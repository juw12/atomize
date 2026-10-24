# Chase universal adapters — one model report, many tools

Chase is **tool-agnostic**. It never assumes Fusion or SOLIDWORKS specifically;
it talks to *whatever produces a `ModelReport`*. That indirection is the
**adapter layer** under `connectors/adapters/`.

An adapter is a small, import-safe Python module that speaks the same JSON as the
engine (`web/js/chase.js`) and the bridge (`server/bridge.py`) — a `ModelReport`
in, a `Diagnosis` / `RepairPlan` / `AssemblyPlan` out, and an `ApplyResult` when a
reviewed plan is applied (`docs/chase-spec.md` §2 / §5). Swap the adapter and the
rest of Chase is unchanged.

## The one report, many adapters idea

```
   Fusion ─┐
SOLIDWORKS ─┤
   FreeCAD ─┤                                   ┌─ Diagnosis
   Blender ─┤        ┌──────────────┐           ├─ RepairPlan
   Onshape ─┼──────► │ ModelReport  │ ──engine──┼─ AssemblyPlan
     Rhino ─┤        │ chase/model- │           ├─ Mesh   (buildMesh)
 SketchUp  ─┤        │ report/v1    │           └─ SimResult (simulate)
 Inventor  ─┤        └──────────────┘
  AutoCAD  ─┤
 open files┘  (STEP/IGES/STL/OBJ/glTF/3MF/DXF)
```

Every adapter exposes the **same four functions**:

| function | purpose |
| --- | --- |
| `DESCRIPTOR()` | the spec §1.4 registry entry (id/name/kind/protocol/formats/available/notes) |
| `probe()` | `{"available": bool, "reason": str}` — is a live host reachable? |
| `dump_report()` | read the host into a `ModelReport` (raises when no host) |
| `apply_plan(plan)` | apply a reviewed plan — `wroteToCad` stays `false` here |

`_base.py` holds the shared `Adapter` protocol, the `DESCRIPTOR(...)` helper, and
`registry()` — the single source of truth for `GET /api/adapters` and the
cockpit's offline fallback.

## The registry (>= 12 entries)

| id | host | kind | protocol | available here |
| --- | --- | --- | --- | --- |
| `fusion` | Autodesk Fusion | cad | python-api | **no** |
| `solidworks` | SOLIDWORKS | cad | com | **no** |
| `freecad` | FreeCAD | cad | python-api | **no** |
| `blender` | Blender | mesh | python-api | **no** |
| `onshape` | Onshape | cad | rest | **no** |
| `rhino` | Rhino | cad | python-api | **no** |
| `sketchup` | SketchUp | cad | cli (Ruby) | **no** |
| `inventor` | Autodesk Inventor | cad | com | **no** |
| `autocad` | AutoCAD | cad | com | **no** |
| `generic-format` | Open formats (file) | format | file | **yes** |
| `catia` | CATIA | cad | com | **no** |
| `solid-edge` | Solid Edge | cad | com | **no** |
| `maya` | Autodesk Maya | mesh | python-api | **no** |
| `creo` | PTC Creo | cad | cli | **no** |
| `simulated` | Simulation core | mesh | in-process | **yes** |

`available` is `false` for **every** host adapter in this environment (no CAD host
is installed); only `generic-format` (a real file adapter) and `simulated` (the
built-in core) report `true`.

> ## Honest caveat — the host adapters are UNVERIFIED templates
>
> A faithful integration needs the **host application + its vendor API** (Fusion's
> `adsk`, FreeCAD's `FreeCAD`/`Part`, Blender's `bpy`, Rhino's `rhino3dm`/`Rhino`,
> SOLIDWORKS/Inventor/AutoCAD COM, Onshape's REST, SketchUp's Ruby API). None of
> that can run or be verified in this offline, zero-dependency monorepo, so the
> host adapters ship as **import-safe templates**: the JSON protocol is real and
> the geometry/simulation core is tested, but the **host calls are stubbed and
> clearly marked**, and **no adapter here has been executed against a real host**.
> Every host import is guarded, so each module imports cleanly with no host and no
> third-party package installed, and `apply_plan()` returns `wroteToCad: false`.

The `protocol` values follow spec §1.4 (`python-api | com | rest | cli | file`).
`simulated` uses `in-process` as an honest extension of that enum — it is neither
a host API nor a file format; it is Chase's own deterministic core.

## How to install each adapter against a real host

**Fusion (`connectors/fusion_addin.py`)** — install Autodesk Fusion, then
*Utilities → Add-Ins → Scripts and Add-Ins* and run/register the file; implement
the two marked sketch bodies (`dump_report`, `apply_plan`) against `adsk.core` /
`adsk.fusion`.

**SOLIDWORKS (`connectors/solidworks_connector.py`)** — Windows + a licensed
seat + `pip install pywin32` (host-machine dependency; the repo stays
zero-dependency); implement the marked bodies against `win32com.client`.

**FreeCAD (`connectors/adapters/freecad_adapter.py`)** — install FreeCAD and run
the module as a macro inside FreeCAD's embedded interpreter so `import FreeCAD`
and `import Part` resolve; implement `dump_report`/`apply_plan`.

**Blender (`connectors/adapters/blender_adapter.py`)** — run inside Blender's
Python interpreter so `import bpy` resolves (*Scripting* workspace → *Run Script*).

**Onshape (`connectors/adapters/onshape_adapter.py`)** — create an API key +
secret, set `ONSHAPE_API_KEY` / `ONSHAPE_API_SECRET`, implement the REST calls in
`dump_report` (stdlib `urllib`). Chase itself never performs a network call.

**Rhino (`connectors/adapters/rhino_adapter.py`)** — either `pip install rhino3dm`
for standalone `.3dm` file access, or run inside Rhino's `Rhino.Python` editor for
the live `import Rhino` API.

**SketchUp (`connectors/adapters/sketchup_adapter.py`)** — SketchUp's API is
**Ruby**. Load `RUBY_SNIPPET` (embedded in the module) via the Ruby Console or as
an Extension; it dumps the same `ModelReport` JSON Chase consumes.

**Inventor / AutoCAD (`*_adapter.py`)** — Windows + licensed seat + `pywin32`;
`probe()` uses `GetActiveObject` so it never launches a fresh COM server.

**CATIA / Solid Edge / Maya / Creo** — registry descriptors only; the same
template pattern applies (COM / toolkit / `maya.cmds`).

**Open formats (`connectors/adapters/generic_format_adapter.py`)** — works with
**no** host: it lists the supported formats, inspects a file, and writes a
`chase/mesh/v1` mesh out as ASCII STL or OBJ using only the standard library.

## Try the registry safely (no host required)

```bash
python apps/chase/server/bridge.py --no-browser
# then, in another shell:
curl http://127.0.0.1:8792/api/adapters
```

Or print the registry directly:

```bash
python apps/chase/connectors/adapters/_base.py
```

Every host adapter appears with `"available": false` and a human-readable
`notes`/`reason` — proof the layer degrades honestly instead of crashing.
