"""On-device scan history for the desktop Read-picture window.

Stored as UTF-8 JSON at ``%APPDATA%\\lingua\\history.json`` (next to
``config.json``). Newest first, capped at :data:`MAX_ENTRIES`. Text only, no
pictures, so the file stays small. Never raises on a broken file.
"""

from __future__ import annotations

import json
import os
import time
import uuid

from engine import config

MAX_ENTRIES = 100


def history_path() -> str:
    return os.path.join(os.path.dirname(config.config_path()), "history.json")


def load() -> list[dict]:
    try:
        with open(history_path(), "r", encoding="utf-8") as fh:
            data = json.load(fh)
    except (OSError, ValueError):
        return []
    return [e for e in data if isinstance(e, dict) and e.get("text")] if isinstance(data, list) else []


def _save(entries: list[dict]) -> None:
    path = history_path()
    os.makedirs(os.path.dirname(path), exist_ok=True)
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as fh:
        json.dump(entries[:MAX_ENTRIES], fh, ensure_ascii=False, indent=1)
    os.replace(tmp, path)


def add(text: str, translation: str | None = None, target: str | None = None,
        source: str = "picture", words: int | None = None) -> dict | None:
    """Prepend a scan; returns the entry (``None`` for empty text)."""
    text = (text or "").strip()
    if not text:
        return None
    entry = {
        "id": uuid.uuid4().hex[:10],
        "at": time.time(),
        "text": text,
        "translation": translation or "",
        "target": target or "",
        "source": source,
        "words": words if words is not None else len(text.split()),
    }
    entries = [e for e in load() if e.get("text") != text]  # no duplicates of the same scan
    entries.insert(0, entry)
    _save(entries)
    return entry


def update_translation(entry_id: str, translation: str, target: str) -> None:
    entries = load()
    for entry in entries:
        if entry.get("id") == entry_id:
            entry["translation"] = translation
            entry["target"] = target
            _save(entries)
            return


def search(query: str) -> list[dict]:
    q = (query or "").strip().lower()
    entries = load()
    if not q:
        return entries
    return [e for e in entries if q in (e.get("text", "") + " " + e.get("translation", "")).lower()]


def delete(entry_id: str) -> None:
    _save([e for e in load() if e.get("id") != entry_id])


def clear() -> None:
    _save([])


def title(entry: dict, width: int = 48) -> str:
    """One-line label: first non-empty line, shortened."""
    first = next((line.strip() for line in entry.get("text", "").splitlines() if line.strip()), "(empty)")
    return first if len(first) <= width else first[: width - 1] + "…"
