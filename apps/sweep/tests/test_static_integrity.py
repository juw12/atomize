#!/usr/bin/env python3
"""Static integrity tests for the Sweep web app (offline-first, zero-dep).

Hermetic and stdlib-only. Exits 0 on success, 1 on failure — so it participates
in scripts/run_all_tests.py.
"""

import os
import re
import sys

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WEB_DIR = os.path.join(BASE_DIR, "web")

REQUIRED_FILES = ["index.html", "styles.css", "app.js"]


def run_tests():
    all_passed = True

    # Test 1: required files exist and are non-empty
    for name in REQUIRED_FILES:
        path = os.path.join(WEB_DIR, name)
        if os.path.isfile(path) and os.path.getsize(path) > 0:
            print(f"ok - {name} exists ({os.path.getsize(path):,} bytes)")
        else:
            print(f"FAIL - {name} missing or empty")
            all_passed = False

    if not all_passed:
        print("\n" + "=" * 50)
        print("SUMMARY: SOME TESTS FAILED")
        return 1

    # Test 2: valid UTF-8 for every file
    contents = {}
    for name in REQUIRED_FILES:
        try:
            with open(os.path.join(WEB_DIR, name), "r", encoding="utf-8") as f:
                contents[name] = f.read()
            print(f"ok - {name} is valid UTF-8")
        except UnicodeDecodeError:
            print(f"FAIL - {name} is not valid UTF-8")
            all_passed = False

    html = contents.get("index.html", "")
    js = contents.get("app.js", "")
    css = contents.get("styles.css", "")

    # Test 3: offline-first — no network calls
    combined = html + js
    if "fetch(" not in combined and "XMLHttpRequest" not in combined and "WebSocket" not in combined:
        print("ok - no fetch/XMLHttpRequest/WebSocket (offline-first)")
    else:
        print("FAIL - contains a network call (fetch/XMLHttpRequest/WebSocket)")
        all_passed = False

    # Test 4: no absolute-root asset refs (breaks GitHub Pages subpath deploy)
    if not re.search(r'(src|href)\s*=\s*"/', html):
        print("ok - no absolute-root asset refs")
    else:
        print("FAIL - contains absolute-root asset refs")
        all_passed = False

    # Test 5: no <base> tag
    if "<base" not in html:
        print("ok - no <base> tag")
    else:
        print("FAIL - contains a <base> tag")
        all_passed = False

    # Test 6: no external network resources (fonts/CDN/remote images)
    resource_tags = r'<(?:script|img|link|iframe|source)\b[^>]*\b(?:src|href)\s*=\s*"https?://'
    if not re.search(resource_tags, html):
        print("ok - no external resources in HTML")
    else:
        print("FAIL - HTML loads an external resource")
        all_passed = False

    # Test 7: local href/src references exist on disk (case-exact)
    refs = re.findall(r'(?:href|src)\s*=\s*"([^"#][^"]*)"', html)
    for ref in refs:
        if ref.startswith(("http://", "https://", "//", "mailto:", "data:", "tel:", "javascript:")):
            continue
        target = os.path.join(WEB_DIR, ref)
        if not os.path.isfile(target):
            print(f"FAIL - local ref '{ref}' does not resolve to a file")
            all_passed = False
    if all_passed:
        print("ok - all local href/src refs resolve")

    # Test 8: app persists to localStorage under a `sweep_` key
    if re.search(r"sweep_[a-z0-9_]+", combined):
        print("ok - uses a `sweep_` localStorage key")
    else:
        print("FAIL - no `sweep_` localStorage key found")
        all_passed = False

    # Test 9: Morning Paper theme tokens present in CSS
    if "--color-accent" in css and "#8b1a1a" in css:
        print("ok - Morning Paper theme tokens present")
    else:
        print("FAIL - missing Morning Paper theme tokens")
        all_passed = False

    print("\n" + "=" * 50)
    if all_passed:
        print("SUMMARY: ALL TESTS PASSED")
        return 0
    print("SUMMARY: SOME TESTS FAILED")
    return 1


if __name__ == "__main__":
    sys.exit(run_tests())
