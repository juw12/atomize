#!/usr/bin/env python3
"""
Generate inline JavaScript CATALOG_DATA from catalog.json.
Reads data/catalog.json and prints the equivalent JSON block for embedding in HTML.
Does NOT rewrite HTML files by default - outputs to stdout.

Usage:
    python tools/gen_inline_data.py > catalog_inline.json
    
Or to update HTML files directly:
    python tools/gen_inline_data.py --update
"""

import json
import sys
import re
from pathlib import Path


def generate_catalog_json(data_catalog: dict) -> str:
    """Generate JSON string for embedding in HTML script tag."""
    return json.dumps(data_catalog, indent=2, ensure_ascii=False)


def update_html_file(html_path: Path, catalog_json: str) -> bool:
    """
    Update an HTML file with the new catalog data between sentinel comments.
    Returns True if updated successfully, False if sentinels not found.
    """
    if not html_path.exists():
        print(f"Warning: {html_path} does not exist, skipping", file=sys.stderr)
        return False
    
    content = html_path.read_text(encoding="utf-8")
    
    start_sentinel = "<!-- BEGIN:CATALOG_DATA -->"
    end_sentinel = "<!-- END:CATALOG_DATA -->"
    
    if start_sentinel not in content or end_sentinel not in content:
        print(f"Warning: {html_path} missing sentinel comments, skipping", file=sys.stderr)
        return False
    
    # Build the new inline script block
    script_block = f"""{start_sentinel}
  <script id="catalog-data" type="application/json">
{catalog_json}
  </script>
{end_sentinel}"""
    
    # Use regex to replace content between sentinels (inclusive)
    pattern = re.escape(start_sentinel) + r".*?" + re.escape(end_sentinel)
    new_content = re.sub(pattern, script_block, content, flags=re.DOTALL)
    
    html_path.write_text(new_content, encoding="utf-8")
    print(f"Updated {html_path}")
    return True


def main():
    # Determine paths
    script_dir = Path(__file__).parent.resolve()
    project_dir = script_dir.parent
    data_file = project_dir / "data" / "catalog.json"
    web_dir = project_dir / "web"
    
    if not data_file.exists():
        print(f"Error: {data_file} not found", file=sys.stderr)
        sys.exit(1)
    
    with open(data_file, "r", encoding="utf-8") as f:
        data_catalog = json.load(f)
    
    # Check for --update flag
    update_mode = "--update" in sys.argv
    
    if update_mode:
        # Update HTML files directly
        catalog_json = generate_catalog_json(data_catalog)
        html_files = list(web_dir.glob("*.html"))
        
        if not html_files:
            print(f"Warning: No HTML files found in {web_dir}", file=sys.stderr)
            sys.exit(0)
        
        updated = 0
        for html_file in html_files:
            if update_html_file(html_file, catalog_json):
                updated += 1
        
        print(f"Updated {updated} HTML file(s)")
    else:
        # Output JSON to stdout
        catalog_json = generate_catalog_json(data_catalog)
        print(catalog_json)
    
    sys.exit(0)


if __name__ == "__main__":
    main()
