#!/usr/bin/env python3
"""
Schema validation test for catalog.json.
Exit 0 if all pass, 1 if any fail.

Mirrors house-of-articles test_data_schema.py AND requires provenance on every colorway.
"""

import json
import sys
from pathlib import Path


def main():
    script_dir = Path(__file__).parent.resolve()
    project_dir = script_dir.parent
    data_file = project_dir / "data" / "catalog.json"
    web_dir = project_dir / "web"
    index_html = web_dir / "index.html"
    
    all_pass = True
    
    # Load data
    try:
        with open(data_file, "r", encoding="utf-8") as f:
            data = json.load(f)
        print("OK: catalog.json loaded")
    except Exception as e:
        print(f"FAIL: Cannot load catalog.json: {e}")
        sys.exit(1)
    
    # Check required top-level keys
    required_keys = ["version", "brands", "sneakers", "colorways"]
    for key in required_keys:
        if key not in data:
            print(f"FAIL: Missing required key '{key}'")
            all_pass = False
        else:
            print(f"OK: Required key '{key}' present")
    
    # Build lookup maps
    brand_ids = {b["id"] for b in data.get("brands", [])}
    sneaker_ids = {s["id"] for s in data.get("sneakers", [])}
    
    # Validate brands
    for brand in data.get("brands", []):
        for field in ["id", "name", "country"]:
            if field not in brand:
                print(f"FAIL: Brand missing '{field}': {brand}")
                all_pass = False
    
    # Validate sneakers
    for sneaker in data.get("sneakers", []):
        for field in ["id", "brand_id", "model_name", "category", "weight", "drop"]:
            if field not in sneaker:
                print(f"FAIL: Sneaker missing '{field}': {sneaker}")
                all_pass = False
        if sneaker.get("brand_id") not in brand_ids:
            print(f"FAIL: Sneaker '{sneaker['id']}' references invalid brand_id '{sneaker.get('brand_id')}'")
            all_pass = False
    
    # Validate colorways
    sku_seen = set()
    sneaker_ids_from_colorways = set()
    for cw in data.get("colorways", []):
        sneaker_ids_from_colorways.add(cw.get("sneaker_id"))
        
        # Check required fields
        for field in ["id", "sneaker_id", "name", "sku", "retail_price", "release_date", 
                      "image_url", "market_price", "bid", "ask", "est_cost", 
                      "markup_pct", "margin_pct", "trend", "parts"]:
            if field not in cw:
                print(f"FAIL: Colorway '{cw.get('id')}' missing '{field}'")
                all_pass = False
        
        # Check numeric fields
        for num_field in ["retail_price", "market_price", "bid", "ask", "est_cost", "markup_pct", "margin_pct"]:
            val = cw.get(num_field)
            if not isinstance(val, (int, float)):
                print(f"FAIL: Colorway '{cw.get('id')}' field '{num_field}' is not numeric: {val}")
                all_pass = False
        
        # Check SKU uniqueness
        sku = cw.get("sku")
        if sku in sku_seen:
            print(f"FAIL: Duplicate SKU '{sku}' in colorway '{cw.get('id')}'")
            all_pass = False
        sku_seen.add(sku)
        
        # Check sneaker reference
        if cw.get("sneaker_id") not in sneaker_ids:
            print(f"FAIL: Colorway '{cw.get('id')}' references invalid sneaker_id '{cw.get('sneaker_id')}'")
            all_pass = False
        
        # Check parts
        parts = cw.get("parts", [])
        for part in parts:
            for field in ["part", "material", "site"]:
                if field not in part:
                    print(f"FAIL: Part in colorway '{cw.get('id')}' missing '{field}': {part}")
                    all_pass = False
        
        # PROVENANCE CHECK - Required for sneaker-ledger
        if "provenance" not in cw:
            print(f"FAIL: Colorway '{cw.get('id')}' missing required 'provenance' field")
            all_pass = False
        else:
            prov = cw.get("provenance")
            for prov_field in ["source", "confidence", "observed_at"]:
                if prov_field not in prov:
                    print(f"FAIL: Colorway '{cw.get('id')}' provenance missing '{prov_field}'")
                    all_pass = False
            
            # Validate confidence value
            confidence = prov.get("confidence")
            if confidence not in ["verified", "estimated", "synthetic"]:
                print(f"FAIL: Colorway '{cw.get('id')}' has invalid confidence '{confidence}' (must be verified/estimated/synthetic)")
                all_pass = False
            else:
                print(f"OK: Colorway '{cw.get('id')}' has valid provenance (confidence={confidence})")
    
    # Check all sneakers are referenced
    unreferenced_sneakers = sneaker_ids - sneaker_ids_from_colorways
    if unreferenced_sneakers:
        print(f"FAIL: Sneakers with no colorways: {unreferenced_sneakers}")
        all_pass = False
    
    # Check HTML file exists
    if not index_html.exists():
        print(f"FAIL: {index_html.name} does not exist")
        all_pass = False
    else:
        print(f"OK: {index_html.name} exists")
        
        content = index_html.read_text(encoding="utf-8")
        
        # Check for http:// or https://
        if "http://" in content or "https://" in content:
            print(f"FAIL: {index_html.name} contains external URLs (http:// or https://)")
            all_pass = False
        else:
            print(f"OK: {index_html.name} has no external URLs")
        
        # Check for absolute paths src="/ or href="/
        if 'src="/' in content or 'href="/' in content:
            print(f"FAIL: {index_html.name} contains absolute paths (src=\"/\" or href=\"/\")")
            all_pass = False
        else:
            print(f"OK: {index_html.name} has no absolute paths")
    
    # Summary
    print()
    if all_pass:
        print("ALL TESTS PASSED")
        sys.exit(0)
    else:
        print("TESTS FAILED")
        sys.exit(1)


if __name__ == "__main__":
    main()
