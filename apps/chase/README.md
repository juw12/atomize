# chase

A local, offline, zero-dependency **desktop engineering copilot** for Autodesk
Fusion and SOLIDWORKS — diagnose and fix broken models, plan whole assemblies,
and review every change before it touches CAD.

## What it is

Chase fixes errors and builds whole assemblies, like the target it improves on —
but **locally, deterministically and auditably**. It works from a **ModelReport**
(a host-agnostic dump of a model's features, components and mates) and produces:

- a typed **Diagnosis** (failed fillets, broken references, dangling/circular
  dependencies, failed mates — with root cause and suggested fix),
- an ordered **Repair plan** (upstream-first, topological), and
- an **Assembly plan** (base part + insert/mate steps + structural checks).

Every plan passes a **dry-run + review gate** before anything is applied. Plans
are applied to the live CAD model through **host connectors** (Fusion Python API /
SOLIDWORKS COM); when no host is attached, Chase runs in a fully usable
**simulation mode** and never writes to CAD.

## Why it exists (vs. the analysed target)

`https://heyvector.co/` (Vector) is a proprietary, account-gated **cloud** AI
copilot that repairs models and drives assemblies inside Fusion/SOLIDWORKS. It
requires a platform sign-in, sends your design data to a vendor, gives
non-deterministic AI edits, and holds write access to a live model.

Chase **improves on / complements** it: it is **local** (no IP leaves the
machine), **open & self-hostable** (stdlib bridge + portable JSON + open
connector templates), usable with **no CAD licence** (simulation core),
**deterministic** (rules → identical output), **auditable** (a typed plan you can
read), and **review-gated** (dry-run first; nothing applied silently). See
`docs/risk-matrix.md`.

> **Honest constraint:** a faithful CAD integration needs a licensed Fusion /
> SOLIDWORKS host and its vendor API, which cannot run or be verified here. The
> connectors therefore ship as **import-safe templates** (`connectors/`) that speak
> the same JSON but are **not executed** in this environment — the tested path is
> the deterministic simulation core.

## Layout

```
apps/chase/
  web/               static cockpit (deployed to GitHub Pages)
  server/bridge.py   zero-dependency Python CAD bridge (stdlib only)
  connectors/        Fusion Python-API + SOLIDWORKS COM connector templates
  tests/             hermetic, stdlib-only end-to-end tests
  docs/              spec, risk matrix, connector guide
  README.md
```

## Run locally

```bash
python apps/chase/server/bridge.py
```

Or open `apps/chase/web/index.html` directly — the cockpit computes diagnoses
and plans **fully offline** with the built-in engine and no backend.

## Tests

```bash
python apps/chase/tests/verify_static.py
python apps/chase/tests/verify_bridge.py
python apps/chase/tests/verify_engine.py   # SKIPs if Node is unavailable
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
