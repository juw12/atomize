# apps/sweep

The **`/sweep`** pipeline — one command, two modes. (Renamed from the old `/update`.)

- **Mode A — `/sweep <app idea>`**: the full **idea → shipped app** pipeline
  (recall memory → brief + Go/No-Go gate → capability matrix → scaffold →
  analyse → build with checkpoints → verify for real → sync GitHub + Obsidian,
  rollback-safe).
- **Mode B — `/sweep` (no idea)**: just **sync** — validate → commit → push →
  Obsidian note; reports **"nothing to sweep"** when the tree is clean and in sync.

Command: [`../../.opencode/command/sweep.md`](../../.opencode/command/sweep.md).
Product plan (PRD + architecture + MVP): [`docs/Sweep-App-Plan.md`](docs/Sweep-App-Plan.md).

## The app (`web/`)

A **static, offline-first** single-page app that walks the front half of the
pipeline: **local workspace (login)** → **idea brief** → **generated plan**
(capability matrix + Definition of Done + phases) → **scaffold preview** →
**catalog**, plus an in-app **How-to-use** guide. Morning Paper theme, light/dark.

- Open it: `apps/sweep/web/index.html` (works from `file://` — no server).
- Live: https://juwpegatron.github.io/projects/sweep/
- Spec: [`docs/BRIEF.md`](docs/BRIEF.md) · PRD: [`docs/Sweep-App-Plan.md`](docs/Sweep-App-Plan.md)
- Zero deps, no network: all state lives in `localStorage`; the workspace gate
  encrypts local data with WebCrypto (PBKDF2 → AES-GCM) when available, otherwise
  it falls back to a clearly labeled unencrypted local profile.

## Mode B — sync (what the script does)

1. **Validates first** (never push a failing state): `scripts/build_site.py`,
   `scripts/check_site.py`, and `scripts/run_all_tests.py` (whichever exist) must
   exit `0`.
2. Stages everything (`git add -A`).
3. Commits with a message (yours, or a timestamped default).
4. Pushes to `origin` (`github.com/juwpegatron/projects`).
5. Writes a note to the Obsidian vault (`Update Log/<date> <repo>.md`).
6. Prints a JSON report: repo, branch, commit, changed count, push status, note path.

## Mode A — idea → app (the pipeline)

Driven by the command file, not the script:

1. **Recall memory** — read the Obsidian project notes + latest `Update Log` + the
   repo `docs/`/`README` so nothing is duplicated.
2. **Brief + Go/No-Go gate** — write `docs/BRIEF.md` (problem, user, job-to-be-done,
   non-goals, 2–4 concrete success checks, overlap vs existing `apps/*`) and ask up
   to 2 sharp questions if anything is ambiguous.
3. **Capability matrix** — derive scope per idea instead of defaulting every feature
   on. **Auth defaults OFF** (only ships with a scrypt/session threat model), and
   `server/` presence drives the deploy target (static → Pages; server → a host).
4. **Scaffold + build with checkpoints** — create `apps/<kebab-name>/` in the
   monorepo shape, analyse (`/rea` only when the idea references an existing
   artifact), and commit a checkpoint after each major piece.
5. **Register** the app on the projects site (`scripts/build_site.py`).
6. **Verify for real** (the commit gate, not exit-0): server smoke (`/` + `/health`
   → 200), Playwright screenshots at desktop + mobile widths, an acceptance test of
   the primary flow, the repo checks, and a secret/endpoint scan. Any failure
   **stops the commit**.
7. **Sync rollback-safe** — `sweep.ps1` (commit + push + Obsidian note), a fixed
   memory schema (`id, app, type, status, date, tags, links`), and a `git revert`
   recipe if the push is bad.

## Use it in chat

```
/sweep                              # Mode B — sync only
/sweep fix: tidy the build_site validator   # Mode B — sync with your message
/sweep a habit tracker with streaks  # Mode A — build the whole app from the idea
```

In **Mode B**, whatever follows `/sweep` becomes the commit message (with no
argument the script uses `sweep: sync projects (<timestamp>)`). In **Mode A**,
whatever follows is treated as the app idea and runs the full pipeline.

## Use the script directly

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File apps/sweep/sweep.ps1 -Message "your message"
```

Flags:

| Flag | Effect |
| --- | --- |
| `-Message "<msg>"` | Commit message (default: timestamped). |
| `-NoPush` | Commit locally, skip the push. |
| `-DryRun` | Preview only — no commit, no push, no note. |
| `-VaultPath <dir>` | Override the Obsidian vault (default: `~/Documents/Obsidian Vault` or `$env:HAZEL_OBSIDIAN_VAULT`). |
| `-NoteFolder <name>` | Folder inside the vault (default: `Update Log`). |

## Global install

`/sweep` is also installed **globally**, so it works from any git repo on this machine:

- Command: `~/.config/opencode/command/sweep.md`
- Script:  `~/.config/opencode/tools/sweep/sweep.ps1` (a mirror of this file)

The script always syncs the **current working directory's** repo. The project-scoped
command uses `apps/sweep/sweep.ps1`; the global command uses the mirrored copy —
keep the two in sync when you change one.

## Notes

- **git is not on PATH** on this machine — the script resolves it from
  `%LOCALAPPDATA%\Programs\Git\cmd\git.exe` (and other known locations).
- The push uses the repo's stored credential (`credential.helper = manager`).
  If credentials are missing the script fails loudly with the exact error
  rather than hanging (`GIT_TERMINAL_PROMPT=0`, `GCM_INTERACTIVE=Never`).
- The Obsidian note is written as plain Markdown files, so it works with or
  without the Local REST API plugin running.
