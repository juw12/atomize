# Provenance Guide — Sneaker Ledger

> "Where did this price come from, and how much should I trust it?"

## What is Provenance?

**Provenance** is the documented origin and history of data. In Sneaker Ledger, every colorway's pricing and market data includes provenance metadata answering:

1. **Source** — Where did this data come from?
2. **Confidence** — How reliable is it?
3. **Observed At** — When was it last verified?

## Why Provenance Matters

House of Articles displays prices without context. Users can't tell:
- Is this price from the brand, a retailer, or a model?
- Is this current data or months old?
- Should I trust this for a $300 purchase decision?

Sneaker Ledger makes provenance **explicit and visible**.

## Provenance Schema

Every colorway in `data/catalog.json` includes:

```json
{
  "provenance": {
    "source": "brand_direct",
    "confidence": "verified",
    "observed_at": "2025-09-15"
  }
}
```

### Source Values

| Value | Meaning | Example |
|-------|---------|---------|
| `brand_direct` | Direct from manufacturer/brand | Release day MSRP from Quantum's press release |
| `market_aggregate` | Aggregated from multiple market sources | Average of StockX, GOAT, eBay sold listings |
| `synthetic_model` | AI/model-generated estimate | Inferred price from similar colorways, no actual sales data |

### Confidence Values

| Value | Color | Meaning | When to Use |
|-------|-------|---------|-------------|
| `verified` | 🟢 Green | Confirmed accurate | Brand press release, official retailer, verified sale |
| `estimated` | 🟡 Yellow | Reasonable estimate | Market aggregate with sufficient sample size |
| `synthetic` | 🟣 Pink | Model-generated | No real data, inferred from similar products |

### Observed At

ISO 8601 date string (YYYY-MM-DD) indicating when the price/data was last observed or verified.

**Example**: `"observed_at": "2025-09-15"` means the price was verified on September 15, 2025.

## Visual Indicators

Sneaker Ledger displays provenance with color-coded badges:

```
┌─────────────────────────────┐
│  [🟢 VERIFIED]              │  ← brand_direct, high confidence
│  Source: brand_direct       │
│  Observed: 2025-09-15       │
└─────────────────────────────┘

┌─────────────────────────────┐
│  [🟡 ESTIMATED]             │  ← market_aggregate, medium confidence
│  Source: market_aggregate   │
│  Observed: 2025-10-18       │
└─────────────────────────────┘

┌─────────────────────────────┐
│  [🟣 SYNTHETIC]             │  ← synthetic_model, low confidence
│  Source: synthetic_model    │
│  Observed: 2025-10-20       │
└─────────────────────────────┘
```

## Provenance Best Practices

### When Adding New Colorways

1. **Always include provenance** — Schema requires it; tests will fail without it.
2. **Be honest about confidence** — Don't mark synthetic data as verified.
3. **Update observed_at** — When refreshing prices, update the timestamp.
4. **Document sources** — If aggregating, note which sources in your data pipeline.

### Confidence Hierarchy

```
brand_direct (verified)
    ↓
market_aggregate (estimated)
    ↓
synthetic_model (synthetic)
```

Higher confidence = more trustworthy for decision-making.

## Integrity Checks

Sneaker Ledger's integrity panel flags:

- ❌ **Missing provenance** — Colorway has no provenance object
- ⚠️ **Incomplete provenance** — Missing source, confidence, or observed_at
- ⚠️ **Invalid confidence** — Confidence value not in {verified, estimated, synthetic}

## Example: Evaluating a Purchase

**Scenario**: You're considering buying "Quantum Leap 1 Eclipse" for $275.

**Without provenance** (House of Articles):
- Market price: $278
- Decision: "Looks fair, close to market"

**With provenance** (Sneaker Ledger):
- Market price: $278
- Provenance: `synthetic_model`, `synthetic`, observed 2025-10-20
- Decision: "⚠️ This is a model estimate, not real sales data. Wait for verified pricing."

**Alternative scenario**:
- Market price: $278
- Provenance: `brand_direct`, `verified`, observed 2025-09-15
- Decision: "✅ This is brand-verified. Confident proceeding."

## Limitations

- **Snapshot, not history** — We show current provenance, not full price history
- **Self-reported** — Provenance is only as honest as the data entry
- **No verification** — We don't independently verify provenance claims (yet)

## Future Enhancements

Potential improvements:

- **Provenance chain** — Track multiple observations over time
- **Source verification** — Cross-check provenance claims against external data
- **Confidence scoring** — Numeric confidence (0-100) instead of categorical
- **Community verification** — User-submitted corrections to provenance

## Related

- [Product Spec.md](Product%20Spec.md) — Full product specification
- [Risk Mitigation.md](Risk%20Mitigation.md) — How provenance mitigates house-of-articles risks
