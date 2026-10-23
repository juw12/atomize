#!/usr/bin/env python3
"""Validate static site for broken links and GitHub Pages compatibility."""

import argparse
import os
import re
import sys
from pathlib import Path


def find_html_files(site_dir):
    """Find all HTML files in the site directory."""
    return list(site_dir.rglob("*.html"))


def find_js_files(site_dir):
    """Find all JavaScript files in the site directory."""
    return list(site_dir.rglob("*.js"))


def find_manifest_files(site_dir):
    """Find all webmanifest files in the site directory."""
    return list(site_dir.rglob("*.webmanifest"))


def extract_refs(content):
    """Extract href and src references from HTML content.

    The opening and closing quotes must match (backreference) so that
    inline-JS attribute values such as ``href="'+esc(url)+'"`` are not
    mistaken for real links.
    """
    pattern = r'(?:href|src)\s*=\s*(["\'])([^"\']*?)\1'
    refs = [m.group(2) for m in re.finditer(pattern, content)]
    return [r for r in refs if '${' not in r]


def extract_path_literals(content):
    """Extract string literals that look like absolute-root paths from JS/manifest files."""
    # Match "/..." pattern in string literals (both single and double quotes)
    # Be conservative: only match clear absolute paths
    pattern = r'["\'](/[^"\']{2,})["\']'
    matches = re.findall(pattern, content)
    # Filter to only keep ones that look like actual path literals (not URLs, not just /)
    return [m for m in matches if not m.startswith('//') and not m.startswith('http')]


def should_skip_ref(ref):
    """Check if a reference should be skipped (external, special, etc.)."""
    if not ref:
        return True
    # Skip external URLs
    if ref.startswith(('http://', 'https://', '//')):
        return True
    # Skip special protocols
    if ref.startswith(('mailto:', 'data:', 'tel:', 'javascript:')):
        return True
    # Skip fragment-only links
    if ref.startswith('#'):
        return True
    return False


def is_absolute_root(ref):
    """Check if reference is an absolute-root path (starts with /)."""
    return ref.startswith('/')


def resolve_ref(ref, file_path, site_dir):
    """Resolve a reference relative to a file and return the absolute path."""
    file_dir = file_path.parent
    
    if ref.startswith('/'):
        # Absolute from site root - for subpath deployment, this is invalid
        # But we still resolve it to check existence
        resolved = site_dir / ref[1:]
    else:
        # Relative path
        resolved = (file_dir / ref).resolve()
    
    return resolved


def check_case_exact(ref, resolved_path, site_dir):
    """
    Check if the reference path segments match the actual filesystem exactly.
    This catches case mismatches that work on Windows but fail on Linux.
    Returns (ok, error_message).
    """
    if not resolved_path.exists():
        return False, f"target does not exist"
    
    # Get the relative path from site_dir
    try:
        rel_path = resolved_path.relative_to(site_dir)
    except ValueError:
        return False, f"resolved path outside site directory"
    
    # Walk each segment and verify exact case match
    current = site_dir
    for segment in rel_path.parts:
        try:
            entries = os.listdir(current)
        except PermissionError:
            continue  # Skip if we can't list (e.g., special directories)
        
        # Find matching entry (case-insensitive)
        matching = [e for e in entries if e.lower() == segment.lower()]
        
        if not matching:
            return False, f"segment '{segment}' not found (case-insensitive)"
        
        if len(matching) == 1:
            # Check exact case match
            if matching[0] != segment:
                return False, f"case mismatch: filesystem has '{matching[0]}' but ref uses '{segment}'"
            current = current / matching[0]
        else:
            # Multiple matches (shouldn't happen on case-sensitive FS, but could on Windows)
            # If exact match exists, use it
            if segment in matching:
                current = current / segment
            else:
                return False, f"ambiguous segment '{segment}' (multiple case variants exist)"
    
    return True, None


def check_file(file_path, site_dir):
    """Check a single HTML file for broken links. Returns list of errors."""
    errors = []
    
    try:
        content = file_path.read_text(encoding='utf-8')
    except Exception as e:
        errors.append(f"cannot read file: {e}")
        return errors
    
    refs = extract_refs(content)
    
    for ref in refs:
        if should_skip_ref(ref):
            continue
        
        # Check for absolute-root paths (break subpath deployment)
        if is_absolute_root(ref):
            errors.append(f"absolute-root ref '{ref}' (breaks subpath deployment)")
            continue
        
        # Resolve and check existence
        resolved = resolve_ref(ref, file_path, site_dir)
        
        # Check if within site directory
        try:
            resolved.relative_to(site_dir)
        except ValueError:
            errors.append(f"ref '{ref}' resolves outside site directory")
            continue
        
        if not resolved.exists():
            errors.append(f"ref '{ref}' - target does not exist")
            continue
        
        # Case-exact check
        ok, msg = check_case_exact(ref, resolved, site_dir)
        if not ok:
            errors.append(f"ref '{ref}' - {msg}")
    
    return errors


def check_js_manifest(file_path, site_dir):
    """Check JS/manifest files for absolute-root path literals. Returns list of warnings."""
    warnings = []
    
    try:
        content = file_path.read_text(encoding='utf-8')
    except Exception as e:
        return [f"cannot read file: {e}"]
    
    paths = extract_path_literals(content)
    
    for path in paths:
        # Skip common false positives
        if path.startswith(('http://', 'https://', '//')):
            continue
        # Skip data URLs, etc.
        if path.startswith(('data:', 'mailto:')):
            continue
        
        warnings.append(f"absolute-root path literal '{path}' (may break subpath deployment)")
    
    return warnings


def check_nojekyll(site_dir):
    """Check that .nojekyll file exists."""
    nojekyll = site_dir / ".nojekyll"
    if not nojekyll.exists():
        return ["_site/.nojekyll does not exist (required for GitHub Pages)"]
    return []


def main():
    parser = argparse.ArgumentParser(description="Validate static site for broken links and Pages compatibility")
    parser.add_argument("--site", default="_site", help="Site directory to check (default: _site)")
    args = parser.parse_args()
    
    site_dir = Path.cwd() / args.site
    
    if not site_dir.exists():
        print(f"ERROR: Site directory '{site_dir}' does not exist")
        print("Run 'python scripts/build_site.py' first")
        sys.exit(1)
    
    if not site_dir.is_dir():
        print(f"ERROR: '{site_dir}' is not a directory")
        sys.exit(1)
    
    print(f"Checking site: {site_dir}")
    print()
    
    all_errors = []
    all_warnings = []
    
    # Check .nojekyll
    nojekyll_errors = check_nojekyll(site_dir)
    all_errors.extend(nojekyll_errors)
    
    # Check HTML files
    html_files = find_html_files(site_dir)
    print(f"Checking {len(html_files)} HTML files...")
    
    for html_file in html_files:
        rel_path = html_file.relative_to(site_dir)
        errors = check_file(html_file, site_dir)
        
        for error in errors:
            all_errors.append(f"{rel_path}: {error}")
    
    # Check JS files for absolute-root path literals
    js_files = find_js_files(site_dir)
    if js_files:
        print(f"Checking {len(js_files)} JS files for absolute-root paths...")
        
        for js_file in js_files:
            rel_path = js_file.relative_to(site_dir)
            warnings = check_js_manifest(js_file, site_dir)
            
            for warning in warnings:
                all_warnings.append(f"{rel_path}: {warning}")
    
    # Check webmanifest files
    manifest_files = find_manifest_files(site_dir)
    if manifest_files:
        print(f"Checking {len(manifest_files)} webmanifest files for absolute-root paths...")
        
        for manifest_file in manifest_files:
            rel_path = manifest_file.relative_to(site_dir)
            warnings = check_js_manifest(manifest_file, site_dir)
            
            for warning in warnings:
                all_warnings.append(f"{rel_path}: {warning}")
    
    print()
    
    # Print warnings (non-fatal)
    if all_warnings:
        print("WARNINGS:")
        for warning in all_warnings:
            print(f"  [WARN] {warning}")
        print()
    
    # Print errors (fatal)
    if all_errors:
        print("ERRORS:")
        for error in all_errors:
            print(f"  [FAIL] {error}")
        print()
        print(f"FAILED: {len(all_errors)} error(s), {len(all_warnings)} warning(s)")
        sys.exit(1)
    else:
        print(f"PASSED: All checks passed ({len(html_files)} HTML files)")
        if all_warnings:
            print(f"  ({len(all_warnings)} warning(s) above)")
        sys.exit(0)


if __name__ == "__main__":
    main()
