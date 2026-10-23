# Sweep — App Plan (PRD + architecture + MVP)

> **One-liner:** Describe an idea → get a **running, tested, deployable** app plus a catalog page — **offline-first, no lock-in.**

Status: idea / planning · Owner: Juwen Lie · Created: 2026-10-23

---

## 1. Problem

Turning an idea into a real app is slow and error-prone: scaffolding, design consistency, auth, tests, docs, deployment and memory are all separate chores, and "AI app builders" optimize for *speed of generation* while under-verifying — you often get code that looks done but doesn't run, and you don't own it.

## 2. Target user

Technical solo builders and small internal teams who want **self-hosted, dependency-light apps** and **durable memory** — people who value ownership and repeatability over a hosted SaaS black box.

## 3. Differentiators (vs v0 / Lovable / bolt.new / Replit Agent)

- **Verification-first** — the product proves the app *runs* (smoke + Playwright screenshots + acceptance) **before** it says "done".
- **Ownership / no lock-in** — output is dependency-light, self-hostable, runnable anywhere; you own the code, tests, docs.
- **Memory + catalog** — a longitudinal idea→app system with a live catalog and a "second brain", not one-off chat→code.
- **Governance** — gates, Definition of Done, rollback, and a cost/time log for people who hate shipping broken things.

## 4. Scope

**MVP (v0.1)**
- Intake **brief** → generated **plan** → **scaffold preview** → **build** (desktop + mobile) → **verify** (unit + smoke + visual) → **export/publish** → **memory log**.
- A fixed **component library + design tokens** (so output is consistent).
- **Catalog** page listing generated apps.
- Single-user; local-first.

**Non-goals (v0.1)**
- Multi-tenant hosting, marketplaces, team collaboration.
- Arbitrary stacks — opinionated output (static-first + optional stdlib backend).

## 5. Success criteria (product Definition of Done)

- Given a raw idea, the tool produces an app that **boots, passes its smoke + visual + acceptance checks**, and is **deployed or exportable** in one run.
- Every generated app has: desktop + mobile, a usage guide, visuals, tests, and a memory note.
- Zero committed secrets/endpoints; deploy verified before "done".
- A **cost/time entry** is logged per run.

## 6. Architecture

| Layer | Responsibility |
|---|---|
| **Orchestrator** | Phases + gates (brief → matrix → build → verify → sync). Emits structured artifacts. |
| **Template registry** | Scaffolds per app shape; one source of truth for the monorepo layout. |
| **Design system** | Tokens + components (nav, cards, login, mobile shell) consumed by every app. |
| **Verification service** | Runs unit + smoke + Playwright screenshots + acceptance; returns pass/fail. |
| **Memory adapter** | Obsidian notes **or** a DB with the same schema; per-app index + front-matter. |
| **Deploy adapters** | Static → GitHub Pages; server → a host. `server/` presence drives the target. |
| **Catalog generator** | Builds the public catalog from app manifests. |

Deliverable form: **CLI + optional web UI**, self-hostable. Dogfood the monorepo ethos (static web + zero-dep stdlib + SQLite).

## 7. Memory schema (fixed front-matter)

```
id: <app>-<seq>
app: <app-name>
type: idea | spec | decision | log
status: draft | building | shipped | paused
date: YYYY-MM-DD
tags: [...]
links: [[...]]
```
Plus one **index note per app**; recall = a structured query, not fuzzy prose.

## 8. MVP milestones

- **M0 — Spec.** This doc + open decisions resolved (static-vs-dynamic, auth-default, hosting). *Acceptance:* doc reviewed.
- **M1 — Scaffolder + design system.** Deterministic scaffold generator + shared tokens/components. *Acceptance:* generate a skeleton app that boots.
- **M2 — Verification service.** Smoke + Playwright (desktop+mobile) + acceptance runner, wired as the commit gate. *Acceptance:* a failing app is blocked from "done".
- **M3 — Memory + catalog + deploy adapters.** Front-matter notes, catalog page, Pages/host deploy, rollback. *Acceptance:* end-to-end idea → live app in one run, with a memory note.

## 9. Risks

1. **Auth/security liability** — shipping "login" (and a hosted product) makes you responsible for secrets/multi-tenancy.
2. **All-features-by-default** — bloats surface area, multiplies bugs, slows the loop.
3. **Static-vs-server ambiguity** — unresolved, deployment is unreliable.
4. **Verification theater** — if exit-0 is the bar, trust evaporates (verification *is* the moat).
5. **Memory sprawl** — without the schema, the second brain degrades to unsearchable prose.
6. **Crowded market** — must win on ownership + verification, not raw generation speed.

## 10. Open decisions

- Static-only apps vs server apps: what's the supported deployment matrix?
- Auth: build a safe stdlib baseline, or gate it off entirely in v0.1?
- Is `/sweep` the engine (personal) an *input* to the product, or does the product re-implement it?
- Monetization: open-core CLI + paid hosted verify/deploy/team features (avoid per-seat SaaS).
