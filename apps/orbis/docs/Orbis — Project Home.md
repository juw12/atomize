---
title: Orbis — Project Home
aliases: [Orbis App, Orbis Project]
tags: [project, orbis, prototype, full-stack]
status: in-progress
created: 2026-10-21
source: "[[Orbis Master Guide]]"
---

# Orbis — Project Home

> **Communication, identity and protection in one app.**
> Keep your commitments. Work clearly. Protect what matters.

This is the working project for **Orbis**, built from the source product spec [[Orbis Master Guide]] (`Orbis_Master_Guide.pdf` on the Desktop). It contains a marketing landing page, an interactive app prototype, and a small Python backend that persists the app's data.

## At a glance

| | |
|---|---|
| Source spec | [[Orbis Master Guide]] (v0.4, ORBIS-MG-003) |
| Code folder | `prototype/` (this folder) |
| Type | Front-end prototype + optional local backend |
| Backend | `server.py` — Python 3 standard library only (no `pip install`) |
| Storage | SQLite (`prototype/data/orbis.db`, created at runtime) |
| Runs by | `python server.py` **or** double-clicking `prototype/index.html` |
| Status | Prototype (mock data). Not production. |
| Desktop copy | `~\Desktop\Orbis\` |

## What's real vs. what's a prototype

- **Real:** the UI, the interactions, the client-side routing, the persistence API, the SQLite storage, and the PWA install.
- **Prototype / mock:** all content (messages, commitments, companies, people) is sample data. There is **no** email/Slack/WhatsApp integration, no accounts, no AI model, no encryption.
- **Not built:** Orbis Work is shown as a *planned* module only.

> ⚠️ Per the spec's honesty rule: **no security, legal-compliance or outcome guarantee applies.** Legal points need counsel confirmation per market before launch.

## How to run

**Option A — with the backend (full experience, data persists):**
```powershell
cd "~\Desktop\Orbis"
python server.py
```
Then open `http://127.0.0.1:8765/` (the server opens it for you). Or double-click `prototype/start.bat` / `Orbis\start.bat`.

**Option B — no install, no server (just the UI):**
Double-click `prototype/index.html`. The app runs in **local mode** and saves to your browser's `localStorage`.

The app shows a badge in the top bar: **"Saved to server"** (green) or **"Local mode — not saved"** (amber).

## File map (`prototype/`)

| File | Purpose |
|---|---|
| `index.html` | Marketing / landing page (no build step). |
| `app.html` | The interactive app: Today, Commitments, Search, Summaries, Drafts, Aura, Culture, Growth, Privacy, Orbis Work. **Mobile-first** (bottom tab bar, installable PWA). |
| `mobile.html` | **"Orbis on mobile" explainer** — phone-frame mockups of every screen + the 6-step how-it-works flow + install steps. |
| `app-mobile.html` | The **mobile app** (dedicated mobile build) — mobile-locked, phone-column on desktop, with **login/sign-up, Account and Settings**. |
| `server.py` | Zero-dependency HTTP server: serves the static files + JSON persistence API + SQLite. |
| `manifest.webmanifest` | PWA manifest (installable). |
| `sw.js` | Service worker (network-first HTML, cache-first static). |
| `icons/orbit.svg` | Orbit logo mark. |
| `start.bat` | Windows launcher (`python server.py`). |
| `README.md` | Technical readme: quick start + full API reference. |
| `tests/verify_api.py` | Automated API test (spawns an isolated server + temp DB). |
| `data/orbis.db` | SQLite database (auto-created on first run). |

## The app (10 surfaces)

| View | What it does |
|---|---|
| **Today** | Follow-up queue; each suggestion shows its reason + source ("Why this?"); Confirm / Edit / Snooze / Dismiss. |
| **Commitments** | Tracked promises with stated dates only, status, confidence, and a source drawer. |
| **Search** | Search by meaning; results show the original message. |
| **Summaries** | Thread summaries: main topic, decisions, open questions, facts vs guesses. |
| **Drafts** | Suggested replies — never sent without explicit approval. |
| **Aura** | Self-chosen profile (work style, strengths, growth edges, portfolio, 12-color archetype). |
| **Culture** | Optional company working rules, admin/member view. |
| **Growth** | After-work layer: 5-stage method, curriculum, key results, session log, weekly review, metrics, progress card, export. |
| **Privacy** | Principles, data-by-category, source consent, AI kill switch, audit log, retention, sensitive-content warning, export/delete. |
| **Orbis Work** | *Planned* job module: profile → role → match on skills → introduce → chat → decide (human review). |

## Sign-in (both apps)

Both the desktop app (`app.html`) and the mobile app (`app-mobile.html`) open with a **login / sign-up gate** (mock auth — any email + password works, or "Continue as guest"). The session is shared via `localStorage['orbis-session']`, so signing in on one is recognised on the other. On desktop, **Sign out** lives in the top-bar avatar menu.

## Mobile versions

Two mobile artifacts exist:

| File | What it is |
|---|---|
| `mobile.html` | The **"Orbis on mobile" explainer** — phone-frame mockups of every screen, the 6-step how-it-works flow, install steps, and the "on your phone" feature list. Its **"Open the app"** buttons open the mobile app (`app-mobile.html`). |
| `app-mobile.html` | The **mobile app** — a mobile-locked build: shown inside a 430px phone column on desktop, full-bleed on a phone. |

### Mobile app features

- **Login / Sign up** — mock auth gate. Any email + password works (or "Continue as guest"). Session lives in `localStorage['orbis-session']`.
- **Account** — avatar, name, email, plan, workspace, verification level, Sign out.
- **Settings** — theme (light/dark), quiet hours, language (English / Bahasa Indonesia), notification toggles, AI kill switch, About, Sign out.
- **Bottom tab bar** — Today · Commitments · Search · Aura · Privacy · More (More opens the full drawer).
- **Fits a phone** — every view fits with no horizontal scroll (the Commitments table is now stacked cards).

Installable (PWA) via `manifest.webmanifest` + `sw.js`.

**How it works** (same order on every platform): **1 Connect** (you choose the source) → **2 Detect** (possible reply or commitment) → **3 Explain** (reason + original message) → **4 Decide** (you confirm/edit/snooze/dismiss) → **5 Track** (watches for resolution) → **6 Review** (all open items in one place). Every suggestion keeps its source and reason.

Tested at **390×844** (phone) and **1440×900** (desktop): 0 console errors, no horizontal overflow in any view.

## Backend API (quick reference)

Base: `/api` · Default `http://127.0.0.1:8765`

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/health` | Health check. |
| GET | `/api/state` | All collections in one object. |
| GET | `/api/<collection>` | One collection. |
| PUT | `/api/<collection>` | Replace a collection (auto-logs an audit event). |
| GET | `/api/audit` | Audit log, newest first. |
| POST | `/api/audit` | Append an audit event. |
| GET | `/api/export` | Download all data as JSON. |
| POST | `/api/reset` | Reseed to defaults. |

Collections: `queue, commitments, summaries, drafts, aura, culture, growth, sources, audit, settings, work`.

## Design system

- **Brand:** indigo `#4338CA`, accent teal `#0D9488`, surface `#FFFFFF` on `#F7F8FB`.
- **Aura archetypes (12):** Ray, Citrine, Ember, Rose, Bloom, Violet, Indigo, Cerulean, Teal, Jade, Stone, Dusk.
- **Status badges:** `[ESTABLISHED CONCEPT]` teal · `[PROPOSED DESIGN]` indigo · `[VALIDATION REQUIRED]` amber · `[FUTURE VISION]` slate.
- Light + dark themes; both pages share the same tokens.

## Build provenance

- Built from `Orbis_Master_Guide.pdf` (21 pages) on the Desktop.
- Landing page + app prototype built as self-contained HTML; backend built stdlib-only.
- Verified with headless Chromium (0 console errors) and an automated API test.

## Next steps / open items

- [ ] Confirm pricing & retention windows (spec decisions D-04, D-07).
- [ ] Decide first connected source(s) (D-03).
- [ ] Decide whether Growth ships in v1 or after the core (D-09).
- [ ] Wire a real data source (email/Slack) — currently mock only.
- [ ] Add authentication if it becomes multi-user.

---

> *Draft for founder review. Designed-to statements; legal points need counsel confirmation.*
