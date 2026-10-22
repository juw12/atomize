# Product Spec — Sneaker Ledger

> "Trust, but verify — with receipts."

## Overview

**Sneaker Ledger** is an offline-first, static-first data integrity and price provenance console that complements the House of Articles sneaker feed by making its catalog verifiable.

Where House of Articles focuses on editorial content and athlete moments, Sneaker Ledger focuses on **data trustworthiness** — answering questions like:

- Where did this price come from?
- How confident should I be in this market data?
- Are the economics (markup, margin) calculated correctly?
- Is this SKU duplicated or inconsistent?

## Target User

- **Sneaker resellers** who need to verify market data before buying/selling
- **Data analysts** auditing catalog quality
- **House of Articles users** who want deeper price/economics analysis
- **Collectors** tracking provenance and manufacturing details

## Core Features

### 1. Price Waterfall Visualization

Per-SKU visual breakdown showing:
- **Est. Cost** → manufacturing/wholesale cost
- **Retail Price** → MSRP
- **Market Price** → current resale market value

This visualizes the value chain and helps users understand where margins come from.

### 2. Resale Economics Calculator

Editable settings (persisted in localStorage under `sneaker_ledger_v1`):
- Marketplace fee % (default: 9.5%)
- Shipping cost $ (default: $15)
- Payment processing fee % (default: 3.5%)

Calculates:
- Gross markup % = (market - est_cost) / est_cost × 100
- Gross margin % = (market - est_cost) / market × 100
- Net proceeds = market - (marketplace_fee + payment_fee + shipping)
- Net profit = net_proceeds - est_cost
- Net ROI = net_profit / est_cost × 100

### 3. Provenance & Confidence Badges

Every colorway includes:
- **source**: `brand_direct`, `market_aggregate`, or `synthetic_model`
- **confidence**: `verified`, `estimated`, or `synthetic`
- **observed_at**: ISO date when price/data was last verified

Visual badges color-code confidence:
- 🟢 **Verified** (green) — Direct from brand or verified retail source
- 🟡 **Estimated** (yellow) — Aggregated from market data
- 🟣 **Synthetic** (pink) — Model-generated or inferred

### 4. Data Integrity Panel

Automated checks for:
- **Duplicate SKUs** — Same SKU appearing multiple times
- **Cross-field mismatches** — Markup/margin inconsistent with cost/retail/market
- **Missing parts** — Colorways without manufacturing breakdown
- **Low-confidence provenance** — Synthetic or missing provenance data
- **Invalid references** — Colorways referencing non-existent sneakers/brands

Results displayed with severity levels:
- ⚠️ **Error** — Critical data corruption (duplicates, invalid refs)
- ⚡ **Warning** — Missing/incomplete data (no provenance, no parts)
- ℹ️ **Info** — Calculation mismatches (markup/margin drift)

### 5. Offline-First Architecture

- **No network required** — All data inline in HTML
- **No login** — No authentication, no user accounts
- **No third-party deps** — Zero CDNs, zero external fonts
- **No fetch/XMLHttpRequest** — Pure static, no async data loading

Settings persist in browser localStorage under key `sneaker_ledger_v1`.

## Data Schema

```json
{
  "version": 1,
  "brands": [
    {"id": "quantum", "name": "Quantum", "country": "USA"}
  ],
  "sneakers": [
    {
      "id": "quantum-leap-1",
      "brand_id": "quantum",
      "model_name": "Leap 1",
      "category": "Basketball",
      "tech": "Quantum Foam, Carbon plate",
      "weight": "348g",
      "drop": "10mm"
    }
  ],
  "colorways": [
    {
      "id": "quantum-leap-1-eclipse",
      "sneaker_id": "quantum-leap-1",
      "name": "Eclipse",
      "sku": "QTM-LP1-ECL",
      "retail_price": 195,
      "release_date": "2025-09-15",
      "image_url": "./assets/basketball-hero.jpg",
      "market_price": 278,
      "bid": 265,
      "ask": 278,
      "est_cost": 81,
      "markup_pct": 43,
      "margin_pct": 58,
      "trend": "+32%",
      "parts": [
        {"part": "Upper", "material": "Engineered mesh", "site": "Vietnam · Factory Q1"}
      ],
      "provenance": {
        "source": "brand_direct",
        "confidence": "verified",
        "observed_at": "2025-09-15"
      }
    }
  ]
}
```

## API Endpoints (Optional Server)

The optional Python stdlib server provides:

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/health` | `{"status":"ok","app":"sneaker-ledger","version":"1.0"}` |
| `GET` | `/api/catalog` | Full catalog JSON |
| `GET` | `/api/sku/{id}` | Single colorway by SKU |
| `GET` | `/api/integrity` | Data integrity report |
| `OPTIONS` | `/api/*` | CORS preflight → 204 |

All responses include `Access-Control-Allow-Origin: *`.

## Design Aesthetic

**Trust/Audit Console** — data-forward, tabular, monospace numbers, clear confidence color coding.

NOT a copy of House of Articles' editorial feed look. This is a **verification tool**, not a content feed.

Key visual elements:
- Dark theme (`#0a0e14` background)
- Monospace fonts for numbers (`Consolas`, `Monaco`)
- Color-coded confidence badges
- Price waterfall bar charts
- Tabular data views

## Non-Goals

- **No editorial content** — This is not a feed or news app
- **No athlete/event tracking** — That's House of Articles' domain
- **No user accounts** — Fully offline, localStorage only
- **No network calls** — Inline data only, no fetch
- **No build step** — Static HTML, Python stdlib server only

## Success Metrics

- [ ] All test scripts exit 0
- [ ] Generator is idempotent (running twice produces same output)
- [ ] `web/index.html` contains `sneaker_ledger_v1` and no `fetch(`
- [ ] Catalog has ~6-9 colorways across ~4 brands
- [ ] Every colorway has valid provenance with source/confidence/observed_at
- [ ] Data integrity panel correctly identifies issues

## Relationship to House of Articles

| Aspect | House of Articles | Sneaker Ledger |
|--------|-------------------|----------------|
| **Focus** | Editorial feed, athlete moments | Data integrity, price verification |
| **Data** | Read-only catalog | Verified catalog with provenance |
| **Prices** | Synthetic/unverifiable | Provenance-tracked with confidence |
| **Economics** | Basic markup/margin | Fee-aware net profit calculator |
| **Aesthetic** | Editorial, magazine-style | Audit console, data-forward |
| **Trust model** | Trust the feed | Verify the data |

Sneaker Ledger **complements** House of Articles by providing the verification layer that the feed lacks.

## Version History

- **v1.0** — Initial release with catalog, provenance, integrity checks, fee calculator
