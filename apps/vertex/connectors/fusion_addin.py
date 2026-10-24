#!/usr/bin/env python3
"""Autodesk Fusion 360 connector — TEMPLATE (not executed here).

A skeleton connector that would run inside Fusion 360 (as an add-in or script)
and speak the same JSON protocol as the Vertex bridge and engine
(`docs/vertex-spec.md` §2 / §6): it dumps a `ModelReport` from the live design
and would apply a `RepairPlan` / `AssemblyPlan` to it.

    > NOT VERIFIED AGAINST A REAL HOST. <
    A real integration needs a licensed Fusion install + the `adsk` Python API,
    which cannot run or be verified in this offline, zero-dependency environment
    (see `docs/risk-matrix.md`, residual risk). This file exists so the protocol
    is real and the host calls are clearly marked; every host import is guarded
    so this module imports cleanly with **no** Fusion present.

Public API (spec §6):
    probe()              -> {"available": bool, "reason": str}
    dump_report()        -> ModelReport   (raises if no host)
    apply_plan(plan)     -> ApplyResult   (wroteToCad stays False unless a real
                                           host is confirmed)

Usage (inside Fusion's Python environment):
    import fusion_addin
    if fusion_addin.probe()["available"]:
        report = fusion_addin.dump_report()
        ...
    else:
        print(fusion_addin.probe()["reason"])
"""

from __future__ import annotations

HOST = "fusion"
PROTOCOL = "python-api"
SCHEMA_REPORT = "vertex/model-report/v1"

# All host imports are guarded: absence must never raise on import.
try:  # pragma: no cover - only true inside Fusion 360
    import adsk.core  # type: ignore
    import adsk.fusion  # type: ignore

    _HAS_FUSION_API = True
except Exception:  # ImportError, or any host-specific failure
    adsk = None  # type: ignore
    _HAS_FUSION_API = False

# Honest status surfaced everywhere.
UNVERIFIED_REASON = (
    "Fusion connector is an unverified template: the adsk Python API is not "
    "available in this interpreter."
)


def probe() -> dict:
    """Report whether a live Fusion host is reachable.

    Always returns `{"available": False, "reason": "..."}` in this environment.
    """
    if not _HAS_FUSION_API:
        return {"available": False, "reason": UNVERIFIED_REASON}
    try:  # pragma: no cover - requires a running Fusion app
        app = adsk.core.Application.get()
        if app is None:
            return {"available": False,
                    "reason": "adsk imported but no running Fusion application found."}
        doc = app.activeDocument
        if doc is None:
            return {"available": False, "reason": "Fusion is running but no document is open."}
        return {"available": True, "reason": "Fusion application and active document detected."}
    except Exception as exc:  # pragma: no cover
        return {"available": False, "reason": "Fusion probe failed: %s" % exc}


def dump_report() -> dict:
    """Read the active Fusion design into a host-agnostic `ModelReport`.

    Only implemented for a live host; raises a clear error otherwise. The body
    below is an unexecuted sketch of the real mapping.
    """
    status = probe()
    if not status.get("available"):
        raise RuntimeError("Fusion host unavailable: %s" % status.get("reason"))

    # --- sketch of the real mapping (NOT executed / NOT verified) -----------
    # app = adsk.core.Application.get()
    # design = adsk.fusion.Design.cast(app.activeDocument.products.itemByProductType("FusionDesignProductType"))
    # root = design.rootComponent
    # features = []
    # for i, feat in enumerate(root.features):
    #     features.append({
    #         "id": "f%d" % (i + 1),
    #         "type": _feature_type(feat),
    #         "name": feat.name,
    #         "status": "ok" if feat.isValid else "failed",
    #         "error": getattr(feat, "errorOrWarningMessage", "") if not feat.isValid else "",
    #         "dependsOn": [],  # resolve from the timeline
    #     })
    # return {"schema": SCHEMA_REPORT, "host": HOST,
    #         "model": {"name": root.name, "units": "mm"},
    #         "features": features, "components": [], "mates": []}
    raise NotImplementedError(
        "dump_report() body is a template; implement against a real Fusion host."
    )  # pragma: no cover


def apply_plan(plan) -> dict:
    """Apply a plan to the live Fusion model, behind the review gate.

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
            "message": "No Fusion host available: nothing was written to CAD.",
        }

    # A real host is required even to reach here; the write path is a template
    # and is intentionally NOT enabled, so we still refuse to claim a CAD write.
    return {
        "ok": False,
        "mode": "simulation",
        "applied": [],
        "blocked": [],
        "wroteToCad": False,
        "message": ("Fusion connector is an unverified template: automatic CAD "
                    "writes are disabled; apply the reviewed plan manually."),
    }


if __name__ == "__main__":  # pragma: no cover - manual smoke check
    import json
    print(json.dumps(probe(), indent=2))
