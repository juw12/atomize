# Vertex v2 — universal 3D copilot (spec addendum)

Extends `vertex-spec.md`. Vertex v2 keeps Repair + Assembly and adds three
capabilities, all **local, deterministic, offline, zero-dependency**:

1. **Universal adapter layer** — works with *any* 3D software via a registry of
   adapters (CAD apps **and** open formats), all speaking the same ModelReport.
2. **Geometry builder + 3D file export** — build a part from parameters/primitives
   and export real files: **STL (ascii+binary), OBJ, glTF 2.0, 3MF, DXF**.
3. **Deterministic simulation** — kinematics/assembly motion, mass properties,
   clearance/interference (AABB).

Plus a **dark, Vector-style UI** with a **live canvas 3D viewport**.

> Everything here is deterministic and dependency-free. No real FEM/CFD solver —
> simulations are kinematic/analytic and clearly labelled.

---

## 1. Schemas

### 1.1 BuildSpec (`vertex/build-spec/v1`) — what to generate
```jsonc
{ "schema":"vertex/build-spec/v1", "name":"Mount flange", "units":"mm",
  "material": { "name":"Aluminium 6061", "density": 2.70 },
  "params": { "L":80, "W":40, "T":6, "boreR":4 },
  "solids": [ { "id":"s1", "type":"box", "x":0,"y":0,"z":0, "params":{"dx":"L","dy":"W","dz":"T"} } ],
  "holes":  [ { "id":"h1", "type":"cylinder", "x":0,"y":0,"z":0, "params":{"r":"boreR","h":"T"} } ] }
```
Primitives: `box(dx,dy,dz)`, `cylinder(r,h)`, `cone(r1,r2,h)`, `sphere(r)`,
`prism(sides,r,h)` — all centred on their local origin, then translated by
`x,y,z`. `params` values are numbers **or** names of keys in `params`.

### 1.2 Mesh (`vertex/mesh/v1`) — the generated geometry
```jsonc
{ "schema":"vertex/mesh/v1",
  "parts":[ {"id":"s1","type":"box","vertices":[[x,y,z]],"triangles":[[i,j,k]],"volume":1234.5} ],
  "bounds":{"min":[x,y,z],"max":[x,y,z]},
  "volume":1234.5, "holeVolume":50.2, "netVolume":1184.3, "triangles":96 }
```
`vertices`/`triangles` are plain JSON arrays (so tests + bridge can round-trip).

### 1.3 SimResult (`vertex/sim/v1`) — deterministic simulation
```jsonc
{ "schema":"vertex/sim/v1",
  "mass": { "volume_mm3":1184.3, "mass_g":3.20, "centroid":[0,0,0],
            "material":"Aluminium 6061" },
  "clearance": [ {"a":"c1","b":"c2","gap_mm":12.5,"verdict":"clear"} ],
  "motion": [ {"t":0.0,"joint":"m1","part":"c2","transform":[16 numbers]} ],
  "dof": 1, "summary":{"parts":2,"joints":1,"interferences":0}, "notes":["kinematic estimate"] }
```
- **mass**: `volume_mm3 = netVolume`; `mass_g = netVolume/1000 * density`
  (density g/cm³); `centroid` = mean of all solid triangle-centroids (holes excluded).
- **clearance**: per unordered part pair, AABB gap; `verdict:"interfere"` if the
  AABBs overlap on **all three** axes, else `"clear"` with the smallest positive
  axis gap (mm). Deterministic order = parts order (i<j).
- **motion**: for each mate, one joint; a 25-sample trace `t = 0..1` in 1/24 steps.
  `concentric`/`gear` → rotate the child part about the mate axis by
  `angle = t * 2π`; `slider` → translate along the axis by `t * 50 mm`;
  `fixed`/unknown → identity. `transform` is a column-major 4×4 matrix (16 nums).
- `dof` = number of non-fixed mates. `notes` must include `"kinematic estimate"`.

### 1.4 Adapter (`vertex/adapter/v1`) — universal connector registry entry
```jsonc
{ "id":"freecad","name":"FreeCAD","kind":"cad","protocol":"python-api",
  "formats":["FCStd","STEP","STL"],"available":false,"notes":"..." }
```
`kind` ∈ `cad | mesh | format`; `protocol` ∈ `python-api | com | rest | cli | file`.
`available` is `false` for every host adapter in this environment (no host);
the `simulated` + `format` entries are `true`.

---

## 2. ENGINE — `web/js/vertex.js` (extend; keep all v1 exports)

New constants: `Vertex.SCHEMA_BUILD/MESH/SIM/ADAPTER`.

```
Vertex.buildMesh(buildSpec) -> Mesh                 // resolve params, primitives, analytic volumes
Vertex.exportSTL(mesh, {binary,name})  -> string|Uint8Array   // ascii string OR binary bytes
Vertex.exportOBJ(mesh)                 -> string
Vertex.exportGLTF(mesh)                -> string    // valid glTF 2.0 JSON, embedded base64 buffer
Vertex.export3MF(mesh)                 -> Uint8Array // store-only ZIP: [Content_Types].xml, _rels/.rels, 3D/3dmodel.model
Vertex.exportDXF(mesh)                 -> string    // 2D silhouette (XY) polyline + hole circles (minimal ASCII DXF)
Vertex.simulate(assemblySpec, buildSpec?) -> SimResult
Vertex.adapters()                      -> Adapter[] // >= 12 entries (see §5)
Vertex.samples()                       -> { brokenBracket, gearbox, flange }  // + flange BuildSpec
```
- `exportSTL` ascii format = spec §3.3 of `vertex-spec.md` (4-decimals, right-hand
  normals). `binary` true → 80-byte header + uint32 count + 50 bytes/tri.
- `exportGLTF` must be valid glTF 2.0: one buffer (base64 data URI) with
  positions(float32) + indices(uint32), one mesh/primitive, correct
  `byteOffset`/`byteLength`, scene+node. `asset.version="2.0"`.
- `export3MF` writes a **store-only** ZIP (no compression) with CRC32; the model
  XML references the mesh as `<mesh>` triangles + vertices.
- `exportDXF` emits a minimal ASCII DXF: header + ENTITIES with one LWPOLYLINE
  (projected bounding outline) + CIRCLE per hole.
- Determinism: identical input ⇒ byte-identical outputs.
- Keep `diagnose/planRepair/planAssembly/dryRun/validateReport` unchanged.

---

## 3. VIEWPORT — `web/js/viewport.js` → `window.VertexView`

Hand-rolled canvas 2D 3D renderer (no WebGL/libs), dark theme.
```
new VertexView(canvas)
view.setMesh(mesh)                      // vertex/mesh/v1
view.setSim(simResult)                  // enables motion playback
view.setOptions({ grid=true, wireframe=true, showHoles=true, dims=true, crop=true })
view.orbit(dx,dy); view.zoom(f); view.fit(); view.reset()
view.setTime(t)                          // 0..1 -> apply motion[t] transforms
view.play()/pause()                      // animate the motion trace
view.render(); view.exportPNG() -> dataURL
```
Behaviour (frozen): dark viewport bg `#0B0C0E`, faint grid `#1C1E22`, geometry
strokes `#C8CED8`, accent/dimension leaders `#7C9CFF` with arrowheads, dashed
centrelines, four corner crop-mark brackets; devicePixelRatio-aware; must not
throw on empty/undefined mesh (draw the empty grid).

---

## 4. UI — dark, Vector-style (all three screens)

Design tokens (mirror Vector + improve). Use CSS custom properties in `styles.css`:
```
--bg:#0E0E0E; --panel:#0E0E0E; --raised:#16171A; --inset:#0B0C0E;
--line:#2A2A2A; --hairline:#222; 
--text:#F2F2F2; --text-2:#9A9A9A; --text-3:#6E6E6E;
--accent:#7C9CFF; --accent-dim:rgba(124,156,255,.14);
--ok:#7DCB9A; --warn:#E0B15E; --err:#E8777F;
--radius-1:6px; --radius-2:8px; --radius-3:12px; --radius-4:16px; --space:4px;
--font-sans:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;
--font-mono:'SF Mono',Menlo,Consolas,'Courier New',monospace;
```
Rules: near-black page, panels set off by 1px `--line` + radius, **one** blue
accent used sparingly, uppercase letter-spaced micro-labels (11–12px,
`letter-spacing:.08em`), large tight headings (tracking −0.02em), mono for data.
No gradients-as-decoration; keep it minimal/premium (Linear/Vercel meets CAD).

Four workspaces (tabs): **Repair · Assembly · Build · Simulate**.
- **Repair / Assembly**: as v1, but rendered in the new theme with the **live viewport**.
- **Build**: edit a BuildSpec (preset + numeric params) → `Vertex.buildMesh` → viewport
  preview + **Export** buttons (STL / OBJ / glTF / 3MF / DXF) behind the review gate.
- **Simulate**: `Vertex.simulate(gearbox)` → mass card, clearance table (clear/interfere
  colour-coded), and a **motion scrubber** driving `view.setTime(t)`.
- **Adapters strip**: `GET ./api/adapters` (offline fallback = `Vertex.adapters()`);
  list adapters with kind/protocol/format chips; hosts show "unavailable (no host)".
- Preserve: `js/vertex.js`→`js/app.js` load order, same DOM ids reused across the 3
  screens, relative paths, `addEventListener` only, review gate + simulation banner.

`index.html` (web) additionally loads `js/viewport.js` **after** `js/vertex.js`,
before `js/app.js`. Same for `app.html` and `mobile.html`.

---

## 5. UNIVERSAL ADAPTERS — `connectors/adapters/`

A registry + import-safe templates (no host present ⇒ `probe()` unavailable):
```
connectors/adapters/_base.py              # Adapter protocol + registry helper
connectors/adapters/freecad_adapter.py    # FreeCAD Python API
connectors/adapters/blender_adapter.py    # bpy
connectors/adapters/onshape_adapter.py    # REST API
connectors/adapters/rhino_adapter.py      # Rhino.Python / rhino3dm
connectors/adapters/sketchup_adapter.py   # Ruby API
connectors/adapters/inventor_adapter.py   # COM
connectors/adapters/autocad_adapter.py    # COM / .NET
connectors/adapters/generic_format_adapter.py  # STEP/IGES/STL/OBJ/glTF/3MF/DXF files
```
Each exposes `probe()`, `dump_report()`, `apply_plan(plan)`, and `DESCRIPTOR()`
(id/name/kind/protocol/formats). `Vertex.adapters()` (engine) and
`GET /api/adapters` (bridge) must list **≥ 12** adapters including these plus
`fusion`, `solidworks`, and `simulated`. All host adapters: `available:false`,
`apply_plan` never writes (`wroteToCad:false`). `docs/adapters.md` documents install.

---

## 6. BRIDGE — `server/bridge.py` (add endpoints; keep v1)
```
GET  /api/adapters           -> {"adapters":[Adapter,...]}
POST /api/build   body BuildSpec -> {"ok":true,"mesh":Mesh,"exports":["stl","obj","gltf","3mf","dxf"]}
POST /api/simulate body AssemblySpec (optional {"build":BuildSpec}) -> SimResult
```
Keep `/api/health` (add `"capabilities":["diagnose","plan","apply","build","simulate","adapters"]`),
`/api/connectors`, samples, `/api/diagnose`, `/api/plan`, `/api/apply`. Bridge mirrors
the engine **byte-identically** for buildMesh + simulate (Python re-implementation).

---

## 7. TESTS (extend; hermetic, stdlib, exit 0/1)
- `tests/engine.test.mjs` — v1 checks **plus**: `buildMesh` closed-form volumes
  (box/cylinder/cone/sphere/prism) + determinism; `exportSTL` ascii/binary structure;
  `exportOBJ` (`v`/`f` counts, 1-indexed); `exportGLTF` parses as JSON with
  `asset.version==="2.0"` and a buffer; `export3MF` unzips (Python) to valid XML with
  the mesh; `exportDXF` has `ENTITIES` + a `CIRCLE`; `simulate` mass/centroid/clearance/
  motion determinism; `adapters().length >= 12`.
- `tests/verify_bridge.py` — v1 plus `/api/adapters` (≥12), `/api/build` (returns mesh +
  exports), `/api/simulate` (schema), and engine↔bridge parity for buildMesh + simulate.
- `tests/verify_static.py` — the 3 screens each load `js/vertex.js` → `js/viewport.js` →
  `js/app.js` + `styles.css`; no absolute-root/CDN/inline handlers; `viewport.js`
  exposes `VertexView`.
