# Vertex connectors — install & use guide

Vertex talks to a CAD host through **connectors**. A connector:

1. dumps the live model into a host-agnostic **`ModelReport`** (`docs/vertex-spec.md` §2.1) — `dump_report()`, and
2. applies a reviewed **`RepairPlan` / `AssemblyPlan`** back to the host — `apply_plan(plan) -> ApplyResult` (§5),

and reports whether a live host is reachable — `probe() -> {"available": bool, "reason": str}`.

There are two host connectors plus one built-in simulation "connector":

| id | host | protocol | shipped as | available here |
| --- | --- | --- | --- | --- |
| `fusion` | Autodesk Fusion | `python-api` (`adsk`) | template | **no** |
| `solidworks` | SOLIDWORKS | `com` (`win32com`) | template | **no** |
| `simulated` | Simulation | `in-process` | the bridge/engine | **yes** |

> ## ⚠️ Honest caveat — the connectors are UNVERIFIED templates
>
> A faithful integration needs a **licensed CAD host + its vendor API** (Fusion's
> `adsk` Python API, or SOLIDWORKS COM automation). That cannot run or be
> verified in this offline, zero-dependency monorepo, so
> `connectors/fusion_addin.py` and `connectors/solidworks_connector.py` ship as
> **import-safe templates**: the JSON protocol and the repair/assembly logic are
> real and tested, but the **host calls are stubbed and clearly marked**, and
> **neither file has been executed against a real host**.
>
> Consequences:
> - Both modules import cleanly with **no** host and **no** third-party package
>   installed (every host import is guarded); `probe()` returns
>   `{"available": False, "reason": "..."}`.
> - `apply_plan()` returns `wroteToCad: false` unless a real host is confirmed,
>   and the automatic write path is intentionally disabled.
> - The tested, deterministic path is the **simulation core** (the engine in
>   `web/js/vertex.js` and the bridge in `server/bridge.py`), which is fully
>   usable with no CAD licence.

---

## The shared protocol

Both connectors speak the **same JSON** as the engine and the bridge — a
`ModelReport` in, a `Diagnosis` / `RepairPlan` / `AssemblyPlan` out, and an
`ApplyResult` when a plan is applied. This is what makes a connector a drop-in:
nothing about the cockpit or the engine changes when a real host appears.

```jsonc
// probe()
{ "available": false, "reason": "…" }

// apply_plan(plan) -> ApplyResult (spec §5)
{ "ok": true, "mode": "simulation", "applied": ["fix f2 (fix_fillet)"],
  "blocked": [], "wroteToCad": false,
  "message": "Simulation only: nothing was written to CAD." }
```

The **review gate** always applies: a plan is applied only after a dry-run and an
explicit `confirm:true` (`POST /api/apply`; see `docs/risk-matrix.md` R7).
Simulation **never** writes to CAD — `wroteToCad` is `false`.

---

## `fusion_addin.py` — Autodesk Fusion 360 (Python API)

**What it would be.** A Fusion 360 add-in / script that runs inside Fusion's
embedded Python and uses `adsk.core` + `adsk.fusion`.

**To install against a real host (not done here):**

1. Install Autodesk Fusion 360 (with a valid licence) on the machine.
2. In Fusion, open **Utilities → Add-Ins → Scripts and Add-Ins**.
3. Either run `fusion_addin.py` as a **script**, or place it under Fusion's
   `API/Scripts` (or `API/AddIns`) folder and register it as an add-in.
4. Implement the two marked sketch bodies:
   - `dump_report()` — walk `design.rootComponent` and the timeline to emit a
     `ModelReport` (feature id/type/name/status/error/`dependsOn`).
   - `apply_plan()` — map each repair step (`fix_fillet`, `fix_extrude`, …) or
     assembly step (`insert`, `mate`) onto the corresponding Fusion API call,
     then set `wroteToCad: true` **only** after a real, reviewed apply succeeds.
5. Verify the exports match `docs/vertex-spec.md` §2 before enabling any write.

**Offline behaviour (here):** imports `adsk` in a guard; if absent,
`probe()` → `{"available": false, ...}` and `apply_plan()` returns
`wroteToCad: false`.

---

## `solidworks_connector.py` — SOLIDWORKS (COM)

**What it would be.** A Windows-only connector that drives SOLIDWORKS through
COM automation via `win32com.client`.

**To install against a real host (not done here):**

1. Install SOLIDWORKS on a Windows machine (with a valid licence).
2. Install **pywin32** in the connector's Python environment
   (`pip install pywin32`) — note this is a *host machine* dependency; the
   Vertex repo itself stays zero-dependency.
3. Implement the two marked sketch bodies:
   - `dump_report()` — read `SldWorks.Application.ActiveDoc` and walk features
     with `FirstFeature()` / `GetNextFeature()` into a `ModelReport`.
   - `apply_plan()` — map plan steps onto SOLIDWORKS API calls, then set
     `wroteToCad: true` only after a real, reviewed apply succeeds.
4. Verify the exports match `docs/vertex-spec.md` §2 before enabling any write.

**Offline behaviour (here):** imports `win32com.client` in a guard; if absent,
`probe()` → `{"available": false, ...}` and `apply_plan()` returns
`wroteToCad: false`.

---

## The `simulated` connector (works everywhere)

When no host is attached, Vertex uses its deterministic simulation core:

- the **engine** (`web/js/vertex.js`) computes everything fully offline in the
  cockpit, with no backend at all, or
- the **bridge** (`python apps/vertex/server/bridge.py`) exposes the same logic
  over HTTP (`GET /api/connectors`, `POST /api/diagnose`, `/api/plan`,
  `/api/apply`).

Check connector status at any time:

```bash
python apps/vertex/server/bridge.py --no-browser
# then, in another shell:
curl http://127.0.0.1:8792/api/connectors
```

---

## Try the connectors safely

Both connector modules are import-safe and can be smoke-tested with no host:

```bash
python -c "import importlib.util,json,sys; \
spec=importlib.util.spec_from_file_location('c','apps/vertex/connectors/fusion_addin.py'); \
m=importlib.util.module_from_spec(spec); spec.loader.exec_module(m); \
print(json.dumps(m.probe()))"
```

Expect `{"available": false, "reason": "..."}` — proof the template imports and
degrades honestly rather than crashing.
