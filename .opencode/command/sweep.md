---
description: Sweep. WITH an app idea → the full idea→app pipeline (recall memory → brief + DoD gate → capability matrix → scaffold → analyse → build with checkpoints → verify for real → sync GitHub + Obsidian, rollback-safe). WITHOUT an idea → validate + commit + push + Obsidian.
---

# /sweep

Two modes. Do NOT stop between steps unless blocked — but DO stop and ask when the brief or scope is genuinely ambiguous.

---

## Mode A — called WITH an app idea / data (`$ARGUMENTS` describes a product)

### 0. Recall memory first (the "second brain")
Read what already exists so you reuse patterns and never duplicate: Obsidian vault (`%USERPROFILE%\Documents\Obsidian Vault`) index/project notes + latest `Update Log/* Default Project.md`, plus the repo `README.md`, `docs/`, and the closest `apps/*/README.md`. Use the `obsidian` MCP if loaded, else read the vault files directly.

### 0.5 Brief + Go/No-Go gate
Write a one-page `docs/BRIEF.md`:
- **Problem**, **target user**, **job-to-be-done**.
- **2–4 concrete success checks** (acceptance criteria) — these become the Definition of Done.
- **Non-goals**.
- **Overlap check** vs existing `apps/*` — name any near-duplicate; if it's essentially a duplicate, **STOP and ask**.
- **Size estimate**.
Ask up to **2 sharp clarifying questions** if anything is ambiguous, then proceed.

### 1. Capability matrix — stop defaulting features on
Decide what THIS idea actually needs; every tick maps to a concrete acceptance check.
| Capability | Default | If ON |
|---|---|---|
| Backend / persistence | **off** | stdlib server (`http.server`+`sqlite3`); deploy target = a host, **not** Pages |
| Auth / login | **off** | secure auth baseline (below), or **don't ship it** |
| Mobile | responsive single build | separate mobile build only if justified |
- **Auth baseline (only if login is ON):** `hashlib.scrypt` + per-user salt, `hmac.compare_digest`, `secrets.token_urlsafe` sessions, HttpOnly + SameSite cookies, and a written threat model ("single-user passthrough, not multi-tenant"). **If you can't do auth safely with the stdlib, keep login OFF.**
- **Static vs dynamic:** `server/` presence drives the deploy target — static apps → GitHub Pages; server apps → a host (Pages hosts only the catalog card). Don't pretend both coexist.

### 2. Create the project folder
`apps/<kebab-name>/` following the monorepo shape: `web/` (desktop + mobile front-end), `server/` (only if backend), `tests/` (hermetic stdlib-only), `docs/`, `README.md`, `.gitignore` (`__pycache__/`, `*.pyc`, `.venv/`, `config.json`, `*.log`). Work inside it.

### 3. Analyse the idea
`/rea` **only if** the idea references an existing artifact (URL / app / repo / firmware) — then reverse-engineer it into `docs/`. For a **greenfield** idea, skip REA and do straightforward requirements analysis (features, data model, screens) into `docs/`.

### 4. Build — with checkpoints
- **Desktop + mobile** (responsive at minimum).
- **Visuals** + a **"How to use" guide** (on-page + `docs/`).
- **Commit a checkpoint after each major piece** — not one giant build (resumable, reversible).
- Match the existing app patterns; zero-dependency / offline-first where possible.

### 5. Register on the projects site
Add the app entry to `scripts/apps.json` (the catalog consumed by both `build_site.py` and `publish_portfolio.py`) and ensure `web/index.html` exists so the card resolves. If the app needs a server, the site card is a **catalog entry** (link + description) only.

### 6. Verify — THIS is the gate (NOT exit-0)
- **Smoke:** boot the server (if any) → `GET /` and `GET /health` → 200.
- **Visual:** Playwright screenshots at **desktop + mobile** widths (use the `webapp-testing` / `playwright` skill); save into `docs/`.
- **Acceptance:** exercise each success check from the brief.
- **Repo checks:** `build_site.py`, `check_site.py`, `run_all_tests.py` must exit 0.
- **Secret/endpoint scan:** no secrets, no internal endpoints committed.
If any check fails → **STOP**, fix, and do not commit.

### 7. Sync — rollback-safe (second brain)
- Run `apps/sweep/sweep.ps1` (it commits, pushes, and writes the Obsidian note).
- **Verify the deploy actually succeeded** (CI + Pages green) before declaring done.
- Write/update the Obsidian project note with the **fixed schema** — front-matter: `id, app, type(idea|spec|decision|log), status, date, tags, links` — and keep **one index note per app**.
- **Never mark done on an unverified push.** If something is wrong after push: `git revert <sha>` and log it.

---

## Mode B — called WITHOUT an idea

Just sync: validate (`build_site.py`, `check_site.py`, `run_all_tests.py` if present) → commit → push → Obsidian note. If the tree is clean and in sync, report **"nothing to sweep"** and stop.

---

## Always
- **Read the notes before starting; write the notes after finishing** (fixed schema).
- Never commit `__pycache__`, `.venv/`, `config.json`, `*.log`, or secrets. **Scrub internal endpoints** before publishing.
- Report at the end: app name, folder, files added, **which success checks passed**, commit hash, push/deploy status, live URL, and the Obsidian note path.
