package app

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/modelcontextprotocol/go-sdk/mcp"
)

// MCP server (spec §18): AI clients such as Claude use an MCP token. Everything they add goes into the workspace's
// "AI Agent" branch with created_via = 'mcp' and the client's name, so a human reviews it before copying to Main.
// Writes reuse the normal services (ingestPage → Agent 1 → Agent 2 → Agent 3) and broadcast WebSocket events.

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

// clientName is the MCP client's self-reported name from the initialize handshake (e.g. "claude-code").
func clientName(req *mcp.CallToolRequest) string {
	if req != nil && req.Session != nil {
		if p := req.Session.InitializeParams(); p != nil && p.ClientInfo != nil {
			if n := strings.TrimSpace(p.ClientInfo.Name); n != "" {
				return truncateRunes(n, 60)
			}
		}
	}
	return "MCP"
}

// nodeInWorkspace loads a node and checks that the MCP user may read (or write) its workspace.
func (a *App) mcpNode(ctx context.Context, nodeID, userID string, write bool) (*Node, error) {
	n, err := a.loadNode(ctx, nodeID)
	if err != nil {
		return nil, fmt.Errorf("node %q not found", nodeID)
	}
	if write {
		err = a.mcpWrite(ctx, n.WorkspaceID, userID)
	} else {
		_, err = a.mcpRole(ctx, n.WorkspaceID, userID)
	}
	if err != nil {
		return nil, err
	}
	return n, nil
}

// absPos is a node's absolute canvas position (children of topics store positions relative to the topic).
func (a *App) absPos(ctx context.Context, nodeID string) (float64, float64, bool) {
	var x, y float64
	err := a.db.QueryRow(ctx, `SELECT n.x + coalesce(p.x,0), n.y + coalesce(p.y,0) FROM nodes n LEFT JOIN nodes p ON p.id=n.parent_id WHERE n.id=$1`, nodeID).Scan(&x, &y)
	return x, y, err == nil
}

// mcpCreateNode inserts a question/note/finding node in the AI Agent branch and broadcasts node.created.
func (a *App) mcpCreateNode(ctx context.Context, u *User, wsID, typ, title, body, client string, near []string) (string, error) {
	branch := a.agentBranch(ctx, wsID)
	if branch == "" {
		return "", errors.New("workspace has no AI Agent branch")
	}
	x, y := 0.0, 0.0
	placed := false
	if len(near) > 0 { // next to its first source, offset by how many AI nodes already sit there
		if sx, sy, ok := a.absPos(ctx, near[0]); ok {
			var n int
			_ = a.db.QueryRow(ctx, `SELECT count(*) FROM nodes WHERE workspace_id=$1 AND created_via='mcp' AND type=$2 AND deleted_at IS NULL`, wsID, typ).Scan(&n)
			x, y, placed = sx+380, sy+float64(n%4)*170, true
		}
	}
	if !placed {
		var minX *float64
		var n int
		_ = a.db.QueryRow(ctx, `SELECT min(x), (SELECT count(*) FROM nodes WHERE workspace_id=$1 AND type=$2 AND deleted_at IS NULL)
			FROM nodes WHERE workspace_id=$1 AND parent_id IS NULL AND deleted_at IS NULL`, wsID, typ).Scan(&minX, &n)
		if minX != nil {
			x = *minX - 360
		}
		y = float64(n%8) * 170
	}
	var id string
	err := a.db.QueryRow(ctx, `INSERT INTO nodes (workspace_id,branch_id,type,title,body,x,y,created_by,created_via,client_name)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'mcp',$9) RETURNING id`, wsID, branch, typ, title, body, x, y, u.ID, client).Scan(&id)
	if err != nil {
		slog.Warn("[MCP] create node failed", "type", typ, "err", err)
		return "", errors.New("could not save the node")
	}
	a.logEvent(ctx, wsID, &u.ID, typ+"_added", gin.H{"node_id": id, "title": title, "via": "mcp", "client": client})
	a.touch(ctx, wsID)
	a.publishNode(ctx, "node.created", id, &u.ID)
	return id, nil
}

func (a *App) mcpServer(u *User) *mcp.Server {
	s := mcp.NewServer(&mcp.Implementation{Name: "research-map", Version: "1.1.0"}, &mcp.ServerOptions{
		Instructions: "Research Map stores research as a visual graph. Workflow: list_workspaces → search_workspace / get_graph_outline to see what exists → " +
			"add_question for the question you are researching → add_source for each web page you used (pass `question` and the page text in `content`) → " +
			"add_finding for conclusions, citing source node ids → link_nodes to explain relationships. Everything you add lands in the " +
			"workspace's AI Agent branch for the user to review. This server does not search the web; use your own search tool and send the results here.",
	})
	type wsIn struct {
		WorkspaceID string `json:"workspace_id" jsonschema:"workspace id from list_workspaces"`
	}

	mcp.AddTool(s, &mcp.Tool{Name: "list_workspaces", Description: "List research workspaces you can access (id, title, your role)."},
		func(ctx context.Context, _ *mcp.CallToolRequest, _ struct{}) (*mcp.CallToolResult, out, error) {
			rows, err := a.db.Query(ctx, `SELECT w.id, w.title, m.role FROM workspaces w JOIN workspace_members m ON m.workspace_id=w.id
				WHERE m.user_id=$1 AND w.deleted_at IS NULL ORDER BY w.updated_at DESC`, u.ID)
			if err != nil {
				return nil, out{}, errors.New("could not list workspaces")
			}
			defer rows.Close()
			list := []gin.H{}
			for rows.Next() {
				var id, t, r string
				if rows.Scan(&id, &t, &r) == nil {
					list = append(list, gin.H{"id": id, "title": t, "role": r, "can_write": roleRank[r] >= roleRank["editor"]})
				}
			}
			return ok(list)
		})

	mcp.AddTool(s, &mcp.Tool{Name: "search_workspace", Description: "Hybrid search (full text + fuzzy + meaning) over pages, notes, highlights, questions, findings and topics."},
		func(ctx context.Context, _ *mcp.CallToolRequest, in struct {
			WorkspaceID string `json:"workspace_id"`
			Query       string `json:"query"`
		}) (*mcp.CallToolResult, out, error) {
			if _, err := a.mcpRole(ctx, in.WorkspaceID, u.ID); err != nil {
				return nil, out{}, err
			}
			q := truncateRunes(strings.TrimSpace(in.Query), 300)
			if q == "" {
				return nil, out{}, errors.New("query is empty")
			}
			res := a.hybridSearch(ctx, in.WorkspaceID, q, searchFilters{})
			if len(res) > 20 {
				res = res[:20]
			}
			return ok(res)
		})

	mcp.AddTool(s, &mcp.Tool{Name: "get_node", Description: "Get a node with its page summary, notes and explained connections."},
		func(ctx context.Context, _ *mcp.CallToolRequest, in struct {
			NodeID string `json:"node_id"`
		}) (*mcp.CallToolResult, out, error) {
			n, err := a.mcpNode(ctx, in.NodeID, u.ID, false)
			if err != nil {
				return nil, out{}, err
			}
			res := gin.H{"node": n}
			if n.PageID != nil {
				if p, err := a.loadPage(ctx, *n.PageID); err == nil {
					res["page"] = p
				}
			}
			res["notes"], _ = collect[Annotation](ctx, a.db, annotationSelect+"WHERE a.node_id=$1", n.ID)
			res["connections"], _ = collect[Edge](ctx, a.db, edgeSelect+"WHERE (e.source_id=$1 OR e.target_id=$1) AND e.state<>'rejected'", n.ID)
			return ok(res)
		})

	mcp.AddTool(s, &mcp.Tool{Name: "get_graph_outline", Description: "Compact outline: topic groups and the pages, questions and findings inside them, with node ids."},
		func(ctx context.Context, _ *mcp.CallToolRequest, in wsIn) (*mcp.CallToolResult, out, error) {
			if _, err := a.mcpRole(ctx, in.WorkspaceID, u.ID); err != nil {
				return nil, out{}, err
			}
			rows, err := a.db.Query(ctx, `SELECT coalesce(t.title,'Unsorted'), n.id, n.type, n.title, b.kind FROM nodes n LEFT JOIN nodes t ON t.id=n.parent_id
				JOIN branches b ON b.id=n.branch_id WHERE n.workspace_id=$1 AND n.deleted_at IS NULL AND n.type<>'topic' ORDER BY 1, n.created_at`, in.WorkspaceID)
			if err != nil {
				return nil, out{}, errors.New("could not read the graph")
			}
			defer rows.Close()
			var b strings.Builder
			last := ""
			for rows.Next() {
				var topic, id, typ, title, kind string
				if rows.Scan(&topic, &id, &typ, &title, &kind) == nil {
					if topic != last {
						fmt.Fprintf(&b, "\n# %s\n", topic)
						last = topic
					}
					mark := ""
					if kind == "agent" {
						mark = " (AI Agent branch)"
					}
					fmt.Fprintf(&b, "- [%s] %s  id=%s%s\n", typ, title, id, mark)
				}
			}
			if b.Len() == 0 {
				return ok("The workspace is empty.")
			}
			return ok(b.String())
		})

	mcp.AddTool(s, &mcp.Tool{Name: "add_question", Description: "Record the research question or search query you are investigating. It becomes a Question node; pass the same text as `question` to add_source so sources are linked to it."},
		func(ctx context.Context, req *mcp.CallToolRequest, in struct {
			WorkspaceID string `json:"workspace_id"`
			Question    string `json:"question"`
		}) (*mcp.CallToolResult, out, error) {
			if err := a.mcpWrite(ctx, in.WorkspaceID, u.ID); err != nil {
				return nil, out{}, err
			}
			q := truncateRunes(strings.TrimSpace(in.Question), 300)
			if q == "" {
				return nil, out{}, errors.New("question is empty")
			}
			id, isNew, err := a.mcpQuestion(ctx, u, in.WorkspaceID, q, clientName(req))
			if err != nil {
				return nil, out{}, err
			}
			return ok(gin.H{"node_id": id, "is_new": isNew})
		})

	mcp.AddTool(s, &mcp.Tool{Name: "add_source", Description: "Add a web page you used as a source. Pass the page text in `content` when you have it (otherwise the server downloads the public page). " +
		"It runs the normal AI pipeline (summary, topics, claims, connections, topic group, conflict check) and lands in the AI Agent branch."},
		func(ctx context.Context, req *mcp.CallToolRequest, in struct {
			WorkspaceID string `json:"workspace_id"`
			URL         string `json:"url"`
			Title       string `json:"title,omitempty"`
			Content     string `json:"content,omitempty" jsonschema:"page text; if empty the server fetches the public page"`
			Note        string `json:"note,omitempty" jsonschema:"why this source matters"`
			Question    string `json:"question,omitempty" jsonschema:"the research question / search query that led to this source"`
		}) (*mcp.CallToolResult, out, error) {
			if err := a.mcpWrite(ctx, in.WorkspaceID, u.ID); err != nil {
				return nil, out{}, err
			}
			if !isHTTPURL(in.URL) || len(in.URL) > 2048 {
				return nil, out{}, errors.New("url must be an http(s) URL")
			}
			if a.blocked(ctx, in.WorkspaceID, domainOf(in.URL)) {
				return nil, out{}, errors.New(domainOf(in.URL) + " is on this workspace's blocklist")
			}
			client := clientName(req)
			b := capturePageReq{URL: in.URL, Title: in.Title, ContentText: in.Content, Transition: "manual", WorkspaceID: in.WorkspaceID}
			if q := truncateRunes(strings.TrimSpace(in.Question), 300); q != "" {
				if _, _, err := a.mcpQuestion(ctx, u, in.WorkspaceID, q, client); err != nil {
					return nil, out{}, err
				}
				b.SearchQuery = &q // ingestPage links the page to the Question node; Agent 2 can add "answers"
			}
			res, err := a.ingestPage(ctx, u, b, nil, "mcp")
			if err != nil {
				slog.Warn("[MCP] add_source failed", "err", err)
				return nil, out{}, errors.New("could not add the source")
			}
			nodeID := res["node_id"].(string)
			if tag, _ := a.db.Exec(ctx, `UPDATE nodes SET client_name=$2 WHERE id=$1 AND created_via='mcp' AND client_name IS NULL`, nodeID, client); tag.RowsAffected() > 0 {
				a.publishNode(ctx, "node.updated", nodeID, &u.ID)
			}
			if res["is_new"] == true {
				a.logEvent(ctx, in.WorkspaceID, &u.ID, "source_added", gin.H{"node_id": nodeID, "url": in.URL, "via": "mcp", "client": client})
			}
			if in.Note != "" {
				if _, err := a.mcpAnnotate(ctx, u, in.WorkspaceID, nodeID, in.Note); err != nil {
					return nil, out{}, err
				}
			}
			res["status"] = "analyzing"
			res["message"] = "Saved. AI analysis is running; call get_node in ~20 s for the summary and connections."
			return ok(res)
		})

	mcp.AddTool(s, &mcp.Tool{Name: "add_note", Description: "Add a note to a node (node_id), or a free-standing Note node in the workspace (workspace_id)."},
		func(ctx context.Context, req *mcp.CallToolRequest, in struct {
			NodeID      string `json:"node_id,omitempty"`
			WorkspaceID string `json:"workspace_id,omitempty"`
			Text        string `json:"text"`
		}) (*mcp.CallToolResult, out, error) {
			text := truncateRunes(strings.TrimSpace(in.Text), 5000)
			if text == "" {
				return nil, out{}, errors.New("text is empty")
			}
			if in.NodeID != "" {
				n, err := a.mcpNode(ctx, in.NodeID, u.ID, true)
				if err != nil {
					return nil, out{}, err
				}
				id, err := a.mcpAnnotate(ctx, u, n.WorkspaceID, n.ID, text)
				if err != nil {
					return nil, out{}, err
				}
				return ok(gin.H{"annotation_id": id})
			}
			if in.WorkspaceID == "" {
				return nil, out{}, errors.New("give node_id or workspace_id")
			}
			if err := a.mcpWrite(ctx, in.WorkspaceID, u.ID); err != nil {
				return nil, out{}, err
			}
			title := truncateRunes(strings.SplitN(text, "\n", 2)[0], 120)
			id, err := a.mcpCreateNode(ctx, u, in.WorkspaceID, "note", title, text, clientName(req), nil)
			if err != nil {
				return nil, out{}, err
			}
			return ok(gin.H{"node_id": id})
		})

	mcp.AddTool(s, &mcp.Tool{Name: "add_finding", Description: "Add a Finding (a conclusion) supported by existing source node ids. Each source gets a 'supports' edge to the finding."},
		func(ctx context.Context, req *mcp.CallToolRequest, in struct {
			WorkspaceID   string   `json:"workspace_id"`
			Statement     string   `json:"statement"`
			SourceNodeIDs []string `json:"source_node_ids"`
		}) (*mcp.CallToolResult, out, error) {
			if err := a.mcpWrite(ctx, in.WorkspaceID, u.ID); err != nil {
				return nil, out{}, err
			}
			st := truncateRunes(strings.TrimSpace(in.Statement), 500)
			if st == "" {
				return nil, out{}, errors.New("statement is empty")
			}
			if len(in.SourceNodeIDs) > 20 {
				return nil, out{}, errors.New("at most 20 source_node_ids")
			}
			for _, sid := range in.SourceNodeIDs { // never trust ids from the client: all must be live nodes of this workspace
				var okNode bool
				_ = a.db.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM nodes WHERE id=$1 AND workspace_id=$2 AND deleted_at IS NULL)`, sid, in.WorkspaceID).Scan(&okNode)
				if !okNode {
					return nil, out{}, fmt.Errorf("source node %q is not in this workspace", sid)
				}
			}
			client := clientName(req)
			id, err := a.mcpCreateNode(ctx, u, in.WorkspaceID, "finding", st, "", client, in.SourceNodeIDs)
			if err != nil {
				return nil, out{}, err
			}
			edges := []string{}
			for _, sid := range in.SourceNodeIDs {
				if eid, err := a.mcpLink(ctx, u, in.WorkspaceID, sid, id, "supports", "Source cited by the AI assistant for this finding.", client); err == nil {
					edges = append(edges, eid)
				}
			}
			return ok(gin.H{"node_id": id, "edge_ids": edges})
		})

	mcp.AddTool(s, &mcp.Tool{Name: "link_nodes", Description: "Suggest an explained connection between two nodes. The user accepts, changes or rejects it. Relations: " +
		"answers, subtopic_of, explains, supports, contradicts, example_of, prerequisite_of, alternative_to, same_topic, source_of."},
		func(ctx context.Context, req *mcp.CallToolRequest, in struct {
			SourceID string `json:"source_id"`
			TargetID string `json:"target_id"`
			Relation string `json:"relation"`
			Reason   string `json:"reason"`
		}) (*mcp.CallToolResult, out, error) {
			if !relations[in.Relation] || in.Relation == "opened_from" || in.Relation == "links_to" || in.Relation == "duplicate_of" {
				return nil, out{}, fmt.Errorf("relation %q is not allowed", in.Relation)
			}
			if strings.TrimSpace(in.Reason) == "" {
				return nil, out{}, errors.New("reason is required (explain why they are connected)")
			}
			n, err := a.mcpNode(ctx, in.SourceID, u.ID, true)
			if err != nil {
				return nil, out{}, err
			}
			id, err := a.mcpLink(ctx, u, n.WorkspaceID, in.SourceID, in.TargetID, in.Relation, in.Reason, clientName(req))
			if err != nil {
				return nil, out{}, err
			}
			return ok(gin.H{"created": true, "edge_id": id})
		})

	mcp.AddTool(s, &mcp.Tool{Name: "list_conflicts", Description: "Potential conflicts between sources (the app never decides who is right)."},
		func(ctx context.Context, _ *mcp.CallToolRequest, in wsIn) (*mcp.CallToolResult, out, error) {
			if _, err := a.mcpRole(ctx, in.WorkspaceID, u.ID); err != nil {
				return nil, out{}, err
			}
			cs, err := a.conflictsWhere(ctx, "WHERE workspace_id=$1", in.WorkspaceID)
			if err != nil {
				return nil, out{}, errors.New("could not list conflicts")
			}
			return ok(cs)
		})

	type refIn struct {
		SessionID   string `json:"session_id,omitempty" jsonschema:"a research session id"`
		WorkspaceID string `json:"workspace_id,omitempty" jsonschema:"or a workspace id: every source in the workspace"`
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
	mcp.AddTool(s, &mcp.Tool{Name: "get_references", Description: "Numbered reference list (Markdown + data) for a session (session_id) or a whole workspace (workspace_id)."},
		func(ctx context.Context, _ *mcp.CallToolRequest, in refIn) (*mcp.CallToolResult, out, error) {
			var refs []Reference
			var err error
			switch {
			case in.SessionID != "":
				se, e := sessionOf(ctx, in.SessionID)
				if e != nil {
					return nil, out{}, e
				}
				refs, err = a.references(ctx, se.ID)
			case in.WorkspaceID != "":
				if _, e := a.mcpRole(ctx, in.WorkspaceID, u.ID); e != nil {
					return nil, out{}, e
				}
				refs, err = a.workspaceReferences(ctx, in.WorkspaceID)
			default:
				return nil, out{}, errors.New("give session_id or workspace_id")
			}
			if err != nil {
				return nil, out{}, errors.New("could not load references")
			}
			return ok(gin.H{"references": refs, "markdown": referencesMarkdown(refs)})
		})
	mcp.AddTool(s, &mcp.Tool{Name: "get_session_report", Description: "Session statistics and the AI summary (if generated). Without session_id, uses the workspace's latest session."},
		func(ctx context.Context, _ *mcp.CallToolRequest, in refIn) (*mcp.CallToolResult, out, error) {
			id := in.SessionID
			if id == "" && in.WorkspaceID != "" {
				if _, err := a.mcpRole(ctx, in.WorkspaceID, u.ID); err != nil {
					return nil, out{}, err
				}
				_ = a.db.QueryRow(ctx, `SELECT id FROM sessions WHERE workspace_id=$1 ORDER BY started_at DESC LIMIT 1`, in.WorkspaceID).Scan(&id)
				if id == "" {
					return nil, out{}, errors.New("this workspace has no tracking sessions yet")
				}
			}
			se, err := sessionOf(ctx, id)
			if err != nil {
				return nil, out{}, err
			}
			stats, err := a.computeStats(ctx, se)
			if err != nil {
				return nil, out{}, errors.New("could not compute statistics")
			}
			var content json.RawMessage
			_ = a.db.QueryRow(ctx, `SELECT content FROM reports WHERE session_id=$1 AND status='ready'`, se.ID).Scan(&content)
			return ok(gin.H{"session_id": se.ID, "stats": stats, "report": content})
		})
	return s
}

// mcpQuestion finds or creates the Question node for a research question (same dedupe rule as /capture/search).
func (a *App) mcpQuestion(ctx context.Context, u *User, wsID, q, client string) (string, bool, error) {
	var id string
	_ = a.db.QueryRow(ctx, `SELECT id FROM nodes WHERE workspace_id=$1 AND type='question' AND deleted_at IS NULL AND lower(title)=lower($2) LIMIT 1`, wsID, q).Scan(&id)
	if id != "" {
		return id, false, nil
	}
	id, err := a.mcpCreateNode(ctx, u, wsID, "question", q, "", client, nil)
	return id, err == nil, err
}

// workspaceReferences numbers every page of a workspace in the order it was first added.
func (a *App) workspaceReferences(ctx context.Context, wsID string) ([]Reference, error) {
	return collect[Reference](ctx, a.db, `SELECT (row_number() OVER (ORDER BY p.created_at))::int AS ref_number, p.id AS page_id,
		(SELECT id FROM nodes WHERE page_id=p.id AND deleted_at IS NULL ORDER BY created_at LIMIT 1) AS node_id,
		p.title, p.url, p.domain, p.site_name, p.author, p.published_at, p.created_at AS first_accessed_at,
		(SELECT CASE WHEN n.created_via='mcp' THEN 'AI assistant ('||coalesce(n.client_name,'MCP')||')' ELSE u.name END
		   FROM nodes n LEFT JOIN users u ON u.id=n.created_by WHERE n.page_id=p.id ORDER BY n.created_at LIMIT 1) AS added_by
		FROM pages p WHERE p.workspace_id=$1 AND EXISTS (SELECT 1 FROM nodes n WHERE n.page_id=p.id AND n.deleted_at IS NULL)
		ORDER BY p.created_at`, wsID)
}

func (a *App) mcpAnnotate(ctx context.Context, u *User, wsID, nodeID, text string) (string, error) {
	var id string
	if err := a.db.QueryRow(ctx, `INSERT INTO annotations (workspace_id,node_id,kind,body,author_id) VALUES ($1,$2,'note',$3,$4) RETURNING id`,
		wsID, nodeID, truncateRunes(text, 5000), u.ID).Scan(&id); err != nil {
		slog.Warn("[MCP] note failed", "err", err)
		return "", errors.New("could not save the note")
	}
	if an, err := a.loadAnnotation(ctx, id); err == nil {
		a.publish(wsID, "annotation.created", &u.ID, an)
	}
	a.logEvent(ctx, wsID, &u.ID, "note_added", gin.H{"node_id": nodeID, "via": "mcp"})
	return id, nil
}

// mcpLink stores an AI-assistant edge (origin mcp, state suggested) in the AI Agent branch. Both ends must be live nodes
// of the workspace, and a pair the user rejected is never suggested again (same rule as Agent 2).
func (a *App) mcpLink(ctx context.Context, u *User, wsID, src, dst, rel, reason, client string) (string, error) {
	if src == dst {
		return "", errors.New("cannot link a node to itself")
	}
	var both, rejected bool
	_ = a.db.QueryRow(ctx, `SELECT (SELECT count(*) FROM nodes WHERE id IN ($2,$3) AND workspace_id=$1 AND deleted_at IS NULL)=2,
		EXISTS(SELECT 1 FROM edges WHERE state='rejected' AND ((source_id=$2 AND target_id=$3) OR (source_id=$3 AND target_id=$2)))`,
		wsID, src, dst).Scan(&both, &rejected)
	if !both {
		return "", errors.New("both nodes must exist in the same workspace")
	}
	if rejected {
		return "", errors.New("the user rejected a connection between these nodes; it will not be suggested again")
	}
	var id string
	err := a.db.QueryRow(ctx, `INSERT INTO edges (workspace_id,branch_id,source_id,target_id,relation,reason,evidence,confidence,origin,state,created_by,client_name)
		VALUES ($1,$2,$3,$4,$5,$6,'[]',0.7,'mcp','suggested',$7,$8) ON CONFLICT DO NOTHING RETURNING id`,
		wsID, a.agentBranch(ctx, wsID), src, dst, rel, truncateRunes(strings.TrimSpace(reason), 400), u.ID, client).Scan(&id)
	if err != nil {
		return "", errors.New("this connection already exists")
	}
	if e, err := a.loadEdge(ctx, id); err == nil {
		a.publish(wsID, "edge.created", &u.ID, e)
	}
	a.logEvent(ctx, wsID, &u.ID, "edge_suggested", gin.H{"edge_id": id, "relation": rel, "via": "mcp", "client": client})
	return id, nil
}

// mcpHandler authenticates the MCP token on every request, rate-limits per user, binds each MCP session to the
// user who opened it, and serves Streamable HTTP.
func (a *App) mcpHandler() gin.HandlerFunc {
	h := mcp.NewStreamableHTTPHandler(func(r *http.Request) *mcp.Server {
		u, _ := r.Context().Value(mcpUserKey{}).(*User)
		return a.mcpServer(u)
	}, &mcp.StreamableHTTPOptions{SessionTimeout: 2 * time.Hour})
	limiter := newRateLimiter(240, time.Minute)
	var owners sync.Map // Mcp-Session-Id → user id
	return func(c *gin.Context) {
		u, err := a.userFromRequest(c)
		if err != nil || u.TokenKind != "mcp" {
			c.AbortWithStatusJSON(401, gin.H{"error": gin.H{"code": "unauthorized", "message": "Use a valid MCP token (Settings → Connect an AI assistant)"}})
			return
		}
		if !limiter.allow("mcp:" + u.ID) {
			c.Header("Retry-After", "30")
			c.AbortWithStatusJSON(429, gin.H{"error": gin.H{"code": "rate_limited", "message": "Too many MCP requests; slow down"}})
			return
		}
		sid := c.GetHeader("Mcp-Session-Id")
		if sid != "" {
			if owner, ok := owners.Load(sid); ok && owner != u.ID {
				c.AbortWithStatusJSON(403, gin.H{"error": gin.H{"code": "forbidden", "message": "This MCP session belongs to another user"}})
				return
			}
		}
		h.ServeHTTP(c.Writer, c.Request.WithContext(context.WithValue(c.Request.Context(), mcpUserKey{}, u)))
		if sid == "" {
			if newSID := c.Writer.Header().Get("Mcp-Session-Id"); newSID != "" {
				owners.Store(newSID, u.ID)
			}
		} else if c.Request.Method == http.MethodDelete {
			owners.Delete(sid)
		}
	}
}

type mcpUserKey struct{}
