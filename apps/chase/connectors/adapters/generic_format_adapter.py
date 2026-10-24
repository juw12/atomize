#!/usr/bin/env python3
"""Generic open-format file adapter — a REAL adapter (no CAD host required).

Where the host adapters need Fusion/FreeCAD/Rhino/etc. running, this one works
with **open file formats** using only the Python standard library: STEP, IGES,
STL, OBJ, glTF, 3MF, DXF. It can list the formats it understands, inspect a file,
and write a ``chase/mesh/v1`` mesh back out as ASCII STL or OBJ. This is why its
``probe()`` honestly returns ``available: True``.

Speaks the same JSON surface as the other adapters (spec §5):
    DESCRIPTOR() / probe() / dump_report(path) / apply_plan(plan)
plus real helpers:
    formats() / can_read(path) / read(path) / write(path, mesh)

Scope note: STEP/IGES/DXF are handled as opaque text (this adapter does not
implement a full boundary-representation kernel); STL and OBJ are parsed and
written for real. See ``docs/adapters.md``.
"""

from __future__ import annotations

import json
from pathlib import Path

ID = "generic-format"
NAME = "Open formats (file adapter)"
KIND = "format"
PROTOCOL = "file"
FORMATS = ["STEP", "IGES", "STL", "OBJ", "glTF", "3MF", "DXF"]

# Extension sets (lower-case, with the leading dot).
_TEXT_EXTS = {".stl", ".obj", ".gltf", ".dxf", ".step", ".stp", ".iges", ".igs"}
_BINARY_EXTS = {".3mf", ".glb"}
_OPAQUE_TEXT_EXTS = {".step", ".stp", ".iges", ".igs", ".dxf"}


def DESCRIPTOR() -> dict:
    return {
        "id": ID, "name": NAME, "kind": KIND, "protocol": PROTOCOL,
        "formats": list(FORMATS), "available": probe()["available"],
        "notes": ("File adapter: reads/writes STL + OBJ for real; STEP/IGES/DXF "
                  "are treated as opaque text; glTF is parsed as JSON; 3MF/GLB "
                  "are handled as binary blobs. No CAD host required."),
    }


def formats() -> list:
    """The open formats this adapter understands."""
    return list(FORMATS)


def probe() -> dict:
    """Available: the standard library can read/write these formats for real."""
    return {
        "available": True,
        "reason": ("File adapter: the standard library reads/writes these open "
                   "formats by extension (STL/OBJ/glTF/3MF/DXF, plus STEP/IGES "
                   "as text). No CAD host required."),
    }


def can_read(path) -> bool:
    return Path(path).suffix.lower() in (_TEXT_EXTS | _BINARY_EXTS)


def read(path) -> dict:
    """Inspect a supported file and return a small, deterministic summary."""
    p = Path(path)
    if not p.is_file():
        raise FileNotFoundError(str(p))
    ext = p.suffix.lower()
    if ext == ".stl":
        return _read_stl(p)
    if ext == ".obj":
        return _read_obj(p)
    if ext == ".gltf":
        doc = json.loads(p.read_text(encoding="utf-8"))
        meshes = doc.get("meshes") if isinstance(doc, dict) else None
        return {"format": "glTF", "meshes": len(meshes or []),
                "assetVersion": (doc.get("asset") or {}).get("version")
                if isinstance(doc, dict) else None}
    if ext in _OPAQUE_TEXT_EXTS:
        text = p.read_text(encoding="utf-8", errors="replace")
        return {"format": ext.lstrip(".").upper(), "lines": text.count("\n") + 1,
                "text": text}
    if ext in _BINARY_EXTS:
        data = p.read_bytes()
        return {"format": ext.lstrip(".").upper(), "bytes": len(data)}
    raise ValueError("unsupported format: %s" % ext)


def _read_stl(p: Path) -> dict:
    """Parse an ASCII or binary STL into a facet count (both variants)."""
    data = p.read_bytes()
    if len(data) >= 84:
        count = int.from_bytes(data[80:84], "little")
        if 84 + count * 50 == len(data) and b"facet" not in data[:256]:
            return {"format": "STL", "binary": True, "facets": count}
    text = data.decode("utf-8", "replace")
    return {"format": "STL", "binary": False, "facets": text.count("facet normal")}


def _read_obj(p: Path) -> dict:
    vertices = 0
    faces = 0
    for line in p.read_text(encoding="utf-8", errors="replace").splitlines():
        if line.startswith("v "):
            vertices += 1
        elif line.startswith("f "):
            faces += 1
    return {"format": "OBJ", "vertices": vertices, "faces": faces}


def _feature_vertices(mesh):
    """Yield ``(vertices, triangles)`` for solids then holes in a mesh."""
    for key in ("parts", "solids", "holes"):
        for feature in (mesh.get(key) or []):
            yield feature.get("vertices") or [], feature.get("triangles") or []


def _fmt(x: float) -> str:
    s = "%.4f" % float(x)
    return "0.0000" if s == "-0.0000" else s


def _normal(a, b, c):
    """Right-hand-rule normal from CCW winding; degenerate -> (0,0,0)."""
    ux, uy, uz = b[0] - a[0], b[1] - a[1], b[2] - a[2]
    wx, wy, wz = c[0] - a[0], c[1] - a[1], c[2] - a[2]
    nx = uy * wz - uz * wy
    ny = uz * wx - ux * wz
    nz = ux * wy - uy * wx
    length = (nx * nx + ny * ny + nz * nz) ** 0.5
    if length < 1e-12:
        return 0.0, 0.0, 0.0
    return nx / length, ny / length, nz / length


def _to_stl(mesh, name="chase") -> str:
    lines = ["solid " + name]
    for verts, triangles in _feature_vertices(mesh):
        for tri in triangles:
            a, b, c = verts[tri[0]], verts[tri[1]], verts[tri[2]]
            n = _normal(a, b, c)
            lines.append("  facet normal %s %s %s" % (_fmt(n[0]), _fmt(n[1]), _fmt(n[2])))
            lines.append("    outer loop")
            for v in (a, b, c):
                lines.append("      vertex %s %s %s" % (_fmt(v[0]), _fmt(v[1]), _fmt(v[2])))
            lines.append("    endloop")
            lines.append("  endfacet")
    lines.append("endsolid " + name)
    return "\n".join(lines)


def _to_obj(mesh) -> str:
    lines = []
    base = 1  # OBJ indices are 1-based and global across the file.
    for verts, triangles in _feature_vertices(mesh):
        for v in verts:
            lines.append("v %s %s %s" % (_fmt(v[0]), _fmt(v[1]), _fmt(v[2])))
        for tri in triangles:
            lines.append("f %d %d %d" % (base + tri[0], base + tri[1], base + tri[2]))
        base += len(verts)
    return "\n".join(lines) + ("\n" if lines else "")


def write(path, mesh) -> dict:
    """Write a ``chase/mesh/v1`` mesh to ASCII STL or OBJ (stdlib only)."""
    p = Path(path)
    ext = p.suffix.lower()
    if ext == ".stl":
        p.write_text(_to_stl(mesh, p.stem or "chase"), encoding="utf-8")
    elif ext == ".obj":
        p.write_text(_to_obj(mesh), encoding="utf-8")
    else:
        raise ValueError("write() supports .stl and .obj only (got %s)" % ext)
    return {"ok": True, "path": str(p), "bytes": p.stat().st_size}


def dump_report(path=None, **kwargs) -> dict:
    """Inspect a file and return a minimal ``ModelReport`` describing it."""
    if path is None:
        raise ValueError("generic-format dump_report() requires a path= argument")
    info = read(path)
    return {
        "schema": "chase/model-report/v1",
        "host": ID,
        "model": {"name": Path(path).name, "units": "mm"},
        "features": [],
        "components": [],
        "mates": [],
        "source": info,
    }


def apply_plan(plan) -> dict:
    """The file adapter writes files explicitly via ``write()`` — never to CAD."""
    return {
        "ok": False, "mode": "simulation", "applied": [], "blocked": [],
        "wroteToCad": False,
        "message": ("File adapter: apply_plan() performs no CAD write; call "
                    "write(path, mesh) to export a file explicitly."),
    }


if __name__ == "__main__":  # pragma: no cover - manual smoke check
    import json as _json
    print(_json.dumps(DESCRIPTOR(), indent=2))
