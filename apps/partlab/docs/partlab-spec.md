# Part Lab — product & interface spec (frozen contract)

> This document is the **interface contract** between the three build surfaces
> (`engine.js`, `renderer.js`/UI, `server`/`tests`). Every public name, signature
> and data shape below is **frozen**: implement exactly this. If something must
> change, change it here first.

Part Lab is a local, offline-first, zero-dependency **parametric part builder**.
It complements the analysed target (Vector, a cloud AI CAD copilot) by being
local, open, deterministic and free (see `risk-matrix.md`).

- **Units:** millimetres (mm). Mass uses g/cm³ density → grams.
- **Rule:** relative paths only (GitHub Pages sub-path), no CDNs, no inline event
  handlers, no third-party deps. Static-first, offline-first, server-optional.

---

## 1. File layout (ownership)

```
apps/partlab/
  web/
    index.html            UI shell (loads css + js in order)
    styles.css            all styling
    js/engine.js          [ENGINE]  pure geometry core  -> window.PartLab
    js/renderer.js        [VIEW]    canvas 3D renderer   -> window.PartLabView
    js/app.js             [UI]      wires engine + renderer + controls
    manifest.webmanifest  PWA manifest
    sw.js                 service worker (cache-first, offline)
    icons/icon.svg        app icon (svg)
  server/serve.py         [SERVER]  stdlib static + parts API (SQLite)
  tests/                  [TESTS]   hermetic, stdlib, exit 0/1
  docs/                   this spec + risk-matrix.md
  README.md
```

`index.html` loads, in order: `js/engine.js` → `js/renderer.js` → `js/app.js`
(engine and view define globals; app consumes them).

---

## 2. PartDoc — the part definition (portable JSON)

```jsonc
{
  "schema": "partlab/part/v1",
  "name": "Mounting bracket",
  "units": "mm",
  "material": { "name": "Aluminium 6061", "density": 2.70 },  // g/cm^3
  "params": { "L": 80, "W": 40, "T": 6, "boreR": 4 },          // numeric only
  "solids": [                                                   // additive bodies
    { "id": "s1", "type": "box", "x": 0, "y": 0, "z": 0,
      "params": { "dx": "L", "dy": "W", "dz": "T" } },
    { "id": "s2", "type": "cylinder", "x": 0, "y": 0, "z": 0,
      "params": { "r": 6, "h": "T", "segments": 32 } }
  ],
  "holes": [                                                    // subtractive features
    { "id": "h1", "type": "cylinder", "x": 14, "y": 0, "z": 0,
      "params": { "r": "boreR", "h": 20, "segments": 24 } }
  ]
}
```

- `type` ∈ `box | cylinder | cone | sphere | prism`.
- Every `params` value is **either a number or the name of a key in `params`**
  (a param reference). `resolveParams` replaces references with numbers.
- `x,y,z` = the feature's origin/placement (numbers or param refs).
- Solids are **additive**; holes are **subtractive** (see risk-matrix for the
  CSG non-goal). `segments` is optional (default per primitive below).

Per-primitive params:
| type     | params                                              | default segments |
| -------- | --------------------------------------------------- | ---------------- |
| box      | `dx,dy,dz` (centered at origin)                     | —                |
| cylinder | `r, h` (axis = Z, centered vertically at origin)    | 32               |
| cone     | `r1 (base), r2 (top), h` (axis = Z)                 | 32               |
| sphere   | `r`                                                 | 24 (latitude bands) |
| prism    | `sides (>=3), r, h` (regular n-gon, axis = Z)       | sides            |

All primitives are centered on their local origin, then translated by `x,y,z`.

---

## 3. ENGINE — `web/js/engine.js` → `window.PartLab`

Pure, deterministic, no DOM, no network. CommonJS-friendly for Node tests
(guarded `if (typeof module !== 'undefined') module.exports = PartLab;`).

```
PartLab.SCHEMA            // "partlab/mesh/v1"
PartLab.PRIMITIVES        // ["box","cylinder","cone","sphere","prism"]

PartLab.resolveParams(doc) -> doc'        // param refs -> numbers; throws Error on
                                          // unknown param / non-numeric / cycle
PartLab.validate(doc) -> { ok:boolean, errors:string[] }
PartLab.buildMesh(doc) -> Mesh            // see §3.2 (calls resolveParams internally)
PartLab.mass(doc, mesh?) -> number        // grams = netVolume_mm3 * density / 1000
PartLab.toSTL(mesh, opts?) -> string      // ASCII STL (opts:{name})
PartLab.toSTLBinary(mesh) -> Uint8Array   // binary STL
PartLab.presets() -> { bracket:PartDoc, flange:PartDoc, spacer:PartDoc }
```

Determinism: identical `doc` ⇒ byte-identical `Mesh` and STL.

### 3.2 Mesh format (frozen)

```jsonc
{
  "schema": "partlab/mesh/v1",
  "solids": [ { "id":"s1", "type":"box",
                "vertices": [[x,y,z], ...],      // numeric, mm
                "triangles": [[i,j,k], ...],     // CCW winding, right-hand normal
                "volume": 1234.5 } ],            // closed-form, mm^3
  "holes":  [ { "id":"h1", "type":"cylinder", "vertices":[...],
                "triangles":[...], "volume": 50.2 } ],
  "bounds":     { "min":[x,y,z], "max":[x,y,z] },
  "volume":     1234.5,   // sum of solids
  "holeVolume": 50.2,     // sum of holes (analytic)
  "netVolume":  1184.3,   // max(0, volume - holeVolume)
  "triangles":  96        // total triangle count (solids + holes)
}
```

Vertex/triangle arrays must be plain arrays (JSON-serialisable) so tests and the
server can round-trip a mesh.

### 3.3 STL (ASCII) exact format

```
solid <name>
  facet normal <nx> <ny> <nz>
    outer loop
      vertex <x> <y> <z>
      vertex <x> <y> <z>
      vertex <x> <y> <z>
    endloop
  endfacet
endsolid <name>
```

Normals via right-hand rule from winding; normalise; degenerate → `0 0 0`.
Facets are emitted for **solids then holes**. Numbers: fixed point, 4 decimals.

---

## 4. VIEW — `web/js/renderer.js` → `window.PartLabView`

Hand-rolled canvas-2D 3D renderer (no WebGL, no libs).

```
new PartLabView(canvasEl)          // canvasEl: HTMLCanvasElement
view.setMesh(mesh)                 // draw this Mesh (§3.2)
view.setOptions({ showHoles=true, wireframe=false, grid=true })
view.setPartColor(cssColor)        // solid colour
view.orbit(dxPixels, dyPixels)     // rotate model (yaw, pitch); clamps pitch
view.zoom(factor)                  // multiply scale (clamped 0.2..6)
view.reset()                       // restore default yaw/pitch/zoom
view.fit()                         // re-fit model to canvas bounds
view.render()                      // (re)draw
view.exportPNG() -> dataURL        // canvas.toDataURL("image/png")
```

Implementation notes (frozen behaviours): orbit via drag, zoom via wheel,
flat shading from a fixed light dir, back-face culling, painter's algorithm
(sort triangles by view-space depth), devicePixelRatio-aware, and it must
**fit** the mesh on first `setMesh`. It must not throw on an empty/undefined mesh
(render an empty grid).

---

## 5. UI — `web/js/app.js` (+ `index.html`, `styles.css`)

Responsibilities (all local, no network): preset selector (bracket/flange/
spacer), a **parameter panel** (numeric inputs for the active preset's params,
live-updating), 3-D preview (PartLabView), a **stats panel** (netVolume mm³,
volume cm³, mass g, bbox mm, triangle count), a **feature list** (solids + holes
with dimensions), and a **review gate**: an "Export STL" button that first shows a
confirmation/summary step (nothing is downloaded silently). Also: **Import** a
part JSON (file picker) and **Export part JSON**. Optional server upgrade:
if `GET ./api/health` responds, offer Save/Load to the local server; otherwise
run fully offline (localStorage).

No `onclick=` attributes (bind with `addEventListener`). All refs relative.

---

## 6. SERVER — `server/serve.py` (Python stdlib only)

Zero-dependency. Serves `web/` and a tiny parts API. Mirrors the repo's
peers/ziris servers. Per-request CORS `*`.

```
GET  /api/health              -> {"status":"ok","app":"partlab","version":"1.0"}
GET  /api/parts               -> {"parts":[{"id","name","updated"}]}          // index
GET  /api/parts/<id>          -> PartDoc  (404 if missing)
PUT  /api/parts/<id>          -> body=PartDoc, upsert; -> {"ok":true,"id":<id>}
POST /api/parts               -> body=PartDoc, create with new id; -> {"ok":true,"id":<id>}
POST /api/reset               -> {"ok":true}   // wipe store
```

- Storage: SQLite at `%PARTLAB_DB%` or `server/data/partlab.db`; table
  `parts(id TEXT PRIMARY KEY, name TEXT, doc TEXT, updated TEXT)`; doc = JSON.
- CLI: `python server/serve.py [--port 8791] [--host 127.0.0.1] [--no-browser]`.
- Static: serve `web/`; block `data/` traversal; secret-free.

Env var for tests: `PARTLAB_DB`.

---

## 7. TESTS — `tests/` (hermetic, stdlib, exit 0 = pass / 1 = fail)

- `tests/verify_static.py` — static integrity: no absolute-root refs / CDNs /
  inline `onclick`; required files exist; `index.html` loads engine→renderer→app
  in order; manifest + sw present; engine exposes `PartLab.buildMesh` etc.
- `tests/verify_server.py` — spawn `server/serve.py` on a free port with a temp
  `PARTLAB_DB`; assert health, parts PUT→GET round-trip, POST create, reset, 404,
  400, OPTIONS/CORS.
- `tests/verify_engine.py` — run `tests/engine.test.mjs` through Node if available
  (portable Node dir or `node` on PATH); **SKIP + exit 0** if no Node. The `.mjs`
  asserts closed-form volumes (unit cube=1, cylinder πr²h within 0.5%,
  cone=(1/3)πr²h), determinism (same doc ⇒ identical STL), and STL structure.
