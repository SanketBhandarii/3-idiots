package app

import (
	"context"
	"time"

	"github.com/jackc/pgx/v5"
)

// JSON shapes mirror frontend/types/api.ts exactly (snake_case).

type Activity struct {
	FirstOpenedAt *time.Time `json:"first_opened_at"`
	LastOpenedAt  *time.Time `json:"last_opened_at"`
	TotalMs       int64      `json:"total_ms"`
	VisitCount    int        `json:"visit_count"`
	PreviousTopic *string    `json:"previous_topic"`
	NextTopic     *string    `json:"next_topic"`
}

type Node struct {
	ID             string         `json:"id" db:"id"`
	WorkspaceID    string         `json:"workspace_id" db:"workspace_id"`
	BranchID       string         `json:"branch_id" db:"branch_id"`
	Type           string         `json:"type" db:"type"`
	PageID         *string        `json:"page_id" db:"page_id"`
	ParentID       *string        `json:"parent_id" db:"parent_id"`
	OriginNodeID   *string        `json:"origin_node_id" db:"origin_node_id"`
	Title          string         `json:"title" db:"title"`
	Body           string         `json:"body" db:"body"`
	X              float64        `json:"x" db:"x"`
	Y              float64        `json:"y" db:"y"`
	Width          *float64       `json:"width" db:"width"`
	Height         *float64       `json:"height" db:"height"`
	Collapsed      bool           `json:"collapsed" db:"collapsed"`
	CategoryID     *string        `json:"category_id" db:"category_id"`
	Importance     *int16         `json:"importance" db:"importance"`
	Status         string         `json:"status" db:"status"`
	PositionLocked bool           `json:"position_locked" db:"position_locked"`
	GroupLocked    bool           `json:"group_locked" db:"group_locked"`
	NameLocked     bool           `json:"name_locked" db:"name_locked"`
	WhyOpened      map[string]any `json:"why_opened" db:"why_opened"`
	CreatedBy      *string        `json:"created_by" db:"created_by"`
	CreatedByName  *string        `json:"created_by_name" db:"created_by_name"`
	CreatedVia     string         `json:"created_via" db:"created_via"`
	Version        int32          `json:"version" db:"version"`
	CreatedAt      time.Time      `json:"created_at" db:"created_at"`
	UpdatedAt      time.Time      `json:"updated_at" db:"updated_at"`
	TagIDs         []string       `json:"tag_ids" db:"tag_ids"`
	Activity       Activity       `json:"activity" db:"-"`
	AIStage        string         `json:"ai_stage" db:"ai_stage"`
	DuplicateOf    *string        `json:"duplicate_of" db:"duplicate_of"`
}

const nodeSelect = `SELECT n.id,n.workspace_id,n.branch_id,n.type,n.page_id,n.parent_id,n.origin_node_id,n.title,n.body,n.x,n.y,
 n.width,n.height,n.collapsed,n.category_id,n.importance,n.status,n.position_locked,n.group_locked,n.name_locked,n.why_opened,
 n.created_by, CASE WHEN n.created_via='mcp' THEN 'AI assistant ('||coalesce(n.client_name,'MCP')||')' ELSE u.name END AS created_by_name,
 n.created_via,n.version,n.created_at,n.updated_at,n.tag_ids,n.ai_stage,n.duplicate_of
 FROM nodes n LEFT JOIN users u ON u.id=n.created_by `

type Edge struct {
	ID            string    `json:"id" db:"id"`
	WorkspaceID   string    `json:"workspace_id" db:"workspace_id"`
	BranchID      string    `json:"branch_id" db:"branch_id"`
	SourceID      string    `json:"source_id" db:"source_id"`
	TargetID      string    `json:"target_id" db:"target_id"`
	Relation      string    `json:"relation" db:"relation"`
	Label         *string   `json:"label" db:"label"`
	Reason        *string   `json:"reason" db:"reason"`
	Evidence      []string  `json:"evidence" db:"evidence"`
	Confidence    *float32  `json:"confidence" db:"confidence"`
	Origin        string    `json:"origin" db:"origin"`
	State         string    `json:"state" db:"state"`
	Locked        bool      `json:"locked" db:"locked"`
	CreatedBy     *string   `json:"created_by" db:"created_by"`
	CreatedByName *string   `json:"created_by_name" db:"created_by_name"`
	DecidedBy     *string   `json:"decided_by" db:"decided_by"`
	DecidedByName *string   `json:"decided_by_name" db:"decided_by_name"`
	Version       int32     `json:"version" db:"version"`
	CreatedAt     time.Time `json:"created_at" db:"created_at"`
	UpdatedAt     time.Time `json:"updated_at" db:"updated_at"`
}

const edgeSelect = `SELECT e.id,e.workspace_id,e.branch_id,e.source_id,e.target_id,e.relation,e.label,e.reason,e.evidence,e.confidence,
 e.origin,e.state,e.locked,e.created_by,CASE WHEN e.origin='mcp' THEN 'AI assistant ('||coalesce(e.client_name,'MCP')||')' ELSE cu.name END AS created_by_name,e.decided_by,du.name AS decided_by_name,e.version,e.created_at,e.updated_at
 FROM edges e LEFT JOIN users cu ON cu.id=e.created_by LEFT JOIN users du ON du.id=e.decided_by `

type Claim struct {
	ID     string `json:"id" db:"id"`
	PageID string `json:"page_id" db:"page_id"`
	Text   string `json:"text" db:"text"`
	Quote  string `json:"quote" db:"quote"`
}

type Page struct {
	ID                string     `json:"id" db:"id"`
	WorkspaceID       string     `json:"workspace_id" db:"workspace_id"`
	URL               string     `json:"url" db:"url"`
	URLNormalized     string     `json:"url_normalized" db:"url_normalized"`
	Domain            string     `json:"domain" db:"domain"`
	Title             string     `json:"title" db:"title"`
	FaviconURL        *string    `json:"favicon_url" db:"favicon_url"`
	OgImageURL        *string    `json:"og_image_url" db:"og_image_url"`
	SiteName          *string    `json:"site_name" db:"site_name"`
	Author            *string    `json:"author" db:"author"`
	PublishedAt       *time.Time `json:"published_at" db:"published_at"`
	Lang              *string    `json:"lang" db:"lang"`
	WordCount         int32      `json:"word_count" db:"word_count"`
	AnalysisStatus    string     `json:"analysis_status" db:"analysis_status"`
	IsResearch        *bool      `json:"is_research" db:"is_research"`
	IsResearchReason  *string    `json:"is_research_reason" db:"is_research_reason"`
	PageType          *string    `json:"page_type" db:"page_type"`
	MainConcept       *string    `json:"main_concept" db:"main_concept"`
	Summary           *string    `json:"summary" db:"summary"`
	Topics            []string   `json:"topics" db:"topics"`
	Claims            []Claim    `json:"claims" db:"-"`
	QuestionsAnswered []string   `json:"questions_answered" db:"questions_answered"`
	Excerpt           string     `json:"excerpt" db:"excerpt"`
	PreviewCapturedAt *time.Time `json:"preview_captured_at" db:"preview_captured_at"`
	Embeddable        bool       `json:"embeddable" db:"embeddable"`
	CreatedAt         time.Time  `json:"created_at" db:"created_at"`
}

const pageSelect = `SELECT p.id,p.workspace_id,p.url,p.url_normalized,p.domain,p.title,p.favicon_url,p.og_image_url,p.site_name,p.author,
 p.published_at,p.lang,p.word_count,p.analysis_status,p.is_research,p.is_research_reason,p.page_type,p.main_concept,p.summary,p.topics,
 p.questions_answered, left(coalesce(p.summary, p.content_text),220) AS excerpt, p.preview_captured_at,p.embeddable,p.created_at FROM pages p `

type Annotation struct {
	ID          string    `json:"id" db:"id"`
	WorkspaceID string    `json:"workspace_id" db:"workspace_id"`
	NodeID      string    `json:"node_id" db:"node_id"`
	Kind        string    `json:"kind" db:"kind"`
	Body        string    `json:"body" db:"body"`
	Quote       *string   `json:"quote" db:"quote"`
	FragmentURL *string   `json:"fragment_url" db:"fragment_url"`
	ParentID    *string   `json:"parent_id" db:"parent_id"`
	Resolved    bool      `json:"resolved" db:"resolved"`
	AuthorID    string    `json:"author_id" db:"author_id"`
	AuthorName  string    `json:"author_name" db:"author_name"`
	AuthorColor string    `json:"author_color" db:"author_color"`
	CreatedAt   time.Time `json:"created_at" db:"created_at"`
	UpdatedAt   time.Time `json:"updated_at" db:"updated_at"`
}

const annotationSelect = `SELECT a.id,a.workspace_id,a.node_id,a.kind,a.body,a.quote,a.fragment_url,a.parent_id,a.resolved,a.author_id,
 u.name AS author_name,u.avatar_color AS author_color,a.created_at,a.updated_at FROM annotations a JOIN users u ON u.id=a.author_id `

type Tag struct {
	ID          string `json:"id" db:"id"`
	WorkspaceID string `json:"workspace_id" db:"workspace_id"`
	Name        string `json:"name" db:"name"`
	Color       string `json:"color" db:"color"`
}

type Category struct {
	ID          string `json:"id" db:"id"`
	WorkspaceID string `json:"workspace_id" db:"workspace_id"`
	Kind        string `json:"kind" db:"kind"`
	Name        string `json:"name" db:"name"`
	Color       string `json:"color" db:"color"`
}

type Branch struct {
	ID          string    `json:"id" db:"id"`
	WorkspaceID string    `json:"workspace_id" db:"workspace_id"`
	Kind        string    `json:"kind" db:"kind"`
	OwnerID     *string   `json:"owner_id" db:"owner_id"`
	Name        string    `json:"name" db:"name"`
	Color       string    `json:"color" db:"color"`
	CreatedAt   time.Time `json:"created_at" db:"created_at"`
}

type Session struct {
	ID            string     `json:"id" db:"id"`
	WorkspaceID   string     `json:"workspace_id" db:"workspace_id"`
	UserID        string     `json:"user_id" db:"user_id"`
	BranchID      string     `json:"branch_id" db:"branch_id"`
	Title         string     `json:"title" db:"title"`
	StartedAt     time.Time  `json:"started_at" db:"started_at"`
	EndedAt       *time.Time `json:"ended_at" db:"ended_at"`
	OpenTabs      []string   `json:"open_tabs" db:"open_tabs"`
	State         string     `json:"state" db:"state"`
	PausedMs      int64      `json:"paused_ms" db:"paused_ms"`
	PausedAt      *time.Time `json:"paused_at" db:"paused_at"`
	PagesCaptured int64      `json:"pages_captured" db:"pages_captured"`
	PagesVisited  int64      `json:"pages_visited" db:"pages_visited"`
	ActiveMs      int64      `json:"active_ms" db:"active_ms"`
}

const sessionSelect = `SELECT s.id,s.workspace_id,s.user_id,s.branch_id,s.title,s.started_at,s.ended_at,s.open_tabs,s.state,s.paused_ms,s.paused_at,
 (SELECT count(*) FROM session_references r WHERE r.session_id=s.id) AS pages_captured,
 (SELECT count(DISTINCT url_normalized) FROM visits v WHERE v.session_id=s.id) AS pages_visited,
 (SELECT coalesce(sum(extract(epoch FROM ended_at-started_at)*1000),0)::bigint FROM visits v WHERE v.session_id=s.id) AS active_ms
 FROM sessions s `

type Member struct {
	UserID      string    `json:"user_id" db:"user_id"`
	Name        string    `json:"name" db:"name"`
	Email       string    `json:"email" db:"email"`
	AvatarColor string    `json:"avatar_color" db:"avatar_color"`
	Role        string    `json:"role" db:"role"`
	JoinedAt    time.Time `json:"joined_at" db:"joined_at"`
}

/* ---------------------------------------------------------------- loaders */

type querier interface {
	Query(ctx context.Context, sql string, args ...any) (pgx.Rows, error)
}

func queryNodes(ctx context.Context, q querier, where string, args ...any) ([]Node, error) {
	rows, err := q.Query(ctx, nodeSelect+where, args...)
	if err != nil {
		return nil, err
	}
	return pgx.CollectRows(rows, pgx.RowToStructByName[Node])
}

func (a *App) loadNode(ctx context.Context, id string) (*Node, error) {
	ns, err := queryNodes(ctx, a.db, "WHERE n.id=$1", id)
	if err != nil || len(ns) == 0 {
		return nil, pgx.ErrNoRows
	}
	if err := a.fillActivity(ctx, ns[0].WorkspaceID, ns); err != nil {
		return nil, err
	}
	return &ns[0], nil
}

// fillActivity sets Research Memory data (time spent, visits) from real visit rows.
func (a *App) fillActivity(ctx context.Context, wsID string, nodes []Node) error {
	rows, err := a.db.Query(ctx, `SELECT page_id, min(started_at), max(ended_at),
		sum(extract(epoch FROM ended_at-started_at)*1000)::bigint, count(*) FROM visits
		WHERE workspace_id=$1 AND page_id IS NOT NULL GROUP BY page_id`, wsID)
	if err != nil {
		return err
	}
	defer rows.Close()
	acts := map[string]Activity{}
	for rows.Next() {
		var pid string
		var ac Activity
		var first, last time.Time
		if err := rows.Scan(&pid, &first, &last, &ac.TotalMs, &ac.VisitCount); err != nil {
			return err
		}
		ac.FirstOpenedAt, ac.LastOpenedAt = &first, &last
		acts[pid] = ac
	}
	for i := range nodes {
		if nodes[i].PageID != nil {
			nodes[i].Activity = acts[*nodes[i].PageID]
		}
		if nodes[i].TagIDs == nil {
			nodes[i].TagIDs = []string{}
		}
		if nodes[i].WhyOpened == nil {
			nodes[i].WhyOpened = map[string]any{}
		}
	}
	return rows.Err()
}

func (a *App) loadEdge(ctx context.Context, id string) (*Edge, error) {
	rows, err := a.db.Query(ctx, edgeSelect+"WHERE e.id=$1", id)
	if err != nil {
		return nil, err
	}
	e, err := pgx.CollectExactlyOneRow(rows, pgx.RowToStructByName[Edge])
	return &e, err
}

func (a *App) loadPages(ctx context.Context, where string, args ...any) ([]Page, error) {
	rows, err := a.db.Query(ctx, pageSelect+where, args...)
	if err != nil {
		return nil, err
	}
	pages, err := pgx.CollectRows(rows, pgx.RowToStructByName[Page])
	if err != nil || len(pages) == 0 {
		return pages, err
	}
	ids := make([]string, len(pages))
	idx := map[string]int{}
	for i, p := range pages {
		ids[i] = p.ID
		idx[p.ID] = i
		pages[i].Claims = []Claim{}
	}
	crows, err := a.db.Query(ctx, `SELECT id,page_id,text,quote FROM claims WHERE page_id = ANY($1)`, ids)
	if err != nil {
		return nil, err
	}
	claims, err := pgx.CollectRows(crows, pgx.RowToStructByName[Claim])
	if err != nil {
		return nil, err
	}
	for _, cl := range claims {
		pages[idx[cl.PageID]].Claims = append(pages[idx[cl.PageID]].Claims, cl)
	}
	return pages, nil
}

func (a *App) loadPage(ctx context.Context, id string) (*Page, error) {
	ps, err := a.loadPages(ctx, "WHERE p.id=$1", id)
	if err != nil || len(ps) == 0 {
		return nil, pgx.ErrNoRows
	}
	return &ps[0], nil
}

func (a *App) loadAnnotation(ctx context.Context, id string) (*Annotation, error) {
	rows, err := a.db.Query(ctx, annotationSelect+"WHERE a.id=$1", id)
	if err != nil {
		return nil, err
	}
	an, err := pgx.CollectExactlyOneRow(rows, pgx.RowToStructByName[Annotation])
	return &an, err
}

func (a *App) loadSession(ctx context.Context, id string) (*Session, error) {
	rows, err := a.db.Query(ctx, sessionSelect+"WHERE s.id=$1", id)
	if err != nil {
		return nil, err
	}
	s, err := pgx.CollectExactlyOneRow(rows, pgx.RowToStructByName[Session])
	return &s, err
}

func collect[T any](ctx context.Context, q querier, sql string, args ...any) ([]T, error) {
	rows, err := q.Query(ctx, sql, args...)
	if err != nil {
		return nil, err
	}
	out, err := pgx.CollectRows(rows, pgx.RowToStructByName[T])
	if out == nil {
		out = []T{}
	}
	return out, err
}

// publishNode loads the latest node and broadcasts it.
func (a *App) publishNode(ctx context.Context, typ, id string, by *string) *Node {
	n, err := a.loadNode(ctx, id)
	if err != nil {
		return nil
	}
	a.publish(n.WorkspaceID, typ, by, n)
	return n
}
