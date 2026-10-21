# Architecture

How this monorepo is put together, and why. Each decision here is deliberate;
see [decisions.md](decisions.md) for the short rationale per choice.

## The three apps

| App | Nature of data | Backend? |
| --- | --- | --- |
| **Orbis** | Mutable, structured (11 named collections) | **Yes** — real stdlib server + SQLite already exists |
| **Peers** | One mutable JSON state document (reviews, places, orders, messages) | **Optional** — a persistence sync layer, not a rebuild |
| **House of Articles** | Read-only catalog + price series | **No** — a *data spine file*, not a service |

The rule: **a backend is justified only by mutable or shared state.** Orbis has
it. Peers has it (a single state blob). House of Articles does not — it is a
read-only feed, so its "spine" is a versioned JSON source of truth that
generates the inline data, not a running server.

## Layout

```
apps/<name>/
  web/        static front-end -> deployed to GitHub Pages
  server/     optional zero-dependency Python backend (stdlib only)
  tests/      hermetic, stdlib-only end-to-end tests
  docs/       product specs and guides
  README.md
common/       (reserved) small shared stdlib helpers if/when duplication is real
scripts/      build_site.py, check_site.py, run_all_tests.py
docs/         this file
.github/workflows/  ci.yml, pages.yml
```

## Offline-first, server-optional

This is the load-bearing design choice, and it is why static hosting works.

- Every front-end runs **with no backend**: Orbis falls back to `localStorage`,
  Peers to its `localStorage` demo state, House of Articles to inline data.
- When a local backend *is* running, the front-end talks to it.
- Therefore GitHub Pages (which can only serve static files) always works, and
  running `python server/server.py` upgrades the same app to real persistence.

## How Peers gets a backend without touching the 5.4 MB file

Each Peers build is a ~5.4 MB single-file HTML app (mostly inline base64
photos). Hand-editing it is the single biggest risk in the project. So instead
of editing it, the local server **injects an adapter at serve time**:

1. The file on disk stays byte-identical (Pages gets the pristine file).
2. `server.py` reads the HTML and inserts one small `<script>` shim before the
   main script, then serves the *injected* copy on localhost.
3. The shim wraps `Storage.prototype.getItem/setItem/removeItem` for the app's
   known keys — so it syncs to the backend **without knowing any internal
   function names**, surviving the app's closures.

Result: zero edits to the giant artifact, offline mode untouched, real backend
locally. (This is the storage-boundary approach, chosen over patching
`loadState`/`saveState` in place.)

## Static-first deployment

Risk is sequenced deliberately: **get all three live as static sites before any
backend work.**

1. `scripts/build_site.py` assembles `_site/` from `apps/*/web/` plus a landing
   page and a `.nojekyll` marker.
2. `scripts/check_site.py` validates the *built site*: every local `href`/`src`
   resolves, references are **case-exact**, and there are no absolute `/` paths.
   This blocks the two failures that pass on Windows but break on Pages.
3. `.github/workflows/pages.yml` uploads `_site/` and deploys via GitHub Pages
   (Actions source, not a branch).

## Tests

Hermetic and dependency-free, so CI is fast and reproducible. Each backend test
spawns its own server with a temp database and a free port; static tests assert
the front-ends keep their offline guarantees (no `fetch`, no absolute paths).
CI runs on Python 3.12 and 3.13.

## Non-goals (deliberately cut)

Monorepo tooling (Nx/Turborepo), a Node build step, a shared data layer/ORM,
auth/accounts, Docker/K8s, coverage gates, and a service worker per app (only
Orbis' PWA needs one). These add surface without making the projects more real.
