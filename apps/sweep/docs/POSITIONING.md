# Sweep — Positioning Brief

> Status: living · Owner: Juwen Lie · Date: 2026-10-23
> Companion to [`BRIEF.md`](BRIEF.md) (the app spec) and
> [`Sweep-App-Plan.md`](Sweep-App-Plan.md) (the PRD).
> This doc is about **market position and messaging**, not scope. Scope lives in the BRIEF.

---

## 1. One-liner

**Product line:**
> Turn a rough idea into a plan you can **verify** and a scaffold you **own** — offline-first, zero lock-in.

**Competitive line (the anti-builder):**
> Foundable builds you a business and hopes it runs. **Sweep proves it runs — and you own it.**

---

## 2. Category

**Local-first, verification-first product pipeline.**

Sweep is not an "AI app builder" in the generate-and-pray sense, and it is not a
hosted "AI employee" that runs a business for you. It is the **planning and
verification front-end** of a product pipeline: idea → checkable plan → scaffold,
with a commitment that "done" means *verified*, not *generated*.

This category choice is deliberate. The crowded market ([Sweep-App-Plan.md](Sweep-App-Plan.md) §9.6)
competes on **speed of generation**. Sweep competes on **trust, ownership, and
repeatability** — the axes the incumbents are structurally weak on.

---

## 3. Target user (who this is for)

Technical solo builders and small internal teams who:

- want **self-hosted, dependency-light** output they fully control;
- value **verification over vibes** — they hate shipping broken things;
- keep a **durable second brain** (memory + catalog) across projects;
- would rather own the artifact than rent it from a SaaS.

**Not for (by design):** non-technical founders who want done-for-you hosting,
payments, and marketing. Those users should choose a hosted operator (see §5).

**JTBD:** *"When I have a rough app idea, I want to turn it into a clear, checkable
plan — and know the result actually runs — so I build the right thing, own the
output, and can repeat the process."*

---

## 4. The competitive frame

### 4.1 Name clarification (important)

The user report referenced **`foundables.com`**. Verification (DNS + HTTP,
2026-10-23):

| Domain | Resolves to | HTTP | Read |
|---|---|---|---|
| `foundables.com` / `www.foundables.com` | `216.92.75.28` | **403 Forbidden** | Parked / bot-blocked domain — **not a product** |
| `foundable.com` | `13.225.177.75`, `.58` | **200** (CloudFront) | **The real, live product** |

> **Assumption (not proven):** the 403 + Cloudflare interstitial pattern at
> `foundables.com` indicates a parked/ad domain. The rest of this brief is about
> **`foundable.com` (singular)**, which is the actual competitor.

### 4.2 What foundable.com is (facts from their own site/docs/pricing)

- **Category:** hosted "idea-to-profit" platform. Tagline: *"Build a business that runs on its own."*
- **Mechanic:** one AI agent, **"Ted"**, framed as "the AI employee who does the work."
- **Loop:** **Build → Grow → Earn** — website + logo + brand + email; outreach +
  social posts + integrations (Gmail/Calendar/Slack/Notion/HubSpot); Stripe
  payments in the user's own name.
- **Automation:** "Autopilot / Run" — on paid plans Ted keeps working on its own
  within a per-run budget; by default everything waits for user approval.
- **Model:** freemium credits. Free = 45 welcome credits + 5/day. Paid from
  **$25/mo ($225/yr)**, tiers Standard / Pro / Max.
- **Stack (their Vercel launch post):** Next.js on Vercel, stateful API on AWS,
  Supabase (Postgres + Auth).
- **Stated limits:** native mobile is an Expo Go preview only (no store
  submission); **no self-serve code export / GitHub sync** (their app-builder page
  contradicts their FAQ — their own messaging is inconsistent); not a code workspace.

### 4.3 What Sweep is (from BRIEF.md)

Local-first, offline-first static PWA; idea brief → capability matrix →
Definition of Done → scaffold preview → catalog → Obsidian memory. The commit
gate is **real verification** (smoke + Playwright screenshots + acceptance test +
secret scan), and output is dependency-light and self-hostable.

### 4.4 Head-to-head (honest)

| Axis | foundable.com | Sweep |
|---|---|---|
| Primary user | Non-technical founders | Technical solo builders / internal teams |
| Scope | Full business: build + grow + **earn** | Planning + verification + scaffold |
| Delivery | Hosted SaaS, one chat agent | Local-first, offline, single-file PWA |
| Ownership | "You own it"; code export only on Pro/Max | **Own everything by default; self-hostable** |
| Verification | Not their moat; code not exposed | **Verification *is* the moat** |
| Breadth | Huge (domains, Stripe, 20+ integrations, autopilot) | Thin (front-half planning + sync) |
| Offline / privacy | Cloud, accounts required | **Zero network, zero accounts, encrypted local** |
| Maturity | Funded, live, polished, marketing-led | Personal project, v0.1 |

**They are adjacent, not identical.** Foundable is an **operator** (does the
business for you). Sweep is a **planner + verifier** (proves the thing you build
runs and that you own it). Overlap is limited to "idea → first version."

---

## 5. Differentiators (the axes we win)

1. **Verification honesty.** The whole category's failure mode is "looks done,
   doesn't run." Sweep's Definition of Done + Playwright gate is a *demonstrable*
   edge — the commit gate, not exit-0.
2. **Ownership / no lock-in.** Dependency-light, self-hostable output; you own
   the code, tests, and docs by default — not as a paid tier.
3. **Offline / privacy.** No accounts, no cloud, encrypted at rest
   (WebCrypto PBKDF2 → AES-GCM). A real niche: privacy-sensitive, regulated,
   air-gapped work.
4. **Speed-to-clarity for builders.** One sitting → a plan you can read *and*
   verify, with no credit meter between you and the next step.
5. **Durable memory.** Longitudinal idea→app system with a live catalog and a
   structured second brain — not one-off chat→code.

---

## 6. Where we do NOT compete (honest non-claims)

Do not market Sweep as "a better Foundable." It is not, and pretending so loses.

- We do **not** yet ship a running app from the web product — the app stops at
  **scaffold preview**; execution lives in the OpenCode `/sweep` pipeline.
- We do **not** offer hosting, custom domains, payments, or marketing automation.
- We do **not** serve non-technical users who want done-for-you everything.
- We do **not** have a monetization model, integrations, or capital.

> **The single biggest credibility gap:** to be a fair "better buy" for the
> technical builder, Sweep must **execute the back half** — generate the runnable,
> verified app (the deterministic generator already exists in the `/sweep`
> pipeline) so a user gets idea → *verified running app*, not just idea → plan.

---

## 7. Non-goals (positioning, aligned with BRIEF.md §Non-goals)

- **Not** a hosted business operator (build/grow/earn-as-a-service).
- **Not** a per-seat SaaS with a credit meter.
- **Not** a generic no-code app builder for the masses.
- **Not** "fastest generation" — we refuse to trade verification for speed.
- **Not** multi-tenant hosting, marketplaces, or team collaboration (v0.1).

---

## 8. Messaging (copy blocks)

- **Header:** *Describe an idea → get a plan you can verify and own.*
- **Against**: *"Foundable builds you a business and hopes it runs. Sweep proves it runs — and you own it."*
- **Proof point:** *"The commit gate isn't exit-0. It's a smoke test, desktop + mobile screenshots, an acceptance test, and a secret scan — or it doesn't ship."*
- **Ownership:** *"Dependency-light, self-hostable, offline-first. You own the code, the tests, and the docs by default."*

---

## 9. Risks to the position

1. **Thin back half** — without real build execution, "we verify" is a claim with
   nothing to verify. (§6 gap.)
2. **Solo vs funded** — foundable.com has brand, capital, and a live product;
   position must win on *niche trust*, never on breadth.
3. **Category confusion** — users may bucket Sweep with generic AI builders.
   Messaging must foreground *verification + ownership* immediately.
4. **Overclaiming** — asserting Sweep "is better than Foundable" invites
   apples-to-oranges rebuttal. Claim the axis, not the whole match.

---

## 10. Evidence status

- **Facts:** all foundable.com details are from their live site, FAQ, pricing, docs,
  and Vercel community launch post (retrieved 2026-10-23).
- **Verified:** DNS + HTTP checks for `foundables.com` vs `foundable.com` (2026-10-23).
- **Assumption:** "parked/ad domain" read for `foundables.com` is inferred from the
  403 + Cloudflare interstitial — not proven.
- **Internal:** Sweep scope and non-goals are from [`BRIEF.md`](BRIEF.md) and
  [`Sweep-App-Plan.md`](Sweep-App-Plan.md).
- **Requires review:** any external marketing use of the Foundable comparison
  should be re-checked for accuracy before it is published.
