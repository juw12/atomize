# apps/update

The **`/update`** pipeline: sync the work in this repository out to GitHub and
mirror a summary note into the Obsidian vault — one command, repeatable.

## What it does

1. Stages everything (`git add -A`).
2. Commits with a message (yours, or a timestamped default).
3. Pushes to `origin` (`github.com/juwpegatron/projects`).
4. Writes a note to the Obsidian vault (`Update Log/<date> <repo>.md`).
5. Prints a JSON report: repo, branch, commit, changed count, push status, note path.

## Use it in chat

```
/update fix: tidy the build_site validator
```

Anything after `/update` becomes the commit message. With no arguments it uses
`update: sync projects (<timestamp>)`.

The command lives at [`../../.opencode/command/update.md`](../../.opencode/command/update.md).

## Use the script directly

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File apps/update/update.ps1 -Message "your message"
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

`/update` is also installed **globally**, so it works from any git repo on this machine:

- Command: `~/.config/opencode/command/update.md`
- Script:  `~/.config/opencode/tools/update/update.ps1` (a mirror of this file)

The script always syncs the **current working directory's** repo. The project-scoped
command here uses `apps/update/update.ps1`; the global command uses the mirrored copy —
keep the two in sync when you change one.

## Notes

- **git is not on PATH** on this machine — the script resolves it from
  `%LOCALAPPDATA%\Programs\Git\cmd\git.exe` (and other known locations).
- The push uses the repo's stored credential (`credential.helper = manager`).
  If credentials are missing the script fails loudly with the exact error
  rather than hanging (`GIT_TERMINAL_PROMPT=0`, `GCM_INTERACTIVE=Never`).
- The Obsidian note is written as plain Markdown files, so it works with or
  without the Local REST API plugin running.
