#!/usr/bin/env python3
"""Rhino / Grasshopper adapter — TEMPLATE (not executed here).

Talks to Rhino two ways:
  * **rhino3dm** — a standalone Python file library for reading/writing ``.3dm``
    without Rhino running (import-safe, no host required for parsing);
  * **Rhino.Python / RhinoCommon** — the in-process API available only inside
    Rhino's ``Rhino.Python`` editor (``import Rhino``).

Speaks the same JSON as the Chase bridge/engine (`docs/chase-spec.md` §2 / §6).

    > NOT VERIFIED AGAINST A REAL HOST. <
    Neither ``rhino3dm`` nor the in-process ``Rhino`` module is installed in this
    zero-dependency environment. Both imports are guarded, so this module imports
    cleanly with **no** host.

Public API (spec §5):
    DESCRIPTOR() / probe() / dump_report() / apply_plan(plan)
"""

from __future__ import annotations

ID = "rhino"
NAME = "Rhino"
KIND = "cad"
PROTOCOL = "python-api"
FORMATS = ["3DM", "STEP", "IGES", "STL", "OBJ"]

try:  # pragma: no cover - only true where rhino3dm is installed / inside Rhino
    import rhino3dm  # type: ignore

    _HAS_RHINO3DM = True
except Exception:
    rhino3dm = None  # type: ignore
    _HAS_RHINO3DM = False

try:  # pragma: no cover - only true inside Rhino's Rhino.Python editor
    import Rhino  # type: ignore

    _HAS_RHINO = True
except Exception:
    Rhino = None  # type: ignore
    _HAS_RHINO = False

REASON = (
    "Rhino adapter is an unverified template: neither rhino3dm nor the in-process "
    "Rhino.Python API (Rhino) is importable in this interpreter."
)


def DESCRIPTOR() -> dict:
    return {
        "id": ID, "name": NAME, "kind": KIND, "protocol": PROTOCOL,
        "formats": list(FORMATS), "available": probe()["available"],
        "notes": REASON,
    }


def probe() -> dict:
    """Report whether a Rhino host (or rhino3dm) is reachable."""
    if _HAS_RHINO:
        return {"available": True, "reason": "Rhino.Python in-process API detected."}
    if _HAS_RHINO3DM:
        return {"available": True,
                "reason": "rhino3dm is importable (file access, no live Rhino)."}
    return {"available": False, "reason": REASON}


def dump_report(*args, **kwargs) -> dict:
    """Read a Rhino document into a host-agnostic ``ModelReport``."""
    status = probe()
    if not status.get("available"):
        raise RuntimeError("Rhino host unavailable: %s" % status.get("reason"))

    # --- sketch of the real mapping (NOT executed / NOT verified) -----------
    # if _HAS_RHINO3DM and path is not None:
    #     model = rhino3dm.File3dm.Read(path)
    #     features = [{"id": "f%d" % (i+1), "type": obj.Geometry.ObjectType,
    #                  "name": str(i), "status": "ok", "dependsOn": []}
    #                 for i, obj in enumerate(model.Objects)]
    #     return {"schema": "chase/model-report/v1", "host": ID,
    #             "model": {"name": path, "units": "mm"},
    #             "features": features, "components": [], "mates": []}
    # if _HAS_RHINO:
    #     doc = Rhino.RhinoDoc.ActiveDoc
    #     ... walk doc.Objects ...
    raise NotImplementedError(
        "dump_report() is a template; implement against rhino3dm or a live Rhino host."
    )  # pragma: no cover


def apply_plan(plan) -> dict:
    """Apply a plan to the live Rhino document, behind the review gate."""
    status = probe()
    if not status.get("available"):
        return {
            "ok": False, "mode": "simulation", "applied": [], "blocked": [],
            "wroteToCad": False,
            "message": "No Rhino host available: nothing was written to CAD.",
        }
    return {
        "ok": False, "mode": "simulation", "applied": [], "blocked": [],
        "wroteToCad": False,
        "message": ("Rhino adapter is an unverified template: automatic document "
                    "writes are disabled; apply the reviewed plan manually."),
    }


if __name__ == "__main__":  # pragma: no cover - manual smoke check
    import json
    print(json.dumps(DESCRIPTOR(), indent=2))
