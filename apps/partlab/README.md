# partlab

Local, offline-first parametric part builder — describe a mechanical part as
parameters, preview it in 3D and export STL. No account, no cloud, no CAD licence.

## What it is

Part Lab turns a part into **parameters**. You define a part as a small portable
JSON document — numeric parameters, additive solids (box / cylinder / cone /
sphere / prism) and subtractive holes — and it gives you back an **instant 3D
preview**, **deterministic** volume / mass / bounding-box statistics, and an
**STL export**. The geometry core is a pure function: identical input yields
byte-identical output. Everything runs in the browser (or a local Python-stdlib
server) with **no third-party dependencies** and **no network**.

## Why it exists (vs. the analysed target)

The analysed target (`https://heyvector.co/` — Vector) is a cloud AI copilot that
drives Autodesk Fusion / SOLIDWORKS: it reads your open CAD document, requires a
platform sign-in, is proprietary and account-gated, and applies model output to a
live CAD model. Its risks are privacy, vendor lock-in, cost/platform lock,
non-determinism, portability and a weak review gate (see `docs/risk-matrix.md`).

Part Lab **improves on / complements** `https://heyvector.co/` rather than cloning
it: it is **local** (no IP leaves the machine), **open & self-hostable**
(zero-dependency, portable JSON), **runs anywhere** (any browser/OS, offline PWA),
**deterministic** (params → exact mesh), **exportable** (STL + portable part JSON),
**free & instant** (no pricing, no sign-in) and **review-gated** (export is a
deliberate, confirmed step). It is not a Fusion/SOLIDWORKS plugin — it is a
standalone local complement.

## Layout

```
apps/partlab/
  web/        static front-end (deployed to GitHub Pages)
  server/     optional zero-dependency Python backend (stdlib only)
  tests/      hermetic, stdlib-only end-to-end tests
  docs/       product specs and guides
  README.md
```

## Run locally

```bash
python apps/partlab/server/serve.py
```

Or just open `apps/partlab/web/index.html` in a browser — the app is fully
offline-first and works with no backend.

## Tests

```bash
python apps/partlab/tests/verify_static.py
python apps/partlab/tests/verify_server.py
python apps/partlab/tests/verify_engine.py   # SKIPs if Node is unavailable
# or everything at once
python scripts/run_all_tests.py
```

## Deploy

Registered in `scripts/apps.json` (the single source of truth consumed by
`scripts/build_site.py` and `scripts/publish_portfolio.py`). `python
scripts/check_site.py` validates relative paths, case-exact filenames, and
`.nojekyll` before Pages deploys.

## License

See [LICENSE](../../LICENSE).
