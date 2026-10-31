# Architecture

How this monorepo is put together, and why. Each decision here is deliberate;
see [decisions.md](decisions.md) for the short rationale per choice.

> **Note** — this doc was last rewritten when the repo shipped three apps; the
> repo has since grown to 12 apps + a meta R&D toolkit (agents-lab, agents-dashboard,
> scripts/, docs/). The shape below describes the *current* layout; the rationale
> remains valid.

## The 12 apps

Apps that ship a deployable product (front-end + optional backend). Each follows
the shape in `apps/<name>/`.

| App | Nature of data | Backend? |
| --- | --- | --- |
| **Orbis** | Mutable, structured (11 named collections) | Yes — stdlib server + SQLite |
| **Peers** | One mutable JSON state document | Optional — persistence sync layer |
| **House of Articles** | Read-only catalog + price series | No — versioned JSON spine |
| **Hazel** | Local media files (creator studio) | No — Electron + bundled ffmpeg |
| **Lingua** | Per-session translation cache | Optional — local MAAS proxy |
| **Pips** | Local productivity log (SQLite) | No — desktop widget (tkinter) |
| **Sweep** | Project catalog + Obsidian notes | No — static SPA |
| **Vertex** | Scene-graph engine + plugin adapters | Optional — stdlib server |
| **Airiz-motor** | Local AIRIZ telemetry cache | No — Electron desktop app |
| **Outlook-archiver** | Per-folder Markdown archives | No — Outlook COM automation |
| **Virtual-bots** | Static dashboard prototype | No — static HTML only |
| **Remotion-shorts** | Video render jobs | No — Remotion CLI |

Three of those (orbis, peers, house-of-articles) still drive most of the
historical decisions below. New apps are added in the same shape.

## Layout

```
apps/<name>/        one product per folder (see above)
  web/              static front-end (this is what GitHub Pages deploys)
  server/           optional zero-dependency Python backend (stdlib only)
  tests/            hermetic, stdlib-only end-to-end tests
  docs/             product specs and guides
  README.md
agents-lab/         meta: four cooperating AI agents (A/B/C/D)
agents-dashboard/   meta: single-file Python bridge to the OpenCode server + dashboard SPA
scripts/            build_site.py, check_site.py, run_all_tests.py, publish_portfolio.py,
                    maas_client.py, eval_models.py, gen_synth.py, process_docs.py,
                    redmine_lessons.py, token-benchmark/
docs/               this file + decisions.md
.github/workflows/  ci.yml, pages.yml
```

There is no `common/` directory — when code is duplicated across apps, the
duplication is left in place until a third copy appears.

## Offline-first, server-optional

The load-bearing design choice that makes static hosting work.

- Every front-end runs **with no backend**: Orbis → `localStorage`, Peers →
  `localStorage` demo state, House of Articles → inline data.
- When a local backend *is* running, the front-end talks to it.
- GitHub Pages (static only) always works; running `python server/server.py`
  upgrades the same app to real persistence.

## How Peers gets a backend without touching the 5.4 MB file

Each Peers build is a ~5.4 MB single-file HTML app (mostly inline base64
photos). Hand-editing it is the biggest risk. So instead of editing it, the
local server **injects an adapter at serve time**:

1. The file on disk stays byte-identical (Pages gets the pristine file).
2. `server.py` reads the HTML and inserts one small `<script>` shim before the
   main script, then serves the *injected* copy on localhost.
3. The shim wraps `Storage.prototype.getItem/setItem/removeItem` for the app's
   known keys — so it syncs to the backend **without knowing any internal
   function names**.

Result: zero edits to the giant artifact, offline mode untouched, real backend
locally.

## Static-first deployment

Risk sequenced deliberately: **get everything live as static sites before any
backend work.**

1. `scripts/build_site.py` assembles `_site/<id>/` from `apps/<id>/web/` plus a
   `.nojekyll` marker. It does **not** generate `_site/index.html` —
   `scripts/publish_portfolio.py` is the sole writer of the portfolio catalog
   index (separate repo).
2. `scripts/check_site.py` validates the *built site*: every local `href`/`src`
   resolves, references are **case-exact**, and there are no absolute `/` paths.
3. `.github/workflows/pages.yml` uploads `_site/` and deploys via GitHub Pages.

## Tests

Hermetic and dependency-free, so CI is fast and reproducible. Each backend test
spawns its own server with a temp database and a free port; static tests assert
the front-ends keep their offline guarantees (no `fetch`, no absolute paths).
CI runs on Python 3.12 and 3.13. `scripts/run_all_tests.py` discovers and runs
all `apps/<id>/tests/*.py`. New `scripts/tests/` and `agents-dashboard/tests/`
hermetic tests have been added for the meta-toolkit modules.

## Non-goals (deliberately cut)

Monorepo tooling (Nx/Turborepo), a Node build step, a shared data layer/ORM,
auth/accounts, Docker/K8s, coverage gates, and a service worker per app (only
Orbis' PWA needs one). These add surface without making the projects more real.

## What lives in the meta R&D toolkit (not a product)

- **`agents-lab/`** — four cooperating agents (A: VS Code, B: Scout research,
  C: Hermes, D: LangGraph ReAct) with shared brain files. Zero config; defaults
  to local Ollama (`qwen3:8b`).
- **`agents-dashboard/`** — single-file Python bridge (`server.py`) + static SPA.
  Proxies the OpenCode server, exposes normalized SSE events, launches external
  bots (VS Code / Hermes / scout / langgraph).
- **`scripts/`** — R&D helpers: model eval, doc processing, Redmine lesson sync,
  MaaS client, token benchmark. Stdlib only.
- **`docs/`** — this file + decisions.md.
