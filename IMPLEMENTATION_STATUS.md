# Implementation Status

> Tracks the real backend, AI service and extension work. Updated at the end of every phase.
> Product spec: `allaboutourproject.md` (local, git-ignored). Frontend contract: `frontend/INTEGRATION.md` + `frontend/types/api.ts`.

**Current phase:** Phase 1 — Go backend foundation (Phase 0 audit done; decisions D4, D14, D16 made on 2026-10-01)

---

## Phase 0 — Repository audit

### 0.1 What exists

| Area | State | Notes |
|---|---|---|
| `frontend/` (was `web/`) Next.js 16.3.8, React 19.2, Tailwind 4, React Flow 12.12, Zustand 5, TanStack Query 5, Recharts 3 | Built | 11.4k lines. Mock + HTTP transports (`NEXT_PUBLIC_API_MODE`). |
| `frontend/types/api.ts` | Built | 896 lines, all contracts (source of truth for JSON shapes). |
| `frontend/lib/api/*` | Built | 16 modules, 71 REST calls. Only place HTTP happens. |
| `frontend/lib/ws/socket.ts` | Built | Real WS: `ws(s)://<host>/api/v1/ws?workspace_id=`, reconnect backoff 0.5 s → 15 s. |
| `frontend/lib/extension/bridge.ts` | Partly built | Web → extension `sendMessage` only. **No listener for extension → web messages.** |
| `frontend/mock/*` | Built | In-browser reference backend (localStorage). `server.ts` = routes, `compute.ts` = formulas, `pipeline.ts` = simulated agents. |
| `frontend/lib/extension/simulator.ts` | Built (demo only) | Used by `WorkspaceScreen.tsx` / `useWorkspace.ts`. Must be switched off in HTTP mode once the extension works. |
| `backend/` (Go) | **Missing** | |
| `agent/` (Python) | **Missing** | |
| `extension/` (WXT) | **Missing** | |
| Tests | **None** | No test files in `frontend/`. Checks: `tsc`, `eslint`, `next build`. |
| Git | `main`, remote `github.com/SanketBhandarii/3-idiots` | `allaboutourproject.*`, `DESIGN.md`, `.claude/` are git-ignored on purpose. |

**Toolchain on this machine:** Go 1.26.5 ✅ · Node 22.13 ✅ · uv 0.11 ✅ (will install Python 3.12) · Python 3.9 system (not used) · Docker client installed but **daemon not running** · **no C compiler** (so use the prebuilt `sqlc` Windows binary; goose and River migrations run as Go libraries, no CLIs needed) · no `psql`.

**Database:** Neon PostgreSQL (given by the team) instead of local Docker. `docker-compose.yml` will still be provided for offline work.

### 0.2 Endpoint inventory (71 REST + WS + MCP + health)

Phase in brackets = when it gets implemented.

| Group | Endpoints |
|---|---|
| Health [1] | `GET /healthz` (liveness), `GET /readyz` (DB check) |
| Auth [2] | `POST /auth/register`, `POST /auth/login`, `POST /auth/logout`, `GET /me` |
| Tokens [2] | `GET /tokens`, `POST /tokens`, `DELETE /tokens/:id` |
| Workspaces [3] | `GET/POST /workspaces`, `GET/PATCH/DELETE /workspaces/:id` |
| Graph & view [4] | `GET /workspaces/:id/graph?branch=`, `PUT /workspaces/:id/view-state` |
| Reorganize [11] | `POST /workspaces/:id/reorganize`, ★`POST …/reorganize/undo` |
| Members & sharing [14] | `GET …/members`, ★`GET …/share-links`, `POST …/share-links`, ★`DELETE …/share-links/:linkId`, `POST /join/:token`, `PATCH/DELETE …/members/:userId` |
| Branches [3 list/create, 14 compare/merge] | `GET/POST …/branches`, `GET …/branches/compare?a=&b=`, `POST /branches/:id/merge` |
| Sessions [6] | `POST …/sessions/start`, `POST /sessions/:id/stop`, ★`…/pause`, ★`…/resume`, `GET …/sessions`, `GET …/journey?session=` |
| Stats, refs, report [13] | `GET /sessions/:id/stats`, `GET /sessions/:id/references?format=`, `POST/GET /sessions/:id/report` |
| Capture [6] | `POST /capture/page`, `/capture/search`, `/capture/visits`, `/capture/highlight`, `PUT/GET /pages/:id/preview` |
| Nodes [4] | `POST /nodes`, `PATCH/DELETE /nodes/:id`, ★`POST /nodes/:id/restore`, `POST /nodes/positions`, ★`POST /nodes/:id/merge` |
| Edges [4] | `POST /edges`, `PATCH/DELETE /edges/:id` |
| Annotations [5] | `POST /nodes/:id/annotations`, `PATCH/DELETE /annotations/:id` |
| Tags & categories [5] | `GET/POST …/tags`, `PUT /nodes/:id/tags`, `GET/POST …/categories`, ★`PATCH /categories/:id` |
| Radar [11] | `GET …/radar`, `POST …/radar/:topicId/suggestions`, ★`PATCH …/radar/items/:itemId` |
| Conflicts [12] | `GET …/conflicts`, `PATCH /conflicts/:id`, `POST /conflicts/:id/methodology` |
| Search [11] | `GET …/search?q=&filters=` |
| Export/import [13] | `GET …/export?format=`, `POST /workspaces/import` |
| WebSocket [7] | `GET /ws?workspace_id=` — 22 server event types, 2 client types (see `WsServerMessage` in `types/api.ts`) |
| MCP [15] | `/api/v1/mcp` Streamable HTTP, 11 tools |

★ = frontend addition (not in spec §17).

**WebSocket server events (22):** `node.created/updated/deleted`, `edge.created/updated/deleted`, `annotation.created/updated/deleted`, `page.created`, `page.analyzed`, `graph.reorganized`, `conflict.detected/updated`, `radar.updated`, `preview.updated`, `presence`, `node.moving`, `job.status`, `session.updated`, `tags.updated`, `categories.updated`. **Client events (2):** `presence.update`, `node.moving`.

**Python internal endpoints [8]:** `POST /v1/embed`, `/v1/understand`, `/v1/place`, `/v1/cluster`, `/v1/conflicts/check`, `/v1/conflicts/methodology`, `/v1/radar/suggest`, `/v1/report`, `GET /health`.

**Extension messages [10]:** web → ext: `PING`, `FOCUS_TAB`, `OPEN_URLS_AS_GROUP`, `CLOSE_SAVED_TABS`, `REQUEST_LIVE_VIDEO`, `ENABLE_INTERACTIVE_EMBED`, `START_TRACKING`, `STOP_TRACKING`. ext → web: `TABS_STATE`, `SNAPSHOT`, `LIVE_STREAM_ID`, `TRACKING_STATE` (receiver not built yet, see D1).

### 0.3 Discrepancies and risks

| # | Where | Problem | Proposal | Phase |
|---|---|---|---|---|
| D1 | `INTEGRATION.md §6` vs `frontend/lib/extension/bridge.ts` | Guide says extension → web messages arrive on a "port listener". No listener exists; `SNAPSHOT`, `LIVE_STREAM_ID`, `TRACKING_STATE`, `TABS_STATE` cannot reach the UI. | Add `chrome.runtime.connect(EXTENSION_ID)` port in `bridge.ts` after `PING` succeeds; route the 4 messages into `stores/extension.ts`. Small frontend addition. | 10 |
| D2 | Spec §9.4 `CONNECT_TOKEN` vs Settings page | No way to hand the extension token to the extension; Settings only shows it to copy. | Add `CONNECT_TOKEN {token, api_base}` to the bridge, sent right after "Create extension token". Extension popup also accepts a pasted token as fallback. | 10 |
| D3 | `bridge.ts` / `WorkspaceScreen.tsx` | `START_TRACKING` / `STOP_TRACKING` are typed but never sent; the extension also needs `session_id` for `/capture/visits`. | Send `START_TRACKING {workspace_id, session_id}` after `sessionApi.start`, `STOP_TRACKING` after stop/pause. Contract addition: `session_id` field. | 10 |
| D4 | `frontend/lib/utils/url.ts#normalizeUrl` | Lower-cases the **whole** URL (path + query). Case-sensitive URLs (e.g. Wikipedia titles, IDs in query strings) would merge into one node. | Lower-case only scheme + host. Same rule in Go `urlnorm`, the extension and `url.ts`. **Decided: host-only lower-case.** | 6 |
| D5 | Mock `PATCH /nodes/:id` | Mock accepts versions up to 5 behind; guide says stale → 409. Also the mock bumps `version` on every AI stage change, so strict checks would cause many false 409s while a page is being analyzed. | Strict check (`version != current` → 409 with latest node). Bump `version` only when a user-editable field changes (title, body, x, y, parent, size, category…); `ai_stage`-only updates do not bump it. | 4 |
| D6 | `ShareDialog` (`features/workspace/Dialogs.tsx:69`) | The list of existing links shows a copyable `url` with the token. Spec says store only a hash, so the URL cannot be shown again. | Store SHA-256 hash for lookup **plus** the token encrypted with AES-GCM (`SHARE_LINK_KEY`) so owners can copy it again. Contract unchanged. | 14 |
| D7 | Radar item ids | Ids are derived strings (`low:<uuid>`, `q:<uuid>`, `concept:<text>`), typed as UUID, sent URL-encoded in the path. | Keep string ids; store status in `radar_item_states (workspace_id, item_key)`. Gin: `UseRawPath` + `UnescapePathValues` so `%2F` in a concept does not break routing. | 11 |
| D8 | Mock graph | Topic nodes are returned for every branch view. | Keep: topic groups are shared layout containers across branches. | 4 |
| D9 | Spec §16 schema vs `types/api.ts` | Missing columns: page `is_research_reason, questions_answered, embeddable, excerpt, preview_captured_at`; node `ai_stage, duplicate_of`; branch `color`; session `state, paused_ms, paused_at`; report `status, model`; radar item states; reorganize undo snapshots; idempotency keys. | Schema follows `types/api.ts`; spec §16 updated to match. | 1–13 |
| D10 | Mock-only shortcuts | `_lib_key`, `_conflict_with`, pre-written analyses, hard-coded methodology checklist, hard-coded report sentences, `DELETE /tokens/:id` without owner check. | Not copied. Real logic via Go + Python. | all |
| D11 | Page previews | Nodes load screenshots from a public service (mShots) and favicons from Google — page URLs leave the browser. | Replace with extension snapshots (`GET /pages/:id/preview`) in real mode. | 10/17 |
| D12 | WebSocket through Next.js rewrite | Not verified that `next dev` rewrites proxy WebSocket upgrades. | Verify in Phase 7. Fallback: `NEXT_PUBLIC_WS_URL=ws://localhost:8080/api/v1/ws` (the cookie is sent because cookies are per host, not per port); Go checks the `Origin` header. | 7 |
| D13 | Neon connection | The given URL uses the **pooler** host (PgBouncer transaction mode). River uses `LISTEN/NOTIFY`, which does not work through it; goose migrations also prefer a direct connection. | `DATABASE_URL` = direct host (same URL without `-pooler`) for Go (API + River + migrations). River runs normally. | 1 |
| D14 | Groq keys | 3 keys were provided. Groq limits are per organization, so keys from the same org add nothing; rotating keys from different accounts to get around limits may break Groq's terms. | Backend uses one key (`GROQ_API_KEY`). Other keys are for teammates' local development. **Decided: one key.** | 8 |
| D15 | Secrets in chat | The Neon password and Groq keys were pasted into a chat. | Stored only in git-ignored `.env` files. Rotate them after the hackathon (Neon: reset role password; Groq: revoke keys). | 1 |
| D16 | Folder names | Request asked for separate backend and frontend folders. | **Decided: rename.** `web/` → `frontend/` (done with `git mv`, docs and `.claude/launch.json` updated), Go in `backend/`, Python in `agent/`, extension in `extension/`. | 1 |
| D17 | `activity[7]` on workspace cards | Mock counts per local browser day. | Server counts per UTC day. | 3 |
| D18 | `frontend/.gitignore` has `.env*` | This also ignores `frontend/.env.example`, which `INTEGRATION.md` references. | Add `!.env.example` to `frontend/.gitignore`. | 1 |

### 0.4 Proposed backend structure

```
backend/                               Go module github.com/SanketBhandarii/3-idiots/api
├── cmd/server/main.go             config → DB pool → migrations → River → HTTP (graceful shutdown)
├── cmd/migrate/main.go            run goose + River migrations only
├── internal/
│   ├── config/                    env loading + validation
│   ├── db/migrations/*.sql        goose (embedded with go:embed)
│   ├── db/queries/*.sql           sqlc input
│   ├── store/                     sqlc generated code (do not edit)
│   ├── httpx/                     Gin engine, middleware (request id, logging, recover, body limit, auth), error envelope
│   ├── auth/                      password hashing, JWT cookie, API tokens, identity context
│   ├── access/                    shared permission checks (workspace role, branch rules) — used by REST, jobs and MCP
│   ├── service/                   business logic, one file per area (workspaces, graph, capture, sessions, …)
│   ├── handlers/                  thin Gin handlers → services
│   ├── realtime/                  WebSocket hub, rooms, presence
│   ├── jobs/                      River workers (analyze_page, place_page, cluster, conflicts, report)
│   ├── agentclient/               HTTP client for the Python service
│   ├── urlnorm/                   URL cleaning (shared rule, see D4)
│   └── mcpserver/                 MCP tools → services
├── sqlc.yaml
└── .env.example
agent/                             Python 3.12 (uv), FastAPI — app/main.py, app/agents/*, app/prompts/*, tests/
extension/                         WXT + TypeScript MV3
```

### 0.5 Phase acceptance checklist

| Phase | Done when |
|---|---|
| 1 Foundation | Go starts; config validated; migrations run on a fresh Neon DB; `/healthz` + `/readyz` work; errors use the envelope; web in `http` mode reaches Go through the rewrite; no secrets in git |
| 2 Auth | register/login/logout/me with bcrypt + httpOnly JWT cookie; tokens hashed, shown once, revocable; login rate-limited; refresh restores session |
| 3 Workspaces | CRUD; Main + personal + AI Agent branches created; roles enforced; list shape matches `Workspace` |
| 4 Graph | graph load; node/edge CRUD persist; relative positions; strict 409; view state restores |
| 5 Manual tools | annotations, tags (dedupe), categories; role checks |
| 6 Sessions & capture | start/pause/resume/stop; capture creates node instantly; no duplicates on retry; visits backfill; stats from real visits |
| 7 Realtime | authenticated WS; exact envelopes; no cross-workspace leaks; presence + moving |
| 8 Python AI | 8 endpoints validated; real Groq + fastembed; safe fallbacks; no DB access |
| 9 Pipeline | captured → ready through River; retries idempotent; locks respected; embedding-only fallback labelled honestly |
| 10 Extension | loads in Chrome; connects; opt-in tracking; capture/visits/highlights reach Go; privacy exclusions |
| 11 Search/Radar | hybrid search with RRF; reorganize + undo; radar from real data |
| 12 Conflicts | grounded in stored claims; review/resolve/dismiss persist and sync |
| 13 Reports | stats, references, AI report with validated citations; exports/imports |
| 14 Sharing | links with roles/expiry; join; compare; merge with provenance |
| 15 MCP | real client connects; 11 tools; AI Agent branch; permissions |
| 16 Full test | end-to-end, failure modes, security checks |
| 17 UX cleanup | real mode has no demo behaviour; docs final |

---

## Phase 1 — Go backend foundation (plan)

**Scope:** runnable Go service with config, logging, error envelope, health checks, migrations on Neon, and the Next.js proxy path. No product features.

| Item | Detail |
|---|---|
| Module | `backend/` → `github.com/SanketBhandarii/3-idiots/backend`, Go 1.25+ |
| Packages | `internal/config` (env + validation, tiny `.env` loader, no extra dependency), `internal/httpx` (Gin engine, request ID, structured `slog` logs, panic recovery, body limit, `NoRoute`/`NoMethod` envelopes, error helpers), `internal/db` (pgxpool with startup retry, embedded goose migrations), `internal/store` (sqlc output), `internal/handlers/health.go` |
| Endpoints | `GET /api/v1/healthz` (process alive) · `GET /api/v1/readyz` (DB ping, migration version, required extensions `vector`, `pg_trgm`, `pgcrypto`) |
| Migration | `00001_extensions.sql` creates the three extensions. Real tables start in Phase 2. |
| sqlc | `sqlc.yaml` + `queries/health.sql` (used by `/readyz`, proves generation works) |
| Env | `API_ADDR`, `APP_ENV`, `DATABASE_URL` (Neon **direct** host, D13), `DB_MAX_CONNS`, `WEB_ORIGINS`, `MAX_BODY_BYTES`, `LOG_LEVEL`, `MIGRATE_ON_START`, `SHUTDOWN_TIMEOUT` |
| Frontend | No code change. `frontend/next.config.ts` already rewrites `/api/*` to `API_PROXY_TARGET` in `http` mode. |
| Security | secrets only in git-ignored `backend/.env`; logs never print query strings, bodies or headers; body limit 1 MB → 413 `bad_request`; unknown routes → 404 `not_found` envelope; panics → 500 `internal` without stack traces |
| Failure cases | missing/invalid env → exit with a clear message; DB unreachable at start → 5 retries with backoff, then exit; DB lost later → `/readyz` 503 |
| Tests | unit: config validation, envelope, body limit, request ID, 404/405, panic recovery; integration (runs only if `DATABASE_URL` set): migrations + `/readyz` against Neon |

---

## Log

| Date | Phase | Change |
|---|---|---|
| 2026-10-01 | 0 | Decisions: rename `web/`→`frontend/` + Go in `backend/`; one Groq key; host-only URL lower-casing. `frontend/.gitignore` now keeps `.env.example`.
| 2026-10-01 | 0 | Audit written. Root `.gitignore` now ignores `.env` files (`!.env.example` kept) and build output. No application code changed. |

---

## Fast build (2026-10-01) — full working version

Per the team's request, the phase gates were merged into one build. **Verified end to end** on Neon + Groq:
register/login (httpOnly JWT) · workspaces + Main/personal/AI Agent branches · graph load · node/edge CRUD with strict 409 ·
capture page/search/visits · AI pipeline (Agent 1 gpt-oss-20b → embeddings → Agent 2 gpt-oss-120b → topic placement → conflict check) ·
stats from real visits · references (md/bibtex) · AI report with validated [n] citations · hybrid search (FTS + trigram + pgvector, RRF) ·
radar · conflicts · export · MCP (Streamable HTTP, 11 tools, AI Agent branch) · WebSocket live updates (101) · UI canvas in http mode.

**Changes vs plan:** no sqlc/River (plain pgx queries + in-process worker pool; nodes not `ready` are retried on restart).
Extension is plain MV3 JavaScript (no WXT build step). Groq free models available to the key: gpt-oss-20b/120b only.

**Run:** `cd agent && uv sync && uv run uvicorn app.main:app --port 8000` · `cd backend && go run ./cmd/server` ·
`cd frontend && npm install && npm run dev` · Chrome → chrome://extensions → Developer mode → Load unpacked → `extension/` →
open the app → Settings → Connect extension → open a workspace → Start Tracking.

**Not yet verified in a real Chrome with the extension loaded** (built, not clicked through): capture while browsing, snapshots,
live video (Alt+Shift+L), interactive embed, tab actions. **Known limits:** Readability.js not bundled (simple text extractor);
reorganize uses AI topics, not /v1/cluster; no automated test suite beyond Go unit tests; secrets were shared in chat — rotate them.

---

## 2026-10-01 — Gemini + Groq key pools, extension hardening

**AI provider architecture** (`agent/app/providers.py`): `GEMINI_API_KEY_1..4` and `GROQ_API_KEY_1..4` pools. Keys are tried in order;
429/quota → key cooled down (Retry-After) → next key; 401/403 → key disabled 10 min → next key; timeouts/5xx → next key.
One attempt per key, invalid JSON retried once, then the other provider. Everything rate-limited → Python returns 429 + Retry-After
(Go waits and retries Agent 1 up to 3×); anything else → 502 and Go uses its labelled fallback (page is always kept).
Routing: Agent 1, Agent 2, conflicts, report → Gemini first, Groq fallback. Radar, methodology → Groq first, Gemini fallback.
Embeddings + clustering stay local (fastembed, scikit-learn). `/health` shows key counts, cooling slots and routing — never key values.
Legacy single `GROQ_API_KEY` still accepted. The `groq` SDK was replaced by plain HTTPS calls (httpx).

**Pipeline trace logs** (no secrets / no page content): `[EXTENSION] page captured` · `[GO] capture received` · `[GO] node created`
(workspace_id, session_id, node_id, page_id) · `[AI] Agent 1 started/completed` · `[GO] embedding generated` · `[GO] candidates retrieved` ·
`[AI] Agent 2 started/completed` · `[GO] edges persisted` · `[WS] graph update emitted`.

**Extension** (`extension/background.js`): Mozilla Readability vendored (`extension/vendor/Readability.js`, Apache-2.0) with DOM fallback;
pages with a visible password field are never auto-captured; incognito tabs rejected in code (plus `incognito: not_allowed`);
dwell deadline persisted in `chrome.storage.session` and re-checked on the 30 s alarm (survives worker restarts) and only fires if the
same URL is still active, window focused and `idle` = active; offline outbox for `/capture/page` + `/capture/search` (retried every 30 s,
up to 20 tries, also flushed on STOP_TRACKING); `GET_OPEN_TABS` message added (frontend uses it on Stop).

**Verification:** Python 3.12 env via `uv sync`; `uv run pytest` → 14 passed (key rotation, 429 cooldown, Gemini→Groq fallback, light-task
routing, quote grounding, Agent 2 candidate filtering, 429 propagation). `go build/vet` OK, `tsc` OK.
**Not verified:** live E2E against Neon/Gemini/Groq and in Chrome — no `backend/.env` / `agent/.env` with real credentials exists on this machine.

## 2026-10-01 — Live environment + real pipeline run
Real `.env` files written (git-ignored). Neon (direct host) connected, migrations at v2, `vector`/`pg_trgm`/`pgcrypto` present, `/readyz` ok.
Gemini model switched to `gemini-flash-latest` (`gemini-2.5-flash` returns 404 for these keys). All 4 Gemini + 4 Groq keys answered.
Real run through the extension's exact API calls: search → Question node; 2 real Wikipedia articles → nodes created instantly → Agent 1 (Gemini) →
384-d embedding → pgvector candidates → Agent 2 (Gemini) → `answers` + `subtopic_of` edges with reasons → topic group → `ready`;
duplicate retries returned the same node; visits → stats; capture after Stop → 409; WebSocket delivered node/page/edge/job/radar events.
Not yet done by hand: loading the unpacked extension in Chrome and clicking through the UI.

## 2026-10-01 — Pipeline audit fixes (Agent 1 → 2 → 3)
- **Agent 1 → Agent 2 bug fixed:** a search Question node (the opener) was silently left out of Agent 2's candidates: its page join is NULL, so the `linked` flag could not be scanned into a Go bool. Fixed with `coalesce`. Result in a live run: `answers` edge (0.89) from the question to the page.
- **Agent 3 is now a real stage** (`Pipeline.memory`): links visits that arrived before the page was captured, ties the page to its session, writes a `page_analyzed` event (`session_id`, analysis, topic group, edges, visits, time spent) and broadcasts `session.updated`. Before this fix, the "Agent 3" job messages were sent but nothing was saved.
- **Retries:** when Agent 1 fails, the node is retried after 30 s, 2 min and 10 min (it is still resumed on restart).
- **In-flight dedupe:** a node is never queued twice at the same time.
- **Extension:** `START_TRACKING` now opens and focuses a new normal tab (`chrome://newtab`). That page is not http(s), so it is never captured.
- **Verified live** (Neon + Gemini, using the same API calls the extension makes): stages from captured to ready over the WebSocket; 3 parallel captures produced 1 node; candidates came from pgvector, the opener, links and the question; AI edges were stored with reasons and confidence; the page went into a topic group; references and stats were saved; Agent 3 was saved; when Agent 3 failed, the page was still kept and the failure was reported.
- **Still not clicked through in a real Chrome** with the unpacked extension.
- **Conflict duplicates fixed:** both pages run the conflict check, so each pair came back once in each order and was saved twice. Now one conflict per pair, and no second `contradicts` edge when Agent 2 already drew one.
- **Topic placement:** a new node joins the topic of its strongest connected node (confidence ≥ 0.7) before the AI topic name is used (spec §14.5). Before this, two related pages could land in two groups with slightly different names. Verified live: 2 opposite coffee studies → 1 conflict, 1 `contradicts` edge, 1 topic group.
