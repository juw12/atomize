# apps/

A monorepo for product projects, each promoted from prototype to a real,
runnable, deployable project.

| Project | What it is | Stack |
| --- | --- | --- |
| [`apps/orbis`](apps/orbis) | Communication, identity, protection — and hiring (Orbis Work) — in one app | Zero-dependency Python stdlib server + SQLite + static PWA |
| [`apps/peers`](apps/peers) | Verified reviews for food, travel and products | Single-file web app + optional stdlib persistence backend |
| [`apps/house-of-articles`](apps/house-of-articles) | Athlete-moment sneaker news + live market feed | Static prototype + versioned data spine |
| [`apps/ailene-open`](apps/ailene-open) | Open, vendor-neutral AI learning — offline-first, bilingual, no login | Static PWA + inline data spine + optional stdlib API |
| [`apps/hazel`](apps/hazel) | Desktop studio for creators — auto-cut, repurpose to every platform, publish, measure traffic | Electron + bundled ffmpeg + local Whisper (offline) |
| [`apps/update`](apps/update) | The `/update` pipeline — sync the repo to GitHub and mirror a note to Obsidian | PowerShell helper + OpenCode slash command |

Each project follows the same shape:

```
apps/<name>/
  web/        static front-end (this is what gets deployed to GitHub Pages)
  server/     optional zero-dependency Python backend (stdlib only)
  tests/      hermetic, stdlib-only end-to-end tests
  docs/       product specs and guides
  README.md
```

## Design principles

- **No third-party dependencies.** Backends run on the Python 3 standard library
  only (`http.server`, `sqlite3`, `json`) — nothing to `pip install`, no build step.
- **Offline-first, server-optional.** Every front-end works with **no** backend
  (local storage or inline data) and upgrades to a real API when one is running.
  That is what makes static GitHub Pages hosting viable.
- **Static-first deploys.** The Pages workflow ships the front-ends as static
  sites; backends run locally or on your own host.

## Run a project locally

```bash
python apps/orbis/server/server.py
python apps/peers/server/server.py
python apps/house-of-articles/server/server.py
```

Each server serves both its API and its `web/` front-end.

## Tests

```bash
python apps/orbis/tests/verify_api.py
python apps/peers/tests/verify_api.py
python apps/house-of-articles/tests/verify_api.py
```

All tests are hermetic (temp database, free port) and exit `0` / `1`. You can
also run every test at once:

```bash
python scripts/run_all_tests.py
```

## Live site

`.github/workflows/pages.yml` builds a static site from the three `web/`
directories (`scripts/build_site.py`) and deploys it with GitHub Pages. A
`scripts/check_site.py` validator blocks the two failures that pass locally but
break on Pages: **absolute paths** and filename **case** mismatches.

## License

See [LICENSE](LICENSE).
