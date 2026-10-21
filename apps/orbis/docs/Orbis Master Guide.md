---
title: Orbis Master Guide
aliases: [Orbis, ORBIS-MG-003]
tags: [product, spec, orbis, draft]
status: draft-for-founder-review
version: 0.4
document-id: ORBIS-MG-003
date-of-issue: 2026-10-18
owner: Founder
classification: Confidential
related: "[[Orbis — Project Home]]"
---

# ORBIS — The Master Guide to the Product

> **Communication, identity and protection in one app.**
> *Keep your commitments. Work clearly. Protect what matters.*
>
> Core engine · Growth · Aura profile · Culture rules · Privacy layer · Orbis Work (planned)

> **Draft for founder review.** Designed-to descriptions only. No security, legal compliance or launch outcome is guaranteed. Legal points are to be confirmed by counsel per market before launch.

## Document Control

| Field | Value |
|---|---|
| Title | Orbis Master Guide: the complete product description |
| Document ID | ORBIS-MG-003 |
| Version and status | 0.4 — DRAFT for founder review |
| Date of issue | 18 October 2026 |
| Document owner | Founder |
| Classification | Confidential. Internal and invited collaborators only. |
| Language | English. Bahasa Indonesia planned at launch. |
| Next review | When a Decision Register item changes, or before any launch |

### Revision history

| Version | Date | Summary |
|---|---|---|
| 0.1 | 17 Oct 2026 | First master guide (three products). |
| 0.2 | 18 Oct 2026 | Adopted Orbis as the umbrella brand; standard guide format. |
| 0.3 | 18 Oct 2026 | Single product: Orbis, with Aura (profile), Culture (company rules), Orbis Work (planned module), privacy protection layer. |
| 0.4 | 18 Oct 2026 | Merged the 5–9 Freedom Lab playbook as the Growth layer; added growth rules, stages, claim discipline, monetization rules and decisions D-09 to D-11. Renumbered parts. |

### Approval

| Role | Name | Decision | Date |
|---|---|---|---|
| Founder (approver) | | | |
| Legal counsel (per market) | | | |
| Engineering lead | | | |

> `[VALIDATION REQUIRED]` AI-assisted draft. Concepts and decisions belong to the founder. Statements about law, standards and platforms must be verified by qualified professionals before reliance.

## Status labels

| Label | Meaning |
|---|---|
| `[ESTABLISHED CONCEPT]` | Already part of the founder's vision. |
| `[PROPOSED DESIGN]` | Proposed design, needs a decision or build. |
| `[VALIDATION REQUIRED]` | Hypothesis, needs evidence before commitment. |
| `[FUTURE VISION]` | Future module, not scheduled. |

## Requirement language

| Word | Meaning |
|---|---|
| SHALL | Mandatory. The product is not acceptable without it. |
| SHOULD | Recommended. Omit only with a recorded reason. |
| MAY | Optional. |
| SHALL NOT | Prohibited. |

> `[ESTABLISHED CONCEPT]` **Honesty rule.** No market data, customer numbers, revenue, integrations, launch dates or security guarantees are asserted. Where a number is needed, the guide says to measure a baseline first.

---

# Part I — Orbis Overview

> One product: a communication engine that keeps commitments, protected by a privacy layer, with self-chosen personal profiles and company rules.

## 1. Product promise

Orbis helps people keep their commitments and communicate clearly, while their conversations, identity and work stay protected. It is designed to reduce the effort of chasing replies, remembering promises and finding context, and to keep work and personal life in separate spaces. After work, a Growth layer helps people turn learning and personal goals into visible, measurable output.

`[PROPOSED DESIGN]` **Designed to, not guaranteed.** Orbis is described here as the team intends it to work. No security, encryption or outcome guarantee applies until it has been built and independently tested.

## 2. Brand and naming

| Name | Role | Status |
|---|---|---|
| Orbis | The product and the brand. | `[ESTABLISHED CONCEPT]` |
| Aura | The personal profile: work style, strengths, growth edges, portfolio, shown with the color archetype language from Chromatica. | `[PROPOSED DESIGN]` |
| Culture | The company's working rules: hours, tone, approval steps. Optional for companies. | `[PROPOSED DESIGN]` |
| Growth | Personal learning and progress layer, from the 5–9 Freedom Lab method. After-work time, separate from work data. | `[PROPOSED DESIGN]` |
| Orbis Work | A planned job-discovery module (search, introduction, conversation). | `[FUTURE VISION]` |
| Chromatica and System.GPT | Earlier working names. Their essence lives in Aura (color archetypes and self-reflection) and Culture (practical rules and systems). Used in brand storytelling only. | `[PROPOSED DESIGN]` |

*Orbita is retired as a product name to avoid confusion with Orbis. Its functions are now core features of Orbis.*

## 3. Who it is for

| Customer | What they get | How they pay |
|---|---|---|
| Individual users (B2C) | Core communication features, personal Aura, personal privacy controls. | Free plan, with an optional personal paid plan. |
| Companies (B2B) | Team workspace, Culture rules, admin controls, audit trail. | Per-seat team plan. |
| Job seekers and employers | Orbis Work (planned): portfolios, search, introductions. | Planned. Pricing to be decided. |

## 4. Core principles

| Principle | What it means |
|---|---|
| Privacy is the protection layer | Built into every feature. Not a marketing theme. |
| Human in control | AI suggests with a reason. The person decides. Nothing is sent without approval. |
| Explainable | Every suggestion shows why it appeared and the source it came from. |
| Work and personal are separate | Separate spaces, quiet hours and urgent-only exceptions by default. |
| Self-chosen identity | Aura is created and edited by the person, never inferred from their messages. |
| Fair in hiring | Personality never ranks, filters or rejects candidates. Human review is required for hiring decisions. |
| Accessible | Screen-reader support, plain language, text labels alongside color. |
| Start from real use | Build from a real problem, test with real people, and show what failed as well as what worked. |
| Evidence before expansion | Each layer earns the next one through measured results. |

---

# Part II — Users and Experience

## 5. Users

| User | Main need | Typical use |
|---|---|---|
| Freelancer or consultant | Stop losing track of client promises. | Follow-up queue, commitments, invoice reminders. |
| Sales professional | Follow up on time without manual tracking. | Follow-up timing, summaries before calls. |
| Founder or manager | See what is open across many threads. | Summaries, shared commitments (team plan). |
| Employee in a company | Work clearly, leave work at the end of the day. | Culture rules, quiet hours, personal space. |
| Job seeker (Orbis Work, planned) | Be found for the right roles. | Portfolio, Aura, introductions. |
| Company admin | Set working norms and control data access. | Culture rules, workspace settings, audit log. |

## 6. A typical day

Morning → During the day → Review → Evening → Weekly.

- **Morning** — Short summary: commitments first.
- **During the day** — Suggested follow-ups, each with its source.
- **Review** — Tap to confirm, edit or dismiss.
- **Evening** — Work closes. Personal space opens.
- **Weekly** — Review open commitments and settings.

`[PROPOSED DESIGN]` **Example.** A consultant gets a suggestion: "Client asked for the revised quote. You said you would send it Friday." The original message is shown beside the suggestion. She edits the draft, sends it herself, and marks the commitment done. Nothing went out without her.

## 7. Aura: the personal profile

`[PROPOSED DESIGN]` Aura is self-chosen and fully editable. It contains the person's work style, strengths, growth edges and a portfolio the person chooses to show. Its color archetype (twelve archetypes from the Chromatica world) gives a shared visual language.

| Aura rule | Detail |
|---|---|
| Created by the person | Through a short self-reflection quiz or by hand. Never inferred from messages. |
| Visibility | Private by default. Shared only when the person chooses, per item. |
| Used for | Personal reflection, communication preferences, and context in an introduction the person accepts. |
| Never used for | Ranking, filtering, rejecting or scoring any person, or for employer decisions. |
| Sensitive content | Health, religion, political views, and similar data are not collected. Written content of this kind is warned about and excluded from matching and search. |
| Control | Edit, hide or delete at any time. Deletion is complete within the retention window in Section 18. |

## 8. Culture: company rules

`[PROPOSED DESIGN]` Culture is an optional set of working norms an organization can publish: hours, tone of messages, approval steps and quiet-hour defaults.

| Culture rule | Detail |
|---|---|
| Optional | A company may use Culture or not. Employees are never forced into a company's rules beyond the workspace. |
| Visible | Employees can read every rule that applies to them and why. |
| Scope | Applies inside the workspace only. Personal life is outside its reach. |
| Admin limits | Admins set rules. They do not see private message content. |

---

# Part III — The Communication Engine

## 9. Core features

| Feature | What the person gets | Status |
|---|---|---|
| Follow-up queue | Messages that may need a reply, with reason and source. Confirm, edit, snooze or dismiss. | `[PROPOSED DESIGN]` |
| Commitment tracking | Promises, requests and deadlines extracted with their source. Dates are used only when stated. | `[PROPOSED DESIGN]` |
| Search by meaning | Ask in plain words. Results show the original message. | `[PROPOSED DESIGN]` |
| Thread summaries | Main topic, decisions, open questions. Facts are separated from guesses. | `[PROPOSED DESIGN]` |
| Quiet hours | Work alerts stop at the end of the day unless marked urgent. | `[PROPOSED DESIGN]` |
| Drafts | A suggested reply for review. Never sent without approval. | `[PROPOSED DESIGN]` |

## 10. How a suggestion is made

1. **Connect** — Source chosen by the person.
2. **Detect** — Possible reply or commitment.
3. **Explain** — Reason and source shown.
4. **Decide** — Person confirms or dismisses.
5. **Track** — Watches for resolution.
6. **Review** — Open items in one place.

| Rule | Requirement |
|---|---|
| Explainability | Every suggestion SHALL show its reason and the source message. |
| Uncertainty | Inferred items SHALL be labeled as suggestions, never as facts. |
| No invention | The system SHALL NOT invent a date, owner or amount that was not stated. |
| Correction | A dismissed or wrong item SHALL teach the system and be easy to fix. |
| Sending | The system SHALL NOT send any message without explicit approval. |

## 11. Sources

`[PROPOSED DESIGN]` Sources are connected only with explicit consent and only where the provider allows it. Which sources launch first is an open decision (D-03). Orbis SHALL NOT scrape restricted conversations or collect credentials beyond what a connection requires.

---

# Part IV — Growth Layer (from the 5–9 Freedom Lab)

## Purpose and origin

`[PROPOSED DESIGN]` The 5–9 Freedom Lab playbook describes a method for turning learning and personal goals into visible, measurable output after work hours. Orbis adopts that method as the Growth layer. The name "5–9" refers to after-work time; Orbis keeps that time protected from work alerts, so the two fit together.

`[VALIDATION REQUIRED]` **Scope boundary.** Growth is a personal tool. It does not coach, diagnose or decide a person's purpose, and it does not claim that tracking will create wealth, discipline or success.

## The five-stage method

1. **Understand** — Real problem, baseline, interviews.
2. **Organize** — Simplest repeatable system.
3. **Explain** — Honest evidence and lessons.
4. **Create** — Turn proven workflow into output.
5. **Empower** — Others adapt it and get results.

The same order governs the product. Each stage must produce evidence that makes the next stage more grounded.

## What the Growth layer contains

| Feature | What the person gets | Status |
|---|---|---|
| Curriculum | Domains, objectives, modules and resources, with explicit "not now" choices. | `[PROPOSED DESIGN]` |
| Key results | Measurable goals with baseline, target and current value. | `[PROPOSED DESIGN]` |
| Session log | Time, category, output and a short reflection after each work block. | `[PROPOSED DESIGN]` |
| Weekly review | Output, blockers and energy reviewed as evidence, not guilt. No streaks that punish missed days. | `[PROPOSED DESIGN]` |
| Before and after metrics | Planning time, time to start, completion rate and consistency, compared to a recorded baseline. | `[PROPOSED DESIGN]` |
| Progress card | An opt-in summary the person designs, with chosen metrics and a date range. | `[PROPOSED DESIGN]` |
| Export | Everything in the Growth layer can be exported or deleted. | `[PROPOSED DESIGN]` |

## Growth rules

| Rule | Requirement |
|---|---|
| Separate from work | Growth data SHALL be stored apart from work communication data. |
| No work-message analysis | Growth SHALL NOT read work messages to infer progress unless the person explicitly opts in for a named feature. |
| Private by default | Personal notes, finances and sensitive goals are private. Sharing is always a deliberate step. |
| No ranking | No leaderboards, public scores or comparisons between people. |
| No guaranteed outcomes | Copy SHALL NOT promise productivity, income or success. |
| Rest counts | Energy, stress and relationships are part of every review. |

## Weekly rhythm

| Moment | Action | Time suggestion |
|---|---|---|
| Weekly planning | Choose one main outcome and up to three supporting actions. | 20–30 min |
| Work sessions | Focused block; end by writing the next action. | 25–90 min |
| Weekly review | Review evidence: output, blockers, energy. | 20 min |
| Monthly review | Decide what to continue, simplify, pause or stop. | 30–60 min |

## Claim discipline

Results are shown as personal, time-bound evidence, for example: "In my four-week test, planning time fell from X to Y minutes using this method." Null and negative results are shown too. A personal case is evidence about one use case, not proof of universal results.

## Monetization and recommendations

| Option | Rule |
|---|---|
| Core Growth features | Free. The core value must stand on its own. |
| Affiliate recommendations (optional, later) | Disclosed beside each link. Alternatives and limits shown. Never affects ranking inside Orbis. Never shown in work or privacy surfaces. |
| Paid templates or kits (later) | Describe exactly what is included and who it suits. |
| Paid convenience features (later) | Only after recurring value is shown. Essential data is never locked away. |

## Community (deferred)

Public feeds, sharing rituals and community challenges belong to a later stage. They require moderation, safety review and privacy controls before any public feature is offered.

## Growth stages and gates

| Stage | Product | Gate to move on |
|---|---|---|
| 0. Personal system | The founder's own curriculum and tracker in a simple tool. | Used for at least four weeks; repeatable value identified. |
| 1. Free template | A simple template and setup guide. | 10–20 target users try it; real feedback collected. |
| 2. Inside Orbis | Growth module in the app, starting with session log and weekly review. | Users return weekly; the module solves a recurring problem. |
| 3. Focused app features | Curriculum, key results, before and after metrics, progress card. | Retention and user outcomes justify continued development. |
| 4. Community | Template discovery and sharing, after safety review. | Safety, moderation and privacy are proven. |

`[PROPOSED DESIGN]` **Build rule.** If a spreadsheet or template already solves the problem adequately, do not build software for it yet. Growth is added inside Orbis only after the template stage shows repeated use.

## How a person would use this

`[ESTABLISHED CONCEPT]` After work, open the Growth tab. Pick one outcome for the week and log a 45-minute session with what you produced. On Sunday, review the week: what got done, what got in the way, how your energy was. Share a progress card only if you choose to, with the metrics you pick. Work messages never feed into any of this.

---

# Part V — Privacy Protection Layer

## 12. Principles

| Principle | Requirement |
|---|---|
| Minimum data | Process only what the active feature needs. |
| Consent | Each source, each Aura share and each Culture rule needs a clear choice. |
| Visibility | The person sees what Orbis reads, stores and shares, in a privacy dashboard. |
| Control | Disconnect, export and delete in one place. |
| Separation | Work and personal data are separate; private and team-shared data are separate. |
| Kill switch | A person can pause all AI features. An admin can pause them for a workspace. |
| Audit | Important actions are logged, and users can see their own log. |

## 13. Data by category

| Data | Collected? | Use | Never used for |
|---|---|---|---|
| Message references and extracted commitments | Yes, from connected sources only | Follow-ups, commitments, search | Training, advertising, profiling |
| Message content | Only where needed for a feature | Summaries and suggestions | Anything outside the feature |
| Aura (self-chosen profile) | Yes, with the person's input | Personal reflection, chosen context | Ranking, rejecting, employer decisions |
| Portfolio items | Yes, chosen by the person | Shown to others the person picks | Matching without consent |
| Health, religion, political views, similar written | No. Warned and excluded if written | None | All uses |

## 14. Sensitive content

Aura and portfolio fields do not ask for health, religion, political views or similar sensitive data. If a person writes such content, Orbis warns them, and the content is excluded from matching, search and summaries.

## 15. Other people's data

Connected threads contain messages from people who may not use Orbis. Only messages needed for a feature are processed. Non-users can request an objection or removal through a form. Their data is never used for matching or profiling.

## 16. Identity and trust

| Stage | Verification |
|---|---|
| Personal account | Light verification (for example, a confirmed email and phone). |
| Before a hiring stage (interview invitation, offer, contract) | Stronger verification, such as a document or work-email check. |
| Reporting | Users can report scams and fake profiles. Reports reach a human review queue. |

## 17. Explainability and human review

Every automated suggestion shows its reason and source. Hiring-related decisions always require a human reviewer, and candidates can ask how a result was reached.

## 18. Retention and deletion

| Data | Retention |
|---|---|
| Message references and commitments | While the source is connected, plus 30 days after disconnect, then deleted. |
| Aura and portfolio | Until the person deletes them. |
| Audit logs | 12 months, then deleted. |
| Backups | Deleted within a stated window (target 30 to 90 days), disclosed in the privacy notice. |
| Deletion requests | Confirmed in the app with a receipt. |

`[VALIDATION REQUIRED]` **Legal baseline.** One design, built to the strictest common standard: data minimization, consent, deletion rights, explainability and human review. Each market needs a short addendum confirmed by counsel: Indonesia (PDP Law), the EU (GDPR and AI Act) and US states (automated hiring rules).

---

# Part VI — Orbis Work (Planned Module)

`[FUTURE VISION]` This module is a future vision. Scope, pricing and launch are not decided.

## 19. How it works

1. **Build profile** — Portfolio and Aura, chosen by the person.
2. **Post or search** — Roles with stated requirements.
3. **Match on skills** — Experience and requirements only.
4. **Introduce** — Both sides accept.
5. **Chat** — Conversation opens.
6. **Decide** — Human review, both can end or report.

## 20. Fairness rules

| Rule | Requirement |
|---|---|
| No personality ranking | Aura SHALL NOT rank, filter or reject candidates. |
| Matching criteria | Skills, experience and stated requirements only. |
| Context, not scoring | Each side may view the other's Aura and Culture to set expectations. |
| Human decisions | Hiring decisions are made by people, with the reason visible. |
| Exit | Either side can end a conversation, report it or delete the record. |

`[VALIDATION REQUIRED]` **Launch conditions.** Orbis Work SHALL NOT launch until the marketplace trust model, verification, anti-fraud review and per-market hiring law review are complete.

---

# Part VII — Architecture and Data

| Layer | Description |
|---|---|
| Apps | Mobile first, web for admins. Views: follow-up queue, commitments, search, Aura, Culture, privacy dashboard. |
| Connections | Authorized sources only. Consent, revocation, rate limits and error handling. |
| Processing | Parsing, participant grouping, duplicate detection, metadata normalization. |
| AI layer | Detection, classification, summaries and drafts. Every output keeps its source link and reason. |
| Core and rules | Commitments, quiet hours, Culture rules and kill switch enforced here. |
| Security | Authentication, roles, encryption in transit and at rest (to be verified), audit logs. |
| Privacy | Consent records, data map, deletion and retention jobs, objection handling. |

*Figure 1. Proposed Orbis architecture, from user interface to privacy controls.*

## 21. Core data entities

| Entity | Key fields |
|---|---|
| Person | Account, verification level, workspace membership. |
| Source | Provider, consent record, scope, status, revocation. |
| Message reference | Source ID, sender, timestamp, permission context. |
| Commitment | Description, responsible person, stated date (if any), status, confidence, source link. |
| Aura | Owner, self-entered fields, visibility per item. |
| Culture rule | Workspace, rule text, applies-to, visible to members. |
| Audit event | Actor, action, time, object. Kept 12 months. |

## 22. Non-functional targets

| Area | Requirement |
|---|---|
| Availability | A target to be set after the first beta baseline. No promise until measured. |
| Performance | Suggestions appear within a time target set in testing. |
| Accessibility | WCAG-aligned, screen-reader support, plain language. |
| Languages | Bahasa Indonesia and English at launch. |

---

# Part VIII — Business Model

> Individuals for reach, companies for revenue. Prices are not yet set.

| Plan | Who | Includes | Price |
|---|---|---|---|
| Personal free | Individuals | Core features for a limited number of sources. | Free |
| Personal paid | Individuals | More sources, longer history, advanced summaries. | To be decided (V) |
| Team | Companies | Workspace, Culture rules, admin controls, audit log. | Per seat, to be decided (V) |
| Orbis Work | Job seekers and employers | Planned module. | Not decided (F) |

Individual use is the entry point. Company plans carry the revenue. Pricing needs willingness-to-pay evidence before it is fixed.

---

# Part IX — Risks, Decisions and Next Steps

## 23. Key risks

| Risk | Why it matters | Mitigation |
|---|---|---|
| Privacy failure | Confidential messages; trust lost quickly. | Privacy built in; independent review before launch. |
| Hiring law | Automated hiring rules differ by market. | Human review; counsel confirmation per market. |
| Platform access | Providers may limit message access. | Launch with sources that allow it. |
| Noisy suggestions | Wrong reminders erode trust. | Easy dismiss; learn from corrections. |
| Fake profiles | Damages the marketplace. | Verification stages and report queue. |
| Crowded market | Existing email tools add AI features. | Win on commitments and privacy, not inbox features. |

## 24. Decision register

| ID | Decision | Status |
|---|---|---|
| D-01 | Product name confirmed as Orbis (umbrella brand retired elsewhere). | Open |
| D-02 | Trademark and domain check for Orbis in target markets. | Open |
| D-03 | First connected source(s). | Open |
| D-04 | Pricing for personal and team plans. | Open |
| D-05 | Launch language and market order. | Open |
| D-06 | Whether and when to start Orbis Work. | Open |
| D-07 | Retention windows confirmed by counsel. | Open |
| D-08 | Aura color palette and Ray and Citrine separation. | Open |
| D-09 | Growth layer in the first release, or after the core is proven (recommended: after). | Open |
| D-10 | Whether affiliate recommendations are ever offered, and in which surfaces. | Open |
| D-11 | Keep the 5–9 Freedom Lab name as a method label, or use only "Growth". | Open |

## 25. Glossary

| Term | Meaning |
|---|---|
| Orbis | The product and brand. |
| Aura | The self-chosen personal profile and portfolio. |
| Culture | Optional company working rules, visible to members. |
| Orbis Work | Planned job discovery module. |
| Commitment | A promise, request or deadline that may need tracking. |
| Kill switch | A control that pauses all AI features. |
| Concierge test | A manual service delivered to a few users to test value before building. |
| Growth | Personal learning and progress layer, based on the 5–9 Freedom Lab method. |
| Key result | A measurable outcome with a baseline, target and current value. |
| Progress card | An opt-in summary of chosen metrics the person may share. |

---

> *Draft for founder review. Designed-to statements; legal points need counsel confirmation.*
