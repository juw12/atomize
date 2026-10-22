# Risk Mitigation — Sneaker Ledger

Phase 2 artifact mapping house-of-articles risks to sneaker-ledger mitigations.

## House of Articles Risks (from REA analysis)

| # | Risk / weakness | Category | Severity | Sneaker Ledger Mitigation | Status |
| - | --------------- | -------- | -------- | ------------------------- | ------ |
| 1 | **Catalog duplicated across multiple sources** (inline HTML + spine + SQLite) causing source-of-truth drift | correctness | high | Single source of truth: `data/catalog.json` is the spine; `tools/gen_inline_data.py` regenerates inline data idempotently; server reads from same spine | ✅ Built |
| 2 | **Prices are synthetic/unverifiable** — no provenance, confidence, or timestamp | correctness | high | Every colorway requires `provenance: {source, confidence, observed_at}`; confidence badges (verified/estimated/synthetic) displayed prominently | ✅ Built |
| 3 | **No fee-aware resale math** — markup/margin shown but not net profit after marketplace fees | ux / correctness | med | Editable settings (marketplace fee %, shipping $, payment fee %) persisted in localStorage; net profit calculator with ROI | ✅ Built |
| 4 | **No data integrity checks** — duplicate SKUs, invalid references, calculation mismatches go undetected | correctness | med | Integrity panel runs automated checks: duplicate SKUs, missing provenance, missing parts, invalid references, markup/margin drift | ✅ Built |
| 5 | **Network-dependent** — requires backend or external APIs | ops / ux | med | Offline-first, inline data only; no fetch/XMLHttpRequest; works without network | ✅ Built |
| 6 | **No third-party audit trail** — users can't verify where data came from | privacy / correctness | med | Provenance tracking with source labels (brand_direct, market_aggregate, synthetic_model) and observed_at timestamps | ✅ Built |

## Mitigation Features

### 1. Single Source of Truth

**Problem**: House of Articles has catalog data in multiple places (mobile inline, desktop inline, spine JSON, SQLite) leading to drift.

**Solution**: 
- `data/catalog.json` is the authoritative spine
- `tools/gen_inline_data.py` regenerates inline HTML block from spine
- Server reads from same spine file
- Tests verify schema consistency

### 2. Provenance Tracking

**Problem**: Prices in House of Articles are synthetic with no way to verify source or confidence.

**Solution**:
- Every colorway MUST have `provenance` object
- `source`: Where did this data come from? (brand_direct, market_aggregate, synthetic_model)
- `confidence`: How reliable is it? (verified, estimated, synthetic)
- `observed_at`: When was it last verified? (ISO date)
- Visual badges color-code confidence levels

### 3. Fee-Aware Economics

**Problem**: House of Articles shows markup/margin but doesn't account for real-world fees.

**Solution**:
- Editable marketplace fee % (default 9.5%)
- Shipping cost $ (default $15)
- Payment processing fee % (default 3.5%)
- Calculates net proceeds, net profit, net ROI
- Settings persist in localStorage `sneaker_ledger_v1`

### 4. Data Integrity Panel

**Problem**: No automated checks for data quality issues.

**Solution**:
- Duplicate SKU detection
- Missing provenance warnings
- Missing parts warnings
- Invalid sneaker/brand reference errors
- Markup/margin calculation mismatch info
- Severity-coded results (error/warning/info)

### 5. Offline-First Architecture

**Problem**: Network dependency creates fragility and privacy concerns.

**Solution**:
- All data inline in HTML
- No fetch() or XMLHttpRequest
- No external CDNs or fonts
- No login required
- localStorage for settings persistence

## Deliberate Non-Goals

Things we explicitly chose NOT to fix or build:

- **Real-time price updates** — This is a verification console, not a live market tracker. Prices are snapshots with provenance timestamps.
- **User accounts / portfolios** — No authentication, no user data. Fully offline.
- **Athlete/event tracking** — That's House of Articles' domain. We focus on data verification.
- **Editorial content** — No feed, no news, no articles. Pure data audit tool.
- **Build step / bundlers** — Static HTML + Python stdlib only. No Node, no npm.

## Residual Risks

Risks we accept as-is:

- **Manual data updates** — Catalog updates require editing `catalog.json` and regenerating inline data. This is deliberate (versioned, auditable) but slower than automated sync.
- **No price history** — We show current prices with provenance, not historical time series. House of Articles handles price trends.
- **Single-file limitation** — Large catalogs may make HTML file large. Acceptable for ~6-9 colorway demo; production would need pagination or lazy loading.
- **Browser localStorage limits** — Settings persist in localStorage (~5-10MB limit). Acceptable for simple fee settings.

## Verification Checklist

- [x] Single source of truth (catalog.json)
- [x] Idempotent generator (gen_inline_data.py)
- [x] Provenance required on every colorway
- [x] Fee-aware calculator with editable settings
- [x] Integrity panel with automated checks
- [x] Offline-first (no fetch, no CDNs)
- [x] All tests exit 0
