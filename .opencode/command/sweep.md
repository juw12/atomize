---
description: Sweep. With an app idea → scaffold a new app end-to-end (recall memory → create project → /rea → desktop+mobile + login + visuals + guide → site → sync GitHub+Obsidian). Without an idea → validate + commit + push + Obsidian.
---

# /sweep

`sweep` has two modes.

---

## Mode A — called WITH an app idea / data (`$ARGUMENTS` describes a product)

Run the full **idea → shipped app** pipeline. Do NOT stop between steps unless blocked.

### 0. Recall memory first (the "second brain")
Before building, read what already exists so you reuse conventions and never duplicate:
- Obsidian vault: `~\Documents\Obsidian Vault` — related project notes and the latest `Update Log/* Default Project.md`.
- The repo's `README.md`, `docs/`, and any `apps/*/README.md` for the closest existing app.
- If the `obsidian` MCP tools are loaded use them; otherwise read the vault files directly (or the Local REST API from `AGENTS.md`).

### 1. Create the project folder
- Choose a **kebab-case app name** from the idea. Confirm the name (this is "the name we deal on").
- Create `apps/<app-name>/` following the monorepo shape:
  ```
  apps/<app-name>/
    web/        desktop + mobile front-end (served on GitHub Pages)
    server/     optional zero-dependency Python stdlib backend (http.server + sqlite3)
    tests/      hermetic stdlib-only tests (exit 0/1)
    docs/       product spec + usage guide + visuals
    README.md
    .gitignore  (__pycache__/, *.pyc, .venv/, config.json, *.log)
  ```
- Treat `apps/<app-name>/` as the working directory for the rest of the build.

### 2. /rea the idea
Reverse-engineer / analyse the idea before coding: use the `rea` MCP tools if available, else the `reverse-engineer-anything` skill + CLI. Derive **features, data model, and screens**, then write them into `docs/`.

### 3. Build the app — ALWAYS include
- **Desktop AND mobile versions** (e.g. `web/index.html` desktop + `web/mobile.html`, responsive).
- **A login interface** (sign-in / sign-up screen with a working flow).
- **Visuals** — screenshots/imagery used on the site card and in `docs/`.
- **A usage guide** — a "How to use" section on the page plus a `docs/` guide.
- Zero-dependency / offline-first where possible; **match the existing app patterns**.

### 4. Register it on the projects site
- Add the app to `scripts/build_site.py` (`APPS` entry + `apps_config`) so it gets a card + page on the projects site. Include a `web/index.html` so the site link resolves.

### 5. Validate (must all pass)
```
python scripts/build_site.py
python scripts/check_site.py
python scripts/run_all_tests.py
```

### 6. Sync to GitHub + Obsidian (the "second brain")
Commit + push to the **projects** repo and write the notes:
```
powershell -NoProfile -ExecutionPolicy Bypass -File "apps/sweep/sweep.ps1" -Message "<app>: <summary>"
```
Also create/update an Obsidian **project note** (`<App> — Project Home.md`) with: what it is, local path, repo path, live URL, stack, structure, how to run, and a decision log.

---

## Mode B — called WITHOUT an idea

Just sync: validate (`build_site.py`, `check_site.py`, `run_all_tests.py` if present) → commit → push → Obsidian note. If the tree is clean and in sync, report **"nothing to sweep"** and stop.

---

## Always
- **Read the notes before starting; write the notes after finishing** — the second brain (GitHub + Obsidian) must stay current.
- Never commit `__pycache__`, `.venv/`, `config.json`, `*.log`, or secrets. **Scrub internal endpoints** before publishing.
- Report concisely at the end: app name, folder, files added, validation result, commit hash, push status, and the Obsidian note path.
