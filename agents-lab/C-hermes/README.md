# C — Hermes Agent (Nous Research)

**Hermes Agent** is a standalone, self-improving agent by Nous Research (MIT).
It's a terminal/TUI + messaging-gateway agent — a different category from the
VS Code and LangGraph projects in this lab.

- Website / docs: https://hermes-agent.nousresearch.com/docs/
- Source (MIT): https://github.com/NousResearch/hermes-agent
- Install home on Windows: `%LOCALAPPDATA%\hermes`

## Install (Windows, PowerShell)
The official one-liner:
```powershell
iex (irm https://hermes-agent.nousresearch.com/install.ps1)
```
> A copy of the installer was already downloaded on this machine at
> `%LOCALAPPDATA%\Temp\hermes_install.ps1` — you can run that instead if the
> online endpoint is blocked by the corporate proxy.

The installer adds **Python 3.14, Node.js, npm, ripgrep, FFmpeg** and Hermes'
Python deps under `%LOCALAPPDATA%\hermes`, then puts `hermes` on your PATH.

## First run
```powershell
hermes setup            # full setup wizard (model + tools)
hermes setup --portal   # one command: OAuth login + model + tools (Nous Portal)
hermes                  # start chatting (CLI)
hermes model            # switch provider/model (OpenAI, OpenRouter, Ollama, ...)
hermes gateway          # start the Telegram/Discord/Slack/WhatsApp gateway
hermes doctor           # diagnose issues
```

## Use a local model (free)
`hermes model` → choose a local/Ollama-compatible provider, or point it at your
Ollama endpoint. (Ollama is already installed on this machine.)

## ⚠️ Setup is interactive (run this yourself)
`hermes setup` / `hermes model` are **interactive wizards** — they ask you to
pick a provider/model and paste API keys or do an OAuth login. They can't be
scripted, so run them in a normal terminal:

1. **Restart your terminal** (so `hermes` is on PATH), or run the full path:
   `& "$env:LOCALAPPDATA\hermes\bin\hermes.exe"`.
2. Pick your brain:
   - **Free / local:** `hermes model` → choose **Ollama** (your box already has
     `qwen3:8b`, `hermes3:latest`, `qwen3-32k`).
   - **Easiest all-in-one:** `hermes setup --portal` (one OAuth login covers
     model + web search + image gen + TTS + browser).
3. `hermes` to chat, or `hermes gateway setup` + `hermes gateway start` for
   Telegram/Discord/Slack/WhatsApp.
4. Something off? `hermes doctor`.

## Notes / gotchas
- Native Windows install lives under `%LOCALAPPDATA%\hermes` (not `~/.hermes`).
- Antivirus sometimes flags the bundled `uv.exe` (Astral's Python package
  manager) as a false positive — see the README's troubleshooting section.
- Requires a model with a large context window; Hermes 3/4 *models* are separate
  from the *agent*.

*(This folder is just notes — the real install goes to `%LOCALAPPDATA%\hermes`.)*
