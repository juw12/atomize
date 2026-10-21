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
| **Mobile** (`web/index.html`) | Mobile-first vertical feed with 19 screens | Home feed, Brand pages, Shoe detail, Cart, Profile |
| **Desktop** (`web/desktop.html`) | Desktop dashboard with 5 views | Feed, Market, Calendar, Collections, Settings |

Both builds are **static-only** with inline data — no backend required.

## Data Spine

The normalized catalog lives in [`data/data-spine.json`](data/data-spine.json) — a versioned JSON file containing:

- **7 brands**: Apex, Court Co., Velocity, Trail Co., Night Owl, Street Phoenix, Cloud Walker
- **13 unique sneakers** (by SKU) across Basketball, Running, HYROX, and Lifestyle categories
- **13 colorways** with full pricing, manufacturing, and market data

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

## Tools

### Generate Inline Data

[`tools/gen_inline_data.py`](tools/gen_inline_data.py) reads the data spine and prints the equivalent JavaScript `SHOE_DATA` object to stdout:

```bash
python tools/gen_inline_data.py
```

This outputs a `const SHOE_DATA = {...}` object matching the original inline format from the HTML prototypes. **Does NOT modify HTML files by default.**

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

## Trademark Caveat

**"House of Articles"** is a working name pending trademark clearance vs. **"House of Highlights"** (ESPN/Complex). The name and branding should be reviewed before public release.

## License

See repository root [`LICENSE`](../../LICENSE).
