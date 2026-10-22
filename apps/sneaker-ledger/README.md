# Sneaker Ledger

> "Trust, but verify — with receipts."

**Offline-first data integrity & price provenance console** for the House of Articles sneaker catalog.

## What It Is

Sneaker Ledger complements [`apps/house-of-articles`](../house-of-articles) by adding a **verification layer** to its sneaker catalog:

| House of Articles | Sneaker Ledger |
|-------------------|----------------|
| Editorial feed, athlete moments | Data integrity, price verification |
| Synthetic/unverifiable prices | Provenance-tracked with confidence badges |
| Basic markup/margin display | Fee-aware net profit calculator |
| Magazine-style aesthetic | Audit console, data-forward UI |
| Trust the feed | **Verify the data** |

## Why It Exists

Phase 1 analysis (via REA) identified three critical risks in House of Articles:

1. **Catalog duplicated** across inline HTML + spine + SQLite → source-of-truth drift
2. **Prices synthetic/unverifiable** → no provenance, confidence, or timestamp
3. **No fee-aware resale math** → markup/margin shown but not net profit after fees

Sneaker Ledger mitigates all three:
- ✅ Single source of truth (`data/catalog.json`)
- ✅ Provenance on every colorway (source, confidence, observed_at)
- ✅ Editable fee calculator with net profit/ROI

## Features

### 1. Price Waterfall
Visual breakdown: Est. Cost → Retail → Market Price

### 2. Resale Economics
Editable settings (persisted in localStorage `sneaker_ledger_v1`):
- Marketplace fee % (default: 9.5%)
- Shipping cost $ (default: $15)
- Payment processing fee % (default: 3.5%)

Calculates net proceeds, net profit, net ROI.

### 3. Provenance Badges
Every colorway shows:
- 🟢 **Verified** — brand_direct
- 🟡 **Estimated** — market_aggregate
- 🟣 **Synthetic** — synthetic_model

### 4. Data Integrity Panel
Automated checks for:
- Duplicate SKUs
- Missing provenance/parts
- Invalid references
- Markup/margin calculation mismatches

## Layout

```
apps/sneaker-ledger/
  data/
    catalog.json           # Single source of truth (8 colorways, 4 brands)
  tools/
    gen_inline_data.py     # Regenerates inline HTML data block
  web/
    index.html             # Offline-first app (inline data, no fetch)
  server/
    server.py              # Optional stdlib API server
  tests/
    test_data_schema.py    # Schema validation + provenance check
    test_static_integrity.py # Static integrity checks
    verify_api.py          # Hermetic API server test
  docs/
    Product Spec.md        # Full product specification
    Risk Mitigation.md     # Maps hoA risks to mitigations
    Provenance.md          # Provenance guide
  README.md
```

## Run Locally

### Static (no server)
Open `web/index.html` directly in a browser. Works offline.

### With API server
```bash
python apps/sneaker-ledger/server/server.py
```

Options:
- `--port` (default: 8790)
- `--host` (default: 127.0.0.1)
- `--no-browser` (do not auto-open browser)

### API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/health` | Health check |
| `GET` | `/api/catalog` | Full catalog JSON |
| `GET` | `/api/sku/{id}` | Single colorway by SKU |
| `GET` | `/api/integrity` | Data integrity report |
| `OPTIONS` | `/api/*` | CORS preflight → 204 |

## Generate Inline Data

Regenerate the inline `<script id="catalog-data">` block in HTML files:

```bash
# Output to stdout
python apps/sneaker-ledger/tools/gen_inline_data.py

# Update HTML files directly
python apps/sneaker-ledger/tools/gen_inline_data.py --update
```

The generator is **idempotent** — running twice produces identical output.

## Tests

All tests are hermetic, stdlib-only, and exit `0` on success, `1` on failure.

```bash
# Schema validation (includes provenance check)
python apps/sneaker-ledger/tests/test_data_schema.py

# Static integrity (no fetch, no absolute paths, has sneaker_ledger_v1)
python apps/sneaker-ledger/tests/test_static_integrity.py

# API server test (free port, temp server)
python apps/sneaker-ledger/tests/verify_api.py

# Or run all at once
python scripts/run_all_tests.py
```

### Test Coverage

**test_data_schema.py**:
- Required keys (version, brands, sneakers, colorways)
- Brand/sneaker field validation
- Colorway field validation + numeric checks
- SKU uniqueness
- Reference integrity (sneaker_id, brand_id)
- **Provenance required** on every colorway
- HTML file checks (no external URLs, no absolute paths)

**test_static_integrity.py**:
- File exists & >5000 bytes
- Valid UTF-8
- No `fetch(` or `XMLHttpRequest`
- Contains `sneaker_ledger_v1` localStorage key
- No absolute-root refs (`src="/`, `href="/`)
- No `<base>` tag
- Has inline catalog-data script tag
- Has sentinel comments for injection

**verify_api.py**:
- Server starts on free port
- `/api/health` returns 200
- `/api/catalog` returns catalog
- `/api/sku/{id}` returns colorway
- `/api/sku/FAKE` returns 404
- `/api/integrity` returns issues
- OPTIONS preflight returns 204

## Catalog Data

Current catalog (`data/catalog.json`):

- **4 brands**: Quantum (USA), Meridian (Germany), Aurora (Japan), Basalt (Iceland)
- **8 sneakers** across Basketball, Running, HYROX, Lifestyle categories
- **8 colorways** with full provenance tracking

Schema matches House of Articles with added `provenance` field:

```json
{
  "id": "quantum-leap-1-eclipse",
  "sneaker_id": "quantum-leap-1",
  "name": "Eclipse",
  "sku": "QTM-LP1-ECL",
  "retail_price": 195,
  "market_price": 278,
  "est_cost": 81,
  "markup_pct": 43,
  "margin_pct": 58,
  "provenance": {
    "source": "brand_direct",
    "confidence": "verified",
    "observed_at": "2025-09-15"
  }
}
```

## Design

**Trust/Audit Console** aesthetic:
- Dark theme (`#0a0e14` background)
- Monospace fonts for numbers
- Color-coded confidence badges
- Price waterfall bar charts
- Tabular data views

NOT a copy of House of Articles' editorial feed look.

## Offline-First Guarantees

- ✅ No network required — all data inline
- ✅ No login — no authentication
- ✅ No third-party deps — zero CDNs, zero external fonts
- ✅ No fetch/XMLHttpRequest — pure static
- ✅ Settings persist in localStorage `sneaker_ledger_v1`

## Deploy

Registered in `scripts/build_site.py` in both the `APPS` landing-card list and the `apps_config` copy list.

```bash
# Build static site
python scripts/build_site.py

# Validate (blocks absolute paths, case mismatches)
python scripts/check_site.py
```

Access to `/data/` is blocked by the server for security.

## Trademark Caveat

**"Sneaker Ledger"** is a working name. All brand names (Quantum, Meridian, Aurora, Basalt) and sneaker models are fictional and created for this demo.

## License

See [LICENSE](../../LICENSE).
