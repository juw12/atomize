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

## Documentation

Product documentation and screenshots are located in the `docs/` folder:

- `Peers App.md` — Product overview and usage guide
- `Peers-Master-Product-Guide-v0.6.pdf` — Master product guide (PDF)
- `screenshots/` — Desktop screenshots
- `screenshots-mobile/` — Mobile screenshots

## Static Integrity Tests

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

## Roadmap

### Current State (v0.6)
- [x] Single-file HTML builds (desktop + mobile)
- [x] Client-side localStorage persistence
- [x] Static integrity tests
- [ ] Backend persistence layer (planned)

### Future: Optional Backend

A stdlib-based persistence backend **may** be added in the future under `server/`. This would provide:
- Server-side storage for demo data
- API endpoints for CRUD operations on photos
- Optional synchronization across devices

**Note:** The backend is **not yet present**. The app currently runs entirely client-side with localStorage. When a backend is added, it will be designed as an optional enhancement that does not break the existing client-only mode.

## Directory Structure

```
apps/peers/
  web/
    index.html        # Desktop build
    mobile.html       # Mobile build
  tests/
    test_static_integrity.py
  docs/
    Peers App.md
    Peers-Master-Product-Guide-v0.6.pdf
    screenshots/
    screenshots-mobile/
  README.md
```
