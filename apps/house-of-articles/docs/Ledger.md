# Ledger — Data Integrity Console

The **Ledger** view provides data provenance tracking, fee-aware resale economics, and automated integrity checks for the House of Articles catalog.

## Features

### 1. Price Waterfall

Visual representation of the price stack for each colorway:
- **Est. Cost** — Estimated manufacturing cost (derived from brand gross margins)
- **Retail** — Official MSRP at launch
- **Market** — Current resale market price

### 2. Fee-Aware Resale Economics

Net profit calculator accounting for real-world marketplace fees:

**Formula:**
```
Marketplace Fee = Market Price × (Fee % / 100)
Net Proceeds = Market Price − Marketplace Fee − Shipping Cost
Net Profit = Net Proceeds − Est. Cost
Net ROI = (Net Profit / Est. Cost) × 100
```

**Settings** (persisted in `localStorage` under `hoa_ledger_v1`):
- Marketplace Fee % (default: 9.5%)
- Shipping Cost $ (default: $15)

### 3. Provenance Tracking

Every colorway includes a `provenance` object with:

| Field | Type | Values |
|-------|------|--------|
| `source` | string | `brand_direct`, `market_aggregate`, `synthetic_model` |
| `confidence` | string | `verified`, `estimated`, `synthetic` |
| `observed_at` | date | ISO date string (YYYY-MM-DD) |

**Confidence badges:**
- **Verified** (green) — Direct from brand or authoritative source
- **Estimated** (amber) — Aggregated from market data
- **Synthetic** (red) — Model-generated or placeholder data

### 4. Data Integrity Checks

Automated validation runs on catalog load:

| Check | Severity | Description |
|-------|----------|-------------|
| Duplicate SKU | Error | Same SKU appears multiple times |
| Missing provenance | Warning | Colorway lacks provenance object |
| Missing parts | Warning | No manufacturing breakdown |
| Invalid sneaker ref | Error | Colorway references non-existent sneaker |
| Markup/margin drift | Info | Calculated values differ from listed by >5% |

## Implementation

### Desktop (`web/desktop.html`)

- Sidebar navigation item "Ledger"
- Full-width panel with stats overview, settings, and data table
- Integrity report panel with issue list

### Mobile (`web/index.html`)

- Tab bar item "Ledger" (6th tab)
- Compact stats cards + scrollable provenance list
- Optimized for small screens

### Data Generation

[`tools/gen_inline_data.py`](../tools/gen_inline_data.py) includes provenance in generated `SHOE_DATA`:

```python
shoe_obj["provenance"] = colorway.get("provenance")
```

## Usage

1. Open desktop app → Sidebar → **Ledger**
2. Open mobile app → Tab bar → **Ledger** (far right)
3. Adjust fee settings to recalculate net profit
4. Review integrity report for data quality issues

## Storage

Settings persist in browser `localStorage`:
- Key: `hoa_ledger_v1`
- Schema: `{ marketplaceFee: number, shippingCost: number }`

## Example Provenance

```json
{
  "provenance": {
    "source": "brand_direct",
    "confidence": "verified",
    "observed_at": "2025-10-12"
  }
}
```

## Related

- [Product Spec](Product%20Spec.md) — Overall product specification
- [README](../README.md) — App overview and setup
