# House of Articles

> "See what athletes wear, and what it's worth — right now."

A short-form, feed-first mobile app where **sneakers are the content and athletes are the reason they matter**. Inspired by the editorial voice of Complex Sneakers + the feed energy of House of Highlights.

## The Wedge

**Athlete moments move sneaker markets.**

The wedge feature:
> **"Athlete wore X → its price moved Y%. Here's why, and here's where to buy it."**

When a player debuts a shoe, an athlete wins in a super-shoe, or a HYROX pro races in a new model, resale demand reacts. House of Articles ties the *on-court/on-course moment* directly to *the live price move* in one feed.

## Builds

Two static prototypes demonstrate the experience across form factors:

| Build | Description | Views |
|-------|-------------|-------|
| **Mobile** (`web/index.html`) | Mobile-first vertical feed with 20 screens | Home feed, Brand pages, Shoe detail, Cart, Profile, **Ledger** |
| **Desktop** (`web/desktop.html`) | Desktop dashboard with 6 views | Feed, Market, Calendar, Collections, Watchlist, **Ledger** |

Both builds are **static-only** with inline data — no backend required.

## Data Spine

The normalized catalog lives in [`data/data-spine.json`](data/data-spine.json) — a versioned JSON file containing:

- **7 brands**: Apex, Court Co., Velocity, Trail Co., Night Owl, Street Phoenix, Cloud Walker
- **13 unique sneakers** (by SKU) across Basketball, Running, HYROX, and Lifestyle categories
- **13 colorways** with full pricing, manufacturing, market data, and **provenance tracking**

### Provenance

Every colorway includes a `provenance` object for data integrity:

```json
{
  "provenance": {
    "source": "brand_direct",
    "confidence": "verified",
    "observed_at": "2025-10-12"
  }
}
```

Confidence levels: `verified` (brand direct), `estimated` (market aggregate), `synthetic` (model-generated).

### Schema

```json
{
  "version": 1,
  "brands": [{"id", "name", "country"}],
  "sneakers": [{"id", "brand_id", "model_name", "category", "tech", "weight", "drop"}],
  "colorways": [
    {
      "id", "sneaker_id", "name", "sku",
      "retail_price", "release_date", "image_url",
      "market_price", "bid", "ask", "est_cost",
      "markup_pct", "margin_pct", "trend",
      "parts": [{"part", "material", "site"}]
    }
  ]
}
```

### Bug Fixes Applied

Two data inconsistencies were identified and corrected during extraction:

| Bug | Source | Fix |
|-----|--------|-----|
| **Apex Runner 3 price mismatch** | Mobile `SHOE_DATA` said `market: 248`, but `shoePrices` said `285` | Use authoritative `market: 248` from `SHOE_DATA` (inline catalog is source of truth) |
| **night-owl-5 missing from prices** | Mobile `SHOE_DATA` includes `night-owl-5`, but `shoePrices` object omitted it | Added `night-owl-5` with `market_price: 162` (from SHOE_DATA) to the price layer |

Note: Desktop prototype has a different shoe `night-owl-runner` (SKU: `NTE-RNR-PHM`, market: 215) which is distinct from mobile's `night-owl-5` (SKU: `NTE-OWL5-NBL`, market: 162). Both are preserved in the data spine.

### 13 Unique SKUs

1. **Apex Runner 3** "Midnight" — APX-RN3-MID
2. **Apex Trail 1** "Forest" — APX-TRL1-FST
3. **Court Legend 1** "Sunset" — CRT-LG1-SUN
4. **Court Legend 2** "Onyx" — CRT-LG2-ONX
5. **Court Pace 3** "Thunder" — CRT-PCE3-THN
6. **Velocity X** "Competition" — VLC-X-COMP
7. **Velocity Ultra** "Volt" — VLC-ULR-VLT
8. **Velocity Enduro** "Forest" — VLC-END-FST
9. **Trail Blazer 2** "Arctic" — TRL-BL2-ARC
10. **Night Owl 5** "Nebula" — NTE-OWL5-NBL
11. **Night Owl Runner** "Phantom" — NTE-RNR-PHM
12. **Street Phoenix** "Royal" — ST-PHX-RYL
13. **Cloud Walker 2** "Pearl" — CLD-WLK2-PRL

## Ledger View

The **Ledger** (desktop sidebar / mobile tab) provides:
- **Price waterfall** — Visual est. cost → retail → market comparison
- **Fee-aware economics** — Net profit calculator with editable marketplace fee % and shipping cost
- **Provenance badges** — Confidence indicators (verified/estimated/synthetic) per colorway
- **Integrity checks** — Automated validation for duplicate SKUs, missing data, calculation drift

Settings persist in `localStorage` under `hoa_ledger_v1`. See [`docs/Ledger.md`](docs/Ledger.md) for details.

## Tools

### Generate Inline Data

[`tools/gen_inline_data.py`](tools/gen_inline_data.py) reads the data spine and prints the equivalent JavaScript `SHOE_DATA` object to stdout:

```bash
python tools/gen_inline_data.py
```

This outputs a `const SHOE_DATA = {...}` object matching the original inline format from the HTML prototypes. **Does NOT modify HTML files by default.**

### Sync Inline Data (single source of truth)

[`tools/sync_inline_data.py`](tools/sync_inline_data.py) is the write side: it rewrites the inline `SHOE_DATA` block in **both** `web/desktop.html` and `web/index.html` from `data/data-spine.json`, so the offline builds and the Ledger never drift from the spine.

```bash
python tools/sync_inline_data.py --write   # regenerate the inline blocks in both builds
python tools/sync_inline_data.py           # report drift only (exit 1 if any)
```

`tests/test_inline_data_sync.py` enforces the same in CI — it fails if either build's inline data doesn't match the spine, so the two can't silently diverge again.

### Run Schema Tests

[`tests/test_data_schema.py`](tests/test_data_schema.py) validates the data spine:

```bash
python tests/test_data_schema.py
```

Checks:
- Required keys present (`version`, `brands`, `sneakers`, `colorways`)
- Every colorway references a valid brand/sneaker
- All SKUs have numeric `retail_price` and `market_price`
- All `parts` have `part`, `material`, `site` fields
- Bug fixes verified (night-owl-5 present, Apex Runner 3 consistent price)
- HTML prototypes exist, contain no external URLs (`http://`, `https://`), and no absolute paths (`src="/`, `href="/`)

Exit code: `0` if all pass, `1` if any fail.

## Spec Data Model

See [`docs/Product Spec.md`](docs/Product%20Spec.md) for the full product specification. Key entities include:

- **Brand** — Sneaker manufacturer (e.g., Apex, Court Co.)
- **Sneaker** — Base model with category, tech specs, weight, drop
- **Colorway** — Specific SKU with pricing, release date, image, market data
- **Athlete** — Typed by sport (NBA, Running, HYROX) with team affiliation
- **Event** — Game, race, or competition where athlete wore the shoe
- **PriceObservation** — Timestamped market price from a source
- **Listing** — Active sale listing with size, condition, price
- **UserPortfolioItem** — User's owned sneakers with cost basis
- **Watchlist/Alert** — Price alerts for specific SKUs
- **FeedItem** — Editorial content linking athlete moments to shoes

## Hosting

Static-only deployment. Serve the `web/` directory directly:

```bash
# Python built-in server
python -m http.server 8000 --directory web

# Or deploy to GitHub Pages, Netlify, Vercel, etc.
```

No backend, no build step, no dependencies.

## Optional Read-Only API

A zero-dependency Python stdlib API server is available for programmatic access to the catalog data.

### Run the server

```bash
python server/server.py
```

Options:
- `--port` (default: 8789)
- `--host` (default: 127.0.0.1)
- `--no-browser` (do not auto-open browser)
- `HOA_DB` env var to override database path (default: `server/data/hoa.db`)

The server seeds a SQLite database from `data/data-spine.json` on first run. **The data spine is the single source of truth** — the served catalog is always derived from it.

### Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/health` | `{"status":"ok","app":"house-of-articles","version":"1.0"}` |
| `GET` | `/api/brands` | List of brands `[{id, name, country}]` |
| `GET` | `/api/sneakers` | List of sneakers with brand + market data |
| `GET` | `/api/sneakers/{id}` | Sneaker detail with colorways and parts |
| `GET` | `/api/sneakers/{id}/prices?range=1m|6m|1y|all` | Deterministic synthesized price time series |
| `OPTIONS` | `/api/*` | CORS preflight → `204` |

All responses include `Access-Control-Allow-Origin: *`. Errors return `{"error": "..."}` JSON.

### Static files

The server also serves static files from `web/`:
- `GET /` → `index.html`
- `GET /index.html`, `/desktop.html`, `/assets/*.jpg`, etc.

Access to `/data/` is blocked for security.

## Trademark Caveat

**"House of Articles"** is a working name pending trademark clearance vs. **"House of Highlights"** (ESPN/Complex). The name and branding should be reviewed before public release.

## License

See repository root [`LICENSE`](../../LICENSE).
