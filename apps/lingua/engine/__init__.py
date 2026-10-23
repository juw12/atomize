"""Lingua headless engine.

Importable and testable on its own: no tkinter, and nothing here talks to the
network at import time. See ``CONTRACT.md`` for the frozen interfaces.
"""

__all__ = ["config", "maas", "capture", "pipeline"]
