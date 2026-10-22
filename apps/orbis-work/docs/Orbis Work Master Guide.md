# Orbis Work — Master Product Guide

**Version 1.0 · October 2026**
*Identity, communication, protection, and hiring — in one app.*
A full merge of **Orbis** (communication · identity · protection) and **Loker** (chat-first job platform), modeled on BOSS Zhipin.

---

## 1. What this app is

**Orbis Work** merges two complete products into one:

- **Orbis** — a communication, identity and protection layer: a follow-up queue, commitments, thread summaries, drafts, the **Aura** profile, company **Culture** rules, **Growth** tracking, and a **Privacy** layer (consent, AI kill switch, audit log).
- **Loker** — a **chat-first job marketplace**: dense job cards, filters, company pages, direct chat with employers, a recruiter **candidate feed**, a virtual résumé, and a **Verified Employer** trust badge.

The merge is not cosmetic: the two share an **identity + trust spine** (see §3).

## 2. Modules

| Group | Modules |
|---|---|
| **Work** (from Loker) | Discover (jobs · filters · company pages) · Candidates (recruiter mode) · Chats · Saved |
| **Life** (from Orbis) | Today (follow-up queue) · Commitments · Summaries · Drafts |
| **You** (from Orbis) | Aura (profile) · Growth |
| **Company** | Culture |
| **Settings** | Privacy · Language · VIP · mode toggle · logout |

## 3. The bridge (what makes it a *merge*, not two apps)

1. **Aura → résumé.** The Orbis **Aura** profile powers the job-seeker's résumé and is what employers see.
2. **Verification → trust.** `aura.verificationLevel` is shown on employer **and** candidate cards as the trust signal.
3. **Consent → audit.** Every apply / chat-start appends to the **audit log** (actor, action, object, time), visible under Privacy — a real consent/traceability trail.
4. **Fairness rule.** The job match score is **skills/experience only** — never personality or Aura (mirrors Orbis's rule *"Aura SHALL NOT rank candidates"*).

## 4. Data model (client state — 27 keys)

Loker (17): `me, role, employers, jobs, chats, saved, notifications, filters, auth, onboarded, lang, accounts, mode, applications, privacy, vip, candidates`

Orbis (10): `queue, commitments, summaries, drafts, aura, culture, growth, sources, audit, settings`

`aura` = {name, headline(+_en), skills, strengths, growthEdges, archetype, **verificationLevel**, visibility}. `settings` = {quietHours, aiPaused, theme}.

## 5. Architecture

```
apps/orbis-work/
  web/index.html      desktop build (single-file, offline)
  web/mobile.html     mobile build  (single-file, offline)
  server/server.py    stdlib HTTP server, port 8792, SQLite, /api/*
  tests/              verify_api.py + test_static_integrity.py
  docs/               this guide (+ PRD)
```

- **Zero dependencies.** Self-contained HTML front-end; Python standard-library-only backend.
- **Offline-first.** Double-click the HTML and it runs; the server only adds persistence.
- **Serve-time state injection**, CORS JSON API, path-traversal protection.
- Wired into the monorepo's `build_site.py` + CI.

## 6. How to run

```powershell
cd "~\Documents\Default Project"
python apps/orbis-work/server/server.py
```
Open `http://127.0.0.1:8792/`. Demo login `demo@orbiswork.app` / `demo123`, or **Continue as guest**.

Offline: double-click `apps/orbis-work/web/index.html` (desktop) or `web/mobile.html` (mobile).

## 7. Bilingual

Full **English ⇄ Bahasa Indonesia**, switchable and persisted; all content has translated variants.

## 8. Honest limits

This is a **merged prototype** (mock data, client-side auth, simulated messaging). It is not production. The merge demonstrates that Orbis's identity/trust layer and Loker's marketplace **fit together** — but real competition still means **liquidity in one niche** + **proven willingness to pay**, not more features.

---

*Merged from `apps/orbis` + `apps/loker` into `apps/orbis-work`. Originals remain intact.*
