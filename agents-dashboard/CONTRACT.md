# agents-dashboard — Bridge Contract v1

Fixed interface for the "virtual bots office" dashboard. Both the bridge (backend)
and the dashboard (frontend) MUST conform to this. Do not change it without updating both.

## Components

- **Bridge** = `agents-dashboard/server.py` — Python 3 **standard library only** (`http.server`,
  `json`, `urllib`, `threading`, `subprocess`, `os`). Serves the dashboard AND proxies OpenCode.
- **Dashboard** = `agents-dashboard/index.html` — single-file, served by the bridge (live mode)
  or openable via `file://` (falls back to simulated mode).
- **Upstream** = `opencode serve` on `http://127.0.0.1:4096` (pin the port; its default is random `0`).

## Auth (IMPORTANT)

`opencode serve` requires HTTP Basic auth. Credentials come from environment variables:
- `OPENCODE_SERVER_USERNAME` (default `opencode`)
- `OPENCODE_SERVER_PASSWORD` (present in the user's env)

The bridge reads these from `os.environ` and adds an `Authorization: Basic ...` header to every
upstream call. **NEVER hardcode the password in any file. NEVER print/log it.**

## Upstream DISCOVERY (IMPORTANT — revised)

The user normally runs the OpenCode **desktop app**, which hosts its own OpenCode server
(observed on `127.0.0.1:9181`, but the port is **dynamic**). Spawning a separate
`opencode serve` with the bundled CLI (v1.16.2) FAILS on prompt-writes in this environment:
`SQLiteError: no such column: replacement_seq` — because the older CLI shares the session DB
(`~/.local/share/opencode/opencode.db`) with the newer desktop app (v1.18.34).

So the bridge MUST prefer connecting to an ALREADY-RUNNING OpenCode server, discovered as:
1. `--upstream <url>` CLI arg, or `OPENCODE_SERVER_URL` env var → use it directly.
2. Else enumerate **listening localhost TCP ports** (e.g. parse `netstat -ano`), and for each
   try `GET /config` with Basic auth (short ~0.4s timeout). The first that returns **200** AND
   a body containing an OpenCode signature (`"$schema"` containing `opencode`, or an
   `openapi`/config shape) wins. Prefer `9181`/`4096` first if present.
3. Else spawn `opencode serve --port 4096 --hostname 127.0.0.1` (existing behavior) and wait.
4. Else → `sim` mode.
A discovered/pre-existing server is NOT ours → do NOT terminate it on exit. Only terminate a
server WE spawned.

## Bridge base URL

`http://127.0.0.1:8790` (pinned).

## Bridge endpoints (what the dashboard calls)

| Method | Path | Purpose | Returns |
|--------|------|---------|---------|
| GET | `/` | Serve dashboard | `index.html` |
| GET | `/vendor/*`, `/assets/*` | Static files | file bytes |
| GET | `/api/health` | Bridge + upstream status | `{ ok: bool, mode: "live"\|"sim", opencode: { connected: bool, url: string } }` |
| GET | `/api/agents` | Agent list (from upstream `GET /agent`) | `{ agents: [{ name, description, mode }] }` |
| GET | `/api/sessions` | Recent sessions (from upstream `GET /session`) | `{ sessions: [{ id, title, directory }] }` |
| GET | `/api/events` | **SSE** live normalized event stream | `text/event-stream` (see below) |
| POST | `/api/command` | Send a goal | see "Command" |
| POST | `/api/permission` | Reply to a permission request | `{ ok: bool }` |

### POST /api/command
Request body: `{ "goal": string, "agent": string, "session_id"?: string }`
- If `session_id` omitted: create one via upstream `POST /session` (body `{ "title": <goal[:80]> }`).
- Then call upstream `POST /session/{id}/prompt_async` (returns `204`, fire-and-forget) with body:
  `{ "agent": <agent>, "parts": [ { "type": "text", "text": <goal> } ] }`.
  Fallback to `POST /session/{id}/message` only if `prompt_async` 404s.
- The bridge returns immediately (do NOT block on the assistant turn):
  Response: `{ "ok": true, "session_id": string, "mode": "live"|"sim" }`
- In `sim` mode: return `{ "ok": true, "session_id": "sim-..." }` and let the sim emitter react.

### POST /api/permission
Request body: `{ "id": string, "reply": "once"|"always"|"reject" }`
- Proxies upstream `POST /permission/{id}/reply` (or the documented equivalent).
- Response: `{ "ok": bool }`

## Normalized SSE event (what `/api/events` emits)

One JSON object per `data:` frame. This is the SAME shape the dashboard's mock feed uses:

```json
{ "ts": 1699999999999, "session_id": "ses_...", "agent": "coder",
  "phase": "start|tool|end|info|error|permission", "tool": "file_write",
  "detail": "writing main.py", "goal_id": "goal-001", "raw": { } }
```

Mapping from upstream OpenCode SSE (`GET /event`, envelope `{ id, type, properties }`):
- `message.part.updated` where `properties.part.type == "tool"` → `phase:"tool"`, `tool = part.tool`,
  `detail = part.state.status` (pending/running/completed/error), `session_id = properties.sessionID`.
- `session.idle` → `phase:"end"`.
- `session.status` (busy) → `phase:"start"` on transition to busy.
- `session.error` → `phase:"error"`.
- `permission.asked` → `phase:"permission"`, `detail = properties.permission`, `raw.id = properties.id`.
- Best-effort `agent` attribution from the event's message/part info; if unknown, use the
  session's chosen agent or `"agent"`. Never block the stream waiting for attribution.
- Always include `raw` = the original upstream event so nothing is lost.

## Modes

- **live**: upstream reachable. Bridge spawns/attaches to `opencode serve` and proxies real events.
- **sim**: upstream NOT reachable. Bridge emits a scripted simulated event stream so the UI is
  fully usable/demoable. The dashboard MUST visibly label sim vs live (no AI theater).

## Process management (bridge)

- On start: if `http://127.0.0.1:4096` is not answering, spawn
  `opencode serve --port 4096 --hostname 127.0.0.1` as a child process, wait up to ~40s for readiness.
- Locate the executable via `shutil.which("opencode")` or the known path
  `~\AppData\Local\PEGAAi Opencode\opencode.exe`.
- On bridge shutdown (Ctrl-C): terminate the child `opencode serve` if the bridge spawned it.
- If `opencode` cannot be found or never becomes ready → fall back to `sim` mode (never crash).
