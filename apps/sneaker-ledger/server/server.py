#!/usr/bin/env python3
"""
Sneaker Ledger — Optional read-only stdlib API server.

Serves:
  GET /api/health      — Health check
  GET /api/catalog     — Full catalog
  GET /api/sku/{id}    — Single colorway by SKU
  GET /api/integrity   — Data integrity report

Also serves static files from web/ directory.
"""

import json
import sys
import os
from pathlib import Path
from http.server import HTTPServer, SimpleHTTPRequestHandler
from urllib.parse import urlparse, unquote
import re


# Project paths
SCRIPT_DIR = Path(__file__).parent.resolve()
PROJECT_DIR = SCRIPT_DIR.parent
DATA_FILE = PROJECT_DIR / "data" / "catalog.json"
WEB_DIR = PROJECT_DIR / "web"


def load_catalog():
    """Load catalog data from JSON file."""
    if not DATA_FILE.exists():
        return None
    with open(DATA_FILE, "r", encoding="utf-8") as f:
        return json.load(f)


def run_integrity_checks(catalog):
    """Run data integrity checks on catalog."""
    issues = []
    sku_seen = set()
    brand_ids = {b["id"] for b in catalog.get("brands", [])}
    sneaker_ids = {s["id"] for s in catalog.get("sneakers", [])}
    
    # Check colorways
    for cw in catalog.get("colorways", []):
        # Duplicate SKU check
        if cw.get("sku") in sku_seen:
            issues.append({
                "type": "error",
                "title": "Duplicate SKU",
                "sku": cw.get("sku")
            })
        sku_seen.add(cw.get("sku"))
        
        # Provenance check
        prov = cw.get("provenance")
        if not prov:
            issues.append({
                "type": "warning",
                "title": "Missing provenance",
                "sku": cw.get("sku")
            })
        elif not all(k in prov for k in ["source", "confidence", "observed_at"]):
            issues.append({
                "type": "warning",
                "title": "Incomplete provenance",
                "sku": cw.get("sku")
            })
        
        # Parts check
        if not cw.get("parts") or len(cw.get("parts", [])) == 0:
            issues.append({
                "type": "warning",
                "title": "Missing parts",
                "sku": cw.get("sku")
            })
        
        # Sneaker reference check
        if cw.get("sneaker_id") not in sneaker_ids:
            issues.append({
                "type": "error",
                "title": "Invalid sneaker reference",
                "sku": cw.get("sku")
            })
    
    # Check sneaker brand references
    for s in catalog.get("sneakers", []):
        if s.get("brand_id") not in brand_ids:
            issues.append({
                "type": "error",
                "title": "Invalid brand reference",
                "sneaker": s.get("id")
            })
    
    return issues


class SneakerLedgerHandler(SimpleHTTPRequestHandler):
    """Custom handler for Sneaker Ledger API and static files."""
    
    def __init__(self, *args, **kwargs):
        # Serve from web directory
        super().__init__(*args, directory=str(WEB_DIR), **kwargs)
    
    def send_json_response(self, data, status=200):
        """Send JSON response."""
        response = json.dumps(data, indent=2).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(response)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(response)
    
    def send_error_response(self, message, status=400):
        """Send error JSON response."""
        self.send_json_response({"error": message}, status)
    
    def do_OPTIONS(self):
        """Handle CORS preflight."""
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()
    
    def do_GET(self):
        """Handle GET requests."""
        parsed = urlparse(self.path)
        path = unquote(parsed.path)
        
        # API routes
        if path == "/api/health":
            self.send_json_response({
                "status": "ok",
                "app": "sneaker-ledger",
                "version": "1.0"
            })
            return
        
        if path == "/api/catalog":
            catalog = load_catalog()
            if catalog:
                self.send_json_response(catalog)
            else:
                self.send_error_response("Catalog not found", 500)
            return
        
        if path.startswith("/api/sku/"):
            sku = path.replace("/api/sku/", "").strip("/")
            catalog = load_catalog()
            if catalog:
                # Find colorway by SKU
                colorway = None
                for cw in catalog.get("colorways", []):
                    if cw.get("sku") == sku:
                        colorway = cw
                        break
                
                if colorway:
                    self.send_json_response(colorway)
                else:
                    self.send_error_response(f"SKU '{sku}' not found", 404)
            else:
                self.send_error_response("Catalog not found", 500)
            return
        
        if path == "/api/integrity":
            catalog = load_catalog()
            if catalog:
                issues = run_integrity_checks(catalog)
                self.send_json_response({
                    "total_issues": len(issues),
                    "errors": len([i for i in issues if i["type"] == "error"]),
                    "warnings": len([i for i in issues if i["type"] == "warning"]),
                    "issues": issues
                })
            else:
                self.send_error_response("Catalog not found", 500)
            return
        
        # Static files - serve index.html for root
        if path == "/":
            self.path = "/index.html"
        
        # Block access to data directory
        if path.startswith("/data/"):
            self.send_error_response("Access denied", 403)
            return
        
        # Serve static file
        return super().do_GET()
    
    def log_message(self, format, *args):
        """Log HTTP requests."""
        print(f"[{self.log_date_time_string()}] {format % args}")


def main():
    import argparse
    
    parser = argparse.ArgumentParser(description="Sneaker Ledger API Server")
    parser.add_argument("--port", type=int, default=8790, help="Port to listen on (default: 8790)")
    parser.add_argument("--host", type=str, default="127.0.0.1", help="Host to bind to (default: 127.0.0.1)")
    parser.add_argument("--no-browser", action="store_true", help="Do not open browser automatically")
    args = parser.parse_args()
    
    # Validate catalog exists
    if not DATA_FILE.exists():
        print(f"Error: Catalog file not found at {DATA_FILE}", file=sys.stderr)
        sys.exit(1)
    
    # Start server
    server_address = (args.host, args.port)
    httpd = HTTPServer(server_address, SneakerLedgerHandler)
    
    url = f"http://{args.host}:{args.port}"
    print(f"Sneaker Ledger API server running at {url}")
    print(f"  GET /api/health   - Health check")
    print(f"  GET /api/catalog  - Full catalog")
    print(f"  GET /api/sku/{{id}} - Single colorway by SKU")
    print(f"  GET /api/integrity - Data integrity report")
    print(f"  GET /             - Web app (index.html)")
    print()
    print("Press Ctrl+C to stop.")
    
    # Open browser if not disabled
    if not args.no_browser:
        try:
            import webbrowser
            webbrowser.open(url)
        except Exception as e:
            print(f"Note: Could not open browser: {e}")
    
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down...")
        httpd.shutdown()


if __name__ == "__main__":
    main()
