#!/usr/bin/env python3
"""Onshape adapter — TEMPLATE (not executed here).

Talks to Onshape through its public **REST API** (documents / parts / assemblies
endpoints) using ``urllib`` from the standard library — no third-party client.
Speaks the same JSON as the Chase bridge/engine (`docs/chase-spec.md` §2 / §6).

    > NOT VERIFIED AGAINST A REAL HOST. <
    A real integration needs an Onshape account, an API key + secret, and network
    access. Chase is offline-first and makes **no** network call on import or
    probe, so this adapter reports ``available: False`` here. Nothing here ever
    reads a secret from a hard-coded value.

Public API (spec §5):
    DESCRIPTOR() / probe() / dump_report() / apply_plan(plan)
"""

from __future__ import annotations

ID = "onshape"
NAME = "Onshape"
KIND = "cad"
PROTOCOL = "rest"
FORMATS = ["STEP", "IGES", "STL", "OBJ", "PARASOLID"]

# No host import is needed for REST; urllib is stdlib. Imported lazily inside
# dump_report() so importing this module never touches the network stack.
BASE_URL = "https://cad.onshape.com/api"

REASON = (
    "Onshape adapter is an unverified template: the REST API needs credentials "
    "and network access, which are not configured in this offline environment."
)


def DESCRIPTOR() -> dict:
    return {
        "id": ID, "name": NAME, "kind": KIND, "protocol": PROTOCOL,
        "formats": list(FORMATS), "available": probe()["available"],
        "notes": REASON,
    }


def probe() -> dict:
    """Report whether a live Onshape REST session is configured.

    Always unavailable here: no API key/secret is present and no network call is
    attempted. A real deploy would check for configured credentials instead.
    """
    import os

    key = os.environ.get("ONSHAPE_API_KEY")
    secret = os.environ.get("ONSHAPE_API_SECRET")
    if not key or not secret:
        return {"available": False, "reason": REASON}
    # Credentials exist, but Chase deliberately does not perform a network probe.
    return {"available": False,
            "reason": ("Onshape credentials are configured but no network probe is "
                       "performed from this offline environment.")}


def dump_report(*args, **kwargs) -> dict:
    """Read an Onshape document into a host-agnostic ``ModelReport`` (via REST)."""
    status = probe()
    if not status.get("available"):
        raise RuntimeError("Onshape host unavailable: %s" % status.get("reason"))

    # --- sketch of the real mapping (NOT executed / NOT verified) -----------
    # import base64, json, urllib.request
    # creds = base64.b64encode(("%s:%s" % (key, secret)).encode()).decode()
    # req = urllib.request.Request(BASE_URL + "/documents",
    #         headers={"Authorization": "Basic " + creds, "Accept": "application/json"})
    # with urllib.request.urlopen(req, timeout=30) as resp:
    #     docs = json.loads(resp.read().decode("utf-8"))
    # ... map features/assemblies -> ModelReport ...
    raise NotImplementedError(
        "dump_report() is a template; implement against a real Onshape account."
    )  # pragma: no cover


def apply_plan(plan) -> dict:
    """Apply a plan to Onshape through REST, behind the review gate."""
    status = probe()
    if not status.get("available"):
        return {
            "ok": False, "mode": "simulation", "applied": [], "blocked": [],
            "wroteToCad": False,
            "message": "No Onshape session available: nothing was sent over the API.",
        }
    return {
        "ok": False, "mode": "simulation", "applied": [], "blocked": [],
        "wroteToCad": False,
        "message": ("Onshape adapter is an unverified template: automatic API "
                    "writes are disabled; apply the reviewed plan manually."),
    }


if __name__ == "__main__":  # pragma: no cover - manual smoke check
    import json
    print(json.dumps(DESCRIPTOR(), indent=2))
