# Research Map — web (frontend)

Next.js 16 + React 19 + Tailwind 4 + React Flow 12 + Zustand + TanStack Query.
Frontend and API-contract layer for **Visual Research & Browser Tab Manager** (see `../allaboutourproject.md`, visual system in `../DESIGN.md`).

## Run

```bash
cd web && npm install && npm run dev
```

Open http://localhost:3000 and click **Continue with demo account** (`demo@researchmap.app` / `demo1234`).
The seeded workspace **AI in Healthcare** has about 20 pages, topic groups, explained edges, a conflict, an under-covered topic, two collaborators, and sessions with visits.

Demo flow: open the workspace → **Start Tracking**. A browsing simulator (standing in for the Chrome extension) runs searches and opens pages. Question and page nodes appear, then go through Agent 1 → 2 → 3, land in topic groups and get explained edges. A conflict is detected and a non-research page goes to the Inbox. **Stop → Stop & generate report** opens the Session Report.

## Mock vs real backend

| Env | Value | Effect |
|---|---|---|
| `NEXT_PUBLIC_API_MODE` | `mock` (default) | Every call goes to the in-browser mock server (`mock/`), persisted to localStorage |
| | `http` | Calls go to `NEXT_PUBLIC_API_BASE_URL` (`/api/v1`), rewritten to `API_PROXY_TARGET` (Go) |

Components never call `fetch`. They use `lib/api/*` → `apiClient` → transport (mock or http). The WebSocket is abstracted the same way in `lib/ws/socket.ts`. The mock server implements the same paths and JSON shapes as §17 of the spec, so moving to Go is an env change.

**Settings → Demo controls** can simulate API outage, AI outage and latency, and can reset the demo data.

## Structure

```
app/            routes: /login /register /workspaces /w/[id] /w/[id]/report/[sessionId] /join/[token] /settings
types/api.ts    all request/response/WebSocket contracts (snake_case, as the Go API sends)
lib/api/        client.ts (transport switch) + one module per endpoint group
lib/ws/         WebSocket abstraction (real + mock)
lib/extension/  extension bridge (Go to tab, tab groups…) + browsing simulator
mock/           mock server: db, seed, routes (server.ts), computations, AI pipeline, presence
stores/         Zustand: auth, graph, ui (view state), session, collab/signals, extension
features/       canvas, panels, views, search, workspace screen, dialogs, graph actions
components/     design-system primitives (DESIGN.md) + shell
```

See **`INTEGRATION.md`** for everything built so far, the full API/WebSocket contract and how to plug in the Go backend and Chrome extension.
