# Integration Guide — what is built so far

> Status as of 1 Oct 2026. Source of truth for product rules stays `../allaboutourproject.md`.
> This file explains **what exists in code today** and **exactly how to plug the real Go backend and Chrome extension in**.

---

## 1. What is built vs not built

| Part (spec §9) | Status | Where |
|---|---|---|
| **Web app (Next.js 16)**: every screen, interaction, state | ✅ Built | `web/` |
| **API client + typed contracts** for all §17 endpoints | ✅ Built | `web/lib/api/`, `web/types/api.ts` |
| **WebSocket client abstraction** (real + mock) | ✅ Built | `web/lib/ws/socket.ts` |
| **Mock backend** (runs in the browser; same paths and JSON as Go will use) | ✅ Built, stand-in only | `web/mock/` |
| **Simulated AI pipeline** (Agent 1 → 2 → 3, conflicts, radar, report text) | ✅ Simulated in mock | `web/mock/pipeline.ts`, `web/mock/compute.ts` |
| **Simulated extension** (browsing script while tracking) | ✅ Simulated | `web/lib/extension/simulator.ts` |
| **Extension bridge** (web app → extension messages) | ✅ Client side built | `web/lib/extension/bridge.ts` |
| Go backend (Gin, PostgreSQL, River, WebSocket hub, MCP) | ❌ Not built | `api/` (to do) |
| Python AI service (FastAPI, Groq, fastembed) | ❌ Not built | `agent/` (to do) |
| Chrome extension (WXT) | ❌ Not built | `extension/` (to do) |

**Key point:** the frontend never talks to the mock directly. Everything goes through `apiClient` → transport. Switching to Go is **one env var**; no component changes.

---

## 2. Run it

```bash
cd web
npm install
npm run dev          # http://localhost:3000
```

Log in with **Continue with demo account** (`demo@researchmap.app` / `demo1234`). The seeded workspace "AI in Healthcare" has 20 pages, 6 topic groups, explained edges, 1 conflict, radar items, 2 collaborators, 2 sessions with visits and 3 branches.

Checks: `npx tsc --noEmit` · `npx eslint .` · `npm run build` all pass.

### Environment (`web/.env.example`, public values only)

| Var | Default | Meaning |
|---|---|---|
| `NEXT_PUBLIC_API_MODE` | `mock` | `mock` = in-browser backend · `http` = real Go backend |
| `NEXT_PUBLIC_API_BASE_URL` | `/api/v1` | REST base path |
| `NEXT_PUBLIC_WS_URL` | *(derived)* | Defaults to `ws(s)://<host>/api/v1/ws` |
| `NEXT_PUBLIC_EXTENSION_ID` | — | Unpacked extension ID for `externally_connectable` |
| `NEXT_PUBLIC_APP_NAME` | `Research Map` | App name |
| `API_PROXY_TARGET` | `http://localhost:8080` | Server-only. In `http` mode `next.config.ts` rewrites `/api/*` here (same-origin httpOnly cookie, no CORS, spec §F1) |

---

## 3. Switching to the real Go backend (3 steps)

1. Go serves `http://localhost:8080/api/v1/...` with the endpoints in §4 and the JSON shapes in `web/types/api.ts`.
2. `web/.env.local`:
   ```env
   NEXT_PUBLIC_API_MODE=http
   API_PROXY_TARGET=http://localhost:8080
   ```
3. Restart `npm run dev`. The mock code is lazy-loaded only in mock mode, so it is never downloaded in `http` mode.

**Rules the frontend relies on:**
- **Auth**: JWT in an **httpOnly cookie**; the client sends `credentials: "include"`. `GET /me` → 401 means logged out (redirects to `/login`).
- **Errors** (all endpoints): `{"error": {"code": "...", "message": "..."}}`. Codes used by the UI: `bad_request, unauthorized, forbidden, not_found, conflict, validation_failed, rate_limited, ai_unavailable, internal`. Parsed in `web/lib/api/errors.ts`; the UI shows `message`, never stack traces.
- **JSON casing**: snake_case everywhere (`workspace_id`, `created_at`, …).
- **Times**: ISO-8601 UTC strings.
- **Optimistic concurrency**: `PATCH /nodes/:id` and `PATCH /edges/:id` send `version`. On a stale version return **409** with the latest object in `error.details`; the UI replaces its copy and shows "Updated by someone else".
- **Every write broadcasts a WebSocket event** (§5). The UI applies events idempotently (upsert by id), so echoing the author's own change is fine.
- **Node positions**: `x,y` of a node inside a topic are **relative to the parent topic** (`parent_id`), as React Flow expects. Top-level nodes use absolute coordinates.

**Reference implementation:** `web/mock/server.ts` implements every route. Permission checks (`requireWorkspace(id, "editor")`), branch selection, event logging and broadcasts are written the way the Go handlers should work. `web/mock/compute.ts` has the exact radar formula, stats definitions, search ranking stand-in and export formats.

---

## 4. REST API — every endpoint the frontend calls (70)

Base `/api/v1`. **★ = frontend addition, not yet in spec §17** (small, needed by the UI). Types live in `web/types/api.ts`; frontend callers are in `web/lib/api/<file>`.

### Auth & tokens — `lib/api/auth.ts`
| Method & path | Body → Response |
|---|---|
| `POST /auth/register` | `RegisterRequest {name,email,password}` → `{user: User}` + sets cookie |
| `POST /auth/login` | `LoginRequest {email,password}` → `{user: User}` + sets cookie |
| `POST /auth/logout` | → 204 |
| `GET /me` | → `User` (401 if logged out) |
| `GET /tokens` · `POST /tokens` `{kind:"extension"\|"mcp", name}` · `DELETE /tokens/:id` | `ApiToken[]` · `CreatedToken` (plain `token` shown once) · 204 |

### Workspaces — `lib/api/workspaces.ts`
| Method & path | Body → Response |
|---|---|
| `GET /workspaces` | → `Workspace[]` (with joined `node_count, page_count, topic_count, members[], my_role, last_opened_at, active_session, activity[7]`) |
| `POST /workspaces` | `{title, description?}` → `Workspace` (also creates Main + personal + AI Agent branches) |
| `GET /workspaces/:id` · `PATCH /workspaces/:id` `{title?,description?,settings?}` · `DELETE /workspaces/:id` (owner) | `Workspace` · `Workspace` · 204 |
| `GET /workspaces/:id/graph?branch=main\|mine\|main,mine\|all\|<branchId>` | → `GraphResponse {workspace, branches, nodes, edges, pages, tags, categories, annotations, view_state}` |
| `PUT /workspaces/:id/view-state` | `ViewState {zoom,x,y,selected_node_id,selected_edge_id,view_mode,panel,branch,filters,color_by,focus_node_id}` → 204 |
| `POST /workspaces/:id/reorganize` | → `{topics_created, nodes_moved, undo_token}`; broadcasts `graph.reorganized` |
| ★ `POST /workspaces/:id/reorganize/undo` | `{undo_token}` → 204 (one-step undo, spec §14.5) |

### Sharing, members, branches — `lib/api/sharing.ts`
| Method & path | Body → Response |
|---|---|
| `GET /workspaces/:id/members` | → `WorkspaceMember[]` |
| ★ `GET /workspaces/:id/share-links` · `POST /workspaces/:id/share-links` `{role, expires_in_days?}` · ★ `DELETE /workspaces/:id/share-links/:linkId` | `ShareLink[]` · `ShareLink` (with full `url`) · 204 |
| `POST /join/:token` | → `{workspace_id, role}` (creates the member + personal branch) |
| `PATCH /workspaces/:id/members/:userId` `{role}` · `DELETE …/members/:userId` | `WorkspaceMember` · 204 |
| `GET /workspaces/:id/branches` · `POST /workspaces/:id/branches` `{name}` | `Branch[]` · `Branch` |
| `GET /workspaces/:id/branches/compare?a=&b=` | → `BranchCompare {a,b,in_both,only_a,only_b,findings_a,findings_b,conflicts}` |
| `POST /branches/:id/merge` `{node_ids}` | → `{copied_node_ids, copied_edge_ids, skipped}` (copies into Main with `origin_node_id`) |

### Sessions, stats, references, report, journey — `lib/api/sessions.ts`, `reports.ts`
| Method & path | Body → Response |
|---|---|
| `POST /workspaces/:id/sessions/start` | → `Session` (returns the existing one if already active) |
| `POST /sessions/:id/stop` `{open_tabs}` | → `Session` |
| ★ `POST /sessions/:id/pause` · ★ `POST /sessions/:id/resume` | → `Session` (`state: active\|paused\|stopped`, `paused_ms`, `paused_at`) |
| `GET /workspaces/:id/sessions` | → `Session[]` newest first |
| `GET /sessions/:id/stats` | → `SessionStats` (pure data from visits; definitions in `mock/compute.ts#computeStats` = spec §F18 table) |
| `GET /sessions/:id/references?format=json\|md\|bibtex` | → `{session_id, format, references: Reference[], text}` |
| `POST /sessions/:id/report` · `GET /sessions/:id/report` | → `SessionReport {status: generating\|ready\|failed, content}`. The UI polls GET every 1 s while `generating` |
| `GET /workspaces/:id/journey?session=` | → `{session_id, items: JourneyItem[]}` ordered visits |

### Capture (called by the Chrome extension; the web app uses `/capture/page` for manual "Add page") — `lib/api/capture.ts`
| Method & path | Body → Response |
|---|---|
| `POST /capture/page` | `CapturePageRequest` (spec §12.3 + `workspace_id`) → `{node_id, page_id, is_new}`. Must create the node **immediately** (`status:"analyzing"`, `ai_stage:"captured"`), broadcast `node.created`, then run the pipeline |
| `POST /capture/search` | `{query, engine, url, workspace_id}` → `{node_id, is_new}` (Question node, F23) |
| `POST /capture/visits` | `{session_id, visits:[{url,tab_id,started_at,ended_at}]}` → `{accepted}`. Drop visits < 2 s; link them to a page by normalized URL (also backfill when the page is captured later) |
| `POST /capture/highlight` | `{url, quote, fragment_url, workspace_id}` → `Annotation` |
| `PUT /pages/:id/preview` `{image}` · `GET /pages/:id/preview` | `PagePreview {page_id, image, captured_at}`; broadcasts `preview.updated` |

### Nodes & edges — `lib/api/nodes.ts`, `edges.ts`
| Method & path | Body → Response |
|---|---|
| `POST /nodes` | `CreateNodeRequest {workspace_id,type,title,body?,x,y,parent_id?,source_node_ids?}` → `ResearchNode` (manual nodes are `position_locked`) |
| `PATCH /nodes/:id` | `UpdateNodeRequest {…fields, version}` → `ResearchNode` · **409 on stale version**. Moving sets `position_locked`; reparenting sets `group_locked`; renaming a topic sets `name_locked` |
| `DELETE /nodes/:id` | → 204 (soft delete; topic children are moved out) |
| ★ `POST /nodes/:id/restore` | → `ResearchNode` (Undo) |
| `POST /nodes/positions` | `{positions:[{id,x,y,parent_id?}]}` → 204 (bulk, sent on drag end / tree layout) |
| ★ `POST /nodes/:id/merge` | `{into_node_id}` → `ResearchNode` (F26 duplicate merge) |
| `POST /edges` | `{workspace_id,source_id,target_id,relation,reason?}` → `ResearchEdge` (`origin:"user"`, accepted, locked). 409 if already exists |
| `PATCH /edges/:id` | `{state?, relation?, reason?, label?, version}` → `ResearchEdge`. Any change sets `locked=true`; `rejected` remembers the pair so AI never re-suggests it |
| `DELETE /edges/:id` | → 204 |

### Notes, tags, categories — `lib/api/annotations.ts`, `tags.ts`
| Method & path | Body → Response |
|---|---|
| `POST /nodes/:id/annotations` | `{kind: note\|highlight\|comment, body, quote?, fragment_url?, parent_id?}` → `Annotation` (viewers may only comment) |
| `PATCH /annotations/:id` `{body?, resolved?}` · `DELETE /annotations/:id` | `Annotation` · 204 |
| `GET/POST /workspaces/:id/tags` `{name, color?}` | `Tag[]` · `Tag` (returns the existing tag for a duplicate name) |
| `PUT /nodes/:id/tags` `{tag_ids}` | → `ResearchNode` |
| `GET/POST /workspaces/:id/categories` `{kind,name,color}` · ★ `PATCH /categories/:id` `{name?,color?}` | `Category[]` · `Category` · `Category` |

### Radar, conflicts, search, export — `lib/api/radar.ts`, `conflicts.ts`, `search.ts`, `export.ts`
| Method & path | Body → Response |
|---|---|
| `GET /workspaces/:id/radar` | → `RadarResponse {eligible, eligibility_message, items: RadarItem[], topics: TopicCoverage[]}` (item kinds: `low_coverage`, `unanswered_question`, `unexplored_concept`) |
| `POST /workspaces/:id/radar/:topicId/suggestions` | → `{topic_id, suggested_searches}` (503 `ai_unavailable` when Groq is down) |
| ★ `PATCH /workspaces/:id/radar/items/:itemId` `{status: open\|reviewed\|ignored}` | → `RadarItem` |
| `GET /workspaces/:id/conflicts` · `PATCH /conflicts/:id` `{status, resolution_note?}` · `POST /conflicts/:id/methodology` | `Conflict[]` · `Conflict` · `{conflict_id, checklist:[{source:"a"\|"b"\|"both", item}]}` |
| `GET /workspaces/:id/search?q=&filters=<json SearchFilters>` | → `{query, results: SearchResult[], took_ms}` (kinds: page, note, highlight, tag, topic, question, finding) |
| `GET /workspaces/:id/export?format=json\|md\|csv\|bookmarks\|mermaid\|bibtex` | → `{format, filename, mime, content}` (the browser downloads `content`; PNG/SVG are rendered client-side) |
| `POST /workspaces/import` | `{format: json\|bookmarks\|onetab, content, workspace_id?, title?}` → `{workspace_id, nodes_imported}` |

---

## 5. WebSocket — `GET /api/v1/ws?workspace_id=`

Envelope: `{ "type": "...", "workspace_id": "...", "by": "<user_id|null>", "data": {...} }`. Typed as `WsServerMessage` in `types/api.ts`, handled in `features/workspace/useWorkspace.ts`. The client reconnects with backoff and shows "Connection lost · retrying".

| Server → client | `data` | UI reaction |
|---|---|---|
| `node.created` / `node.updated` / `node.deleted` | `ResearchNode` / `{id}` | upsert/remove on canvas |
| `edge.created` / `edge.updated` / `edge.deleted` | `ResearchEdge` / `{id}` | upsert/remove |
| `annotation.created/updated/deleted` | `Annotation` / `{id,node_id}` | notes panel; toast on others' comments |
| `page.created` · `page.analyzed` | `Page` | summary/topics appear |
| `graph.reorganized` | `{topics: ResearchNode[], parent_changes:[{id,parent_id,x,y}]}` | regroups canvas |
| `conflict.detected` / `conflict.updated` | `Conflict` | badge + "Potential conflict detected" toast |
| `radar.updated` | `RadarResponse` | radar badge + panel |
| `preview.updated` | `{page_id, captured_at}` | refresh snapshot |
| `presence` | `{users:[{id,name,color,selected_node_id}]}` | avatars + coloured ring on nodes |
| `node.moving` | `{id,x,y}` | live drag of others |
| `job.status` | `{kind,status,message,node_id?,agent?}` | AI ticker + AI activity panel ("Agent 1 · Analyzing page…") |
| ★ `session.updated` | `Session` | tracking bar |
| ★ `tags.updated` · ★ `categories.updated` | `Tag[]` · `Category[]` | tag/category lists |

| Client → server | `data` |
|---|---|
| `presence.update` | `{selected_node_id}` (sent when the selection changes) |
| `node.moving` | `{id,x,y}` |

**AI pipeline stages** the UI visualises via `node.updated.ai_stage`: `captured → analyzing → understood → organizing → connected → ready` (or `failed`). Emit them from the River jobs in that order. Non-research pages: set `status:"inbox"`.

---

## 6. Chrome extension integration (§9.4)

Already built on the web side, in `lib/extension/bridge.ts` + `stores/extension.ts`:
- Detection: `chrome.runtime.sendMessage(EXTENSION_ID, {type:"PING"})` → any truthy reply = connected (Settings → Connect extension).
- Web → extension messages: `FOCUS_TAB {url}`, `OPEN_URLS_AS_GROUP {title,color,urls}`, `CLOSE_SAVED_TABS {urls}`, `REQUEST_LIVE_VIDEO {url}`, `ENABLE_INTERACTIVE_EMBED {url}`, `START_TRACKING {workspace_id}`, `STOP_TRACKING`. When not connected, the UI shows "Chrome extension connection required."
- Extension → web app: call `useExtensionStore.getState().setTabs({ [normalizedUrl]: "active" | "open" })` from the port listener on `TABS_STATE`. Nodes show 🟢 active / 🔵 open / ⚪ closed and refresh their snapshot faster for open tabs.
- Snapshots: pass the JPEG data URL as `image` to `PagePreview` (or `PUT /pages/:id/preview`). Until then, node previews use a **real screenshot** from a free public service (`lib/domain/preview.ts`). Replace `screenshotUrl()` when the extension is ready.
- Extension REST calls: `/capture/page`, `/capture/search`, `/capture/visits` (every 30 s), `/capture/highlight`, with `Authorization: Bearer <extension token>` (created in Settings).
- Remove `lib/extension/simulator.ts` usage (in `WorkspaceScreen.tsx` / `useWorkspace.ts`) once the real extension drives capture.

---

## 7. Frontend — what exists

**Routes** (`web/app`)
| Route | Screen |
|---|---|
| `/login`, `/register` | Split auth layout; demo-account button in mock mode |
| `/workspaces` | Workspace cards (counts, members, last opened, 7-day activity, tracking status); create / rename / delete / import |
| `/w/[workspaceId]` | **Main research canvas** (below) |
| `/w/[workspaceId]/report/[sessionId]` | Session Report: Statistics (8 Recharts charts, real data only) + Summary (AI, `[n]` citations → jump to node) + References (JSON/MD/BibTeX), print-to-PDF |
| `/join/[token]` | Accept share link |
| `/settings` | Profile, extension connect + token, MCP token + `claude mcp add` command, demo controls (simulate API outage / AI outage / latency / reset data) |

**Canvas screen features** (`features/`)
- React Flow graph with **5 node types**: Page = browser-tab card with a real website view, Question, Note (Markdown, double-click edit), Finding, Topic group (collapse, rename, resize).
- **Explained edges** (13 relation types): click → "Why are these connected?" with reason, evidence, confidence, origin; Accept / Change relationship / Reject / edit reason.
- **Mouse**: scroll to pan (Excalidraw-style), Ctrl+scroll/pinch to zoom, drag or Space+drag to pan, drag nodes, drop into or out of groups (locks placement), drag handle to connect (relation picker), Shift for multi-select, double-click empty canvas for a note, right-click menus, Delete key.
- **Toolbar**: Add (page/note/question/finding/topic), AI Re-organize (+Undo), **Horizontal / Vertical tree layout toggle**, Filters (tags, categories, page type, domain, show suggested/weak), Color by (topic/source/importance/page type/collaborator/branch), Journey line.
- **Views**: Graph · Focus (2-hop neighbourhood + breadcrumb) · List (sortable table) · Grid (cards by topic) · Timeline (visit bars per topic).
- **Panels**: Node details (preview Snapshot/Live/Interactive, Why did I open this?, AI analysis, Research Memory, tags/category/importance, notes/highlights/threaded comments, connections incl. weak suggestions), Research Radar, Conflict Radar (side by side, methodology, Keep both / Resolve / Add resolution to notes / Dismiss), Research Memory (time per topic + journey), AI activity feed, Inbox.
- **Top bar**: Start / Pause / Resume / Stop Tracking with timer, Ctrl+K search, view switcher, radar/conflict/inbox badges, branch switcher + Compare & merge, presence avatars, connection status, Share (links, roles, members, online status), Export (JSON, MD, PNG, SVG, CSV, Bookmarks, Mermaid, BibTeX).
- **Resume exactly**: view state (zoom, pan, selection, view, panel, branch, filters, colour-by) is saved via `PUT /view-state` and restored on open.
- Loading skeletons, empty states, error states with Retry, toasts, keyboard shortcuts (`?`), responsive drawers.

**Code map**
```
web/types/api.ts          all contracts
web/lib/api/*             one module per endpoint group (the only place HTTP happens)
web/lib/ws/socket.ts      WebSocket (real + mock)
web/lib/extension/*       extension bridge + demo simulator
web/stores/*              Zustand: auth, graph, ui, session, collab/signals, extension
web/features/graph/actions.ts   all graph mutations (optimistic + API + toasts)
web/features/*            canvas, panels, views, search, workspace screen, dialogs
web/components/ui/*       design system (DESIGN.md)
web/mock/*                mock backend: db, seed, server (routes), compute, pipeline, presence
```

---

## 8. Known limits / things to replace

| Item | Now | Replace with |
|---|---|---|
| All data | Browser localStorage (mock) | Go + PostgreSQL |
| AI results | Pre-written demo analyses + templated text | Python agents via Go |
| Browsing capture | Scripted simulator | Chrome extension |
| Page previews | Public screenshot service (mShots) + Google favicons (page URLs leave the browser) | Extension snapshots / `GET /pages/:id/preview` |
| PDF | Browser print-to-PDF | `@react-pdf/renderer` (spec §F18) if needed |
| Search ranking | Simple token scoring | PostgreSQL FTS + trigram + pgvector with RRF |
| Live Video preview | Refreshing snapshot + LIVE badge | `chrome.tabCapture` stream |
