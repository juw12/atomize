"""
Tiny observability layer for the D agent.

Every event is appended as one JSON line to `traces.jsonl` in the agent folder.
If BOTH Langfuse keys are set AND the `langfuse` package is installed, events
are also forwarded to Langfuse; otherwise it silently stays local-only.

Enable Langfuse:
    pip install langfuse
    $env:LANGFUSE_PUBLIC_KEY="pk-..."; $env:LANGFUSE_SECRET_KEY="sk-..."
    # optional: $env:LANGFUSE_HOST="https://cloud.langfuse.com"
"""
from __future__ import annotations

import json
import os
import time
from pathlib import Path

TRACE_FILE = Path(__file__).resolve().parent / "traces.jsonl"


class Tracer:
    def __init__(self, name: str = "d-agent") -> None:
        self.name = name
        self._langfuse = None
        try:
            if os.environ.get("LANGFUSE_PUBLIC_KEY") and os.environ.get("LANGFUSE_SECRET_KEY"):
                from langfuse import Langfuse  # type: ignore

                self._langfuse = Langfuse()
        except Exception:  # noqa: BLE001
            self._langfuse = None

    def event(self, event: str, **fields) -> None:
        record = {"ts": round(time.time(), 3), "agent": self.name, "event": event, **fields}
        try:
            with TRACE_FILE.open("a", encoding="utf-8") as fh:
                fh.write(json.dumps(record, default=str) + "\n")
        except Exception:  # noqa: BLE001
            pass
        if self._langfuse is not None:
            try:
                self._langfuse.create_event(name=event, metadata=fields)
            except Exception:  # noqa: BLE001
                pass
