#!/usr/bin/env python3
"""Sync the inline `SHOE_DATA` in the web builds from data/data-spine.json.

The spine is the single source of truth. Each build (web/desktop.html,
web/index.html) carries an inlined `const SHOE_DATA={...}` for offline use, which
must match the spine. Run this after editing the spine:

    python tools/sync_inline_data.py --write   # rewrite the inline blocks
    python tools/sync_inline_data.py           # report drift (exit 1 if any)

Stdlib only. tests/test_inline_data_sync.py enforces the same thing in CI.
"""

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import gen_inline_data as gen  # noqa: E402

APP_DIR = Path(__file__).resolve().parent.parent
SPINE = APP_DIR / "data" / "data-spine.json"
WEB = APP_DIR / "web"
TARGETS = ("desktop.html", "index.html")

MARK_START = "const SHOE_DATA={"
MARK_END = "\n};"


def expected_js() -> str:
    return gen.generate_shoe_data(json.loads(SPINE.read_text(encoding="utf-8")))


def current_js(html: str) -> str:
    start = html.index(MARK_START)
    end = html.index(MARK_END, start) + len(MARK_END)
    return html[start:end]


def replace_block(html: str, js: str) -> str:
    start = html.index(MARK_START)
    end = html.index(MARK_END, start) + len(MARK_END)
    return html[:start] + js + html[end:]


def main(argv) -> int:
    write = "--write" in argv
    js = expected_js()
    drifted = []

    for name in TARGETS:
        path = WEB / name
        html = path.read_text(encoding="utf-8")
        if current_js(html) == js:
            print(f"OK    {name}")
            continue
        drifted.append(name)
        if write:
            path.write_text(replace_block(html, js), encoding="utf-8", newline="")
            print(f"WROTE {name}")

    if drifted and not write:
        print("Inline SHOE_DATA is out of sync with data-spine.json: "
              + ", ".join(drifted))
        print("Fix: python tools/sync_inline_data.py --write")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
