# Ailene Open

> **Learn AI concepts, not vendor lock-in.**

Ailene Open is an independent, open, vendor-neutral reinterpretation and improvement of AI learning platforms like ailene.id. It provides a free, bilingual (Indonesian/English) curriculum with model-agnostic prompts that work across Claude, GPT, Gemini, and local models.

## Quick Start

**Desktop:** Double-click `web/index.html`  
**Mobile:** Double-click `web/mobile.html`

Both files work completely offline in any modern browser — no server, no login, no network required.

## Key Features

### 🎯 Vendor-Neutral Learning
- **Core concept first**: Each lesson teaches the underlying AI concept, not platform-specific features
- **Model-agnostic prompts**: Every prompt includes per-model adaptations for Claude, GPT, Gemini, and local models (Llama/Mistral)
- **No paywalls**: All levels and modules are fully accessible — nothing gated behind payment

### 🌐 Bilingual (ID/EN)
- Complete Indonesian and English translations for all content
- One-click language toggle
- Culturally appropriate for Indonesian market while remaining globally accessible

### 📚 Open Curriculum
- **Level 01**: AI Fundamentals (tokens, context windows, temperature)
- **Level 02**: Prompt Engineering (system prompts, few-shot learning)
- **Level 03**: AI Safety & Ethics (bias, privacy, harm reduction)
- **Level 04**: Advanced Techniques (chain-of-thought, self-correction)

Every lesson includes:
- Core concept explanation
- Model-agnostic prompt template
- Per-model adaptations (Claude/GPT/Gemini/Local)
- Citable sources for verification

### 🧠 AI Type Quiz
12-question assessment to discover your AI interaction style:
- **The Professor** — Values depth, accuracy, structured learning
- **The Builder** — Learns by doing, prefers examples and templates
- **The Detective** — Questions everything, seeks transparency
- **The Guardian** — Safety and ethics first
- **The All-Rounder** — Adaptable across contexts

### ✅ Safety & Evaluation Checklist
8-point checklist for responsible AI use:
- Factual accuracy verification
- Hallucinated citation detection
- Bias review (cultural, gender, demographic)
- Privacy protection (no PII)
- Security (no secrets in prompts)
- Copyright compliance
- Context appropriateness
- Human review for critical outputs

### 💾 Offline-First Progress
- Progress stored in `localStorage` under key `ailene_open_v1`
- No login required
- Works from `file://` protocol

## Architecture

```
apps/ailene-open/
  web/
    index.html          # Desktop build (offline-first, inline data)
    mobile.html         # Mobile build (offline-first, inline data)
  data/
    curriculum.json     # Single source of truth (versioned spine)
  tools/
    gen_inline_data.py  # Generates inline data blocks for HTML
  server/
    server.py           # Optional stdlib API server
  tests/
    test_data_schema.py # Validates curriculum spine
    test_static_integrity.py # HTML integrity checks
    verify_api.py       # Hermetic API tests
  docs/
    Product Spec.md
    Risk Mitigation.md
    Provenance.md
  README.md
```

## Build: Generate Inline Data

The curriculum data is embedded inline in the HTML files (like `apps/peers`). To regenerate:

```bash
python apps/ailene-open/tools/gen_inline_data.py --write
```

This reads `data/curriculum.json` and updates the marked region between `<!-- BEGIN:CURRICULUM_DATA -->` and `<!-- END:CURRICULUM_DATA -->` in both HTML files.

## Optional Backend

An optional zero-dependency Python stdlib server is available:

```bash
python apps/ailene-open/server/server.py
```

**Endpoints:**
- `GET /api/health` — Health check
- `GET /api/curriculum` — Full curriculum JSON
- `GET /api/lessons/{id}` — Single lesson by ID
- `GET /api/quiz` — Quiz questions and results
- `GET /` — Serves `web/index.html`
- `GET /mobile.html` — Serves `web/mobile.html`

**CLI Options:**
- `--port 8790` — Custom port (default: 8790)
- `--host 127.0.0.1` — Custom host (default: 127.0.0.1)
- `--no-browser` — Do not open browser on start

**Important:** The front-end is **offline-first** and does NOT require this server. The server is purely optional for programmatic API access.

## Tests

Run all tests:

```bash
python apps/ailene-open/tests/test_data_schema.py
python apps/ailene-open/tests/test_static_integrity.py
python apps/ailene-open/tests/verify_api.py
```

All tests exit `0` on success, `1` on failure.

### test_data_schema.py
Validates the curriculum spine:
- Every lesson has `id, module, level, title, sources[], prompts[]`
- Each prompt has per-model variant keys (claude, gpt, gemini, local)
- Bilingual text (en + id) for all user-facing strings
- HTML files contain no `fetch(`/`XMLHttpRequest`
- HTML files contain localStorage key `ailene_open_v1`
- No absolute-root asset refs or `<base>` tags

### test_static_integrity.py
Mirrors `apps/peers/tests/test_static_integrity.py` conventions:
- File exists and > 5000 bytes
- Valid UTF-8 encoding
- No `fetch(`/`XMLHttpRequest`
- Contains localStorage key `ailene_open_v1`
- No absolute-root asset refs (`(src|href)="/`)
- No `<base>` tag

### verify_api.py
Hermetic stdlib server test:
- Uses temp directory + free ephemeral port
- Tests `/api/health`, `/api/curriculum`, `/api/lessons/{id}`, `/api/quiz`
- Verifies CORS headers
- Tests 404 for unknown routes
- Verifies static file serving
- Exit `0`/`1`

## Design Principles

1. **Zero third-party dependencies** — Python stdlib only, no Node/build step, no CDNs
2. **Offline-first** — Works from `file://` with no network
3. **Vendor-neutral** — Teaches concepts, not platforms
4. **Open spine** — All content inspectable, nothing gated
5. **Bilingual by design** — ID/EN from the start, not an afterthought
6. **No login friction** — Progress in localStorage, no accounts

## Differences from ailene.id

| Feature | ailene.id | Ailene Open |
|---------|-----------|-------------|
| **Pricing** | Paid packages (Rp 1,49jt All Access) | Completely free |
| **Content access** | Level 01 free, rest gated | All levels open |
| **Vendor focus** | Claude-centric (KelasClaude) | Vendor-neutral (Claude/GPT/Gemini/Local) |
| **Language** | Indonesian only | Bilingual (ID/EN) |
| **Login** | Required for advanced content | No login ever |
| **Offline** | Requires network | Works offline |
| **Sources** | Not cited | All claims sourced |
| **Quiz** | 12 questions, personas | 12 questions, 5 personas + tips |
| **Safety** | Not prominent | 8-point checklist |

## Risk Mitigation

See [`docs/Risk Mitigation.md`](docs/Risk%20Mitigation.md) for a detailed table mapping ailene.id risks to mitigating features.

Key mitigations:
- **New brand trust** → Transparent sourcing, open curriculum
- **Vendor lock-in** → Model-agnostic prompts, per-model adaptations
- **Gated content** → All levels free, fully inspectable
- **No verifiability** → Every lesson has citable sources
- **Indonesia-only** → Bilingual ID/EN
- **Login friction** → No-login localStorage progress
- **Offline friction** → Works from `file://`

## Provenance

This is an **independent, open-source work** — NOT affiliated with or endorsed by ailene.id or PT Pengusaha Muda Indonesia.

All content is original. No copy, assets, or logos from ailene.id are reproduced.

See [`docs/Provenance.md`](docs/Provenance.md) for details.

## License

See repository root [`LICENSE`](../../LICENSE).

## Trademark Notice

"Ailene Open" is a working name for this independent educational project. It is not affiliated with "ailene.id" or "PT Pengusaha Muda Indonesia". All trademarks remain the property of their respective owners.
