#!/usr/bin/env python
"""
Chase Static Integrity Test — v2 with viewport
Stdlib only, exit 0/1. Checks:
- No absolute-root refs in any html/js/manifest
- No CDN refs
- No inline on*= handlers
- ALL THREE variants (app.html, index.html, mobile.html) exist
- Each variant references styles.css and loads js/chase.js → js/viewport.js → js/app.js (in that order)
- manifest.webmanifest (start_url app.html), sw.js, icons/icon.svg exist
- web/js/chase.js exists and contains Chase, diagnose, planAssembly
- web/js/viewport.js exists and exposes ChaseView
Prints [ok]/[FAIL] per check + summary. Creates NO files.
"""

import os
import re
import sys
from pathlib import Path


def main():
    # Base paths
    script_dir = Path(__file__).parent
    chase_dir = script_dir.parent
    web_dir = chase_dir / 'web'
    
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
    app_html_file = web_dir / 'app.html'
    index_html_file = web_dir / 'index.html'
    mobile_html_file = web_dir / 'mobile.html'
    css_file = web_dir / 'styles.css'
    app_js_file = web_dir / 'js' / 'app.js'
    chase_js_file = web_dir / 'js' / 'chase.js'
    viewport_js_file = web_dir / 'js' / 'viewport.js'
    manifest_file = web_dir / 'manifest.webmanifest'
    sw_file = web_dir / 'sw.js'
    icon_file = web_dir / 'icons' / 'icon.svg'
    
    # === File existence checks ===
    check('app.html exists', app_html_file.exists())
    check('index.html exists', index_html_file.exists())
    check('mobile.html exists', mobile_html_file.exists())
    check('styles.css exists', css_file.exists())
    check('js/app.js exists', app_js_file.exists())
    check('js/chase.js exists', chase_js_file.exists())
    check('js/viewport.js exists', viewport_js_file.exists())
    check('manifest.webmanifest exists', manifest_file.exists())
    check('sw.js exists', sw_file.exists())
    check('icons/icon.svg exists', icon_file.exists())
    
    # Read file contents
    app_html_content = ''
    index_html_content = ''
    mobile_html_content = ''
    app_js_content = ''
    chase_js_content = ''
    viewport_js_content = ''
    manifest_content = ''
    
    if app_html_file.exists():
        app_html_content = app_html_file.read_text(encoding='utf-8')
    if index_html_file.exists():
        index_html_content = index_html_file.read_text(encoding='utf-8')
    if mobile_html_file.exists():
        mobile_html_content = mobile_html_file.read_text(encoding='utf-8')
    if app_js_file.exists():
        app_js_content = app_js_file.read_text(encoding='utf-8')
    if chase_js_file.exists():
        chase_js_content = chase_js_file.read_text(encoding='utf-8')
    if viewport_js_file.exists():
        viewport_js_content = viewport_js_file.read_text(encoding='utf-8')
    if manifest_file.exists():
        manifest_content = manifest_file.read_text(encoding='utf-8')
    
    # All HTML files combined
    all_html_content = app_html_content + index_html_content + mobile_html_content
    all_files_content = all_html_content + app_js_content + chase_js_content + viewport_js_content + manifest_content
    
    # === Check: No absolute-root refs (href="/...", src="/...") ===
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
    inline_matches = re.findall(inline_handler_pattern, all_html_content, re.IGNORECASE)
    check('No inline on*= handlers', len(inline_matches) == 0,
          f'found {len(inline_matches)} inline handler(s)')
    
    # === Check: Each variant loads styles.css and js/chase.js → js/viewport.js → js/app.js ===
    html_variants = [
        ('app.html', app_html_content),
        ('index.html', index_html_content),
        ('mobile.html', mobile_html_content)
    ]
    
    for variant_name, content in html_variants:
        # Extract script and link tags in order
        load_order_pattern = r'(?:<link[^>]*href=["\']([^"\']*\.css)["\'][^>]*>|<script[^>]*src=["\']([^"\']*\.js)["\'][^>]*>)'
        loads = re.findall(load_order_pattern, content)
        
        # Flatten to just the paths
        loaded_paths = []
        for css_path, js_path in loads:
            if css_path:
                loaded_paths.append(css_path)
            if js_path:
                loaded_paths.append(js_path)
        
        # Check styles.css is loaded
        has_styles = any('styles.css' in p for p in loaded_paths)
        check(f'{variant_name} loads styles.css', has_styles)
        
        # Check chase.js, viewport.js, and app.js are loaded in correct order
        chase_idx = None
        viewport_idx = None
        app_idx = None
        for i, path in enumerate(loaded_paths):
            if 'chase.js' in path:
                chase_idx = i
            if 'viewport.js' in path:
                viewport_idx = i
            if 'app.js' in path:
                app_idx = i
        
        check(f'{variant_name} loads js/chase.js', chase_idx is not None)
        check(f'{variant_name} loads js/viewport.js', viewport_idx is not None)
        check(f'{variant_name} loads js/app.js', app_idx is not None)
        check(f'{variant_name}: js/chase.js loads before js/viewport.js', 
              chase_idx is not None and viewport_idx is not None and chase_idx < viewport_idx,
              'order incorrect' if (chase_idx is not None and viewport_idx is not None and chase_idx >= viewport_idx) else '')
        check(f'{variant_name}: js/viewport.js loads before js/app.js', 
              viewport_idx is not None and app_idx is not None and viewport_idx < app_idx,
              'order incorrect' if (viewport_idx is not None and app_idx is not None and viewport_idx >= app_idx) else '')
    
    # === Check: manifest.webmanifest start_url is app.html ===
    if manifest_file.exists():
        start_url_match = re.search(r'"start_url"\s*:\s*"([^"]+)"', manifest_content)
        if start_url_match:
            start_url = start_url_match.group(1)
            check('manifest.webmanifest start_url is app.html', 
                  start_url == './app.html' or start_url == 'app.html',
                  f'found "{start_url}"')
        else:
            check('manifest.webmanifest start_url is app.html', False, 'start_url not found')
    else:
        check('manifest.webmanifest start_url is app.html', False, 'manifest does not exist')
    
    # === Check: js/chase.js contains required exports ===
    if chase_js_file.exists():
        has_chase = 'Chase' in chase_js_content
        has_diagnose = 'diagnose' in chase_js_content
        has_planAssembly = 'planAssembly' in chase_js_content
        
        check('js/chase.js contains "Chase"', has_chase)
        check('js/chase.js contains "diagnose"', has_diagnose)
        check('js/chase.js contains "planAssembly"', has_planAssembly)
    else:
        check('js/chase.js contains "Chase"', False, 'file does not exist')
        check('js/chase.js contains "diagnose"', False, 'file does not exist')
        check('js/chase.js contains "planAssembly"', False, 'file does not exist')
    
    # === Check: js/viewport.js exposes ChaseView ===
    if viewport_js_file.exists():
        has_chaseview = 'ChaseView' in viewport_js_content
        check('js/viewport.js exposes "ChaseView"', has_chaseview)
    else:
        check('js/viewport.js exposes "ChaseView"', False, 'file does not exist')
    
    # === Check: sw.js caches viewport.js ===
    if sw_file.exists():
        has_viewport_in_sw = 'viewport.js' in sw_content if 'sw_content' in locals() else 'viewport.js' in sw_file.read_text(encoding='utf-8')
        check('sw.js caches js/viewport.js', has_viewport_in_sw)
    else:
        check('sw.js caches js/viewport.js', False, 'sw.js does not exist')
    
    # === Summary ===
    print()
    print(f'Summary: {checks_passed} passed, {checks_failed} failed')
    
    return 0 if checks_failed == 0 else 1


if __name__ == '__main__':
    sys.exit(main())
