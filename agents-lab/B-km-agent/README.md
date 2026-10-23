# B — Scout, the web research assistant

A Knowledge-Management agent with a persistent Markdown "brain". Given a topic
or URLs, Scout reads them and writes a **structured brief**
(Summary → Key points → Sources). It never fabricates and always cites sources.

## The brain (files)
| File | Purpose |
| --- | --- |
| `AGENTS.md` | objective + workflow + output conventions |
| `SOUL.md` | persona & boundaries |
| `IDENTITY.md` | name/persona (Scout 🔎) |
| `USER.md` | about the user |
| `MEMORY.md` | durable rules & preferences |
| `memory/YYYY-MM-DD.md` | daily logs |

## How to use
Open this folder as the agent workspace in OpenCode (or any agent that reads
`AGENTS.md` + `MEMORY.md`), then give it a URL or topic. It reads `MEMORY.md`
and `memory/` for continuity, does the research, and returns a brief.

## Profile (from the km-agent-creator interview)
- **Job:** web research assistant
- **Inputs:** web pages / URLs
- **Output:** structured brief with sources
- **Rule:** never fabricate; always cite
