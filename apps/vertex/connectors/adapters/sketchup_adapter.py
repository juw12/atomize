#!/usr/bin/env python3
"""SketchUp adapter — TEMPLATE (not executed here).

SketchUp's automation API is **Ruby** (``Sketchup`` module), not Python. Vertex is
a Python/stdlib project, so this adapter ships as a **Python stub** that probes
for availability and documents the real work with a ready-to-run **Ruby snippet**
(``RUBY_SNIPPET``) that a user would load via *Extensions* or the Ruby Console.
The Ruby side speaks the same JSON as the Vertex bridge/engine.

    > NOT VERIFIED AGAINST A REAL HOST. <
    There is no Ruby / SketchUp host in this environment, so this module imports
    cleanly and reports ``available: False``.

Public API (spec §5):
    DESCRIPTOR() / probe() / dump_report() / apply_plan(plan)
    RUBY_SNIPPET  -> str   (the .rb the user runs inside SketchUp)
"""

from __future__ import annotations

ID = "sketchup"
NAME = "SketchUp"
KIND = "cad"
PROTOCOL = "cli"
FORMATS = ["SKP", "STL", "OBJ", "DAE"]

REASON = (
    "SketchUp adapter is an unverified template: SketchUp's automation API is "
    "Ruby (the Sketchup module), not available in this Python environment."
)

# The real connector body, in the host's own language. A user runs this inside
# SketchUp (Ruby Console or a packaged Extension) to dump the model JSON.
RUBY_SNIPPET = r'''# vertex_sketchup_connector.rb — run inside SketchUp (Ruby Console / Extension)
# Dumps the active model as a Vertex ModelReport (docs/vertex-spec.md §2.1).
require 'json'

module VertexSketchup
  def self.probe
    { available: true, reason: 'SketchUp Ruby API is running.' }.to_json
  end

  def self.dump_report
    model = Sketchup.active_model
    features = []
    model.entities.each_with_index do |e, i|
      next unless e.is_a?(Sketchup::Group) || e.is_a?(Sketchup::ComponentInstance)
      features << {
        id: "f#{i + 1}",
        type: (e.respond_to?(:definition) ? 'component' : 'group'),
        name: (e.name.to_s.empty? ? "Feature#{i + 1}" : e.name),
        status: 'ok',
        error: '',
        dependsOn: []
      }
    end
    {
      schema: 'vertex/model-report/v1',
      host: 'sketchup',
      model: { name: model.title.to_s.empty? ? 'SketchUp model' : model.title, units: 'mm' },
      features: features,
      components: [],
      mates: []
    }.to_json
  end
end

# puts VertexSketchup.probe
# puts VertexSketchup.dump_report
'''


def DESCRIPTOR() -> dict:
    return {
        "id": ID, "name": NAME, "kind": KIND, "protocol": PROTOCOL,
        "formats": list(FORMATS), "available": probe()["available"],
        "notes": REASON,
    }


def probe() -> dict:
    """Report whether a SketchUp Ruby host is reachable (never, from Python)."""
    return {"available": False, "reason": REASON}


def dump_report(*args, **kwargs) -> dict:
    """Read a SketchUp model into a ``ModelReport`` — via the Ruby snippet.

    Cannot run from Python: the host API is Ruby. Raises with a pointer to
    ``RUBY_SNIPPET`` so the path forward is clear.
    """
    raise NotImplementedError(
        "SketchUp's API is Ruby: run RUBY_SNIPPET inside SketchUp, then feed the "
        "resulting ModelReport JSON back into Vertex."
    )


def apply_plan(plan) -> dict:
    """SketchUp writes happen in Ruby; from Python nothing is written."""
    return {
        "ok": False, "mode": "simulation", "applied": [], "blocked": [],
        "wroteToCad": False,
        "message": ("SketchUp adapter is a Python stub: no host available, so "
                    "nothing was written. Use RUBY_SNIPPET inside SketchUp."),
    }


if __name__ == "__main__":  # pragma: no cover - manual smoke check
    import json
    print(json.dumps(DESCRIPTOR(), indent=2))
