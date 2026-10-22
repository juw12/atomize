# A — VS Code / Copilot custom agent (starter)

This folder contains a VS Code **custom agent** definition.

## Use it
1. Open **this folder** (`agents-lab\A-vscode-agent`) in VS Code (`File → Open Folder`).
2. Open **Copilot Chat** (the chat icon in the sidebar).
3. Open the agent picker (the dropdown at the top of the chat) and choose **Dev Helper**.
4. Ask it something like: *"summarize this folder"* or *"add a README badge"*.
5. Switch into **Agent mode** so it can edit files and run commands.

## Where the file lives
- Agent definition: `.github/agents/dev-helper.agent.md`

VS Code discovers custom agents from `.github/agents/*.agent.md` in the opened
workspace (and from `~/.copilot/agents/` for a user-level agent).

## Customize
- `description:` — when Copilot should auto-suggest this agent.
- `tools:` — what it's allowed to touch (`codebase`, `editFiles`, `runCommands`, …).
- The Markdown body — the agent's instructions/persona.

You can add more agents by dropping additional `*.agent.md` files in the same folder.
Optional: add reusable slash-prompts as `.github/prompts/*.prompt.md`.
