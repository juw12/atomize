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


# Each app lists the entry points the landing page links to (paths are relative
# to the site root). Every product ships three versions — App, Web and Mobile.
#   App    = installable application (installable PWA, or the native desktop app)
#   Web    = desktop browser build
#   Mobile = mobile-optimised build
APPS_FILE = Path(__file__).resolve().parent / "apps.json"


def load_apps():
    """Return the catalog entries from scripts/apps.json, in publish order."""
    data = json.loads(APPS_FILE.read_text(encoding="utf-8"))
    apps = data["apps"] if isinstance(data, dict) else data
    return sorted(apps, key=lambda a: a.get("order", 0))


def build_landing_apps(catalog):
    """Map catalog entries to the {name, desc, links} rows the landing page needs."""
    landing = []
    for app in catalog:
        links = app["links"]
        landing.append({
            "name": app["name"],
            "desc": app["desc"],
            "links": [("App", links["app"]), ("Web", links["web"]), ("Mobile", links["mobile"])],
        })
    return landing


# Apps that were renamed: old site path -> the app's current id. A tiny redirect
# stub is emitted at the old path so existing links/bookmarks keep working.
REDIRECTS = {"productivity-widget": "pips"}


def write_redirects(out_dir, catalog):
    """Emit redirect stubs for renamed apps (old path -> current path)."""
    ids = {app["id"] for app in catalog}
    for old_id, new_id in REDIRECTS.items():
        if new_id not in ids:
            continue
        targets = [
            ("index.html", f"../{new_id}/"),
            ("web.html", f"../{new_id}/web.html"),
            ("mobile.html", f"../{new_id}/mobile.html"),
        ]
        for page, target in targets:
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


def generate_index(out_dir, repo_name, apps):
    """Generate the main index.html landing page with Desktop/Mobile links."""
    index_html = out_dir / "index.html"

    cards = []
    for app in apps:
        buttons = "\n".join(
            f'          <a class="btn" href="{href}">{label}</a>'
            for label, href in app["links"]
        )
        cards.append(
            f'''      <div class="card">
        <h2>{app["name"]}</h2>
        <p>{app["desc"]}</p>
        <div class="variants">
{buttons}
        </div>
      </div>'''
        )
    cards_html = "\n".join(cards)

    html_content = f'''<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{repo_name}</title>
  <style>
    :root {{
      --bg: #F7F8FB;
      --surface: #FFFFFF;
      --ink: #101828;
      --muted: #667085;
      --line: #E4E7EC;
      --brand: #4F46E5;
      --brand-600: #4338CA;
      --brand-50: #EEF2FF;
      --radius: 12px;
      --shadow: 0 1px 2px rgba(16, 24, 40, 0.06), 0 8px 24px -10px rgba(16, 24, 40, 0.18);
      --font: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    }}
    * {{ box-sizing: border-box; margin: 0; padding: 0; }}
    body {{
      font-family: var(--font);
      background: var(--bg);
      color: var(--ink);
      line-height: 1.6;
      padding: 48px 24px;
      min-height: 100vh;
    }}
    .container {{
      max-width: 900px;
      margin: 0 auto;
    }}
    h1 {{
      font-size: 2.5rem;
      font-weight: 700;
      letter-spacing: -0.02em;
      margin-bottom: 12px;
      color: var(--ink);
    }}
    .subtitle {{
      font-size: 1.125rem;
      color: var(--muted);
      margin-bottom: 40px;
    }}
    .grid {{
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
      gap: 20px;
      margin-top: 32px;
    }}
    .card {{
      background: var(--surface);
      border: 1px solid var(--line);
      border-radius: var(--radius);
      padding: 24px;
      display: flex;
      flex-direction: column;
      transition: transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease;
    }}
    .card:hover {{
      transform: translateY(-2px);
      box-shadow: var(--shadow);
      border-color: var(--brand);
    }}
    .card h2 {{
      font-size: 1.25rem;
      font-weight: 600;
      margin-bottom: 8px;
      color: var(--brand-600);
    }}
    .card p {{
      font-size: 0.95rem;
      color: var(--muted);
      margin: 0;
    }}
    .variants {{
      display: flex;
      gap: 10px;
      margin-top: 20px;
    }}
    .btn {{
      flex: 1;
      text-align: center;
      padding: 10px 12px;
      border: 1px solid var(--line);
      border-radius: 8px;
      font-size: 0.9rem;
      font-weight: 600;
      color: var(--brand-600);
      text-decoration: none;
      transition: background 0.15s ease, border-color 0.15s ease;
    }}
    .btn:hover {{
      background: var(--brand-50);
      border-color: var(--brand);
    }}
    footer {{
      margin-top: 64px;
      padding-top: 24px;
      border-top: 1px solid var(--line);
      color: var(--muted);
      font-size: 0.875rem;
      text-align: center;
    }}
  </style>
</head>
<body>
  <div class="container">
    <h1>{repo_name}</h1>
    <p class="subtitle">Product projects — each with an app, web and mobile build</p>

    <div class="grid">
{cards_html}
    </div>

    <footer>
      <p>Built with Python stdlib only · Deployed to GitHub Pages</p>
    </footer>
  </div>
</body>
</html>
'''

    index_html.write_text(html_content, encoding="utf-8")
    print(f"Generated {index_html}")


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
        copy_app_web(apps_dir, app["id"], out_dir, app["id"])

    print()

    write_redirects(out_dir, catalog)
    write_nojekyll(out_dir)

    repo_name = get_repo_name().replace("-", " ").title()
    generate_index(out_dir, repo_name, build_landing_apps(catalog))

    print()
    print("Build complete!")
    print(f"Output: {out_dir.absolute()}")


if __name__ == "__main__":
    main()
