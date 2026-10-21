#!/usr/bin/env python3
"""Build static site from apps/*/web directories for GitHub Pages deployment."""

import argparse
import os
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


def generate_index(out_dir, repo_name):
    """Generate the main index.html landing page."""
    index_html = out_dir / "index.html"
    
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
      transition: transform 0.2s ease, box-shadow 0.2s ease;
      text-decoration: none;
      color: inherit;
      display: block;
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
    .card-arrow {{
      float: right;
      font-size: 1.25rem;
      color: var(--brand);
      transition: transform 0.2s ease;
    }}
    .card:hover .card-arrow {{
      transform: translateX(4px);
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
    <p class="subtitle">Static site monorepo — zero-dependency Python projects</p>
    
    <div class="grid">
      <a class="card" href="orbis/">
        <span class="card-arrow">→</span>
        <h2>Orbis</h2>
        <p>Communication, identity and protection in one app</p>
      </a>
      
      <a class="card" href="peers/">
        <span class="card-arrow">→</span>
        <h2>Peers</h2>
        <p>Verified reviews for food, travel and products</p>
      </a>
      
      <a class="card" href="house-of-articles/">
        <span class="card-arrow">→</span>
        <h2>House of Articles</h2>
        <p>Athlete-moment sneaker news + live market feed</p>
      </a>
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
    
    # Clean and create output directory
    clean_create_site(out_dir)
    
    # Copy each app's web directory
    print("Copying app web directories:")
    apps_config = [
        ("orbis", "orbis"),
        ("peers", "peers"),
        ("house-of-articles", "house-of-articles"),
    ]
    
    for app_name, site_subdir in apps_config:
        copy_app_web(apps_dir, app_name, out_dir, site_subdir)
    
    print()
    
    # Write .nojekyll
    write_nojekyll(out_dir)
    
    # Generate index.html
    repo_name = get_repo_name().replace("-", " ").title()
    generate_index(out_dir, repo_name)
    
    print()
    print("Build complete!")
    print(f"Output: {out_dir.absolute()}")


if __name__ == "__main__":
    main()
