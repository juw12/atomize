---
title: Peers — Verified Reviews App
type: project
status: prototype
tags:
  - project
  - app
  - prototype
  - peers
  - product-guide
updated: 2026-10-21
---

# Peers — Verified Reviews App

> **Real experiences, real people.** A single-file web prototype of the "Peers" platform: a worldwide app for honest, **verified** reviews of food, travel, and products.

Built from *Peers Master Product Guide v0.6* (in this folder).

---

## What is in this folder

| File | What it is |
|---|---|
| `Peers App.html` | The app itself — one self-contained file (~5.4 MB). Double-click / click to open in a browser. Works fully offline. |
| `Peers-Master-Product-Guide-v0.6.pdf` | The source product guide this was built from. |
| `screenshots/` | Screen captures of every major view (see below). |

## How to open

Double-click **`Peers App.html`** (or click the file in this note). It opens in any browser. No install, no internet connection needed — all images and code are embedded in the one file.

---

## What the app does

### Version 1 — Food & travel
- **Feed** — reviews from people you follow, plus collections and a "Discover" section; filter by city or "Trending".
- **Explore / Map** — stylised map with pins for every reviewed place; filter by Food / Travel / Shops, rating, or people you follow.
- **Place pages** — photos, hours, price, location, **all reviews visible** (including negative ones), owner replies.
- **About tab** — description, hours, price level, address, amenities, and a location mini-map.
- **Write a review** — rating, text, photos, tags, optional affiliate link; publishes instantly as **"Recently reviewed"** (30-day label).
- **Verification** — 5 proof types (location check-in, booking, receipt, owner confirmation, Peers order) with a 14-day window → **Verified: <type>** or **Unverified**.
- **Check-ins** — visit history with the radius rule (100 m food/shops, 1 km stays/tours).
- **Collections** — saved lists such as "Best cafés in Lisbon".
- **Reader feedback** — thumbs up/down and a Report flow.
- **Complaints & disputes** — 30-day window, 7-day response, 14-day admin decision; review hidden while open, returns with the outcome noted.
- **Moderation queue** — reported reviews and open complaints with decisions.
- **Follow / followers / fans** — followers see posts in their feed; an optional **fan tier** with a paid monthly subscription and perks.
- **Messaging** — thread list + conversations, plus **Ask the seller** on products and **Message** on places.
- **Notifications** — bell with unread count, list, and mark-all-read.
- **Translation** — view a translation with the original always available.
- **Settings** — 12 interface languages, country, currency; one-click **Reset demo data**.

### Phase 2 — Peers Market
- Product grid across **stationery, handmade gifts, small-brand fashion, packaged snacks** with a sort control.
- Product pages with verified-purchase badges, seller info, and reviews.
- **Discover → Choose → Buy → Receive → Review** flow: cart drawer (with dim backdrop), partner checkout, order tracking, returns/refunds (14 days).

### Principles baked into the UI
- Honest reviews **stay up** — negative reviews are never removed.
- **Verified ≠ Unverified** — never conflated; every badge is always visible.
- **Every relationship is labelled** — Sponsored, Affiliate link, Verified purchase.
- **Human-first** — AI may translate, organise, and recommend, but never writes or fabricates reviews.
- **Revenue never changes ranking.**

---

## Brand direction (from the guide)

| Token | Hex | Used for |
|---|---|---|
| Ink blue | `#14213D` | Text, logo |
| Coral | `#FF6B5B` | Accent, verified |
| Warm cream | `#FAF6EF` | Background |
| Sand | `#EFE6D8` | Cards |
| Slate | `#5B6478` | Secondary text |

Logo: two overlapping circles + "Peers". Typography: readable **serif** for headings and review text, clean **sans-serif** for interface and labels.

---

## Demo notes

- All content is **mock/seeded demo data** — people, places, reviews, products, orders, complaints.
- State is saved in the browser via `localStorage` (key `peers_demo_v3`). **Settings → Reset demo data** restores the seed.
- Content: ~20 places across 16 cities / 14 countries, 20 products, 40 reviews, 12 users, 6 sellers, 8 collections, 6 message threads, 8 notifications, in 5 languages.
- **Photos:** 16 original AI-generated photographs plus 24 derived variants, all embedded as base64 so the file works offline. (New images could not be generated at build time because the internal image gateway returned a `400 Model mismatch`; the extra shots are derived from the existing set and can be regenerated later.)

## Build & verification

- Single self-contained HTML file — **no CDN, fonts, or external requests**; verified offline.
- Verified in a headless browser: 18 views render, **0 page/console errors**, all embedded photos load, JS passes `node --check`.
- Source app also lives at `~\Desktop\opencode_project\peers-app\index.html`.

## Known limitations / possible next steps

- Photos for the added places/products are derived variants, not unique scenes (see note above).
- Product/place data is mock; there is no real backend, accounts, or payments.
- Some Phase-3 features are intentionally stubbed (in-app checkout, Peers Studio, fulfilment, wallet).

---

## Screenshots

### Feed
![[01-feed.png]]

### Explore / Map
![[02-explore-map.png]]

### Place page
![[03-place.png]]

### Place — About tab
![[04-place-about.png]]

### Peers Market
![[05-peers-market.png]]

### Product page
![[06-product.png]]

### Search
![[07-search.png]]

### Messages
![[08-messages.png]]

### Notifications
![[09-notifications.png]]

### Become a fan
![[10-fan-subscribe.png]]

### Moderation queue
![[11-moderation.png]]

### Cart (Peers Market)
![[12-cart.png]]

### About / Vision
![[13-about-vision.png]]

---

## 📱 Phone version

A **phone-first build** of the same app lives in this folder as `Peers App (Mobile).html`.

What's different from the desktop file:

- **Shell:** compact top app bar (logo + page title + search / notifications / cart) and a fixed **bottom tab bar** — *Feed · Explore · Market · Messages · More* — plus a floating **Write** action button. The "More" tab opens Orders, Collections, Visited history, My profile, Moderation, About, Settings.
- **Phone patterns:** modals, the cart, and notifications open as **bottom sheets**; search opens as a **full-screen overlay**; a **back chevron** appears on detail pages (place → Explore, product → Market, …).
- **Fit for thumbs:** 44px+ touch targets, `:active` feedback, safe-area insets (notches / home bar), 16px inputs (prevents iOS zoom-on-focus), 2-column product grid, single-column layout, no horizontal scrolling.
- **Same content:** all 40 embedded photos, 20 places, 20 products, 40 reviews, 12 people, messaging, notifications, moderation, fan tiers.
- **Separate storage** (`peers_mobile_v1`) so it does not clash with the desktop app's saved state.

**How to use it:** open `Peers App (Mobile).html` in a phone browser, or open it on the desktop browser and switch to device/phone mode (e.g. 390×844). It works offline like the desktop version.

> Note: this is a **mobile web** app. To pin it to a phone's home screen and run it full-screen like a native app, it would need to be served from a web server (a PWA manifest + service worker is not bundled).

### Phone — Feed
![[mob_01_feed.png]]

### Phone — Explore / Map
![[mob_02_map.png]]

### Phone — Place page
![[mob_03_place.png]]

### Phone — Peers Market
![[mob_04_market.png]]

### Phone — Product page
![[mob_05_product.png]]

### Phone — Search overlay
![[mob_06_search.png]]

### Phone — More menu
![[mob_07_more.png]]

### Phone — Messages
![[mob_08_messages.png]]

### Phone — Cart (bottom sheet)
![[mob_09_cart.png]]

### Phone — Settings
![[mob_10_settings.png]]
