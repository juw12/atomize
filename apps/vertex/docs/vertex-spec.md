# Vertex — product & interface spec (frozen contract)

> **Interface contract** between the three build surfaces (`engine`, cockpit/UI,
> `bridge`/connectors). Every public name, signature and data shape below is
> **frozen**: implement exactly this. Change the spec first if something must change.

Vertex is a **local, offline, zero-dependency desktop engineering copilot** for
Autodesk Fusion and SOLIDWORKS. It **diagnoses broken models, plans repairs, and
plans whole assemblies**, then applies plans to the live CAD model through **host
connectors** — always behind a **dry-run + review gate**. Because a real CAD host
+ vendor API cannot run or be verified here, the CAD integration ships as
**connector templates** plus a deterministic **simulation core**. This
complements the analysed target (Vector) by being local, deterministic, auditable
and review-gated (see `risk-matrix.md`).

- **Units:** millimetres (mm); angles degrees.
- **Rules:** relative paths only, no CDNs, no inline handlers, no third-party deps.
  Static-first, offline-first, server-optional.

---

## 1. Layout (ownership)

```
apps/vertex/
  web/
    index.html            cockpit shell (loads css + js in order)
    styles.css            styling
    js/vertex.js          [ENGINE]  deterministic diagnosis + assembly engine -> window.Vertex
    js/app.js             [UI]      wires engine + bridge + controls
    manifest.webmanifest  PWA manifest
    sw.js                 service worker (cache-first, offline)
    icons/icon.svg
  server/bridge.py        [BRIDGE]  stdlib HTTP CAD bridge (simulation backend)
  connectors/
    fusion_addin.py       [CONN]    Fusion 360 Python-API connector template (NOT executed here)
    solidworks_connector.py [CONN]  SOLIDWORKS COM connector template (NOT executed here)
  tests/                  hermetic, stdlib, exit 0/1
  docs/                   this spec + risk-matrix.md + connectors.md
  README.md
```

`index.html` loads in order: `js/vertex.js` → `js/app.js`.

---

## 2. Data schemas (all JSON, portable)

### 2.1 ModelReport — the host-agnostic model dump

```jsonc
{
  "schema": "vertex/model-report/v1",
  "host": "fusion" | "solidworks" | "simulated",
  "model": { "name": "Bracket v15", "units": "mm" },
  "features": [
    { "id": "f1", "type": "extrude", "name": "Extrude1", "status": "ok" },
    { "id": "f2", "type": "fillet",  "name": "Fillet7",  "status": "failed",
      "error": "radius exceeds adjacent face", "dependsOn": ["f1"] },
    { "id": "f3", "type": "pattern", "name": "Pattern3", "status": "warning",
      "error": "reference missing", "dependsOn": ["f2"] }
  ],
  "components": [ { "id": "c1", "name": "Shaft", "qty": 1 } ],
  "mates": [ { "id": "m1", "type": "concentric", "a": "c1", "b": "c2", "status": "ok" } ]
}
```

- `status` ∈ `ok | warning | failed | suppressed`.
- `dependsOn` = ids of features this one consumes (build order graph).
- All fields except `schema`, `host`, `model.name`, `features` are optional; the
  engine must tolerate missing `components`/`mates` (default `[]`).

### 2.2 Finding — one diagnosed problem

```jsonc
{ "id": "d1", "kind": "failed_feature", "severity": "high",
  "feature": "f2", "message": "Fillet7 failed: radius exceeds adjacent face",
  "rootCause": "f2", "fix": "Reduce the fillet radius or reselect the edge",
  "dependsOn": ["f1"] }
```

### 2.3 AssemblySpec — what to build

```jsonc
{
  "schema": "vertex/assembly-spec/v1",
  "name": "Four-speed gearbox",
  "parts": [ { "id": "c1", "name": "Housing", "qty": 1 },
             { "id": "c2", "name": "Shaft",   "qty": 4 } ],
  "mates": [ { "id": "m1", "type": "concentric", "a": "c1", "b": "c2" } ]
}
```

---

## 3. ENGINE — `web/js/vertex.js` → `window.Vertex`

Pure, deterministic, no DOM/network. Guarded CommonJS export for Node tests:
`if (typeof module !== 'undefined' && module.exports) module.exports = Vertex;`
and `if (typeof window !== 'undefined') window.Vertex = Vertex;`.

```
Vertex.SCHEMA_REPORT        // "vertex/model-report/v1"
Vertex.SCHEMA_DIAGNOSIS     // "vertex/diagnosis/v1"
Vertex.SCHEMA_REPAIR_PLAN   // "vertex/repair-plan/v1"
Vertex.SCHEMA_ASSEMBLY_PLAN // "vertex/assembly-plan/v1"

Vertex.validateReport(report) -> { ok:boolean, errors:string[] }
Vertex.diagnose(report) -> Diagnosis            // §3.1
Vertex.planRepair(report) -> RepairPlan          // §3.2
Vertex.planAssembly(spec) -> AssemblyPlan        // §3.3
Vertex.dryRun(plan) -> { ok:boolean, wouldApply:string[], blocked:string[] }  // §3.4
Vertex.samples() -> { brokenBracket:ModelReport, gearbox:AssemblySpec }
```

Determinism: identical input ⇒ identical output (ordered arrays, no Date/random).

### 3.1 `diagnose(report) -> Diagnosis`

```jsonc
{ "schema": "vertex/diagnosis/v1",
  "findings": [ Finding, ... ],                 // ordered (see below)
  "summary": { "high":1, "med":2, "low":0, "total":3 } }
```

Rules (each yields a Finding; `severity` fixed per kind):
| kind | condition | severity |
| --- | --- | --- |
| `failed_feature` | `status == "failed"` | high |
| `broken_reference` | `status != "ok"` and `error` matches `/reference|missing|broken/i` | high |
| `dangling_dependency` | a `dependsOn` id is not a known feature id | high |
| `circular_dependency` | the `dependsOn` graph has a cycle | high |
| `warning_feature` | `status == "warning"` (and not already a broken reference) | med |
| `suppressed_feature` | `status == "suppressed"` | low |
| `failed_mate` | a mate `status == "failed"` | med |
| `dangling_mate` | a mate references a component id not in `components` | med |

Ordering: by severity rank (`high`>`med`>`low`), then by the feature's index in
`features`, then by finding id. Finding `id` = `"d" + (index+1)` in that final order.
`rootCause` = the deepest upstream `dependsOn` id that is itself failed/dangling,
else the feature itself. `fix` = a short deterministic suggestion per kind.

### 3.2 `planRepair(report) -> RepairPlan`

```jsonc
{ "schema": "vertex/repair-plan/v1",
  "steps": [ { "order":1, "target":"f2", "action":"fix_fillet",
               "reason":"Fillet7 failed: radius exceeds adjacent face" } ],
  "unrealized": ["f3"] }        // features still broken after their upstream fix
```

- `diagnose` first; then order the affected features **topologically** (upstream
  first; ties broken by feature index). `action` derived from the feature `type`:
  `fix_fillet | fix_extrude | fix_pattern | fix_<type> | rebuild`.
- `unrealized` = ids of features whose status is failed/warning and which have no
  step (never happens if all failed features get a step — keep the field for honesty).

### 3.3 `planAssembly(spec) -> AssemblyPlan`

```jsonc
{ "schema": "vertex/assembly-plan/v1", "name": "...", "base": "c1",
  "steps": [ { "n":1, "op":"insert", "part":"c1" },
             { "n":2, "op":"insert", "part":"c2" },
             { "n":3, "op":"mate", "type":"concentric", "a":"c1", "b":"c2" } ],
  "checks": [ { "id":"chk1", "kind":"under-constrained", "severity":"med",
                "message":"c2 has no mate" } ],
  "partCount": 2, "mateCount": 1 }
```

- **Base part** = the component with the highest mate-degree; ties broken by
  `parts` order then id. Insert `base` first, then other parts in `parts` order,
  then mates in `mates` order.
- **Checks** (deterministic): `under-constrained` (a non-base part has zero mates,
  med), `over-constrained` (>6 mates on one part, med), `dangling-mate` (mate
  references a part not in `parts`, high), `duplicate-part` (same id twice, med),
  `no-mates` (spec has parts but no mates, low).
- `qty` expands: a part with `qty:n` inserts `n` times (ids `<id>#1..n`).
- A plan that references an unknown part must **fail loud** (include a
  `dangling-mate` check), never silently drop the mate.

### 3.4 `dryRun(plan) -> { ok, wouldApply:[], blocked:[] }`

The **review gate**. `wouldApply` = human-readable ops the plan would perform;
`blocked` = ops that cannot be applied automatically (e.g. a mate referencing a
missing part, or an action needing manual CAD input). `ok` = `blocked.length === 0`.
This is a pure function; nothing is applied.

---

## 4. Cockpit UI — `web/index.html`, `styles.css`, `js/app.js`

Offline-first cockpit. Two workspaces (tabs): **Repair** and **Assembly**.
- **Repair**: load a ModelReport (sample button, paste, or file) → show the
  **Diagnosis** (findings grouped by severity, each with rootCause + fix) and the
  **Repair plan** (ordered steps) → a **Dry-run** button → a **review gate**
  confirming the change list → an "Apply" action that is **disabled/simulated**
  when no live host (shows `mode: simulation`).
- **Assembly**: load an AssemblySpec (sample = gearbox) → show the **Assembly
  plan** (base + ordered steps) and **checks** → review-gated "Build (simulate)".
- **Connector status** strip: fetch `./api/connectors`; show Fusion / SOLIDWORKS /
  Simulated availability (offline ⇒ all unavailable, Simulated = on).
- Optional server upgrade: if `GET ./api/health` responds, use the bridge for
  diagnose/plan/apply; otherwise compute **fully offline** with `window.Vertex`.

UI rules: `addEventListener` only (no inline handlers), relative refs only,
original copy, a clear "simulation, nothing is written to CAD" banner.

---

## 5. BRIDGE — `server/bridge.py` (Python stdlib only)

Zero-dependency HTTP bridge between the cockpit and the CAD host. Mirrors the
repo's peers/airiz servers. Per-request CORS `*`. `mode` is `"simulation"` unless
a real connector is available (never, in this environment).

```
GET  /api/health     -> {"status":"ok","app":"vertex","version":"1.0","mode":"simulation"}
GET  /api/connectors -> {"connectors":[
                          {"id":"fusion","available":false,"host":"Autodesk Fusion","protocol":"python-api"},
                          {"id":"solidworks","available":false,"host":"SOLIDWORKS","protocol":"com"},
                          {"id":"simulated","available":true,"host":"Simulation","protocol":"in-process"}]}
GET  /api/report/sample    -> a sample ModelReport (brokenBracket)
GET  /api/assembly/sample  -> a sample AssemblySpec (gearbox)
POST /api/diagnose   -> body ModelReport -> Diagnosis
POST /api/plan       -> body ModelReport|AssemblySpec -> RepairPlan|AssemblyPlan
POST /api/apply      -> body {"plan":<plan>,"confirm":false|true} -> ApplyResult
```

`ApplyResult`:
```jsonc
{ "ok": true, "mode": "simulation", "applied": ["fix f2 (fix_fillet)"],
  "blocked": [], "wroteToCad": false,
  "message": "Simulation only: nothing was written to CAD." }
```
- `/api/apply` **requires** `confirm:true`; with `confirm:false` (or missing) it
  returns `{"ok":false,"confirmed":false,...}` and applies nothing.
- The bridge **never** writes to CAD in simulation mode (`wroteToCad:false` always
  here). It re-implements the diagnosis/plan logic server-side identically to the
  engine (deterministic; the engine is authoritative for the cockpit).

CLI: `python server/bridge.py [--port 8792] [--host 127.0.0.1] [--no-browser]`.

---

## 6. CONNECTORS — `connectors/`

Templates that talk to a real CAD host and speak the same JSON. **Not executed**
in this environment (no host, no licence); imported safely (all host imports
guarded). Each exposes `dump_report()`, `apply_plan(plan) -> ApplyResult`, and
`Probe()`/`probe()` returning `{"available": false, "reason": "..."}` here.

- `connectors/fusion_addin.py` — Autodesk Fusion Python API (`adsk.core`,
  `adsk.fusion`) add-in skeleton.
- `connectors/solidworks_connector.py` — SOLIDWORKS COM (`win32com.client`)
  skeleton.
Both must import cleanly with **no** host present (guard the imports), and their
`probe()` must return unavailable. `docs/connectors.md` documents how a user would
install them.

---

## 7. TESTS — `tests/` (hermetic, stdlib, exit 0 = pass / 1 = fail)

- `tests/verify_engine.py` — runs `tests/engine.test.mjs` through Node (portable
  Node dir, `PARTLAB_NODE`-style env `VERTEX_NODE`, or `node` on PATH); **SKIP +
  exit 0** if no Node. The `.mjs` asserts: `diagnose` finds the sample's findings
  with correct kinds/severities/counts; ordering is deterministic; `planRepair`
  is topologically ordered; `planAssembly` picks the right base + emits
  insert/mate steps + emits duplicate/dangling checks; `dryRun` blocks a
  dangling mate; identical input ⇒ identical JSON (determinism).
- `tests/verify_bridge.py` — spawn `server/bridge.py` on a free port with a temp
  env; assert health (mode=simulation), connectors (3, fusion/sw unavailable,
  simulated available), samples, `POST /api/diagnose` and `/api/plan` return the
  right schema + a known finding, `POST /api/apply` with `confirm:false` applies
  nothing and with `confirm:true` returns `wroteToCad:false`, 400/404, OPTIONS CORS.
- `tests/verify_static.py` — no absolute-root refs / CDNs / inline handlers;
  required files; `index.html` loads `js/vertex.js` → `js/app.js`; `js/vertex.js`
  exposes `Vertex`, `diagnose`, `planAssembly`; manifest + sw + icon present.
