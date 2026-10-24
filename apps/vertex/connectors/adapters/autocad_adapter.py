#!/usr/bin/env python3
"""AutoCAD adapter — TEMPLATE (not executed here).

Drives AutoCAD through **COM** automation via ``win32com.client`` (``AcadApplication``).
Speaks the same JSON as the Vertex bridge/engine (`docs/vertex-spec.md` §2 / §6).

    > NOT VERIFIED AGAINST A REAL HOST. <
    A real integration needs a licensed Windows-only AutoCAD seat and
    ``pywin32``. The COM import is guarded so this module imports cleanly with
    **no** host and **no** ``pywin32`` installed.

Public API (spec §5):
    DESCRIPTOR() / probe() / dump_report() / apply_plan(plan)
"""

from __future__ import annotations

ID = "autocad"
NAME = "AutoCAD"
KIND = "cad"
PROTOCOL = "com"
FORMATS = ["DWG", "DXF", "STL", "OBJ"]

try:  # pragma: no cover - only true on Windows with pywin32
    import win32com.client  # type: ignore

    _HAS_COM = True
except Exception:
    win32com = None  # type: ignore
    _HAS_COM = False

REASON = (
    "AutoCAD adapter is an unverified template: COM automation (win32com) is "
    "not available in this interpreter."
)


def DESCRIPTOR() -> dict:
    return {
        "id": ID, "name": NAME, "kind": KIND, "protocol": PROTOCOL,
        "formats": list(FORMATS), "available": probe()["available"],
        "notes": REASON,
    }


def probe() -> dict:
    """Report whether a live AutoCAD host is reachable via COM."""
    if not _HAS_COM:
        return {"available": False, "reason": REASON}
    try:  # pragma: no cover - requires a running AutoCAD instance
        app = win32com.client.GetActiveObject("AutoCAD.Application")
        if app is None:
            return {"available": False, "reason": "no running AutoCAD instance found."}
        return {"available": True, "reason": "AutoCAD COM application detected."}
    except Exception as exc:  # pragma: no cover
        return {"available": False,
                "reason": "no running AutoCAD instance found (%s)." % exc}


def dump_report(*args, **kwargs) -> dict:
    """Read the active AutoCAD drawing into a host-agnostic ``ModelReport``."""
    status = probe()
    if not status.get("available"):
        raise RuntimeError("AutoCAD host unavailable: %s" % status.get("reason"))

    # --- sketch of the real mapping (NOT executed / NOT verified) -----------
    # app = win32com.client.GetActiveObject("AutoCAD.Application")
    # doc = app.ActiveDocument
    # features = [{"id": "f%d" % (i+1), "type": e.ObjectName, "name": e.ObjectName,
    #              "status": "ok", "dependsOn": []}
    #             for i, e in enumerate(doc.ModelSpace)]
    # return {"schema": "vertex/model-report/v1", "host": ID,
    #         "model": {"name": doc.Name, "units": "mm"},
    #         "features": features, "components": [], "mates": []}
    raise NotImplementedError(
        "dump_report() is a template; implement against a live AutoCAD host."
    )  # pragma: no cover


def apply_plan(plan) -> dict:
    """Apply a plan to the live AutoCAD drawing, behind the review gate."""
    status = probe()
    if not status.get("available"):
        return {
            "ok": False, "mode": "simulation", "applied": [], "blocked": [],
            "wroteToCad": False,
            "message": "No AutoCAD host available: nothing was written to CAD.",
        }
    return {
        "ok": False, "mode": "simulation", "applied": [], "blocked": [],
        "wroteToCad": False,
        "message": ("AutoCAD adapter is an unverified template: automatic drawing "
                    "writes are disabled; apply the reviewed plan manually."),
    }


if __name__ == "__main__":  # pragma: no cover - manual smoke check
    import json
    print(json.dumps(DESCRIPTOR(), indent=2))
