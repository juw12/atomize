# BRIEF — Sweep (the app)

> Status: building · Owner: Juwen Lie · Date: 2026-10-23
> Source idea: [`Sweep-App-Plan.md`](Sweep-App-Plan.md) (the product PRD).

## Problem
Turning an idea into a real app is slow and error-prone, and "AI app builders"
optimize for *speed of generation* while under-verifying — you get code that
looks done but doesn't run, and you don't own it. There is no lightweight tool
that takes a rough idea, forces a short **brief + Definition of Done**, and shows
a **plan you own** before any code is written.

## Target user / job-to-be-done
Technical solo builders and small internal teams who want **self-hosted,
dependency-light** apps and **durable memory**.
**JTBD:** *"When I have a rough app idea, I want to turn it into a clear, checkable
plan (scope + success criteria + scaffold) in one sitting — so I build the right
thing, own the output, and can repeat the process."*

## MVP scope (v0.1) — what this app is
A **static-first, local-first** web app (desktop + mobile, no backend) that walks
the user through the front half of the `/sweep` pipeline:

1. **Local workspace ("login")** — create/unlock a workspace with a name +
   passphrase. Encrypted **at rest in the browser** (WebCrypto PBKDF2 → AES-GCM)
   when available; explicitly labeled *local-only, no server*.
2. **Idea brief** — problem, target user, job-to-be-done, **2–4 success checks**,
   non-goals, overlap note.
3. **Generated plan** — from the brief, a **capability matrix** (backend/auth/
   mobile off by default) + a **Definition-of-Done checklist** + phases.
4. **Scaffold preview** — the monorepo file tree the app would create.
5. **Catalog** — the workspace's projects with status; a public demo card.
6. **How-to-use guide** — in-app.

## Success checks (Definition of Done — the app must pass ALL)
1. **Clean boot** — opening `web/index.html` from `file://` renders with **0 console
   errors / 0 failed requests** at **1440×900** and **390×844**.
2. **Workspace gate** — create (name + passphrase) → enters app; reload → prompts to
   unlock; **wrong passphrase rejected**; sign out returns to the gate.
3. **Brief → Plan → Catalog** — submitting a brief produces a plan with a capability
   matrix + DoD checklist, and the project shows in the catalog; **persists across reload**.
4. **Scaffold preview** renders the file tree for the current project.
5. **Guide** present and reachable from the nav.
6. **Repo gates** — `build_site.py`, `check_site.py`, `run_all_tests.py` all exit 0;
   no secrets / internal endpoints committed.

## Capability matrix (decided, not defaulted)
| Capability | Decision | Rationale |
|---|---|---|
| Backend / persistence | **off** | Static → GitHub Pages. Persistence = `localStorage` (local-first). |
| Auth / login | **local workspace** | Client-side passphrase gate; WebCrypto encryption *if available*, else honest local profile. **Not** a server security boundary — labeled as such. |
| Mobile | **responsive single build** | One `index.html`, mobile-first CSS. |
| Deploy target | **GitHub Pages (static)** | No `server/` present → Pages hosts the app page. |

## Non-goals (v0.1)
- Multi-tenant hosting, marketplaces, team collaboration.
- Real server-side auth (no backend in v0.1).
- Arbitrary output stacks (opinionated, static-first).
- Any runtime network/LLM call — the app is **offline-first**.

## Overlap check vs existing `apps/*`
No existing app does idea→app planning/scaffolding (orbis, peers, house-of-articles,
hazel, lingua, productivity-widget, desk-verdict each *are* apps — none *plan* apps).
**No duplicate.** This is the productization of the `/sweep` pipeline itself.

## Size estimate
Medium — single-page static app (HTML/CSS/JS, zero deps) + docs + one hermetic test.
