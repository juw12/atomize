# Vertex v3 — Vector-parity visuals + the functions Vector markets (better)

Extends `vertex-v2-spec.md`. Two goals:

1. **Visuals more like `heyvector.co`** — carry Vector's exact design language and
   *structure* into Vertex (hero, product panel, feature grid, numbered steps,
   footer), then improve it.
2. **Function like Vector, but better** — add the capabilities Vector markets
   that Vertex lacks (**Answers / how-do-I**, **Reverse engineering scan→CAD**,
   **Drawing→CAD**, **Automation / repetition**), implemented **deterministically,
   locally, offline** (Vector's differentiators are cloud/account/AI; Vertex's are
   local/deterministic/universal/review-gated).

Everything stays zero-dependency, offline-first, deterministic, server-optional.

---

## 1. Vector design language (match, then beat)

Reproduce Vector's vocabulary (from its CSS tokens + hero + product shot), then
push it: same restraint, more capability shown.

- **Layout**: `top bar` (logo + product name **left**; a letter-spaced UPPERCASE
  tagline **right**) → `hero` (left = eyebrow + headline + subhead + CTAs; right =
  **product panel**) → `feature grid` → numbered `0 1 / 0 2 / 0 3` steps → `footer`
  bar (left = "Autodesk Fusion + SOLIDWORKS + <n> tools"; right = product name + `↗`).
- **Hero**: eyebrow UPPERCASE letter-spaced (`.08em`) with **one accent word** in
  `--accent`; headline `clamp(2.75rem, 6vw, 4.5rem)`, weight 600, tracking `-0.02em`;
  subhead `1.25rem` in `--text-2`; two CTAs (primary accent + ghost).
- **Product panel** (right of hero): a window frame — three traffic-light dots +
  an UPPERCASE letter-spaced label `FROM REPORT TO GEOMETRY` — wrapping the **live
  viewport**; corner crop-marks, faint grid, blue dimension leaders.
- **Feature grid**: cards = icon + title + one-line desc + tag chips. Mirror
  Vector's set: **Reverse engineering · Drawing to CAD · Repair · Answers ·
  Automation · Assemblies** (+ Build, Simulate).
- **Numbered steps**: `0 1 Works on your file (local)`, `0 2 Speaks every tool's
  format`, `0 3 Shows every change (review-gated)`.
- Tokens: reuse v2 `styles.css` vars (`--bg #0E0E0E`, `--line #2A2A2A`,
  `--accent #7C9CFF`, `--text #F2F2F2`, `--text-2 #9A9A9A`, radii 6–16, `--space:4px`).
  Nothing decorative; one accent, used sparingly.

All three screens (`index.html`, `app.html`, `mobile.html`) share the chrome; the
**workspace tabs** sit below the hero.

---

## 2. New ENGINE functions — `web/js/vertex.js` → `window.Vertex`

Add to `Vertex` (keep everything from v2). All pure, deterministic, offline.

```
Vertex.SCHEMA_ANSWER   // "vertex/answer/v1"
Vertex.SCHEMA_SCAN     // "vertex/scan/v1"
Vertex.SCHEMA_DRAWING  // "vertex/drawing/v1"
Vertex.SCHEMA_BATCH    // "vertex/batch/v1"

Vertex.answer(report, question)   -> Answer        // §2.1  (Vector "Answers / How do I")
Vertex.reverse(scan)              -> BuildSpec     // §2.2  (Vector "Reverse engineering")
Vertex.fromDrawing(drawing)       -> BuildSpec     // §2.3  (Vector "Drawing to CAD")
Vertex.automate(batch)            -> BatchPlan     // §2.4  (Vector "Automation / repetition")
```

### 2.1 `answer(report, question) -> Answer`
```jsonc
{ "schema":"vertex/answer/v1", "question":"...", "kind":"count|status|dependency|howto|mate|summary|unknown",
  "answer":"<one plain sentence>", "evidence":["f2 Fillet7 failed","dependsOn: f1"] }
```
Deterministic keyword rules (lowercased question), first match wins:
`/how many|count/` → count features by status; `/what failed|which failed|broken/` →
list failed/warning features; `/depends on (\w+)/` → features depending on that id;
`/how (do|to) i? ?(fix|make|create|repair|pattern|fillet|extrude|mate|assembly)/i` →
a short how-to from a LOCAL tips table (`Vertex.TIPS` = object of CAD op → tip);
`/mates?/` → mate summary; `/summary|what is this|overview/` → model summary; else
`unknown` with a helpful fallback. Never throws; tolerates empty report.

### 2.2 `reverse(scan) -> BuildSpec` (scan → parametric CAD)
```jsonc
{ "schema":"vertex/scan/v1", "points": [[x,y,z], ...], "maxFitError": 0.08 }
```
Deterministic fit: centre = mean of points; AABB from points; base = **box**
(dx,dy,dz) centred on the AABB centre. If the XY radial distances from the centre
satisfy `(maxR - minR) / maxR < maxFitError` → emit a **cylinder** (r = meanR,
h = z-extent) instead. Name `"Reversed part"`, material default Aluminium 6061 /
2.70, `units:"mm"`. Output is a valid `vertex/build-spec/v1`. Empty/1-point scans →
throw `Error` (caller guards). Deterministic.

### 2.3 `fromDrawing(drawing) -> BuildSpec` (drawing → CAD)
```jsonc
{ "schema":"vertex/drawing/v1", "units":"mm",
  "extents": { "L":80, "W":40, "T":6 },
  "holes": [ {"x":0,"y":0,"r":4}, {"x":-30,"y":15,"r":3} ] }
```
Deterministic → a box `L×W×T` (centred) with one `cylinder` hole per entry (r from
`r`, through `h:"T"`). Name from `title` or `"Drawing part"`. Missing `holes` → [].

### 2.4 `automate(batch) -> BatchPlan` (automation / repetition)
```jsonc
{ "schema":"vertex/batch/v1", "ops": [
    { "op":"export",  "name":"flange", "formats":["stl","obj","gltf","3mf","dxf"] },
    { "op":"pattern", "name":"rib", "count":26, "dx":8, "dy":0, "dz":0 },
    { "op":"sheets",  "name":"drawing", "count":11 }
]}
```
→
```jsonc
{ "schema":"vertex/batch-plan/v1",
  "steps":[ {"n":1,"op":"export","name":"flange","formats":["stl","obj","gltf","3mf","dxf"],"count":5},
            {"n":2,"op":"pattern","name":"rib","count":26,"delta":[8,0,0]} ],
  "summary": { "ops": n, "instances": n, "exports": n } }
```
Deterministic ordering (ops order); `pattern` expands to a `count`-instance step;
totals in `summary`. Vector's pitch ("26 blocks → 1 pattern, 18 exports, 11
sheets") becomes real numbers here. Empty `ops` → empty plan.

---

## 3. BRIDGE — add endpoints (keep v1/v2), mirroring the engine
```
POST /api/answer   body {"report":ModelReport,"question":"..."} -> Answer
POST /api/reverse  body Scan -> BuildSpec
POST /api/drawing  body DrawingSpec -> BuildSpec
POST /api/automate body Batch -> BatchPlan
```
Extend `GET /api/health` capabilities with `answer,reverse,drawing,automate`.
Bridge must reproduce §2 deterministically (Python), matching the engine.

---

## 4. UI — Vector-parity chrome + tool panels
- Rework `index.html`/`app.html`/`mobile.html` to the §1 Vector structure (top bar,
  hero with product panel wrapping the live viewport, feature grid, numbered steps,
  footer). Keep the workspace tabs below.
- Workspace tabs become **Repair · Assembly · Build · Simulate · Answers · Reverse ·
  Drawing · Automation** (8). Each new tab:
  - **Answers**: a question input + `Vertex.answer(report, q)`; show the answer +
    evidence; a few example chips ("what failed?","how do I fix a fillet?").
  - **Reverse**: paste points (or load a sample scan) → `Vertex.reverse` → BuildSpec
    in the Build viewport + "Open in Build".
  - **Drawing**: an extents + holes editor → `Vertex.fromDrawing` → BuildSpec.
  - **Automation**: a batch editor (export/pattern/sheets) → `Vertex.automate` →
    ordered plan + totals; run exports through the review gate.
- Keep the shared DOM contract, relative paths, `addEventListener` only, review gate,
  "Simulation — nothing is written to CAD" banner. All offline.

---

## 5. TESTS (extend)
- `tests/engine.test.mjs`: `answer` (count/status/dependency/howto/mate/unknown, determinism);
  `reverse` (box fit vs cylinder fit, determinism); `fromDrawing` (extents + hole count,
  determinism); `automate` (step order, pattern expansion, totals, determinism).
- `tests/verify_bridge.py`: the 4 new endpoints + engine↔bridge parity for each.
- `tests/verify_static.py`: all 3 screens still load `js/vertex.js → js/viewport.js →
  js/app.js` in order; the new tabs exist; no absolute-root/CDN/inline.
