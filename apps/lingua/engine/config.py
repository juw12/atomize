"""Settings persistence for Lingua.

Config lives at ``%APPDATA%\\lingua\\config.json`` on Windows (falling back to
``~`` when ``APPDATA`` is unset). ``load()`` always returns a dict merged over
``DEFAULTS`` so callers never see missing keys.
"""

from __future__ import annotations

import json
import os

APP_NAME = "lingua"

#: Hard-coded defaults. Every key here is guaranteed to exist after ``load()``.
DEFAULTS: dict = {
    "region": None,            # [x, y, w, h] or None (not yet selected)
    "source_lang": "Auto (detect)",
    "target_lang": "繁體中文",
    "poll_ms": 200,            # idle polling interval between captures
    "ocr_max_width": 640,      # downscale the crop before OCR (latency)
    "ocr_model": "deepseek-ai/DeepSeek-OCR-2",
    "llm_model": "translate-default",  # translation model on the gateway
    "font_size": 20,
    "opacity": 0.85,           # 0.55 - 1.0
    "click_through": False,
    "overlay_xy": None,        # [x, y] or None
    "theme": "dark",           # "dark" or "light"
}


def config_path() -> str:
    """Absolute path to the JSON config file (may not exist yet)."""
    base = os.environ.get("APPDATA") or os.path.expanduser("~")
    return os.path.join(base, APP_NAME, "config.json")


def load() -> dict:
    """Return ``DEFAULTS`` merged with the on-disk config (on-disk wins).

    A missing or unreadable file yields plain defaults; never raises.
    """
    cfg = dict(DEFAULTS)
    try:
        with open(config_path(), "r", encoding="utf-8") as fh:
            data = json.load(fh)
    except (OSError, ValueError):
        return cfg
    if isinstance(data, dict):
        cfg.update(data)
    return cfg


def save(cfg: dict) -> None:
    """Persist ``cfg`` as pretty UTF-8 JSON, creating the parent dir if needed."""
    path = config_path()
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as fh:
        json.dump(cfg, fh, indent=2, ensure_ascii=False)
