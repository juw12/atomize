# agents-lab — build-an-AI-agent starter kit

Four working starter projects, one per track. Each is a **generic demo** —
open it, run it, then customize. Nothing here touches the rest of the repo.

| Track | Folder | What it is | How to use |
| --- | --- | --- | --- |
| **A** | `A-vscode-agent/` | A **VS Code / GitHub Copilot custom agent** (`.agent.md`) | Open this folder in VS Code → Copilot Chat → pick "Dev Helper" |
| **B** | `B-km-agent/` | A **Knowledge-Management agent** with persistent memory (Markdown "brain") | Open in OpenCode and chat; it reads/writes `MEMORY.md` etc. |
| **C** | `C-hermes/` | **Hermes Agent** (Nous Research) — standalone terminal/messaging agent | See `C-hermes/README.md` (installed to `%LOCALAPPDATA%\hermes`) |
| **D** | `D-langgraph-agent/` | A **LangGraph** Python agent (wired to local Ollama, with offline fallback) | `cd D-langgraph-agent` → run `agent.py` |

## The five-layer agent model
Most "agents" are just these 5 pieces. Each track shows a different way to assemble them:

1. **Brain / model** — the LLM (cloud API or local via Ollama).
2. **Instructions / persona** — system prompt or Markdown files (see B).
3. **Tools** — what it can *do* (MCP servers, functions, terminal).
4. **Memory** — what it remembers across sessions (see B and C).
5. **Runtime / host** — where it runs (VS Code, OpenCode, terminal, cloud, Docker).

## Suggested order
Start with **A** (instant, no code) → **B** (adds memory) → **D** (adds real code) → **C** (a full standalone agent).

> These are deliberately minimal. For the full tool landscape (voice, browser,
> observability, deployment, guardrails…) see the master catalog.
