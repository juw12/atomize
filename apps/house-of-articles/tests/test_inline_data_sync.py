#!/usr/bin/env python3
"""Guard against inline-data drift in the House of Articles web builds.

The inlined `const SHOE_DATA={...}` in web/desktop.html and web/index.html must
exactly match what tools/gen_inline_data.py derives from data/data-spine.json.
If they drift, the offline builds (and the Ledger) show stale data.

Exit 0 if all builds are in sync, 1 otherwise. Stdlib only.
"""

import json
import sys
from pathlib import Path

APP = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(APP / "tools"))
import gen_inline_data as gen  # noqa: E402

SPINE = APP / "data" / "data-spine.json"
WEB = APP / "web"
TARGETS = ("desktop.html", "index.html")
MARK_START = "const SHOE_DATA={"
MARK_END = "\n};"


def main() -> int:
    expected = gen.generate_shoe_data(json.loads(SPINE.read_text(encoding="utf-8")))
    all_ok = True

    for name in TARGETS:
        html = (WEB / name).read_text(encoding="utf-8")
        try:
            start = html.index(MARK_START)
            end = html.index(MARK_END, start) + len(MARK_END)
            actual = html[start:end]
        except ValueError:
            print(f"FAIL: {name}: inline SHOE_DATA block not found")
            all_ok = False
            continue

        if actual == expected:
            print(f"OK: {name} inline SHOE_DATA matches data-spine.json")
        else:
            print(f"FAIL: {name} inline SHOE_DATA is out of sync with data-spine.json "
                  f"(expected {len(expected)} chars, found {len(actual)})")
            all_ok = False

    print()
    if all_ok:
        print("ALL TESTS PASSED")
        return 0
    print("TESTS FAILED - run: python tools/sync_inline_data.py --write")
    return 1


if __name__ == "__main__":
    sys.exit(main())
