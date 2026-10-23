# Peers App

Peers is a client-side photo demo application that showcases a responsive photo gallery interface. The app is built as a **single-file HTML** with all CSS and JavaScript embedded inline, requiring no build process or backend server to run.

## Quick Start

**Desktop:** Double-click `web/index.html`  
**Mobile:** Double-click `web/mobile.html`

Both files work completely offline in any modern browser.

## Build Variants

| File | Target | localStorage Key |
|------|--------|------------------|
| `web/index.html` | Desktop browsers | `peers_demo_v3` |
| `web/mobile.html` | Mobile browsers | `peers_mobile_v1` |

The two builds are optimized for different screen sizes but share the same core functionality.

## Architecture

- **Single-file design:** All HTML, CSS, and JavaScript are contained within one file per build variant.
- **Client-side only:** No `fetch()` or `XMLHttpRequest` calls. The app does not require a server.
- **Persistence:** Demo data is stored in browser localStorage using the keys shown above.
- **Assets:** Large image assets are embedded as base64 data URIs within the JavaScript.

## Optional Backend (Zero-Dependency Python)

An optional Python stdlib backend provides server-side persistence while keeping the front-end files **byte-pristine** (never modified on disk).

### Run the Backend

```bash
python apps\peers\server\server.py
```

This serves both the API and the static front-end on `http://127.0.0.1:8788/`.

**CLI Options:**
- `--port 8788` — Custom port (default: 8788)
- `--host 127.0.0.1` — Custom host (default: 127.0.0.1)
- `--no-browser` — Do not open browser on start

**Environment:**
- `PEERS_DB` — Override database path (default: `apps\peers\server\data\peers.db`)

### API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/health` | Health check: `{"status":"ok","app":"peers","version":"1.0"}` |
| `GET` | `/api/state` | Get full state document |
| `PUT` | `/api/state` | Replace entire state (body: JSON object) |
| `POST` | `/api/reset` | Reset to seed state |
| `POST` | `/api/auth/signup` | Create user: `{action:"signup",email,password,name}` |
| `POST` | `/api/auth/signin` | Login: `{action:"signin",email,password}` |
| `POST` | `/api/auth/logout` | Logout: `{action:"logout"}` |
| `OPTIONS` | `/api/*` | CORS preflight (204) |

All responses include `Access-Control-Allow-Origin: *`.

### Serve-Time HTML Injection (Key Design)

The backend **never modifies** `web/index.html` or `web/mobile.html` on disk. Instead, when serving these files:

1. The server reads the HTML file from disk
2. It injects a small `<script>` shim **immediately before** the first `<script>` tag
3. The injected HTML is served to the browser

The shim does two things:

**(a) Hydrate at boot:** Synchronously sets `localStorage.setItem(KEY, <server state>)` before the app's own `loadState()` runs, so the app reads server state on startup.

**(b) Sync on write:** Wraps `Storage.prototype.setItem` and `removeItem` to fire-and-forget `fetch('/api/state', {method:'PUT', ...})` after every localStorage write, keeping the server in sync.

The shim uses the correct localStorage key for each file:
- `index.html` → `peers_demo_v3`
- `mobile.html` → `peers_mobile_v1`

**Why this matters:**
- Front-end files remain **byte-pristine** (verified by `test_static_integrity.py`)
- No build step required
- Offline mode still works (double-click HTML files directly)
- Server adds persistence as an optional enhancement

### Offline Guarantee

The app works **completely offline** when opened directly via `file://`:
- No backend required
- All state stored in browser localStorage
- No external dependencies

The backend is an **optional enhancement** for server-side persistence. It does not break offline mode.

## Documentation

Product documentation and screenshots are located in the `docs/` folder:

- `Peers App.md` — Product overview and usage guide
- `Peers-Master-Product-Guide-v0.6.pdf` — Master product guide (PDF)
- `screenshots/` — Desktop screenshots
- `screenshots-mobile/` — Mobile screenshots

## Tests

### Static Integrity Tests

Run the static integrity tests to verify the HTML builds have not been corrupted:

```bash
python apps\peers\tests\test_static_integrity.py
```

The test checks:
- File size sanity (> 1MB)
- Valid UTF-8 encoding
- No `fetch()` or `XMLHttpRequest` (client-side guarantee)
- Expected localStorage key present
- No absolute-root asset references (`src="/`, `href="/`)
- No `<base>` tag

### API Verification Tests

Run the hermetic API tests (spawns server with temp DB, free port):

```bash
python apps\peers\tests\verify_api.py
```

Tests cover:
- Health endpoint
- State GET/PUT round-trip
- Reset endpoint
- Auth signup/signin/logout
- CORS headers
- OPTIONS preflight
- 404 for unknown routes
- 400 for malformed JSON
- HTML injection (shim present, precedes original script)

## Directory Structure

```
apps/peers/
  web/
    index.html        # Desktop build (5,468,126 bytes)
    mobile.html       # Mobile build (5,477,175 bytes)
  server/
    server.py         # Zero-dependency Python backend
    seed_state.json   # Seed state documentation
    data/
      peers.db        # SQLite database (created on first run)
  tests/
    test_static_integrity.py
    verify_api.py
  docs/
    Peers App.md
    Peers-Master-Product-Guide-v0.6.pdf
    screenshots/
    screenshots-mobile/
  README.md
```

## Categories (modes) + AI Tools

Peers now works as a **multi-category app**. A category switcher (the pill row under the
header / app bar, or **All categories**) scopes the whole interface — feed, explore, writing
and the market — to one vertical. Pick a category and every screen becomes about it.

The **AI Tools** mode merges the *Desk Verdict* AI-tool scorecard: score a tool on a real
work task across five dimensions (time saved, output quality, ease of use, cost vs value,
work safety) and get a **Use it / Wait / Skip** verdict (work safety is a hard gate at ≤ 2).

The taxonomy lives in `web/index.html` / `web/mobile.html` as the appended `MODES` module
(a second `<script>` block before `</body>`). It overrides app globals
(`seed`, `views.feed` / `views.map` / `views.market` / `views.search`, `render`, `runSearch`)
and injects its own markup and CSS at runtime — the original script is not edited.

### Categories (32)

- **Places:** Food & Drink · Travel & Stays · Shops & Retail · Home Services · Health & Wellness · Beauty & Personal Care · Auto & EV · Real Estate · Pets · Kids & Care · Fitness & Sport · Events & Fun · Groceries · Learning · Public Services · Nonprofits
- **Tools & services:** AI Tools · Software & SaaS · Money & Finance · Apps & Marketplaces · Telecom & Internet · Streaming & Media · Freelancers & Agencies
- **Products (Peers Market):** Peers Market · Gadgets & Electronics · Home & Garden · Fashion & Apparel · Baby & Maternity · Books & Stationery · Gifts & Handmade · Wellness & Nutrition
- Plus **All** (everything).

Every category describes what people review there and its market, and any category with no
reviews yet shows a "be the first to review" hub. Searching a category name (e.g. "doctors",
"hotels", "AI tools") surfaces a **Jump to category** result.

### New state keys

`mode` (active category) and `verdicts` (AI tool scorecard records) join the state document,
alongside `votes` and `feedFilter`; all four are in the server seed and the required-key list.

## Roadmap

### Current State (v0.6)
- [x] Single-file HTML builds (desktop + mobile)
- [x] Client-side localStorage persistence
- [x] Static integrity tests
- [x] Backend persistence layer (optional, zero-dependency)
- [x] Serve-time HTML injection (byte-pristine front-ends)
- [x] Hermetic API tests
