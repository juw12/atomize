#!/usr/bin/env python3
"""
Generate inline JavaScript SHOE_DATA from data-spine.json.
Reads data/data-spine.json and prints the equivalent const SHOE_DATA = {...} JS object to stdout.
Does NOT rewrite the HTML files by default.
"""

import json
import sys
from pathlib import Path


def normalize_key(sneaker_id: str, colorway_name: str) -> str:
    """Generate a normalized key for the shoe from sneaker_id."""
    return sneaker_id


def generate_shoe_data(data_spine: dict) -> str:
    """Generate JavaScript SHOE_DATA object from normalized data spine."""
    shoes = {}
    
    for colorway in data_spine["colorways"]:
        sneaker_id = colorway["sneaker_id"]
        
        # Find the sneaker details
        sneaker = None
        for s in data_spine["sneakers"]:
            if s["id"] == sneaker_id:
                sneaker = s
                break
        
        if not sneaker:
            continue
        
        # Find brand
        brand = None
        for b in data_spine["brands"]:
            # Match brand_id to brand id
            if b["id"] == sneaker["brand_id"]:
                brand = b
                break
        
        brand_name = brand["name"] if brand else sneaker["brand_id"]
        
        # Build the shoe object matching the original inline format
        shoe_obj = {
            "brand": brand_name,
            "model": sneaker["model_name"],
            "colorway": colorway["name"],
            "sku": colorway["sku"],
            "release": colorway["release_date"].replace("-", " ").replace(" ", " ", 1).replace("-", ", "),
            "retail": colorway["retail_price"],
            "market": colorway["market_price"],
            "bid": colorway["bid"],
            "ask": colorway["ask"],
            "estCost": colorway["est_cost"],
            "markupPct": colorway["markup_pct"],
            "marginPct": colorway["margin_pct"],
            "category": sneaker["category"],
            "weight": sneaker["weight"],
            "drop": sneaker["drop"],
            "image": colorway["image_url"],
            "trend": colorway["trend"],
            "parts": colorway["parts"],
            "provenance": colorway.get("provenance")
        }
        
        # Format release date to match original: "2025-10-12" -> "Oct 12, 2025"
        months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
        parts = colorway["release_date"].split("-")
        if len(parts) == 3:
            year, month, day = parts
            month_name = months[int(month) - 1]
            shoe_obj["release"] = f"{month_name} {int(day)}, {year}"
        
        shoes[sneaker_id] = shoe_obj
    
    # Generate JavaScript output
    lines = ["const SHOE_DATA={"]
    for i, (key, shoe) in enumerate(shoes.items()):
        parts_js = ",".join(
            f"{{part:'{p['part']}',material:'{p['material']}',site:'{p['site']}'}}"
            for p in shoe["parts"]
        )
        
        prov_js = f"provenance:{{source:'{shoe['provenance']['source']}',confidence:'{shoe['provenance']['confidence']}',observed_at:'{shoe['provenance']['observed_at']}'}}" if shoe.get("provenance") else "provenance:null"
        line = (
            f"  '{key}':{{"
            f"brand:'{shoe['brand']}',"
            f"model:'{shoe['model']}',"
            f"colorway:'{shoe['colorway']}',"
            f"sku:'{shoe['sku']}',"
            f"release:'{shoe['release']}',"
            f"retail:{shoe['retail']},"
            f"market:{shoe['market']},"
            f"bid:{shoe['bid']},"
            f"ask:{shoe['ask']},"
            f"estCost:{shoe['estCost']},"
            f"markupPct:{shoe['markupPct']},"
            f"marginPct:{shoe['marginPct']},"
            f"category:'{shoe['category']}',"
            f"weight:'{shoe['weight']}',"
            f"drop:'{shoe['drop']}',"
            f"image:'{shoe['image']}',"
            f"trend:'{shoe['trend']}',"
            f"parts:[{parts_js}],"
            f"{prov_js}"
            f"}}"
        )
        if i < len(shoes) - 1:
            line += ","
        lines.append(line)
    lines.append("};")
    
    return "\n".join(lines)


def main():
    # Determine paths
    script_dir = Path(__file__).parent.resolve()
    project_dir = script_dir.parent
    data_file = project_dir / "data" / "data-spine.json"
    
    if not data_file.exists():
        print(f"Error: {data_file} not found", file=sys.stderr)
        sys.exit(1)
    
    with open(data_file, "r", encoding="utf-8") as f:
        data_spine = json.load(f)
    
    js_output = generate_shoe_data(data_spine)
    print(js_output)


if __name__ == "__main__":
    main()
