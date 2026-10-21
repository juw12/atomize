# House of Articles — Product Spec

> "House of Highlights, but for sneakers — powered by athlete moments."
> Inspired by the editorial voice of Complex Sneakers + the feed energy of House of Highlights.

- **Status:** Draft v0.4
- **Name:** **House of Articles** *[working name — trademark clearance pending vs "House of Highlights"]*
- **Platform:** Cross-platform mobile (iOS + Android)
- **Launch scope:** Global (with regional editions)
- **Athlete scope:** NBA + Running + HYROX + emerging trending sports
- **Business model:** Affiliate-first

---

## 1. Vision

A short-form, feed-first mobile app where **sneakers are the content and athletes are the reason they matter**.

The feed reads like House of Highlights (vertical, snappy, video/image cards, swipeable), but every card connects a **real-world athlete moment** to a **real market price**. The app is both the *news* and the *exchange* for sneakers.

**One-liner:**
> "See what athletes wear, and what it's worth — right now."

---

## 2. The Core Insight (the "wedge")

**Athlete moments move sneaker markets.**

When a player debuts a shoe, an athlete wins in a super-shoe, or a HYROX pro races in a new model, resale demand reacts. No mainstream app currently ties *the on-court/on-course moment* directly to *the live price move* in one feed.

The wedge feature:
> **"Athlete wore X → its price moved Y%. Here's why, and here's where to buy it."**

Everything else in the product exists to feed, deepen, or monetize this loop.

---

## 3. Market Context: Reference & Competition

### 3.1 Reference & Inspiration — Complex Sneakers

Complex's Sneakers section is the editorial benchmark. Its proven content formats map almost 1:1 onto our modules. We are **inspired by the formats, not copying the brand/content**.

| Complex format | What it is | Our equivalent |
|---|---|---|
| **"Everything You Need to Know"** | Per-shoe deep dive: *Price / When / Where / What You Need to Know* | **Shoe Detail page template** (§7.2) |
| **Release-date guides / "The Weekly Drop"** | Weekly drop calendars, **by region** (e.g. Complex Australia) | **Regional release calendar** (§7.1) |
| **Rankings & lists** | "Every LeBron Signature, Ranked", "Best Sneakers of Fall" | **Editorial rankings module** (§7.1) |
| **Sneaker Shopping** | Host + celebrity/athlete shop and talk | **Original creator/athlete video series** (§7.1) |
| **Complex Closets** | Tour of a person's collection | **Collection tours + user Collections** (§7.4) |
| **Price the Hype** | Valuing sneakers against their buzz | **Heat Index / hype-vs-value** (§7.2) |
| **Sneaker Battles** | Head-to-head community voting | **Shoe battles** (§7.4) |
| **Brand hubs** | Nike / Adidas / NB / Puma / Reebok pages | **Brand pages** (§7.1) |
| **Athlete↔brand news** | "Mbappé leaves Nike to join On" | **Signing / athlete-market news feed** (§7.1) |
| **PE coverage** | "Jalen Brunson's Kobe 3 Low PE" | **PE tracker** (§7.3) |
| **Sneaker terminology guide** | Culture glossary | **Education / glossary module** (§7.1) |

**Takeaway:** Complex proves the *editorial + release-date* side works. **What Complex does NOT do is tie every story to a live, multi-source market price.** That is our defensible wedge.

### 3.2 Competitive Landscape (verified)

The space is **crowded**, and much of our feature set already exists elsewhere. Differentiation must come from the athlete→market wedge, not from feature coverage.

| Competitor | What they already do | Overlap with us |
|---|---|---|
| **SoleInsider** | Release tracker, countdowns, calendar, sneaker DB, **COP/DROP community votes**, editorial, brand pages, **live NBA/NFL/MLB/MLS/UCL scores**, buy links to StockX/GOAT/eBay | **High (~60–70%)** |
| **Droplist** | Releases, raffles, restocks, **StockX resale + 30-day chart, sneaker portfolio** | High on Market module |
| **Sole Retriever** | Releases, worldwide raffles, restocks, real-time news, notifications | Medium |
| **HeatSignal** | Aggregates marketplace listings, tracks pairs, collection catalogue, "Signal Feed", alerts, P2P deals | Medium–High |
| **StockX / GOAT** | Market price + charts (the data layer itself) | Data dependency, not a rival |

**Our defensible differentiation:**
1. **Athlete-moment → price feed** — nobody ties the on-court/on-course moment to the live price move in one feed.
2. **Typed athlete layer** (NBA + running + HYROX cards, PEs, signings) — no competitor does this.
3. **House-of-Highlights-style short-form feed** as the primary surface.
4. **Multi-source global price layer** (not single-source).

> **Implication:** "build everything" is *table stakes*, not a moat. The moat is the athlete wedge + editorial voice. Execute those *better*, not just include them.

---

## 4. Naming

**Decision (v0.4 working name): `House of Articles`.**

### 4.1 Evidence behind the decision: the descriptor space is saturated

We tried to find a sneaker/market-specific name. Every natural one is already owned *in this exact niche* (verified):

| Tried | Status |
|---|---|
| Heat Signal / HeatSignal | ❌ Live competitor (`heatsignal.app`) |
| Sole Signal / SoleSignal | ❌ Running-shoe tracker app |
| House of Heat | ❌ Sneaker media site |
| Heat Check | ❌ Heat Check LLC + Nike *Jordan Heat Check* + AND1 *Heatcheck* |
| Heatseeker | ❌ Under Armour shoe + Canadian trademark HEATSEEKER |
| Leaderboard | ❌ Generic word; dozens of apps own it |
| Kickdex | ❌ Live sneaker app (track/value/sell) |
| KickScore / Kickstroid / KickSnap / KickScope | ❌ All live sports or sneaker apps |
| SoleDeck / SoleMark / Solebox / Soleboard | ❌ Taken or too close |
| SoleFlux | ❌ Ublives boots |
| Statline / Solemetric | ❌ StatLine LLC (trademark pending) |

**Conclusion:** the "sole / kick / heat / signal / stat" vocabulary is wall-to-wall occupied — a coined sneaker-descriptor name is not realistically available. An **editorial name that sidesteps the clutter** is the pragmatic choice. Hence **House of Articles**.

### 4.2 Caveats (must act before launch)
1. ⚠️ **Trademark clearance** — *House of Articles* sounds close to **"House of Highlights"** (Bleacher Report). Verify no confusion risk in the relevant media/entertainment class.
2. *House of Articles* says "articles," not "sneakers" — compensate with a sneaker-led icon + tagline.
3. **App Store + domain check** (e.g. `houseofarticles.com`) still required.

### 4.3 Fallback if the HoH conflict blocks us
Keep the editorial "House of ___" frame but own it: **House of Signal** — appears unclaimed, keeps the market-"signal" meaning.

**Status:** Decided (working) — pending formal trademark clearance.

---

## 5. Target Users

Three audiences with different needs. We serve all three through **one adaptive feed**, not three averaged screens.

| Persona | Wants | Primary surfaces |
|---|---|---|
| **Sneakerhead / Reseller** | Market price, P&L, cost basis, alerts, deal finder | Price charts, Portfolio, Alerts |
| **Sports Fan** | "Who wore what last night", athlete stories | On-court/on-course feed, Athlete cards |
| **Casual / Fashion buyer** | Cool shoes + easy buy | Feed, Shoe detail + buy links |

**Persona model:** onboarding picks a persona, which **re-weights** (not filters) the main feed. Default feed = athlete moment + market reaction, which happens to serve all three at once.

---

## 6. Product Pillars

1. **Feed / News** — the House of Highlights + Complex-style editorial engine
2. **Market** — prices, charts, cost basis, P&L, alerts, deal finder
3. **Athlete** — typed athlete cards, stats/events, shoe rotation, PE tracking
4. **Commerce + Community** — affiliate buy links, collections, fit-checks, shoe battles

---

## 7. Full Feature Map

### 7.1 Feed / News engine
- **Moment feed** (vertical): athlete wore X → price reaction card
- **News feed**: releases, restocks, rumors, collabs, culture stories, athlete↔brand signings
- **Regional release guides** ("The Weekly Drop" style) — per-region calendars
- **Editorial rankings & lists** ("Every X Ranked", "Best of [season]")
- **Brand hubs** (Nike, Adidas, New Balance, Puma, Reebok, plus collab pages)
- **Original video series** (creator/athlete shopping, closet tours, "price the hype")
- **Education / glossary** (sneaker terminology, how to read a price chart)
- **Short-form video/image cards** (HoH-style autoplay, swipes)
- **"Why it's trending"** explainer cards (moment → price)
- **Personalized re-weighting** by persona + followed athletes/shoes
- **Save / share / reactions**

### 7.2 Market module
- **Shoe detail page** using the **"Everything You Need to Know" template**:
  - *Price · When · Where · What You Need to Know* + market chart
  - brand/manufacturer, model, colorway, SKU, retail price, release date, materials/tech
- **Market price + price-trend chart** (historical, low/high, volatility, % change)
- **Retail vs market** comparison
- **Heat Index / hype-vs-value** (buzz measured against price)
- **"Estimated cost to make"** margin insight (clearly labeled *estimated*, derived from brand gross-margin ratios — NOT claimed as exact)
- **Cost basis ("actual capital")**: user's purchase price for shoes they own
- **Portfolio**: owned shoes → cost basis vs current market → **P&L**
- **Watchlist**: track shoes you don't own yet
- **Price alerts**: threshold + momentum alerts
- **Deal finder**: listings below market
- **Multi-source price layer**: eBay, StockX, GOAT, regional resale + retail feeds

### 7.3 Athlete module
- **Typed athlete cards** (one frame, type-specific body):
  - **NBA card** → team, season stats, next game, on-court shoe
  - **Endurance card** → race results, PBs/splits, shoe rotation, upcoming events
  - **HYROX card** → event results, station splits, official shoe partner
- **Athlete profile**: bio, career, shoe history/rotation
- **PE (Player Exclusive) tracker**: rare athlete-only versions (e.g. PE releases)
- **Signing tracker**: athlete↔brand moves (a la "Mbappé leaves Nike")
- **Follow athlete** → surfaces their shoe moments in feed

### 7.4 Commerce + Community
- **Affiliate buy links** (primary revenue)
- **Retailer/source directory** (where to buy, in-stock)
- **Collections** (user-owned showcases) + **collection tours**
- **Fit-checks** (community photos)
- **Shoe battles / votes** (engagement)
- **Leaderboards** (top collectors, most-tracked shoes)

---

## 8. Data Model (core entities)

| Entity | Key fields |
|---|---|
| **Brand / Manufacturer** | id, name, country, parent, official partner links |
| **Sneaker (model)** | id, brand, model name, category (basketball / running / HYROX / lifestyle), tech |
| **Colorway / SKU** | id, model, colorway name, SKU, retail price, release date, images |
| **Athlete (typed)** | id, name, type (nba/endurance/hyrox), sport, bio, sponsorship |
| **Team** (NBA only) | id, name, league |
| **Event** | id, type (game/race/hyrox), date, venue, results ref |
| **AthleteWear** | athlete_id, sku_id, event_id, date, context (on-court / race / PE) |
| **PriceObservation** | sku_id, source, price, currency, condition, timestamp |
| **Listing** | sku_id, source, price, size, url, active/sold |
| **UserPortfolioItem** | user_id, sku_id, cost_basis, purchase_date, size |
| **Watchlist / Alert** | user_id, sku_id, type, threshold |
| **FeedItem** | type, ref (moment/news/ranking/guide), asset, athlete_id, sku_id, price_delta |

**Note:** "Athlete" is a **single unified entity** with a `type` field and type-specific attributes. Cards render one frame, different bodies. This is the core fix that lets NBA + running + HYROX coexist.

---

## 9. Data Sources & Pipeline

**Principle: pluggable, multi-source — never hard-wire one provider.**

### Prices
- **eBay**: sold data = *Marketplace Insights API* (Limited Release, must apply). Active listings = *Browse API* (generally available). **Fallback needed.**
- **StockX / GOAT**: global resale; partner/paid access or licensed data.
- **Regional resale + retail feeds**: for true global coverage + regional editions.
- **Normalization layer**: unify currency, condition, size, and de-duplicate listings.

> **Risk:** eBay-only is US-centric and cannot support a global launch. Design the price layer as a **source registry** from day one.

### Athletes / Events
- **NBA**: NBA Stats API (free-ish) for players, teams, schedules, stats.
- **Running / HYROX**: event results, PB databases, race calendars, official partner data. More fragmented — may need manual curation + partnerships early.

### Editorial
- **Complex-style editorial** is manually curated or API-fed from our own CMS. Not scraped — we write/produce our own voice.

### Feet-on-the-ground reality
- **Manufacturing cost is NOT public.** Brand-level gross margins (footwear roughly 40–50%) let us *estimate* COGS from retail. Label as **"Estimated cost to make"** — never claim it as actual.

---

## 10. Technical Architecture (proposed)

- **Mobile:** React Native (or Flutter) — one codebase iOS + Android
- **Backend:** API service + async workers for price scraping/aggregation
- **CMS:** for editorial (guides, rankings, news)
- **Database:** relational (Postgres) for catalog/athletes/portfolio + time-series store for price history
- **Search:** dedicated index for shoes/athletes
- **Media/CDN:** for images + short-form video
- **Notifications:** push for alerts
- **Auth:** social + email; user identity tied to portfolio

---

## 11. Monetization

**Primary: Affiliate.**
- Earn commission on "buy" links (retail + resale partners)
- Deal finder and shoe pages optimize click-through to purchase
- Commerce/drops (affiliate-only; no own inventory at launch)

**Future layers (do not build yet):**
- Premium subscription (advanced market data, unlimited alerts)
- Brand/sponsorship placements (careful: conflicts with editorial trust)

---

## 12. Build Plan

Per user decision: **build everything at once.** Honest meaning of that:

> **The data spine is a hard prerequisite.** Every feature reads from the same catalog + price + athlete tables. Nothing can be built before the spine. So "all at once" = **Spine first, then 4 parallel workstreams.**

### Phase 0 — Spine (blocks everything)
- Sneaker catalog (model / colorway / SKU / retail / brand)
- Typed athlete catalog (NBA + endurance + HYROX)
- Multi-source price pipeline (source registry + normalization)
- Event / schedule pipeline
- Editorial CMS (for guides/rankings/news)

### Then 4 parallel workstreams
1. **Feed engine** — moment feed, news, regional guides, rankings, short-form, brand hubs
2. **Market module** — shoe detail (EYNTK template), charts, heat index, estimated-make-cost, portfolio/P&L, alerts, deal finder
3. **Athlete module** — typed cards, stats/events, rotation, PE tracker, signings
4. **Commerce + community** — affiliate links, collections, fit-checks, battles, leaderboards

### Honest cost of "everything at once"
- Longer time to first launch (not a 2-week MVP)
- More surfaces → higher launch bug risk
- 3 athlete types + multi-region pricing + editorial → more QA surface

---

## 13. Risks & Mitigations

| Risk | Severity | Mitigation |
|---|---|---|
| eBay sold data gated (Limited Release) | High | Apply early; fallback to active-listing median + secondary sources |
| Global pricing not supported by eBay alone | High | Pluggable multi-source price layer from day one |
| Manufacturing cost not public | Medium | Label as "estimated," derive from margin ratios |
| Running/HYROX data fragmented | Medium | Manual curation + partnerships early |
| Athlete likeness / team logos / brand trademarks | High | License for real product; prototype first |
| **Crowded market (SoleInsider, Droplist, Sole Retriever, HeatSignal)** | **High** | Win on the athlete→market wedge + editorial voice; don't compete on feature count |
| "Build everything" scope risk | High | Spine-first dependency; parallel workstreams; hard milestone gates |
| 3 personas dilute UX | Medium | Adaptive re-weighting, not averaged screens |
| Editorial workload (Complex-level output) | Medium | Small original voice + community + AI-assisted drafts |

---

## 14. Success Metrics (draft)

- **Activation:** persona set + ≥3 shoe/athlete follows in first session
- **Engagement:** daily feed sessions, watchlist adds
- **Money:** affiliate click-through + conversion rate
- **Retention:** weekly return for alerts + portfolio tracking

---

## 15. Open Questions

1. ~~Final name?~~ **Decided (working): House of Articles** — run trademark clearance vs "House of Highlights".
2. Affiliate partners to target first (retail vs resale)?
3. How deep on HYROX/running data partnerships vs manual curation at launch?
4. **How do we beat SoleInsider/Droplist specifically?** (the wedge must be sharper than their feature lists)
5. How much of Complex-style editorial do we produce ourselves vs community-driven?
6. Any hard launch date or budget constraint?
7. Do we prototype UI before committing to the spine build?

---

*Spec is a living document. Every decision here is up for revision.*
