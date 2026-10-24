# Chase simulation — what it is (and what it is not)

`Chase.simulate(assemblySpec, buildSpec?)` (engine) and `POST /api/simulate`
(bridge) return a deterministic **`SimResult`** (`chase/sim/v1`,
`docs/chase-v2-spec.md` §1.3). It gives you checkable numbers **before** you
export or touch CAD — with **no** solver, **no** licence and **no** network.

> **Kinematic / analytic only.** Chase does not run a finite-element (FEM) or
> computational-fluid-dynamics (CFD) solver. It models rigid, idealised motion
> and rectangular bounding-volume interference. It is a fast, deterministic
> sanity check — **not** a substitute for an engineering analysis package.

## What *is* modelled

### Mass properties
- `mass.volume_mm3` = the mesh `netVolume` = `max(0, volume − holeVolume)`, where
  `volume` is the sum of **analytic** solid volumes and `holeVolume` the sum of
  analytic hole volumes (box, cylinder, cone, sphere, prism — closed form).
- `mass.mass_g` = `netVolume / 1000 × density` (density in g/cm³, from the
  build's `material.density`; default 1).
- `mass.centroid` = the **mean of all solid triangle-centroids** (holes
  excluded). This is a discrete surface-average, exactly as specified — *not* a
  volume-weighted centre of mass. Placing a centroid at the local origin in each
  primitive keeps it intuitive, but it is a definition, not physics.

### Clearance / interference (AABB)
- One entry per **unordered pair of solid parts** (i < j, mesh order — hence
  deterministic).
- Each part's axis-aligned bounding box (AABB) comes from its mesh vertices.
- `verdict` is `"interfere"` when the two AABBs overlap on **all three** axes
  (touching faces count as overlap), else `"clear"`.
- For a clear pair, `gap_mm` is the **smallest positive per-axis separation**.
  For an interfering pair, `gap_mm` is `0.0` (a bounding-box test does not report
  penetration depth).

### Motion (kinematic trace)
- One joint per mate, each a **25-sample** trace with `t = 0, 1/24, …, 1`.
- `concentric` / `gear` → the **child** part (`b`) rotates about the mate axis
  (default **Z**) by `angle = t · 2π`.
- `slider` → the child translates along the axis by `t · 50 mm`.
- `fixed` / unknown → the identity matrix.
- `transform` is a **column-major 4×4** matrix (16 numbers).
- `dof` = the number of **non-fixed** mates. `notes` always includes
  `"kinematic estimate"`.

## What is *not* modelled (deliberate non-goals)

- **No FEM / stress / strain / thermal / fatigue analysis.**
- **No CFD / flow / pressure analysis.**
- **No exact B-rep interference** — clearance is an AABB test, so concave shapes,
  rotations and true penetration are approximated.
- **No multi-body dynamics, friction, joints limits, or contact resolution** —
  motion is a fixed, idealised per-joint transform trace.
- **No mass moment of inertia / centre of mass by volume** — centroid is the
  discrete solid-triangle mean defined above.
- **Holes are not subtracted geometrically** — they reduce `netVolume` and are
  excluded from the centroid, but the AABB clearance uses bounding boxes of the
  solid parts only.

These limits are stated plainly so a result is never mistaken for a certified
engineering analysis. For anything safety-critical, verify in a dedicated FEA/CFD
package.

## Determinism

Identical input ⇒ byte-identical `SimResult` (and identical `Mesh`). Arrays are
ordered; no clock or random source is read; nothing shells out to Node. The
engine and the bridge implement the **same rules** — the bridge is a
server-side re-implementation so `POST /api/simulate` and `Chase.simulate`
agree.

## Example

```bash
python apps/chase/server/bridge.py --no-browser
curl -X POST http://127.0.0.1:8792/api/simulate \
  -H "Content-Type: application/json" \
  -d '{"schema":"chase/assembly-spec/v1","name":"rig",
       "parts":[{"id":"p1"},{"id":"p2"}],
       "mates":[{"id":"m1","type":"concentric","a":"p1","b":"p2"}],
       "build":{"schema":"chase/build-spec/v1","name":"two boxes","units":"mm",
                "material":{"name":"Aluminium 6061","density":2.70},
                "params":{},"solids":[
                  {"id":"s1","type":"box","x":-20,"y":0,"z":0,"params":{"dx":10,"dy":10,"dz":10}},
                  {"id":"s2","type":"box","x":20,"y":0,"z":0,"params":{"dx":10,"dy":10,"dz":10}}],
                "holes":[]}}'
```

Returns a `chase/sim/v1` object with `mass`, one `clearance` pair (`gap_mm: 30`,
`"clear"`), a 25-entry `motion` trace, `dof: 1`, and a `summary`.
