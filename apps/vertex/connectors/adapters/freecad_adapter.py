#!/usr/bin/env python3
"""FreeCAD adapter — TEMPLATE (not executed here).

Talks to FreeCAD through its bundled Python API (``FreeCAD`` + ``Part``), which
is how a real FreeCAD macro/addon reads and edits a document. Speaks the same
JSON as the Vertex bridge/engine (`docs/vertex-spec.md` §2 / §6): dump a
``ModelReport`` from the active document, and (in a real host) apply a reviewed
``RepairPlan`` / ``AssemblyPlan``.

    > NOT VERIFIED AGAINST A REAL HOST. <
    A real integration needs a FreeCAD install running this as a macro inside
    FreeCAD's embedded interpreter. Every host import is guarded so this module
    imports cleanly with **no** FreeCAD present.

Public API (spec §5):
    DESCRIPTOR()          -> dict
    probe()               -> {"available": bool, "reason": str}
    dump_report()         -> ModelReport   (raises if no host)
    apply_plan(plan)      -> ApplyResult   (wroteToCad false unless a host is
                                            confirmed AND the write path is enabled)
"""

from __future__ import annotations

ID = "freecad"
NAME = "FreeCAD"
KIND = "cad"
PROTOCOL = "python-api"
FORMATS = ["FCStd", "STEP", "IGES", "STL", "OBJ"]

# All host imports are guarded: absence must never raise on import.
try:  # pragma: no cover - only true inside a FreeCAD macro
    import FreeCAD  # type: ignore
    import Part  # type: ignore

    _HAS_FREECAD = True
except Exception:
    FreeCAD = None  # type: ignore
    Part = None  # type: ignore
    _HAS_FREECAD = False

REASON = (
    "FreeCAD adapter is an unverified template: the FreeCAD Python API "
    "(FreeCAD/Part) is not importable in this interpreter."
)


def DESCRIPTOR() -> dict:
    return {
        "id": ID, "name": NAME, "kind": KIND, "protocol": PROTOCOL,
        "formats": list(FORMATS), "available": probe()["available"],
        "notes": REASON,
    }


def probe() -> dict:
    """Report whether a live FreeCAD host is reachable."""
    if not _HAS_FREECAD:
        return {"available": False, "reason": REASON}
    try:  # pragma: no cover - requires a running FreeCAD
        doc = getattr(FreeCAD, "ActiveDocument", None)
        if doc is None:
            return {"available": False,
                    "reason": "FreeCAD imported but no document is open."}
        return {"available": True, "reason": "FreeCAD active document detected."}
    except Exception as exc:  # pragma: no cover
        return {"available": False, "reason": "FreeCAD probe failed: %s" % exc}


def dump_report(*args, **kwargs) -> dict:
    """Read the active FreeCAD document into a host-agnostic ``ModelReport``.

    Only implemented for a live host; raises a clear error otherwise. The body
    is an unexecuted sketch of the real mapping.
    """
    status = probe()
    if not status.get("available"):
        raise RuntimeError("FreeCAD host unavailable: %s" % status.get("reason"))

    # --- sketch of the real mapping (NOT executed / NOT verified) -----------
    # doc = FreeCAD.ActiveDocument
    # features = []
    # for i, obj in enumerate(doc.Objects):
    #     features.append({
    #         "id": "f%d" % (i + 1),
    #         "type": obj.TypeId,
    #         "name": obj.Label,
    #         "status": "ok" if obj.State in ("Valid", "Touched") else "failed",
    #         "error": "",
    #         "dependsOn": [],
    #     })
    # return {"schema": "vertex/model-report/v1", "host": ID,
    #         "model": {"name": doc.Label, "units": "mm"},
    #         "features": features, "components": [], "mates": []}
    raise NotImplementedError(
        "dump_report() is a template; implement against a live FreeCAD host."
    )  # pragma: no cover


def apply_plan(plan) -> dict:
    """Apply a plan to the live FreeCAD document, behind the review gate."""
    status = probe()
    if not status.get("available"):
        return {
            "ok": False, "mode": "simulation", "applied": [], "blocked": [],
            "wroteToCad": False,
            "message": "No FreeCAD host available: nothing was written to CAD.",
        }
    return {
        "ok": False, "mode": "simulation", "applied": [], "blocked": [],
        "wroteToCad": False,
        "message": ("FreeCAD adapter is an unverified template: automatic CAD "
                    "writes are disabled; apply the reviewed plan manually."),
    }


if __name__ == "__main__":  # pragma: no cover - manual smoke check
    import json
    print(json.dumps(DESCRIPTOR(), indent=2))
