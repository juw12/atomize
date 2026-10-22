#!/usr/bin/env python3
"""
Static integrity tests for web/index.html.
Exit 0 if all pass, 1 if any fail.

Checks:
- File exists & >5000 bytes
- Valid UTF-8
- No fetch( or XMLHttpRequest
- Contains sneaker_ledger_v1 (localStorage key)
- No absolute-root refs (src="/, href="/)
- No <base> tag
"""

import sys
import re
from pathlib import Path


def main():
    script_dir = Path(__file__).parent.resolve()
    project_dir = script_dir.parent
    web_dir = project_dir / "web"
    index_html = web_dir / "index.html"
    
    all_pass = True
    
    # Check file exists
    if not index_html.exists():
        print(f"FAIL: {index_html} does not exist")
        sys.exit(1)
    
    print(f"OK: {index_html.name} exists")
    
    # Check file size > 5000 bytes
    file_size = index_html.stat().st_size
    if file_size <= 5000:
        print(f"FAIL: {index_html.name} is {file_size} bytes (must be > 5000)")
        all_pass = False
    else:
        print(f"OK: {index_html.name} is {file_size} bytes (> 5000)")
    
    # Check valid UTF-8
    try:
        content = index_html.read_text(encoding="utf-8")
        print("OK: Valid UTF-8 encoding")
    except UnicodeDecodeError as e:
        print(f"FAIL: Invalid UTF-8 encoding: {e}")
        all_pass = False
        sys.exit(1)
    
    # Check no fetch(
    if "fetch(" in content or "fetch (" in content:
        print("FAIL: Contains fetch() - must be offline-first with inline data only")
        all_pass = False
    else:
        print("OK: No fetch() calls")
    
    # Check no XMLHttpRequest
    if "XMLHttpRequest" in content:
        print("FAIL: Contains XMLHttpRequest - must be offline-first with inline data only")
        all_pass = False
    else:
        print("OK: No XMLHttpRequest")
    
    # Check contains sneaker_ledger_v1
    if "sneaker_ledger_v1" in content:
        print("OK: Contains sneaker_ledger_v1 localStorage key")
    else:
        print("FAIL: Missing sneaker_ledger_v1 localStorage key")
        all_pass = False
    
    # Check no absolute-root refs src="/
    if re.search(r'src="/', content):
        print("FAIL: Contains absolute-root src=\"/\" references")
        all_pass = False
    else:
        print("OK: No absolute-root src=\"/\" references")
    
    # Check no absolute-root refs href="/
    if re.search(r'href="/', content):
        print("FAIL: Contains absolute-root href=\"/\" references")
        all_pass = False
    else:
        print("OK: No absolute-root href=\"/\" references")
    
    # Check no <base> tag
    if "<base" in content.lower():
        print("FAIL: Contains <base> tag - not allowed in offline-first app")
        all_pass = False
    else:
        print("OK: No <base> tag")
    
    # Check for inline catalog data
    if '<script id="catalog-data" type="application/json">' in content:
        print("OK: Contains inline catalog-data script tag")
    else:
        print("FAIL: Missing inline catalog-data script tag")
        all_pass = False
    
    # Check for sentinel comments
    if "<!-- BEGIN:CATALOG_DATA -->" in content and "<!-- END:CATALOG_DATA -->" in content:
        print("OK: Contains sentinel comments for data injection")
    else:
        print("FAIL: Missing sentinel comments (<!-- BEGIN:CATALOG_DATA --> and <!-- END:CATALOG_DATA -->)")
        all_pass = False
    
    # Summary
    print()
    if all_pass:
        print("ALL TESTS PASSED")
        sys.exit(0)
    else:
        print("TESTS FAILED")
        sys.exit(1)


if __name__ == "__main__":
    main()
