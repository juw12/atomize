# agents-lab — build, run, and wire AI agents

One lab: **four ways to build an agent**, a cooperating workflow, and integration
into **Virtual Bots Office**. Everything runs **locally and free** (Ollama
`qwen3:8b`) — no API keys required.

## The four agents
| Track | Agent | What it is | Run it |
| --- | --- | --- | --- |
| **A** | Dev Helper | VS Code / Copilot custom agent (`.agent.md`) | open `A-vscode-agent` in VS Code → Copilot Chat → **Dev Helper** |
| **B** | Scout (research) | research assistant → structured brief (Summary / Key points / Sources); Markdown brain + runnable `scout.py` | `..\D-langgraph-agent\.venv\Scripts\python.exe B-km-agent\scout.py "https://…"` |
| **C** | Hermes | standalone terminal/messaging agent (Nous Research, MIT) | restart terminal → `hermes setup` → `hermes` |
| **D** | LangGraph agent | Python ReAct agent (tools + memory + guardrails + tracing + MCP) | `cd D-langgraph-agent` → `.\.venv\Scripts\python.exe agent.py "What is 23*47?"` |

## What D includes
- **Tools** — `calculator`, `current_time`, `read_text_file` (+ any MCP tools)
- **Memory** — SQLite checkpointer → remembers across turns *and* separate runs
- **Guardrails** — blocks prompt-injection; redacts PII from output
- **Observability** — JSONL traces in `traces.jsonl` (+ optional Langfuse)
- **MCP** — `agent_mcp.py` loads tools from MCP servers (demo server + your Obsidian vault)

## The A↔C workflow
`WORKFLOW.md` + shared `HANDOFF.md` + `start-agents.ps1`:
A (VS Code) builds code in the editor; C (Hermes) operates the machine (shell,
web, scheduling). They pass work through `HANDOFF.md`.
```powershell
.\start-agents.ps1 -Launch     # opens VS Code (A) + Hermes (C)
```

## Integration with "Virtual Bots Office"
The dashboard (`..\agents-dashboard`, http://127.0.0.1:8790) lists agents from the
OpenCode server. We added two layers:
- **OpenCode agents** (appear after an OpenCode restart): `web-researcher` (B),
  `python-agent-runner` (D) — defined in `~/.config/opencode/agents/`.
- **External bots** (listed by the bridge now): `vscode-dev-helper` (A),
  `scout` (B), `hermes` (C), `langgraph-agent` (D).
- **The buttons actually launch them** — sending a goal to an external bot starts
  the app/script (VS Code, Hermes, or the Python agent in a new console).

## The five layers (how every agent here is assembled)
1. **Brain** (model) · 2. **Instructions** · 3. **Tools** · 4. **Memory** · 5. **Runtime**

## Files
```
README.md   USAGE.md   WORKFLOW.md   HANDOFF.md   start-agents.ps1
A-vscode-agent\    .github\agents\dev-helper.agent.md
B-km-agent\        AGENTS.md MEMORY.md IDENTITY.md SOUL.md USER.md
                   memory\  briefs\  scout.py  README.md
C-hermes\          README.md
D-langgraph-agent\ agent.py agent_mcp.py guardrails.py observability.py
                   mcp_servers\demo_server.py requirements.txt .env.example README.md
```

See **`USAGE.md`** for detailed how-to and **`WORKFLOW.md`** for the A↔C loop.
