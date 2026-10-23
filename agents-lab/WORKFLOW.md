# Workflow — A (VS Code dev-helper) ↔ C (Hermes)

Two specialized agents cooperating on one project, passing work through a shared
`HANDOFF.md` scratchpad.

## Roles
| Track | Agent | Strength | Use it for |
| --- | --- | --- | --- |
| **A** | VS Code **Dev Helper** | in-editor editing + diagnostics | writing/refactoring code, running tests, fixing lint/types |
| **C** | **Hermes** | terminal + tools + memory + messaging | running commands, web research, scripting/automation, scheduled jobs, deploy, chat from Telegram |

## The loop
1. **Start here** → write the goal into `HANDOFF.md` (Task + acceptance criteria).
2. **A (VS Code)** → open `A-vscode-agent` in VS Code, pick the **Dev Helper**
   agent, make the code change, then append a short note to `HANDOFF.md`
   (done / files changed / how verified).
3. **C (Hermes)** → in a terminal run `hermes` in this workspace; ask it to run
   tests, research anything, or automate the follow-up. It reads `HANDOFF.md`.
4. Repeat until done. Keep `HANDOFF.md` as the single source of truth.

## Launch
```powershell
.\start-agents.ps1            # dry-run: shows the plan + checks tools
.\start-agents.ps1 -Launch    # opens VS Code (A) and starts Hermes (C)
```

## Why two agents
A is optimized for *editing the codebase in the editor*; Hermes is optimized for
*operating the machine* (shell, web, scheduling, messaging) and keeps persistent
memory. Sharing `HANDOFF.md` (plus each agent's own memory) keeps them in sync.

## Where Scout (B) fits
Scout is the researcher: write a URL/topic into `HANDOFF.md`, then either paste
its brief back or run `B-km-agent\scout.py "https://…"` and paste the result.
