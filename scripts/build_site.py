#!/usr/bin/env python3
"""Build static site from apps/*/web directories for GitHub Pages deployment."""

import argparse
import json
import shutil
from pathlib import Path


def get_repo_name():
    """Get repository name from directory or default."""
    cwd = Path.cwd()
    return cwd.name or "static-site"


def clean_create_site(out_dir):
    """Remove and recreate the output directory."""
    if out_dir.exists():
        shutil.rmtree(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    print(f"Created clean output directory: {out_dir}")


def copy_app_web(apps_dir, app_name, out_dir, site_subdir):
    """Copy app's web directory to output, return files copied."""
    src = apps_dir / app_name / "web"
    dst = out_dir / site_subdir

    if not src.exists():
        print(f"  [SKIP] {app_name}/web does not exist")
        return []

    if not src.is_dir():
        print(f"  [SKIP] {app_name}/web is not a directory")
        return []

    shutil.copytree(src, dst)
    copied = list(dst.rglob("*"))
    print(f"  [OK] Copied {app_name}/web -> {site_subdir}/ ({len(copied)} items)")
    return copied


def write_nojekyll(out_dir):
    """Write empty .nojekyll file to disable Jekyll processing."""
    nojekyll = out_dir / ".nojekyll"
    nojekyll.write_text("", encoding="utf-8")
    print(f"Created {nojekyll}")


APPS_FILE = Path(__file__).resolve().parent / "apps.json"


def load_apps():
    """Return the catalog entries from scripts/apps.json, in publish order."""
    data = json.loads(APPS_FILE.read_text(encoding="utf-8"))
    apps = data["apps"] if isinstance(data, dict) else data
    return sorted(apps, key=lambda a: a.get("order", 0))


# Apps that were renamed: old site path -> the app's current id. A tiny redirect
# stub is emitted at the old path so existing links/bookmarks keep working.
REDIRECTS = {"productivity-widget": "pips", "ziris-motor": "airiz-motor"}


def write_redirects(out_dir, catalog):
    """Emit redirect stubs for renamed apps (old path -> current path)."""
    ids = {app["id"] for app in catalog}
    for old_id, new_id in REDIRECTS.items():
        if new_id not in ids:
            continue
        targets = [
            ("index.html", f"../{new_id}/", out_dir / new_id),
            ("web.html", f"../{new_id}/web.html", out_dir / new_id / "web.html"),
            ("mobile.html", f"../{new_id}/mobile.html", out_dir / new_id / "mobile.html"),
        ]
        for page, target, target_path in targets:
            if not target_path.exists():
                continue
            dst = out_dir / old_id / page
            dst.parent.mkdir(parents=True, exist_ok=True)
            dst.write_text(
                '<!DOCTYPE html>\n<html lang="en">\n<head>\n'
                '<meta charset="UTF-8">\n'
                f'<meta http-equiv="refresh" content="0; url={target}">\n'
                f'<link rel="canonical" href="{target}">\n'
                '<title>Moved</title>\n</head>\n<body>\n'
                f'<p>This page moved to <a href="{target}">{new_id}</a>.</p>\n'
                '</body>\n</html>\n',
                encoding="utf-8")
        print(f"  [redirect] {old_id}/ -> {new_id}/")


def main():
    parser = argparse.ArgumentParser(description="Build static site from apps/*/web directories")
    parser.add_argument("--out", default="_site", help="Output directory (default: _site)")
    args = parser.parse_args()

    repo_root = Path.cwd()
    out_dir = repo_root / args.out
    apps_dir = repo_root / "apps"

    print(f"Building static site from {apps_dir}")
    print(f"Output directory: {out_dir}")
    print()

    clean_create_site(out_dir)

    catalog = load_apps()

    print("Copying app web directories:")
    for app in catalog:
        if app.get("external") or app.get("work"):
            continue
        copy_app_web(apps_dir, app["id"], out_dir, app["id"])

    print()

    write_redirects(out_dir, catalog)
    write_nojekyll(out_dir)

    print()
    print("Build complete!")
    print(f"Output: {out_dir.absolute()}")


if __name__ == "__main__":
    main()
