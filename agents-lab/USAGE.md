# How to use the agents-lab agents

Five ways to build an agent — pick by your skill level and the job.

---

## A — VS Code "Dev Helper" (custom agent)
**What:** an in-editor coding assistant with a `.agent.md` definition.
**How:**
1. Open the folder `agents-lab\A-vscode-agent` in VS Code.
2. Open **Copilot Chat** → open the agent picker at the top → choose **Dev Helper**.
3. Switch to **Agent mode** (so it can edit files + run commands).
4. Talk to it: *"read ../HANDOFF.md and do the task"*.
**Files:** `.github/agents/dev-helper.agent.md`.

## B — Scout, the research assistant (Markdown brain + runnable twin)
**What:** an agent whose "memory" is a set of Markdown files.
**How (as a chat agent):** open `agents-lab\B-km-agent` as the workspace in
OpenCode; it reads `AGENTS.md`, `MEMORY.md`, `memory/` automatically. Give it a
URL/topic; it returns a brief.
**How (runnable):**
```powershell
cd agents-lab\B-km-agent
..\D-langgraph-agent\.venv\Scripts\python.exe scout.py "https://example.com"
# with Obsidian:  $env:OBSIDIAN_API_KEY="…"  → adds the vault tools
```
**Files:** `AGENTS.md`, `MEMORY.md`, `IDENTITY.md`, `SOUL.md`, `USER.md`,
`memory/`, `briefs/`, `scout.py`.

## C — Hermes Agent (standalone)
**What:** an autonomous terminal/messaging agent (Nous Research, MIT).
**How:**
```powershell
# restart terminal first (so `hermes` is on PATH), then:
hermes setup          # pick Ollama (free/local) or Portal
hermes                # chat
hermes model          # switch model
hermes gateway setup  # + `hermes gateway start` for Telegram/Discord/Slack
hermes doctor         # diagnose
```
**Files:** notes in `agents-lab\C-hermes\README.md`; install lives in
`%LOCALAPPDATA%\hermes`.

## D — LangGraph agent (code)
**What:** a Python ReAct agent with tools, memory, guardrails, tracing, MCP.
**How:**
```powershell
cd agents-lab\D-langgraph-agent
.\.venv\Scripts\python.exe agent.py "What is 23 * 47?"     # tools + memory + guardrails
.\.venv\Scripts\python.exe agent_mcp.py "How many words in 'a b c'?"   # MCP tools
```
**Files:** `agent.py`, `agent_mcp.py`, `guardrails.py`, `observability.py`,
`mcp_servers\demo_server.py`.

---

## The A↔C workflow
`WORKFLOW.md` + `HANDOFF.md` (shared scratchpad) + `start-agents.ps1`:
```powershell
cd agents-lab
.\start-agents.ps1            # dry-run
.\start-agents.ps1 -Launch    # opens VS Code (A) + Hermes (C)
```

---

## Integration with "Virtual Bots Office"
Virtual Bots Office (`Default Project\agents-dashboard`) is a **dashboard for the
OpenCode server**: it lists the agents OpenCode exposes (`GET /agent`) and can
send them goals (`POST /api/command`).

So an agent shows up there **only if it is an OpenCode agent**. Our agents:
| Agent | Shows in Virtual Bots Office? | Why |
| --- | --- | --- |
| B (research) | ✅ via an OpenCode agent definition | created at `~/.config/opencode/agents/web-researcher.md` |
| D (python) | ✅ (as an OpenCode agent that runs the script) | define one that shells out to `scout.py`/`agent.py` |
| A (VS Code) | ❌ | VS Code extension agent, not an OpenCode agent |
| C (Hermes) | ❌ | separate app; runs alongside, not inside OpenCode |

**How to add another agent:** drop a Markdown file in
`~/.config/opencode/agents/<name>.md` (global) or `.opencode/agents/<name>.md`
(project). The file name becomes the agent name. Then restart OpenCode (the PEGAAi
app) so the server re-lists agents; the dashboard will show it.
