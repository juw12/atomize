---
description: Validate (build + site check + tests), then commit & push pending work and mirror a note to Obsidian
---

Run the **/sweep** pipeline for this repository: **validate first, then sync**.

1. **Check what's pending.**
   - Run `git status --short` and `git diff --stat`.
   - If the tree is clean *and* local `main` equals `origin/main`, report **"nothing to sweep"** and stop.

2. **Validate BEFORE committing** — never push a failing state. Run all three and require exit code 0:
   ```
   python scripts/build_site.py
   python scripts/check_site.py
   python scripts/run_all_tests.py
   ```
   If any fails, **STOP**, show the exact failure, and do not commit.

3. **Commit, push & log** by running the helper (it resolves git itself, commits any changes, pushes to `origin`, and writes the Obsidian note into `Update Log/`):
   ```
   powershell -NoProfile -ExecutionPolicy Bypass -File "apps/update/update.ps1" -Message "$ARGUMENTS"
   ```
   If `/sweep` was called with no message, the script uses a timestamped default.
   - Before committing, make sure nothing unwanted is staged: never commit `__pycache__`, `.venv/`, `config.json`, `*.log`, or anything that looks like a secret/credential. Unstage such files first (`git restore --staged <path>`).

4. **Report** concisely: validation result, repo, branch, commit hash, push status, changed-file count, and the **Obsidian note path**.

5. If the push **failed** (auth/network), show the exact error and stop — do not retry blindly.

Options (pass through to the script): `-NoPush` commits locally only; `-DryRun` previews without committing.
