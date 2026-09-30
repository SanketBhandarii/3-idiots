package app

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/modelcontextprotocol/go-sdk/mcp"
)

// MCP server (Sanket's feature): AI clients such as Claude use an MCP token. Everything they add goes into
// the workspace's "AI Agent" branch (created_via = mcp) so humans review it before copying to Main.

type out struct {
	Result any `json:"result"`
}

func (a *App) mcpRole(ctx context.Context, wsID, userID string) (string, error) {
	var role string
	err := a.db.QueryRow(ctx, `SELECT m.role FROM workspace_members m JOIN workspaces w ON w.id=m.workspace_id
		WHERE m.workspace_id=$1 AND m.user_id=$2 AND w.deleted_at IS NULL`, wsID, userID).Scan(&role)
	if err != nil {
		return "", errors.New("workspace not found or you are not a member")
	}
	return role, nil
}

func (a *App) mcpWrite(ctx context.Context, wsID, userID string) error {
	role, err := a.mcpRole(ctx, wsID, userID)
	if err != nil {
		return err
	}
	if roleRank[role] < roleRank["editor"] {
		return errors.New("viewers cannot add research")
	}
	return nil
}

func (a *App) agentBranch(ctx context.Context, wsID string) string {
	var id string
	_ = a.db.QueryRow(ctx, `SELECT id FROM branches WHERE workspace_id=$1 AND kind='agent'`, wsID).Scan(&id)
	return id
}

func ok[T any](v T) (*mcp.CallToolResult, out, error) { return nil, out{v}, nil }

func (a *App) mcpServer(u *User) *mcp.Server {
	s := mcp.NewServer(&mcp.Implementation{Name: "research-map", Version: "1.0.0"}, nil)
	type wsIn struct {
		WorkspaceID string `json:"workspace_id" jsonschema:"workspace id from list_workspaces"`
	}

	mcp.AddTool(s, &mcp.Tool{Name: "list_workspaces", Description: "List research workspaces you can access."},
		func(ctx context.Context, _ *mcp.CallToolRequest, _ struct{}) (*mcp.CallToolResult, out, error) {
			rows, err := a.db.Query(ctx, `SELECT w.id, w.title, m.role FROM workspaces w JOIN workspace_members m ON m.workspace_id=w.id
				WHERE m.user_id=$1 AND w.deleted_at IS NULL ORDER BY w.updated_at DESC`, u.ID)
			if err != nil {
				return nil, out{}, err
			}
			defer rows.Close()
			list := []gin.H{}
			for rows.Next() {
				var id, t, r string
				if rows.Scan(&id, &t, &r) == nil {
					list = append(list, gin.H{"id": id, "title": t, "role": r})
				}
			}
			return ok(list)
		})

	mcp.AddTool(s, &mcp.Tool{Name: "search_workspace", Description: "Search pages, notes and findings in a workspace."},
		func(ctx context.Context, _ *mcp.CallToolRequest, in struct {
			WorkspaceID string `json:"workspace_id"`
			Query       string `json:"query"`
		}) (*mcp.CallToolResult, out, error) {
			if _, err := a.mcpRole(ctx, in.WorkspaceID, u.ID); err != nil {
				return nil, out{}, err
			}
			rows, err := a.db.Query(ctx, `SELECT n.id, n.type, n.title, p.url, coalesce(p.summary, left(n.body,200)) FROM nodes n LEFT JOIN pages p ON p.id=n.page_id
				WHERE n.workspace_id=$1 AND n.deleted_at IS NULL AND (n.title ILIKE $2 OR n.body ILIKE $2 OR p.summary ILIKE $2 OR p.search_tsv @@ websearch_to_tsquery('english',$3))
				LIMIT 20`, in.WorkspaceID, "%"+in.Query+"%", in.Query)
			if err != nil {
				return nil, out{}, err
			}
			defer rows.Close()
			res := []gin.H{}
			for rows.Next() {
				var id, typ, title string
				var url, summary *string
				if rows.Scan(&id, &typ, &title, &url, &summary) == nil {
					res = append(res, gin.H{"node_id": id, "type": typ, "title": title, "url": url, "summary": summary})
				}
			}
			return ok(res)
		})

	mcp.AddTool(s, &mcp.Tool{Name: "get_node", Description: "Get a node with its summary, notes and explained connections."},
		func(ctx context.Context, _ *mcp.CallToolRequest, in struct {
			NodeID string `json:"node_id"`
		}) (*mcp.CallToolResult, out, error) {
			n, err := a.loadNode(ctx, in.NodeID)
			if err != nil {
				return nil, out{}, errors.New("node not found")
			}
			if _, err := a.mcpRole(ctx, n.WorkspaceID, u.ID); err != nil {
				return nil, out{}, err
			}
			res := gin.H{"node": n}
			if n.PageID != nil {
				res["page"], _ = a.loadPage(ctx, *n.PageID)
			}
			res["notes"], _ = collect[Annotation](ctx, a.db, annotationSelect+"WHERE a.node_id=$1", n.ID)
			res["connections"], _ = collect[Edge](ctx, a.db, edgeSelect+"WHERE (e.source_id=$1 OR e.target_id=$1) AND e.state<>'rejected'", n.ID)
			return ok(res)
		})

	mcp.AddTool(s, &mcp.Tool{Name: "get_graph_outline", Description: "Compact outline: topics and the pages inside them."},
		func(ctx context.Context, _ *mcp.CallToolRequest, in wsIn) (*mcp.CallToolResult, out, error) {
			if _, err := a.mcpRole(ctx, in.WorkspaceID, u.ID); err != nil {
				return nil, out{}, err
			}
			rows, err := a.db.Query(ctx, `SELECT coalesce(t.title,'Unsorted'), n.type, n.title FROM nodes n LEFT JOIN nodes t ON t.id=n.parent_id
				WHERE n.workspace_id=$1 AND n.deleted_at IS NULL AND n.type<>'topic' ORDER BY 1, n.created_at`, in.WorkspaceID)
			if err != nil {
				return nil, out{}, err
			}
			defer rows.Close()
			var b strings.Builder
			last := ""
			for rows.Next() {
				var topic, typ, title string
				if rows.Scan(&topic, &typ, &title) == nil {
					if topic != last {
						b.WriteString("\n# " + topic + "\n")
						last = topic
					}
					b.WriteString("- [" + typ + "] " + title + "\n")
				}
			}
			return ok(b.String())
		})

	mcp.AddTool(s, &mcp.Tool{Name: "add_source", Description: "Add a web page as a source. It goes through the normal AI pipeline and lands in the AI Agent branch."},
		func(ctx context.Context, _ *mcp.CallToolRequest, in struct {
			WorkspaceID string `json:"workspace_id"`
			URL         string `json:"url"`
			Title       string `json:"title,omitempty"`
			Content     string `json:"content,omitempty" jsonschema:"page text; if empty the server fetches it"`
			Note        string `json:"note,omitempty"`
		}) (*mcp.CallToolResult, out, error) {
			if err := a.mcpWrite(ctx, in.WorkspaceID, u.ID); err != nil {
				return nil, out{}, err
			}
			if !isHTTPURL(in.URL) {
				return nil, out{}, errors.New("url must be http(s)")
			}
			res, err := a.ingestPage(ctx, u, capturePageReq{URL: in.URL, Title: in.Title, ContentText: in.Content, Transition: "manual", WorkspaceID: in.WorkspaceID}, nil, "mcp")
			if err != nil {
				return nil, out{}, err
			}
			if in.Note != "" {
				a.mcpAnnotate(ctx, in.WorkspaceID, res["node_id"].(string), in.Note)
			}
			return ok(res)
		})

	mcp.AddTool(s, &mcp.Tool{Name: "add_note", Description: "Add a note to a node."},
		func(ctx context.Context, _ *mcp.CallToolRequest, in struct {
			NodeID string `json:"node_id"`
			Text   string `json:"text"`
		}) (*mcp.CallToolResult, out, error) {
			n, err := a.loadNode(ctx, in.NodeID)
			if err != nil {
				return nil, out{}, errors.New("node not found")
			}
			if err := a.mcpWrite(ctx, n.WorkspaceID, u.ID); err != nil {
				return nil, out{}, err
			}
			return ok(a.mcpAnnotate(ctx, n.WorkspaceID, n.ID, in.Text))
		})

	mcp.AddTool(s, &mcp.Tool{Name: "add_finding", Description: "Add a Finding node supported by existing source nodes."},
		func(ctx context.Context, _ *mcp.CallToolRequest, in struct {
			WorkspaceID   string   `json:"workspace_id"`
			Statement     string   `json:"statement"`
			SourceNodeIDs []string `json:"source_node_ids"`
		}) (*mcp.CallToolResult, out, error) {
			if err := a.mcpWrite(ctx, in.WorkspaceID, u.ID); err != nil {
				return nil, out{}, err
			}
			branch := a.agentBranch(ctx, in.WorkspaceID)
			var id string
			if err := a.db.QueryRow(ctx, `INSERT INTO nodes (workspace_id,branch_id,type,title,x,y,created_by,created_via)
				VALUES ($1,$2,'finding',$3,(SELECT coalesce(min(x),0)-340 FROM nodes WHERE workspace_id=$1), 0, $4,'mcp') RETURNING id`,
				in.WorkspaceID, branch, truncateRunes(in.Statement, 500), u.ID).Scan(&id); err != nil {
				return nil, out{}, err
			}
			a.publishNode(ctx, "node.created", id, &u.ID)
			for _, sid := range in.SourceNodeIDs {
				a.mcpLink(ctx, in.WorkspaceID, sid, id, "supports", "Source cited by the AI assistant for this finding.")
			}
			return ok(gin.H{"node_id": id})
		})

	mcp.AddTool(s, &mcp.Tool{Name: "link_nodes", Description: "Suggest a connection between two nodes (the user accepts or rejects it)."},
		func(ctx context.Context, _ *mcp.CallToolRequest, in struct {
			SourceID string `json:"source_id"`
			TargetID string `json:"target_id"`
			Relation string `json:"relation"`
			Reason   string `json:"reason"`
		}) (*mcp.CallToolResult, out, error) {
			n, err := a.loadNode(ctx, in.SourceID)
			if err != nil || !relations[in.Relation] {
				return nil, out{}, errors.New("unknown node or relation")
			}
			if err := a.mcpWrite(ctx, n.WorkspaceID, u.ID); err != nil {
				return nil, out{}, err
			}
			return ok(a.mcpLink(ctx, n.WorkspaceID, in.SourceID, in.TargetID, in.Relation, in.Reason))
		})

	mcp.AddTool(s, &mcp.Tool{Name: "list_conflicts", Description: "Potential conflicts between sources (the app never decides who is right)."},
		func(ctx context.Context, _ *mcp.CallToolRequest, in wsIn) (*mcp.CallToolResult, out, error) {
			if _, err := a.mcpRole(ctx, in.WorkspaceID, u.ID); err != nil {
				return nil, out{}, err
			}
			cs, err := a.conflictsWhere(ctx, "WHERE workspace_id=$1", in.WorkspaceID)
			return nil, out{cs}, err
		})

	type sessIn struct {
		SessionID string `json:"session_id"`
	}
	sessionOf := func(ctx context.Context, id string) (*Session, error) {
		s, err := a.loadSession(ctx, id)
		if err != nil {
			return nil, errors.New("session not found")
		}
		if _, err := a.mcpRole(ctx, s.WorkspaceID, u.ID); err != nil {
			return nil, err
		}
		return s, nil
	}
	mcp.AddTool(s, &mcp.Tool{Name: "get_references", Description: "Numbered reference list of a research session."},
		func(ctx context.Context, _ *mcp.CallToolRequest, in sessIn) (*mcp.CallToolResult, out, error) {
			se, err := sessionOf(ctx, in.SessionID)
			if err != nil {
				return nil, out{}, err
			}
			refs, err := a.references(ctx, se.ID)
			return nil, out{refs}, err
		})
	mcp.AddTool(s, &mcp.Tool{Name: "get_session_report", Description: "Session statistics and the AI summary (if generated)."},
		func(ctx context.Context, _ *mcp.CallToolRequest, in sessIn) (*mcp.CallToolResult, out, error) {
			se, err := sessionOf(ctx, in.SessionID)
			if err != nil {
				return nil, out{}, err
			}
			stats, err := a.computeStats(ctx, se)
			if err != nil {
				return nil, out{}, err
			}
			var content json.RawMessage
			_ = a.db.QueryRow(ctx, `SELECT content FROM reports WHERE session_id=$1 AND status='ready'`, se.ID).Scan(&content)
			return ok(gin.H{"stats": stats, "report": content})
		})
	return s
}

func (a *App) mcpAnnotate(ctx context.Context, wsID, nodeID, text string) gin.H {
	var id string
	if err := a.db.QueryRow(ctx, `INSERT INTO annotations (workspace_id,node_id,kind,body,author_id) VALUES ($1,$2,'note',$3,
		(SELECT created_by FROM nodes WHERE id=$2)) RETURNING id`, wsID, nodeID, truncateRunes(text, 5000)).Scan(&id); err != nil {
		return gin.H{"error": err.Error()}
	}
	if an, err := a.loadAnnotation(ctx, id); err == nil {
		a.publish(wsID, "annotation.created", nil, an)
	}
	return gin.H{"annotation_id": id}
}

func (a *App) mcpLink(ctx context.Context, wsID, src, dst, rel, reason string) gin.H {
	var id string
	err := a.db.QueryRow(ctx, `INSERT INTO edges (workspace_id,branch_id,source_id,target_id,relation,reason,confidence,origin,state)
		SELECT $1,$2,$3,$4,$5,$6,0.7,'ai','suggested' WHERE (SELECT count(*) FROM nodes WHERE id IN ($3,$4) AND workspace_id=$1 AND deleted_at IS NULL)=2
		ON CONFLICT DO NOTHING RETURNING id`, wsID, a.agentBranch(ctx, wsID), src, dst, rel, truncateRunes(reason, 400)).Scan(&id)
	if err != nil {
		return gin.H{"created": false}
	}
	if e, err := a.loadEdge(ctx, id); err == nil {
		a.publish(wsID, "edge.created", nil, e)
	}
	return gin.H{"created": true, "edge_id": id}
}

// mcpHandler authenticates the MCP token on every request and serves Streamable HTTP.
func (a *App) mcpHandler() gin.HandlerFunc {
	h := mcp.NewStreamableHTTPHandler(func(r *http.Request) *mcp.Server {
		u, _ := r.Context().Value(mcpUserKey{}).(*User)
		return a.mcpServer(u)
	}, nil)
	return func(c *gin.Context) {
		u, err := a.userFromRequest(c)
		if err != nil || u.TokenKind != "mcp" {
			c.AbortWithStatusJSON(401, gin.H{"error": gin.H{"code": "unauthorized", "message": "Use an MCP token (Settings → Connect an AI assistant)"}})
			return
		}
		h.ServeHTTP(c.Writer, c.Request.WithContext(context.WithValue(c.Request.Context(), mcpUserKey{}, u)))
	}
}

type mcpUserKey struct{}
