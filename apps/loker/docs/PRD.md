# Loker — Product Requirements Document (PRD)

**Version:** 0.4 (Zhipin-grade prototype — feature-complete demo)
**Status:** Prototype built & verified (auth + browse + chat + dual-mode + i18n).
**App name:** Loker (Indonesian slang for "job vacancy / job listing")
**Repo location:** `apps/loker/` (4th app, alongside Orbis, Peers, House of Articles)
**Reference:** BOSS Zhipin (zhipin.com) — direct-chat recruitment, adapted to Indonesia with a trust wedge.
**Validation:** see [`Employer-Validation-Plan.md`](Employer-Validation-Plan.md) — the next real step.

> Legend: **[BUILT]** = exists & verified · **[PROPOSED]** = recommended, not built.

---

## 1. Summary

Loker is a **chat-first job platform for Indonesia**. Job seekers message the **employer/boss directly** (no HR, no *calo*/brokers), guided by an **AI match score**, with an anti-scam **"Verified Employer"** badge as the core trust promise. It mirrors BOSS Zhipin's direct-recruitment model while adding an Indonesia-specific anti-scam trust layer, a two-sided (seeker/recruiter) experience, and full bilingual support.

**One-liner:** *"Chat langsung dengan bosnya — tanpa perantara, tanpa penipuan."* / *"Chat directly with the boss — no middlemen, no scams."*

## 2. Problem

- Indonesian job boards (JobStreet, Kalibrr, Glints) skew **white-collar** and are **resume-upload / one-way** — applications vanish into a void.
- **Blue-collar / first-job seekers** (the majority of the workforce) are underserved.
- **Scams and fake listings** are a major pain point.
- No direct line to the **decision-maker**; HR is a slow middleman.

## 3. Target Users

| Persona | Description | Need |
|---|---|---|
| **Andi** (primary) | 18–30, blue-collar / first job, mobile-first, low data budget | Find a legit job fast, talk to a real boss, avoid scams |
| **Bu Sari** (employer) | SME owner (F&B, retail, logistics) | Hire quickly without HR or consultants |

## 4. Differentiation

1. **Direct chat with the boss** — removes the HR middleman.
2. **Verified Employer badge** — anti-scam trust (the core wedge).
3. **AI match score** — recommendation feed, not search.
4. **Mobile-first + offline-capable** — works on cheap phones / poor connectivity.
5. **Bilingual** — English ⇄ Bahasa Indonesia (user-selectable).
6. **Two-sided** — one account switches between job seeker and recruiter.

## 5. Features by screen — all [BUILT]

| Screen | Function | Status |
|---|---|---|
| **0. Auth** | Login / Sign up tabs, email+password (show/hide), validation, loading state, **Continue as guest**, demo credentials, language switcher | BUILT |
| **1. Onboarding** | Role picker (seeker / employer), name entry, language switcher | BUILT |
| **2. Discover feed** | **Zhipin-dense job cards**: title · salary **+ bonus** · experience/education/benefit tags · commute · company + industry + size + **funding stage** + verified · **recruiter name + online dot + response rate** · applicants · posted-ago · match % · free-text search | BUILT |
| **3. Filters** | City / Experience / Education / Salary / **Type** dropdowns + Clear + **industry category chips** (F&B, Retail, Logistics, Manufacturing, Services, Hospitality), live filtering | BUILT |
| **4. Job detail** | Full description, employer profile, response rate, "Chat with boss" CTA, **mass apply** | BUILT |
| **5. Company profile** | Verified badge, industry, size, funding stage, rating + review count, about, open jobs, reviews | BUILT |
| **6. Chat thread** | 1:1 chat, quick replies + **prewritten templates**, **action bar** (Call / Share contact / Send résumé / Not interested), typing indicator, verified header | BUILT |
| **7. Chats list** | Conversation list + **filter tabs** (All / Unread / New / Interview / Not interested) | BUILT |
| **8. Saved jobs** | Bookmarked jobs + empty state | BUILT |
| **9. Recruiter mode** | Mode toggle (seeker ⇄ recruiter); **candidate feed** with match %, experience/education, expected salary, chat | BUILT |
| **10. Profile / Settings** | **Virtual résumé** (headline, city, expected salary, education, experience, skills, response rate, completeness), language setting, **privacy** (hide profile, block companies), **VIP teaser**, logout | BUILT |
| **Notifications** | Bell dropdown, mark-all-read, unread badge | BUILT |
| **i18n** | Full EN ⇄ ID, switchable, persisted in state | BUILT |

## 6. Non-functional [BUILT]

- **Offline-first**: double-click the HTML, works with no server.
- **Zero dependencies**: pure HTML/CSS/JS; Python **standard-library-only** backend.
- **Optional persistence**: `server.py` (SQLite) + serve-time state injection; front-end files stay byte-pristine.
- **Security/perf**: no external network calls, CORS-enabled JSON API, path-traversal protection.
- **i18n**: `id` + `en`, stored as `lang` (default `id`).

## 7. Data Model (state) — all [BUILT]

Top-level keys:
`me, role, employers, jobs, chats, saved, notifications, filters, auth, onboarded, lang, accounts, mode, applications, privacy, vip, candidates`

- `me` → id, name, headline(+_en), location, responseRate, expectedSalary, education(+_en), experience(+_en), city, skills[], completeness, verified
- `employers` → id, name, industry(+_en), location, verified, responseRate, about(+_en), size(+_en), funding(+_en), rating, reviewCount, openings, reviews[]
- `jobs` → id, employerId, title(+_en), salaryMin/Max, salaryLabel, location, city, category, type(+_en), experience(+_en), education(+_en), bonus(+_en), commute(+_en), tags[](+_en), description(+_en), applicants, postedAgo(+_en), recruiter{name, role(+_en), online, responseRate}, match, verified
- `chats` → id, employerId, jobId, unread, tag, messages[{from, text(+_en), ts}]
- `candidates` → id, name, headline(+_en), location, skills[], experience(+_en), education(+_en), expectedSalary, match, note(+_en), avatar
- `applications` → [{jobId, ts, status}] · `privacy` → {hideProfile, blockedCompanies[]} · `vip` → bool · `mode` → "seeker"|"recruiter"
- `accounts` → [{email, name, pass(demo hash), created}] · `auth` → {loggedIn, email, name}
- `saved`, `notifications`, `filters{city, experience, education, salary, type, category}`, `onboarded`, `lang`

## 8. Technical Architecture [BUILT]

```
apps/loker/
  web/index.html      desktop build (single-file, offline, key loker_demo_v1)
  web/mobile.html     mobile build  (single-file, offline, key loker_mobile_v1)
  server/server.py    stdlib HTTP server, port 8791, SQLite, /api/*
  tests/              verify_api.py + test_static_integrity.py
  docs/               this PRD + Employer Validation Plan
```

**API:** `GET /api/health` · `GET|PUT /api/state` · `POST /api/reset` · `POST /api/auth` · CORS `*`.
Wired into `scripts/build_site.py` and CI (`check_site.py`, `run_all_tests.py` → 7/7 pass).

## 9. Monetization [PROPOSED]

- **Primary:** employer-side paid engagement / subscriptions (BOSS Zhipin's model — seekers rarely pay). SME-friendly.
- **VIP tier:** candidate premium (visibility boost, "who viewed you") — mirrored from Zhipin.
- **Possible attach:** jobs as a funnel for **fintech** (earned-wage, micro-loans).

## 10. Success Metrics [PROPOSED]

Match→chat conversion · chat→employer-reply rate · **time-to-first-response** · % verified employers · verified listing→hire rate · 30-day retention · chats per active seeker (liquidity).

## 11. Roadmap

| Phase | Scope | Status |
|---|---|---|
| **0. Prototype** | Screens, i18n, offline, optional backend | ✅ Done |
| **0.1 Auth** | Login/signup/guest/logout | ✅ Done |
| **0.2 Browse (Zhipin-grade)** | Dense cards, filters, categories, company pages | ✅ Done |
| **0.3 Features (1B)** | Chat tabs/templates/action bar, dual-mode, résumé+mass apply, privacy, VIP | ✅ Done |
| **1. Validation** | 10 employer interviews → confirm willingness to pay | ▶ **Next** (see validation plan) |
| **2. Niche pilot** | One city + vertical; real employers; verification flow | Planned |
| **3. Monetization** | Employer subscriptions; real messaging backend | Planned |
| **4. Scale** | Multi-city/vertical; fintech; fraud ops | Planned |

## 12. Risks & Open Questions

1. **Liquidity cold-start** — the #1 risk (why Hirect failed despite $40M).
2. **Monetization** — SME price sensitivity; thin ARPPU.
3. **Trust at scale** — verification cost + fraud ops, not just a badge.
4. **Incumbents** — Glints / KitaLulus / Pintarnya already ship chat features.
5. **Open:** which city/vertical first? Who performs verification? Capital or bootstrap?

## 13. What this prototype is / isn't

- **Is:** a polished, feature-complete **demo** that mirrors BOSS Zhipin's core loop (auth → discover → filter → company → chat → dual-mode → résumé) and the Indonesia trust wedge. Good enough to show people and to test the concept.
- **Isn't:** a production service or a literal competitor to a $9B company. Real competition = **liquidity in one niche** + **proven willingness to pay**. Next step is the [Employer Validation Plan](Employer-Validation-Plan.md), not more features.

---

*Fact vs proposal: Sections 5/6/7/8 describe what is built & verified. Sections 9/10/11 (Phase 2+) describe recommendations requiring validation with real users.*
