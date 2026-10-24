#!/usr/bin/env python3
"""SOLIDWORKS connector — TEMPLATE (not executed here).

A skeleton connector that would talk to a running SOLIDWORKS instance over COM
(`win32com.client`) and speak the same JSON protocol as the Chase bridge and
engine (`docs/chase-spec.md` §2 / §6): it dumps a `ModelReport` from the active
document and would apply a `RepairPlan` / `AssemblyPlan` to it.

    > NOT VERIFIED AGAINST A REAL HOST. <
    A real integration needs a licensed, Windows-only SOLIDWORKS seat + the
    COM automation interface, which cannot run or be verified in this offline,
    zero-dependency environment (see `docs/risk-matrix.md`, residual risk). Every
    host import is guarded so this module imports cleanly with **no** host and
    **no** `pywin32` installed.

Public API (spec §6):
    probe()              -> {"available": bool, "reason": str}
    dump_report()        -> ModelReport   (raises if no host)
    apply_plan(plan)     -> ApplyResult   (wroteToCad stays False unless a real
                                           host is confirmed)

Usage (on a machine with SOLIDWORKS + pywin32):
    import solidworks_connector
    if solidworks_connector.probe()["available"]:
        report = solidworks_connector.dump_report()
        ...
    else:
        print(solidworks_connector.probe()["reason"])
"""

from __future__ import annotations

HOST = "solidworks"
PROTOCOL = "com"
SCHEMA_REPORT = "chase/model-report/v1"

# All host imports are guarded: absence must never raise on import.
try:  # pragma: no cover - only true on a Windows host with pywin32
    import win32com.client  # type: ignore

    _HAS_COM = True
except Exception:  # ImportError, or COM registry failures
    win32com = None  # type: ignore
    _HAS_COM = False

UNVERIFIED_REASON = (
    "SOLIDWORKS connector is an unverified template: COM automation "
    "(win32com) is not available in this interpreter."
)


def probe() -> dict:
    """Report whether a live SOLIDWORKS host is reachable via COM.

    Always returns `{"available": False, "reason": "..."}` in this environment.
    """
    if not _HAS_COM:
        return {"available": False, "reason": UNVERIFIED_REASON}
    try:  # pragma: no cover - requires a running SOLIDWORKS instance
        # GetActiveObject attaches ONLY to an already-running instance and
        # raises otherwise. Dispatch() would silently launch a fresh COM server
        # and falsely report a host, so it is deliberately not used here.
        app = win32com.client.GetActiveObject("SldWorks.Application")
        if app is None:
            return {"available": False,
                    "reason": "no running SOLIDWORKS instance was found."}
        return {"available": True, "reason": "SOLIDWORKS COM application detected."}
    except Exception as exc:  # pragma: no cover
        return {"available": False,
                "reason": "no running SOLIDWORKS instance found (%s)." % exc}


def dump_report() -> dict:
    """Read the active SOLIDWORKS document into a host-agnostic `ModelReport`.

    Only implemented for a live host; raises a clear error otherwise. The body
    below is an unexecuted sketch of the real mapping.
    """
    status = probe()
    if not status.get("available"):
        raise RuntimeError("SOLIDWORKS host unavailable: %s" % status.get("reason"))

    # --- sketch of the real mapping (NOT executed / NOT verified) -----------
    # app = win32com.client.Dispatch("SldWorks.Application")
    # model = app.ActiveDoc
    # if model is None:
    #     raise RuntimeError("No active SOLIDWORKS document.")
    # features = []
    # feat = model.FirstFeature()
    # i = 0
    # while feat is not None:
    #     i += 1
    #     features.append({
    #         "id": "f%d" % i,
    #         "type": feat.GetTypeName2(),
    #         "name": feat.Name,
    #         "status": "ok",
    #         "error": "",
    #         "dependsOn": [],
    #     })
    #     feat = feat.GetNextFeature()
    # title = model.GetTitle
    # return {"schema": SCHEMA_REPORT, "host": HOST,
    #         "model": {"name": title, "units": "mm"},
    #         "features": features, "components": [], "mates": []}
    raise NotImplementedError(
        "dump_report() body is a template; implement against a real SOLIDWORKS host."
    )  # pragma: no cover


def apply_plan(plan) -> dict:
    """Apply a plan to the active SOLIDWORKS document, behind the review gate.

    Returns a spec §5 `ApplyResult`. Without a confirmed real host this returns
    `wroteToCad: False` and applies nothing.
    """
    status = probe()
    if not status.get("available"):
        return {
            "ok": False,
            "mode": "simulation",
            "applied": [],
            "blocked": [],
            "wroteToCad": False,
            "message": "No SOLIDWORKS host available: nothing was written to CAD.",
        }

    return {
        "ok": False,
        "mode": "simulation",
        "applied": [],
        "blocked": [],
        "wroteToCad": False,
        "message": ("SOLIDWORKS connector is an unverified template: automatic "
                    "CAD writes are disabled; apply the reviewed plan manually."),
    }


if __name__ == "__main__":  # pragma: no cover - manual smoke check
    import json
    print(json.dumps(probe(), indent=2))
