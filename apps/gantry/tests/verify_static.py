#!/usr/bin/env python
"""
Gantry Static Integrity Test
Stdlib only, exit 0/1. Checks:
- No absolute-root refs in any html/js/manifest
- No CDN refs
- No inline on*= handlers
- index.html loads js/gantry.js then js/app.js (in that order) and styles.css
- manifest.webmanifest, sw.js, icons/icon.svg exist
- web/js/gantry.js exists and contains Gantry, diagnose, planAssembly
Prints [ok]/[FAIL] per check + summary. Creates NO files.
"""

import os
import re
import sys
from pathlib import Path


def main():
    # Base paths
    script_dir = Path(__file__).parent
    gantry_dir = script_dir.parent
    web_dir = gantry_dir / 'web'
    
    checks_passed = 0
    checks_failed = 0
    
    def check(name, condition, details=''):
        nonlocal checks_passed, checks_failed
        if condition:
            print(f'[ok] {name}')
            checks_passed += 1
        else:
            print(f'[FAIL] {name}' + (f': {details}' if details else ''))
            checks_failed += 1
    
    # Files to check
    html_file = web_dir / 'index.html'
    css_file = web_dir / 'styles.css'
    app_js_file = web_dir / 'js' / 'app.js'
    gantry_js_file = web_dir / 'js' / 'gantry.js'
    manifest_file = web_dir / 'manifest.webmanifest'
    sw_file = web_dir / 'sw.js'
    icon_file = web_dir / 'icons' / 'icon.svg'
    
    # === File existence checks ===
    check('index.html exists', html_file.exists())
    check('styles.css exists', css_file.exists())
    check('js/app.js exists', app_js_file.exists())
    check('js/gantry.js exists', gantry_js_file.exists())
    check('manifest.webmanifest exists', manifest_file.exists())
    check('sw.js exists', sw_file.exists())
    check('icons/icon.svg exists', icon_file.exists())
    
    # Read file contents
    html_content = ''
    app_js_content = ''
    gantry_js_content = ''
    manifest_content = ''
    
    if html_file.exists():
        html_content = html_file.read_text(encoding='utf-8')
    if app_js_file.exists():
        app_js_content = app_js_file.read_text(encoding='utf-8')
    if gantry_js_file.exists():
        gantry_js_content = gantry_js_file.read_text(encoding='utf-8')
    if manifest_file.exists():
        manifest_content = manifest_file.read_text(encoding='utf-8')
    
    # === Check: No absolute-root refs (href="/...", src="/...") ===
    all_files_content = html_content + app_js_content + manifest_content
    
    # Pattern for absolute-root paths (but not //cdn or http)
    absolute_root_pattern = r'(?:href|src)=["\']\/[^\/\s]["\']'
    absolute_matches = re.findall(absolute_root_pattern, all_files_content)
    check('No absolute-root refs in html/js/manifest', len(absolute_matches) == 0, 
          f'found {len(absolute_matches)} absolute-root ref(s)')
    
    # === Check: No CDN refs ===
    cdn_patterns = [
        r'cdn\.jsdelivr\.net',
        r'unpkg\.com',
        r'cdnjs\.cloudflare\.com',
        r'code\.jquery\.com',
        r'fonts\.googleapis\.com',
        r'fonts\.gstatic\.com',
        r'bootstrapcdn\.com',
        r'kit\.fontawesome\.com'
    ]
    cdn_found = []
    for pattern in cdn_patterns:
        if re.search(pattern, all_files_content, re.IGNORECASE):
            cdn_found.append(pattern)
    check('No CDN refs', len(cdn_found) == 0, 
          f'found CDN refs: {", ".join(cdn_found)}' if cdn_found else '')
    
    # === Check: No inline on*= handlers ===
    inline_handler_pattern = r'\son[a-z]+\s*=\s*["\'][^"\']*["\']'
    inline_matches = re.findall(inline_handler_pattern, html_content, re.IGNORECASE)
    check('No inline on*= handlers', len(inline_matches) == 0,
          f'found {len(inline_matches)} inline handler(s)')
    
    # === Check: index.html loads styles.css, js/gantry.js, js/app.js in order ===
    # Extract script and link tags in order
    load_order_pattern = r'(?:<link[^>]*href=["\']([^"\']*\.css)["\'][^>]*>|<script[^>]*src=["\']([^"\']*\.js)["\'][^>]*>)'
    loads = re.findall(load_order_pattern, html_content)
    
    # Flatten to just the paths
    loaded_paths = []
    for css_path, js_path in loads:
        if css_path:
            loaded_paths.append(css_path)
        if js_path:
            loaded_paths.append(js_path)
    
    # Check styles.css is loaded
    has_styles = any('styles.css' in p for p in loaded_paths)
    check('index.html loads styles.css', has_styles)
    
    # Check gantry.js and app.js are loaded in correct order
    gantry_idx = None
    app_idx = None
    for i, path in enumerate(loaded_paths):
        if 'gantry.js' in path:
            gantry_idx = i
        if 'app.js' in path:
            app_idx = i
    
    check('index.html loads js/gantry.js', gantry_idx is not None)
    check('index.html loads js/app.js', app_idx is not None)
    check('js/gantry.js loads before js/app.js', 
          gantry_idx is not None and app_idx is not None and gantry_idx < app_idx,
          'order incorrect' if (gantry_idx is not None and app_idx is not None and gantry_idx >= app_idx) else '')
    
    # === Check: gantry.js contains required exports ===
    if gantry_js_file.exists():
        has_gantry = 'Gantry' in gantry_js_content
        has_diagnose = 'diagnose' in gantry_js_content
        has_planAssembly = 'planAssembly' in gantry_js_content
        
        check('js/gantry.js contains "Gantry"', has_gantry)
        check('js/gantry.js contains "diagnose"', has_diagnose)
        check('js/gantry.js contains "planAssembly"', has_planAssembly)
    else:
        check('js/gantry.js contains "Gantry"', False, 'file does not exist')
        check('js/gantry.js contains "diagnose"', False, 'file does not exist')
        check('js/gantry.js contains "planAssembly"', False, 'file does not exist')
    
    # === Summary ===
    print()
    print(f'Summary: {checks_passed} passed, {checks_failed} failed')
    
    return 0 if checks_failed == 0 else 1


if __name__ == '__main__':
    sys.exit(main())
