#!/usr/bin/env python3
"""
Part Lab — Static Integrity Test
Verifies: no absolute-root refs, no CDNs, no inline handlers, required files exist,
correct script load order, engine.js exposes PartLab API.

Exit codes: 0 = pass, 1 = fail
"""

import os
import re
import sys
from pathlib import Path

# Base paths
SCRIPT_DIR = Path(__file__).parent
APP_DIR = SCRIPT_DIR.parent
WEB_DIR = APP_DIR / 'web'
JS_DIR = WEB_DIR / 'js'

# Track results
results = []


def check(name: str, passed: bool, message: str = ''):
    """Record a test result."""
    status = 'ok' if passed else 'FAIL'
    results.append((name, passed, message))
    print(f'[{status}] {name}' + (f': {message}' if message and not passed else ''))


def read_file(path: Path) -> str:
    """Read file contents, return empty string if missing."""
    try:
        return path.read_text(encoding='utf-8')
    except FileNotFoundError:
        return ''


def check_absolute_root_refs(content: str, filename: str):
    """Check for absolute-root references (href="/...", src="/...")."""
    # Match href="/ or src="/ but allow href="./ or src="./
    pattern = r'(?:href|src)=["\']\/[^"\']'
    matches = re.findall(pattern, content)
    
    # Also check for literal "/..." path strings in JS
    js_pattern = r'["\']\/[a-zA-Z]'
    js_matches = re.findall(js_pattern, content)
    
    # Filter out false positives (comments, protocols)
    bad_refs = [m for m in matches + js_matches if not m.startswith('"//') and not m.startswith("'//")]
    
    passed = len(bad_refs) == 0
    check(f'No absolute-root refs in {filename}', passed, 
          f'Found: {bad_refs[:3]}' if bad_refs else '')
    return passed


def check_cdn_refs(content: str, filename: str):
    """Check for CDN references."""
    cdn_patterns = [
        r'unpkg\.com',
        r'jsdelivr\.net',
        r'cdnjs\.cloudflare\.com',
        r'googleapis\.com',
        r'cdn\.jsdelivr\.net',
    ]
    
    found = []
    for pattern in cdn_patterns:
        if re.search(pattern, content):
            found.append(pattern)
    
    passed = len(found) == 0
    check(f'No CDN refs in {filename}', passed,
          f'Found CDNs: {found}' if found else '')
    return passed


def check_inline_handlers(content: str, filename: str):
    """Check for inline event handlers (onclick=, on*=)."""
    pattern = r'\son\w+=["\']'
    matches = re.findall(pattern, content, re.IGNORECASE)
    
    passed = len(matches) == 0
    check(f'No inline handlers in {filename}', passed,
          f'Found: {matches[:3]}' if matches else '')
    return passed


def check_script_order(content: str, filename: str):
    """Check that index.html loads scripts in correct order."""
    # Find all script tags
    pattern = r'<script[^>]*src=["\']([^"\']+)["\'][^>]*>'
    scripts = re.findall(pattern, content)
    
    # Expected order: engine.js, renderer.js, app.js
    expected = ['engine.js', 'renderer.js', 'app.js']
    
    # Extract just the filenames
    script_files = [os.path.basename(s) for s in scripts]
    
    # Check if all expected scripts are present in order
    passed = True
    message = ''
    
    if 'engine.js' not in script_files:
        passed = False
        message = 'Missing engine.js'
    elif 'renderer.js' not in script_files:
        passed = False
        message = 'Missing renderer.js'
    elif 'app.js' not in script_files:
        passed = False
        message = 'Missing app.js'
    else:
        # Check order
        indices = [script_files.index(s) for s in expected]
        if indices != sorted(indices):
            passed = False
            message = f'Wrong order: {script_files}'
    
    check(f'{filename} loads engine->renderer->app in order', passed, message)
    return passed


def check_styles_css_ref(content: str, filename: str):
    """Check that index.html references styles.css."""
    pattern = r'href=["\']styles\.css["\']'
    passed = bool(re.search(pattern, content))
    check(f'{filename} references styles.css', passed)
    return passed


def main():
    """Run all checks."""
    all_passed = True
    
    # Read files
    index_html = read_file(WEB_DIR / 'index.html')
    manifest = read_file(WEB_DIR / 'manifest.webmanifest')
    sw_js = read_file(WEB_DIR / 'sw.js')
    icon_svg = read_file(WEB_DIR / 'icons' / 'icon.svg')
    engine_js = read_file(JS_DIR / 'engine.js')
    renderer_js = read_file(JS_DIR / 'renderer.js')
    app_js = read_file(JS_DIR / 'app.js')
    
    # (a) Check for absolute-root refs in HTML, JS, manifest
    if index_html:
        if not check_absolute_root_refs(index_html, 'index.html'):
            all_passed = False
    
    if manifest:
        if not check_absolute_root_refs(manifest, 'manifest.webmanifest'):
            all_passed = False
    
    if engine_js:
        if not check_absolute_root_refs(engine_js, 'engine.js'):
            all_passed = False
    
    if renderer_js:
        if not check_absolute_root_refs(renderer_js, 'renderer.js'):
            all_passed = False
    
    if app_js:
        if not check_absolute_root_refs(app_js, 'app.js'):
            all_passed = False
    
    # (b) Check for CDN references
    if index_html:
        if not check_cdn_refs(index_html, 'index.html'):
            all_passed = False
    
    if engine_js:
        if not check_cdn_refs(engine_js, 'engine.js'):
            all_passed = False
    
    if renderer_js:
        if not check_cdn_refs(renderer_js, 'renderer.js'):
            all_passed = False
    
    if app_js:
        if not check_cdn_refs(app_js, 'app.js'):
            all_passed = False
    
    # (c) Check for inline handlers
    if index_html:
        if not check_inline_handlers(index_html, 'index.html'):
            all_passed = False
    
    # (d) Check index.html script order and styles.css ref
    if index_html:
        if not check_script_order(index_html, 'index.html'):
            all_passed = False
        if not check_styles_css_ref(index_html, 'index.html'):
            all_passed = False
    
    # (e) Check required files exist
    check('manifest.webmanifest exists', (WEB_DIR / 'manifest.webmanifest').exists())
    check('sw.js exists', (WEB_DIR / 'sw.js').exists())
    check('icons/icon.svg exists', (WEB_DIR / 'icons' / 'icon.svg').exists())
    check('web/js/engine.js exists', (JS_DIR / 'engine.js').exists())
    
    # (f) Check engine.js exposes PartLab API
    if engine_js:
        has_partlab = 'PartLab' in engine_js
        has_buildmesh = 'buildMesh' in engine_js
        has_tostl = 'toSTL' in engine_js
        
        check('engine.js exposes PartLab', has_partlab)
        check('engine.js exposes buildMesh', has_buildmesh)
        check('engine.js exposes toSTL', has_tostl)
        
        if not (has_partlab and has_buildmesh and has_tostl):
            all_passed = False
    else:
        check('engine.js exposes PartLab', False, 'File not found')
        check('engine.js exposes buildMesh', False, 'File not found')
        check('engine.js exposes toSTL', False, 'File not found')
        all_passed = False
    
    # Summary
    print()
    total = len(results)
    passed = sum(1 for _, p, _ in results if p)
    failed = total - passed
    
    print(f'Summary: {passed}/{total} checks passed')
    
    if failed > 0:
        print(f'FAILED: {failed} check(s) failed')
        return 1
    else:
        print('All checks passed!')
        return 0


if __name__ == '__main__':
    sys.exit(main())
