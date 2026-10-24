#!/usr/bin/env python3
"""Blender adapter — TEMPLATE (not executed here).

Talks to Blender through ``bpy`` (Blender's embedded Python module) and speaks
the same JSON as the Chase bridge/engine (`docs/chase-spec.md` §2 / §6). Blender
is a mesh tool, so its ``kind`` is ``mesh``.

    > NOT VERIFIED AGAINST A REAL HOST. <
    A real integration needs Blender running this as a script inside its Python
    interpreter. The ``bpy`` import is guarded so this module imports cleanly
    with **no** Blender present.

Public API (spec §5):
    DESCRIPTOR() / probe() / dump_report() / apply_plan(plan)
"""

from __future__ import annotations

ID = "blender"
NAME = "Blender"
KIND = "mesh"
PROTOCOL = "python-api"
FORMATS = ["BLEND", "STL", "OBJ", "glTF", "GLB", "PLY", "FBX"]

try:  # pragma: no cover - only true inside Blender's interpreter
    import bpy  # type: ignore

    _HAS_BPY = True
except Exception:
    bpy = None  # type: ignore
    _HAS_BPY = False

REASON = (
    "Blender adapter is an unverified template: the bpy module is not importable "
    "in this interpreter (Blender is not running here)."
)


def DESCRIPTOR() -> dict:
    return {
        "id": ID, "name": NAME, "kind": KIND, "protocol": PROTOCOL,
        "formats": list(FORMATS), "available": probe()["available"],
        "notes": REASON,
    }


def probe() -> dict:
    """Report whether a live Blender host is reachable."""
    if not _HAS_BPY:
        return {"available": False, "reason": REASON}
    try:  # pragma: no cover - requires a running Blender
        if getattr(bpy, "data", None) is None:
            return {"available": False, "reason": "bpy imported but data is unavailable."}
        return {"available": True, "reason": "Blender (bpy) detected."}
    except Exception as exc:  # pragma: no cover
        return {"available": False, "reason": "Blender probe failed: %s" % exc}


def dump_report(*args, **kwargs) -> dict:
    """Read the active Blender scene into a host-agnostic ``ModelReport``."""
    status = probe()
    if not status.get("available"):
        raise RuntimeError("Blender host unavailable: %s" % status.get("reason"))

    # --- sketch of the real mapping (NOT executed / NOT verified) -----------
    # objs = [o for o in bpy.data.objects]
    # features = []
    # for i, o in enumerate(objs):
    #     features.append({"id": "f%d" % (i + 1), "type": o.type, "name": o.name,
    #                      "status": "ok", "error": "", "dependsOn": []})
    # return {"schema": "chase/model-report/v1", "host": ID,
    #         "model": {"name": "Blender scene", "units": "mm"},
    #         "features": features, "components": [], "mates": []}
    raise NotImplementedError(
        "dump_report() is a template; implement against a live Blender host."
    )  # pragma: no cover


def apply_plan(plan) -> dict:
    """Apply a plan to the live Blender scene, behind the review gate."""
    status = probe()
    if not status.get("available"):
        return {
            "ok": False, "mode": "simulation", "applied": [], "blocked": [],
            "wroteToCad": False,
            "message": "No Blender host available: nothing was written to CAD.",
        }
    return {
        "ok": False, "mode": "simulation", "applied": [], "blocked": [],
        "wroteToCad": False,
        "message": ("Blender adapter is an unverified template: automatic scene "
                    "edits are disabled; apply the reviewed plan manually."),
    }


if __name__ == "__main__":  # pragma: no cover - manual smoke check
    import json
    print(json.dumps(DESCRIPTOR(), indent=2))
