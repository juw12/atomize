#!/usr/bin/env python3
"""Static integrity tests for OrbisWork app HTML builds."""

import os
import re
import sys

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WEB_DIR = os.path.join(BASE_DIR, "web")

TESTS = [
    {
        "file": "index.html",
        "localStorage_key": "orbiswork_demo_v1",
    },
    {
        "file": "mobile.html",
        "localStorage_key": "orbiswork_mobile_v1",
    },
]


def run_tests():
    all_passed = True

    for test in TESTS:
        filename = test["file"]
        filepath = os.path.join(WEB_DIR, filename)
        localStorage_key = test["localStorage_key"]

        print(f"\n=== {filename} ===")

        # Test 1: File exists and is non-empty and > 20,000 bytes
        try:
            size = os.path.getsize(filepath)
            if size > 20_000:
                print(f"ok - size check ({size:,} bytes)")
            else:
                print(f"FAIL - size check (only {size:,} bytes, expected > 20,000)")
                all_passed = False
        except FileNotFoundError:
            print("FAIL - file exists check (file not found)")
            all_passed = False
            continue

        # Test 2: Valid UTF-8 text
        try:
            with open(filepath, "r", encoding="utf-8") as f:
                content = f.read()
            print("ok - UTF-8 encoding")
        except UnicodeDecodeError:
            print("FAIL - UTF-8 encoding")
            all_passed = False
            continue

        # Test 3: No fetch( or XMLHttpRequest
        if "fetch(" not in content and "XMLHttpRequest" not in content:
            print("ok - no fetch/XMLHttpRequest")
        else:
            print("FAIL - contains fetch( or XMLHttpRequest")
            all_passed = False

        # Test 4: Contains expected localStorage key
        if localStorage_key in content:
            print(f"ok - localStorage key '{localStorage_key}'")
        else:
            print(f"FAIL - missing localStorage key '{localStorage_key}'")
            all_passed = False

        # Test 5: No absolute-root asset refs (src="/ or href="/)
        absolute_pattern = r'(src|href)="/'
        if not re.search(absolute_pattern, content):
            print("ok - no absolute-root asset refs")
        else:
            print("FAIL - contains absolute-root asset refs")
            all_passed = False

        # Test 6: No <base tag
        if "<base " not in content and "<base>" not in content:
            print("ok - no <base> tag")
        else:
            print("FAIL - contains <base> tag")
            all_passed = False

    print("\n" + "=" * 50)
    if all_passed:
        print("SUMMARY: ALL TESTS PASSED")
        return 0
    else:
        print("SUMMARY: SOME TESTS FAILED")
        return 1


if __name__ == "__main__":
    sys.exit(run_tests())
