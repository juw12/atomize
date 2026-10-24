#!/usr/bin/env python3
"""Vertex universal adapter layer — base protocol + registry.

Vertex works with *any* 3D tool through **adapters**. An adapter speaks the same
host-agnostic JSON as the engine and the bridge (`docs/vertex-spec.md` §2) and
reports whether a live host is reachable. This module is the shared spine:

  * ``DESCRIPTOR(...)`` — build one spec §1.4 adapter descriptor;
  * ``Adapter`` — the base protocol every adapter follows
    (``probe()`` / ``dump_report()`` / ``apply_plan()`` / ``descriptor()``);
  * ``registry()`` — the full, ordered adapter list (>= 12 entries) used by both
    ``GET /api/adapters`` and the cockpit's offline fallback.

Everything here is **Python standard library only** and **import-safe**: no host
library is imported unconditionally (each ``*_adapter`` module guards its own
host imports), and no network call is ever made. Host adapters therefore report
``available: False`` in this environment; the ``simulated`` core and the
``generic-format`` file adapter are genuinely ``available: True``.

See ``docs/adapters.md`` for the install story behind each entry.
"""

from __future__ import annotations

import importlib.util
from pathlib import Path

SCHEMA_ADAPTER = "vertex/adapter/v1"

_ADAPTERS_DIR = Path(__file__).resolve().parent     # .../apps/vertex/connectors/adapters
_CONNECTORS_DIR = _ADAPTERS_DIR.parent              # .../apps/vertex/connectors

# The per-file adapters shipped next to this module (import-safe templates).
_ADAPTER_MODULES = [
    "freecad_adapter",
    "blender_adapter",
    "onshape_adapter",
    "rhino_adapter",
    "sketchup_adapter",
    "inventor_adapter",
    "autocad_adapter",
    "generic_format_adapter",
]


# ---------------------------------------------------------------------------
# Descriptor + Adapter protocol
# ---------------------------------------------------------------------------


def DESCRIPTOR(id, name, kind, protocol, formats, available=False, notes=""):
    """Build a spec §1.4 Adapter descriptor (plain dict, JSON-serialisable).

    ``kind`` ∈ ``cad | mesh | format``; ``protocol`` ∈
    ``python-api | com | rest | cli | file``.
    """
    return {
        "id": id,
        "name": name,
        "kind": kind,
        "protocol": protocol,
        "formats": list(formats),
        "available": bool(available),
        "notes": notes,
    }


class Adapter:
    """Base protocol for every Vertex adapter (subclass and fill the constants).

    Subclasses set ``ID`` / ``NAME`` / ``KIND`` / ``PROTOCOL`` / ``FORMATS`` and
    override ``probe()`` / ``dump_report()`` / ``apply_plan()``. The defaults are
    deliberately honest: an unimplemented adapter reports *unavailable* and never
    claims a CAD write.
    """

    ID = ""
    NAME = ""
    KIND = "cad"
    PROTOCOL = "file"
    FORMATS = ()
    NOTES = ""

    def probe(self):
        return {"available": False, "reason": "No host is present in this environment."}

    def descriptor(self):
        status = self.probe()
        return DESCRIPTOR(
            self.ID, self.NAME, self.KIND, self.PROTOCOL, self.FORMATS,
            available=bool(status.get("available")), notes=self.NOTES,
        )

    def dump_report(self, *args, **kwargs):
        raise NotImplementedError(
            "%s: dump_report() requires a real host." % (self.ID or "adapter"))

    def apply_plan(self, plan):
        return {
            "ok": False,
            "mode": "simulation",
            "applied": [],
            "blocked": [],
            "wroteToCad": False,
            "message": "No live host: nothing was written to CAD.",
        }


# ---------------------------------------------------------------------------
# Import-safe module loading (by file path; cwd-independent)
# ---------------------------------------------------------------------------


def _load_module(name, path):
    """Import a module from an explicit path without touching sys.path."""
    spec = importlib.util.spec_from_file_location(name, str(path))
    if spec is None or spec.loader is None:
        raise ImportError("cannot load %s" % path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _load_adapter(stem):
    return _load_module("vertex_adapter_" + stem, _ADAPTERS_DIR / (stem + ".py"))


# ---------------------------------------------------------------------------
# Registry
# ---------------------------------------------------------------------------


def _host_descriptor(stem, id, name, kind, protocol, formats, notes):
    """Descriptor for one per-file host adapter (available from its probe())."""
    module = _load_adapter(stem)
    descriptor = module.DESCRIPTOR()
    # Normalise: keep the registry keys exactly as this module defines them.
    descriptor["id"] = id
    descriptor["name"] = name
    descriptor["kind"] = kind
    descriptor["protocol"] = protocol
    descriptor["formats"] = list(formats)
    if not descriptor.get("notes"):
        descriptor["notes"] = notes
    return descriptor


def _connector_descriptor(stem, id, name, kind, protocol, formats, notes):
    """Descriptor for a connector in ``connectors/`` (Fusion / SOLIDWORKS)."""
    available = False
    try:
        module = _load_module("vertex_connector_" + stem, _CONNECTORS_DIR / (stem + ".py"))
        available = bool(module.probe().get("available"))
    except Exception:  # never fail the registry because one probe blew up
        available = False
    return DESCRIPTOR(id, name, kind, protocol, formats, available, notes)


def _inline_descriptors():
    """Additional universal adapters shipped as descriptors only (no host here)."""
    return [
        DESCRIPTOR(
            "catia", "CATIA", "cad", "com",
            ["CATPart", "CATProduct", "STEP", "STL"], False,
            "Unverified template: no CATIA COM host is available in this environment."),
        DESCRIPTOR(
            "solid-edge", "Solid Edge", "cad", "com",
            ["PAR", "ASM", "STEP", "STL"], False,
            "Unverified template: no Solid Edge COM host is available in this environment."),
        DESCRIPTOR(
            "maya", "Autodesk Maya", "mesh", "python-api",
            ["MA", "OBJ", "FBX", "STL"], False,
            "Unverified template: no Maya (maya.cmds) host is available in this environment."),
        DESCRIPTOR(
            "creo", "PTC Creo", "cad", "cli",
            ["PRT", "ASM", "STEP", "STL"], False,
            "Unverified template: no Creo toolkit host is available in this environment."),
    ]


def _simulated_descriptor():
    return DESCRIPTOR(
        "simulated", "Simulation core", "mesh", "in-process", ["internal"], True,
        "Built-in deterministic simulation core (engine + bridge); always available.")


def registry():
    """Return the full, ordered list of Adapter descriptors (>= 12).

    Order: the two shipped host connectors (Fusion, SOLIDWORKS), then the
    universal per-file adapters, then descriptor-only universals, then the
    built-in ``simulated`` core last.
    """
    out = []

    out.append(_connector_descriptor(
        "fusion_addin", "fusion", "Autodesk Fusion", "cad", "python-api",
        ["F3D", "STEP", "IGES", "STL", "OBJ"],
        "Unverified template: the adsk Python API is not available here."))
    out.append(_connector_descriptor(
        "solidworks_connector", "solidworks", "SOLIDWORKS", "cad", "com",
        ["SLDPRT", "SLDASM", "STEP", "IGES", "STL"],
        "Unverified template: COM automation (win32com) is not available here."))

    for stem in _ADAPTER_MODULES:
        try:
            out.append(_load_adapter(stem).DESCRIPTOR())
        except Exception:
            # A broken adapter must never take down the whole registry.
            continue

    out.extend(_inline_descriptors())
    out.append(_simulated_descriptor())
    return out


# Convenience alias (spec §5 calls it "a registry function").
adapters = registry


if __name__ == "__main__":  # pragma: no cover - manual smoke check
    import json
    print(json.dumps({"adapters": registry()}, indent=2))
