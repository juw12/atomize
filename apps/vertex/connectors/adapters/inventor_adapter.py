#!/usr/bin/env python3
"""Autodesk Inventor adapter — TEMPLATE (not executed here).

Drives Autodesk Inventor through its **COM** automation interface via
``win32com.client``. Speaks the same JSON as the Vertex bridge/engine
(`docs/vertex-spec.md` §2 / §6).

    > NOT VERIFIED AGAINST A REAL HOST. <
    A real integration needs a licensed Windows-only Inventor seat and
    ``pywin32``. The COM import is guarded so this module imports cleanly with
    **no** host and **no** ``pywin32`` installed.

Public API (spec §5):
    DESCRIPTOR() / probe() / dump_report() / apply_plan(plan)
"""

from __future__ import annotations

ID = "inventor"
NAME = "Autodesk Inventor"
KIND = "cad"
PROTOCOL = "com"
FORMATS = ["IPT", "IAM", "IDW", "STEP", "IGES", "STL"]

try:  # pragma: no cover - only true on Windows with pywin32
    import win32com.client  # type: ignore

    _HAS_COM = True
except Exception:
    win32com = None  # type: ignore
    _HAS_COM = False

REASON = (
    "Inventor adapter is an unverified template: COM automation (win32com) is "
    "not available in this interpreter."
)


def DESCRIPTOR() -> dict:
    return {
        "id": ID, "name": NAME, "kind": KIND, "protocol": PROTOCOL,
        "formats": list(FORMATS), "available": probe()["available"],
        "notes": REASON,
    }


def probe() -> dict:
    """Report whether a live Inventor host is reachable via COM."""
    if not _HAS_COM:
        return {"available": False, "reason": REASON}
    try:  # pragma: no cover - requires a running Inventor instance
        # GetActiveObject attaches ONLY to a running instance so we never launch
        # a fresh COM server and falsely report a host.
        app = win32com.client.GetActiveObject("Inventor.Application")
        if app is None:
            return {"available": False, "reason": "no running Inventor instance found."}
        return {"available": True, "reason": "Inventor COM application detected."}
    except Exception as exc:  # pragma: no cover
        return {"available": False,
                "reason": "no running Inventor instance found (%s)." % exc}


def dump_report(*args, **kwargs) -> dict:
    """Read the active Inventor document into a host-agnostic ``ModelReport``."""
    status = probe()
    if not status.get("available"):
        raise RuntimeError("Inventor host unavailable: %s" % status.get("reason"))

    # --- sketch of the real mapping (NOT executed / NOT verified) -----------
    # app = win32com.client.GetActiveObject("Inventor.Application")
    # doc = app.ActiveDocument
    # compdef = doc.ComponentDefinition
    # features = [{"id": "f%d" % (i+1), "type": f.Type, "name": f.Name,
    #              "status": "ok", "dependsOn": []}
    #             for i, f in enumerate(compdef.Features)]
    # return {"schema": "vertex/model-report/v1", "host": ID,
    #         "model": {"name": doc.DisplayName, "units": "mm"},
    #         "features": features, "components": [], "mates": []}
    raise NotImplementedError(
        "dump_report() is a template; implement against a live Inventor host."
    )  # pragma: no cover


def apply_plan(plan) -> dict:
    """Apply a plan to the live Inventor document, behind the review gate."""
    status = probe()
    if not status.get("available"):
        return {
            "ok": False, "mode": "simulation", "applied": [], "blocked": [],
            "wroteToCad": False,
            "message": "No Inventor host available: nothing was written to CAD.",
        }
    return {
        "ok": False, "mode": "simulation", "applied": [], "blocked": [],
        "wroteToCad": False,
        "message": ("Inventor adapter is an unverified template: automatic CAD "
                    "writes are disabled; apply the reviewed plan manually."),
    }


if __name__ == "__main__":  # pragma: no cover - manual smoke check
    import json
    print(json.dumps(DESCRIPTOR(), indent=2))
