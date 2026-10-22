#!/usr/bin/env python3
"""
Generate inline curriculum data from curriculum.json.
Reads data/curriculum.json and prints the embedded <script> block to stdout.
Does NOT modify HTML files by default — use --write to update HTML files.

Usage:
  python tools/gen_inline_data.py                    # Print to stdout
  python tools/gen_inline_data.py --write            # Update HTML files
"""

import json
import sys
import argparse
import io
from pathlib import Path

# Fix Windows console encoding
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')


def generate_inline_script(data_spine: dict) -> str:
    """Generate the <script> block containing curriculum data."""
    json_str = json.dumps(data_spine, ensure_ascii=False, separators=(',', ':'))
    
    lines = [
        '<!-- BEGIN:CURRICULUM_DATA -->',
        '<script id="curriculum-data" type="application/json">',
        json_str,
        '</script>',
        '<!-- END:CURRICULUM_DATA -->'
    ]
    
    return '\n'.join(lines)


def update_html_file(html_path: Path, new_script_block: str) -> bool:
    """
    Update an HTML file with new curriculum data between sentinel comments.
    Returns True if successful, False if file doesn't exist or sentinel not found.
    """
    if not html_path.exists():
        print(f"Warning: {html_path} does not exist, skipping", file=sys.stderr)
        return False
    
    content = html_path.read_text(encoding='utf-8')
    
    # Find sentinel markers
    start_marker = '<!-- BEGIN:CURRICULUM_DATA -->'
    end_marker = '<!-- END:CURRICULUM_DATA -->'
    
    start_idx = content.find(start_marker)
    end_idx = content.find(end_marker)
    
    if start_idx == -1 or end_idx == -1:
        print(f"Warning: Sentinel comments not found in {html_path}", file=sys.stderr)
        return False
    
    # Replace content between sentinels (inclusive)
    new_content = content[:start_idx] + new_script_block + content[end_idx + len(end_marker):]
    
    html_path.write_text(new_content, encoding='utf-8')
    return True


def main():
    parser = argparse.ArgumentParser(
        description='Generate inline curriculum data from curriculum.json'
    )
    parser.add_argument(
        '--write',
        action='store_true',
        help='Write to HTML files instead of stdout'
    )
    args = parser.parse_args()
    
    # Determine paths
    script_dir = Path(__file__).parent.resolve()
    project_dir = script_dir.parent
    data_file = project_dir / 'data' / 'curriculum.json'
    web_dir = project_dir / 'web'
    
    if not data_file.exists():
        print(f"Error: {data_file} not found", file=sys.stderr)
        sys.exit(1)
    
    with open(data_file, 'r', encoding='utf-8') as f:
        data_spine = json.load(f)
    
    script_block = generate_inline_script(data_spine)
    
    if args.write:
        # Update both desktop and mobile HTML files
        index_html = web_dir / 'index.html'
        mobile_html = web_dir / 'mobile.html'
        
        success_count = 0
        for html_path in [index_html, mobile_html]:
            if update_html_file(html_path, script_block):
                success_count += 1
                print(f"Updated: {html_path}")
        
        if success_count == 0:
            print("Error: No HTML files were updated", file=sys.stderr)
            sys.exit(1)
    else:
        # Print to stdout
        print(script_block)


if __name__ == '__main__':
    main()
