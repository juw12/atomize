# Loker — Master Product Guide

**Version 0.4 · October 2026**
*A chat-first job platform for Indonesia, modeled on BOSS Zhipin (zhipin.com).*

---

## 1. What Loker is

**Loker** (Indonesian slang for "job vacancy") is a **chat-first job platform**. Job seekers message the **employer directly** — no HR middleman, no *calo* (brokers) — guided by an **AI match score**, with an anti-scam **"Verified Employer"** badge as the core trust promise.

> **Tagline:** *"Chat langsung dengan bosnya — tanpa perantara, tanpa penipuan."* / *"Chat directly with the boss — no middlemen, no scams."*

It mirrors BOSS Zhipin's *Direct Recruitment Model* (mobile-native + recommendation feed + instant direct chat) and adapts it to Indonesia with a local trust layer and full bilingual support.

## 2. The problem

- Indonesian job boards (JobStreet, Kalibrr, Glints) skew **white-collar** and are **resume-upload / one-way** — applications disappear into a void.
- **Blue-collar and first-job seekers** (the majority of the workforce) are underserved.
- **Scams and fake listings** are a major, widely felt pain point.
- There is **no direct line to the decision-maker**; HR is a slow middleman.

## 3. Who it's for

| Persona | Description | Need |
|---|---|---|
| **Andi** (primary) | 18–30, blue-collar / first job, mobile-first, low data budget | Find a legit job fast, talk to a real boss, avoid scams |
| **Bu Sari** (employer) | SME owner (F&B, retail, logistics) | Hire quickly without HR or consultants |

## 4. How it works — the core loop

1. **Sign in** (account or guest) and pick a language.
2. **Onboarding** — choose seeker or employer, enter your name.
3. **Discover** — a recommendation feed of dense job cards with an AI match %.
4. **Filter** — city, experience, education, salary, type, industry category.
5. **Open a job** — see the employer, verification, response rate, and benefits.
6. **Chat directly with the boss** — using quick replies or prewritten templates.
7. In recruiter mode, the employer flips the switch and sees a **candidate feed**.

## 5. Feature reference

| # | Screen | Function |
|---|---|---|
| 0 | Auth | Login / Sign up, guest access, validation, demo credentials, language switcher |
| 1 | Onboarding | Role picker, name entry |
| 2 | Discover feed | Dense job cards: salary + bonus, tags, commute, company, recruiter + online + response rate, match % |
| 3 | Filters | City / Experience / Education / Salary / Type + industry chips |
| 4 | Job detail | Description, employer profile, mass apply |
| 5 | Company profile | Verified, industry, size, funding, rating, reviews, open roles |
| 6 | Chat thread | 1:1 chat, templates, action bar (call / share contact / send résumé / not interested) |
| 7 | Chats list | Filter tabs: All / Unread / New / Interview / Not interested |
| 8 | Saved jobs | Bookmarked jobs |
| 9 | Recruiter mode | Candidate feed with match %, chat |
| 10 | Profile / Settings | Virtual résumé, language, privacy, VIP teaser, logout |

## 6. Chat & hiring flow

- Either side can start the conversation; the chat is tied to the job poster.
- **Prewritten templates** speed up first contact (no cover letter needed).
- The **action bar** lets users call, exchange contact, send a résumé, or mark not-interested.
- **Response rates** are shown so both sides are nudged to be responsive (a Zhipin signature).

## 7. Trust & anti-scam (the wedge)

- **Verified Employer** badge on vetted companies.
- **Blocked companies** — users can hide an employer's jobs.
- **Hide profile** privacy toggle.
- A "Why Loker?" panel reinforces the no-scam, no-broker promise.

## 8. Bilingual

Full **English ⇄ Bahasa Indonesia**, switchable on the login screen, onboarding, and settings; the choice persists. All content (jobs, employers, candidates, chat) has translated variants.

## 9. Data model (client state)

Top-level keys:
`me, role, employers, jobs, chats, saved, notifications, filters, auth, onboarded, lang, accounts, mode, applications, privacy, vip, candidates`

Key collections: `jobs` (title, salary, tags, experience, education, bonus, commute, city, category, recruiter, match, verified), `employers` (industry, size, funding, rating, reviews), `candidates` (recruiter-mode), `chats` (messages + tag).

## 10. Technical architecture

```
apps/loker/
  web/index.html      desktop build (single-file, offline)
  web/mobile.html     mobile build  (single-file, offline)
  server/server.py    stdlib HTTP server, port 8791, SQLite, /api/*
  tests/              verify_api.py + test_static_integrity.py
  docs/               PRD + this guide + validation plan
```

- **Zero dependencies.** Front-end is one self-contained HTML file; backend is Python standard library only.
- **Offline-first.** Double-click the HTML and it works with no server.
- **Optional persistence.** The server injects state at serve time; on-disk files stay byte-pristine.
- **CI.** Wired into the monorepo's `build_site.py`, `check_site.py`, and `run_all_tests.py`.

## 11. How to run

**With backend (data persists):**
```powershell
cd "~\Documents\Default Project"
python apps\loker\server\server.py
```
Open `http://127.0.0.1:8791/`. Demo login `demo@loker.app` / `demo123`, or Continue as guest.

**Offline:** double-click `apps/loker/web/index.html` or `web/mobile.html`.

## 12. Monetization

- **Primary:** employer-side paid engagement / subscriptions (seekers rarely pay).
- **VIP tier:** candidate premium (visibility boost, "who viewed you").
- **Possible attach:** jobs as a funnel for **fintech** (earned-wage, micro-loans).

## 13. Roadmap

| Phase | Scope | Status |
|---|---|---|
| 0. Prototype | Screens, i18n, offline, backend | Done |
| 0.1 Auth | Login/signup/guest/logout | Done |
| 0.2 Browse | Dense cards, filters, categories, company pages | Done |
| 0.3 Features | Chat tabs/templates, dual-mode, résumé, privacy, VIP | Done |
| 1. Validation | 10 employer interviews | Next |
| 2. Pilot | One city + vertical; real employers | Planned |
| 3. Monetization | Employer subscriptions; real messaging | Planned |

## 14. Validation (the next real step)

Before more features: run **10 employer interviews** in one niche to test willingness to pay. See the **Employer Validation Plan**. Success = **3+ employers willing to pay** for a pilot.

## 15. FAQs

- **Is this production-ready?** No. It is a feature-complete prototype with mock data.
- **Does login really work?** It is client-side (demo accounts + guest); there is no auth server.
- **Is messaging real-time?** No — replies are simulated.
- **Does it need to be online?** No. It works offline; the server only adds persistence.
- **Is the employer verification real?** No — the badge is demonstrated, not enforced.

## 16. Honest limits

Loker is a **demo**, not a competitor to a $9B company. Real competition is **liquidity in one niche** plus **proven willingness to pay** — not more features. Validate before building further.

---

*Built as the 4th app in the `apps/` monorepo, alongside Orbis, Peers, and House of Articles.*
