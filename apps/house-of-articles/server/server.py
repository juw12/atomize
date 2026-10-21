#!/usr/bin/env python3
"""
House of Articles - Read-only API server
Zero-dependency Python stdlib only. Serves static files + JSON API.
"""

import argparse
import hashlib
import json
import sqlite3
import threading
import urllib.parse
from http.server import HTTPServer, SimpleHTTPRequestHandler
from pathlib import Path

LOCK = threading.Lock()
DB_PATH = None
WEB_ROOT = None
DATA_SPINE_PATH = None


def get_db_path():
    return DB_PATH


def get_web_root():
    return WEB_ROOT


def init_db(db_path, data_spine_path):
    with open(data_spine_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    conn = sqlite3.connect(db_path)
    cur = conn.cursor()

    cur.executescript("""
        DROP TABLE IF EXISTS brands;
        DROP TABLE IF EXISTS sneakers;
        DROP TABLE IF EXISTS colorways;
        DROP TABLE IF EXISTS parts;

        CREATE TABLE brands (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            country TEXT NOT NULL
        );

        CREATE TABLE sneakers (
            id TEXT PRIMARY KEY,
            brand_id TEXT NOT NULL,
            model_name TEXT NOT NULL,
            category TEXT NOT NULL,
            tech TEXT,
            weight TEXT,
            drop_mm TEXT,
            FOREIGN KEY (brand_id) REFERENCES brands(id)
        );

        CREATE TABLE colorways (
            id TEXT PRIMARY KEY,
            sneaker_id TEXT NOT NULL,
            name TEXT NOT NULL,
            sku TEXT NOT NULL,
            retail_price REAL NOT NULL,
            release_date TEXT NOT NULL,
            image_url TEXT NOT NULL,
            market_price REAL NOT NULL,
            bid REAL NOT NULL,
            ask REAL NOT NULL,
            est_cost REAL NOT NULL,
            markup_pct REAL NOT NULL,
            margin_pct REAL NOT NULL,
            trend TEXT NOT NULL,
            FOREIGN KEY (sneaker_id) REFERENCES sneakers(id)
        );

        CREATE TABLE parts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            colorway_id TEXT NOT NULL,
            part TEXT NOT NULL,
            material TEXT NOT NULL,
            site TEXT NOT NULL,
            FOREIGN KEY (colorway_id) REFERENCES colorways(id)
        );
    """)

    for brand in data["brands"]:
        cur.execute(
            "INSERT INTO brands (id, name, country) VALUES (?, ?, ?)",
            (brand["id"], brand["name"], brand["country"]),
        )

    for sneaker in data["sneakers"]:
        cur.execute(
            "INSERT INTO sneakers (id, brand_id, model_name, category, tech, weight, drop_mm) VALUES (?, ?, ?, ?, ?, ?, ?)",
            (
                sneaker["id"],
                sneaker["brand_id"],
                sneaker["model_name"],
                sneaker["category"],
                sneaker.get("tech"),
                sneaker.get("weight"),
                sneaker.get("drop"),
            ),
        )

    for colorway in data["colorways"]:
        cur.execute(
            "INSERT INTO colorways (id, sneaker_id, name, sku, retail_price, release_date, image_url, market_price, bid, ask, est_cost, markup_pct, margin_pct, trend) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (
                colorway["id"],
                colorway["sneaker_id"],
                colorway["name"],
                colorway["sku"],
                colorway["retail_price"],
                colorway["release_date"],
                colorway["image_url"],
                colorway["market_price"],
                colorway["bid"],
                colorway["ask"],
                colorway["est_cost"],
                colorway["markup_pct"],
                colorway["margin_pct"],
                colorway["trend"],
            ),
        )
        for part in colorway.get("parts", []):
            cur.execute(
                "INSERT INTO parts (colorway_id, part, material, site) VALUES (?, ?, ?, ?)",
                (colorway["id"], part["part"], part["material"], part["site"]),
            )

    conn.commit()
    conn.close()


def generate_price_series(retail_price, market_price, range_str):
    point_counts = {"1m": 30, "6m": 90, "1y": 180, "all": 365}
    num_points = point_counts.get(range_str, 30)

    seed_value = retail_price + market_price
    prices = []
    for i in range(num_points):
        t = i * 86400
        hash_input = f"{seed_value}:{i}:{range_str}"
        hash_val = int(hashlib.sha256(hash_input.encode()).hexdigest()[:8], 16)
        noise = (hash_val % 1000) / 1000.0
        progress = i / max(num_points - 1, 1)
        base_price = retail_price + (market_price - retail_price) * progress
        price = round(base_price + noise * (market_price - retail_price) * 0.1, 2)
        prices.append(price)

    from datetime import datetime, timedelta

    end_date = datetime.now()
    start_date = end_date - timedelta(days=num_points - 1)

    result = []
    for i, price in enumerate(prices):
        point_date = start_date + timedelta(days=i)
        result.append({"t": point_date.strftime("%Y-%m-%d"), "price": price})

    return result


class HOAHandler(SimpleHTTPRequestHandler):
    def send_cors_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")

    def send_json(self, data, status=200):
        body = json.dumps(data).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.send_cors_headers()
        self.end_headers()
        self.wfile.write(body)

    def send_error_json(self, message, status=400):
        self.send_json({"error": message}, status)

    def do_OPTIONS(self):
        if self.path.startswith("/api/"):
            self.send_response(204)
            self.send_cors_headers()
            self.end_headers()
        else:
            self.send_response(404)
            self.end_headers()

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path
        query = urllib.parse.parse_qs(parsed.query)

        if path.startswith("/api/"):
            self.handle_api(path, query)
        else:
            self.handle_static(path)

    def handle_api(self, path, query):
        if path == "/api/health":
            self.send_json(
                {"status": "ok", "app": "house-of-articles", "version": "1.0"}
            )
            return

        if path == "/api/brands":
            with LOCK:
                conn = sqlite3.connect(get_db_path())
                cur = conn.cursor()
                cur.execute("SELECT id, name, country FROM brands")
                rows = cur.fetchall()
                conn.close()
            brands = [{"id": r[0], "name": r[1], "country": r[2]} for r in rows]
            self.send_json(brands)
            return

        if path == "/api/sneakers":
            with LOCK:
                conn = sqlite3.connect(get_db_path())
                cur = conn.cursor()
                cur.execute(
                    """
                    SELECT s.id, s.brand_id, s.model_name, s.category, s.tech, s.weight, s.drop_mm,
                           b.name as brand_name,
                           c.market_price, c.bid, c.ask
                    FROM sneakers s
                    JOIN brands b ON s.brand_id = b.id
                    JOIN colorways c ON c.sneaker_id = s.id
                """
                )
                rows = cur.fetchall()
                conn.close()
            sneakers = []
            seen_ids = set()
            for r in rows:
                if r[0] in seen_ids:
                    continue
                seen_ids.add(r[0])
                sneakers.append(
                    {
                        "id": r[0],
                        "brand_id": r[1],
                        "model_name": r[2],
                        "category": r[3],
                        "tech": r[4],
                        "weight": r[5],
                        "drop": r[6],
                        "brand": {"id": r[1], "name": r[7]},
                        "market_price": r[8],
                        "bid": r[9],
                        "ask": r[10],
                    }
                )
            self.send_json(sneakers)
            return

        if path.startswith("/api/sneakers/") and "/prices" not in path:
            sneaker_id = path[len("/api/sneakers/") :]
            if not sneaker_id:
                self.send_error_json("Missing sneaker ID", 400)
                return

            with LOCK:
                conn = sqlite3.connect(get_db_path())
                cur = conn.cursor()
                cur.execute(
                    """
                    SELECT s.id, s.brand_id, s.model_name, s.category, s.tech, s.weight, s.drop_mm,
                           b.name as brand_name,
                           c.id as colorway_id, c.name as colorway_name, c.sku, c.retail_price,
                           c.release_date, c.image_url, c.market_price, c.bid, c.ask,
                           c.est_cost, c.markup_pct, c.margin_pct, c.trend
                    FROM sneakers s
                    JOIN brands b ON s.brand_id = b.id
                    JOIN colorways c ON c.sneaker_id = s.id
                    WHERE s.id = ?
                """,
                    (sneaker_id,),
                )
                rows = cur.fetchall()

                if not rows:
                    conn.close()
                    self.send_error_json(f"Sneaker '{sneaker_id}' not found", 404)
                    return

                first = rows[0]
                colorways = []
                for r in rows:
                    cur.execute(
                        "SELECT part, material, site FROM parts WHERE colorway_id = ?",
                        (r[8],),
                    )
                    parts_rows = cur.fetchall()
                    parts = [
                        {"part": pr[0], "material": pr[1], "site": pr[2]}
                        for pr in parts_rows
                    ]
                    colorways.append(
                        {
                            "id": r[8],
                            "name": r[9],
                            "sku": r[10],
                            "retail_price": r[11],
                            "release_date": r[12],
                            "image_url": r[13],
                            "market_price": r[14],
                            "bid": r[15],
                            "ask": r[16],
                            "est_cost": r[17],
                            "markup_pct": r[18],
                            "margin_pct": r[19],
                            "trend": r[20],
                            "parts": parts,
                        }
                    )
                conn.close()

                sneaker = {
                    "id": first[0],
                    "brand_id": first[1],
                    "model_name": first[2],
                    "category": first[3],
                    "tech": first[4],
                    "weight": first[5],
                    "drop": first[6],
                    "brand": {"id": first[1], "name": first[7]},
                    "colorways": colorways,
                }
            self.send_json(sneaker)
            return

        if path.startswith("/api/sneakers/") and path.endswith("/prices"):
            parts = path.split("/")
            if len(parts) != 5:
                self.send_error_json("Invalid price endpoint", 400)
                return
            sneaker_id = parts[3]
            range_str = query.get("range", ["all"])[0]
            if range_str not in ["1m", "6m", "1y", "all"]:
                range_str = "all"

            with LOCK:
                conn = sqlite3.connect(get_db_path())
                cur = conn.cursor()
                cur.execute(
                    "SELECT market_price, retail_price FROM colorways WHERE sneaker_id = ? LIMIT 1",
                    (sneaker_id,),
                )
                row = cur.fetchone()
                conn.close()

            if not row:
                self.send_error_json(f"Sneaker '{sneaker_id}' not found", 404)
                return

            market_price, retail_price = row
            prices = generate_price_series(retail_price, market_price, range_str)
            self.send_json({"sneaker_id": sneaker_id, "range": range_str, "prices": prices})
            return

        self.send_error_json("Not found", 404)

    def handle_static(self, path):
        if path.startswith("/data/"):
            self.send_error_json("Forbidden", 403)
            return

        if ".." in path:
            self.send_error_json("Forbidden", 403)
            return

        if path == "/":
            path = "/index.html"

        clean_path = path.lstrip("/")
        file_path = get_web_root() / clean_path

        if not file_path.exists() or not file_path.is_file():
            self.send_error_json("Not found", 404)
            return

        try:
            with open(file_path, "rb") as f:
                content = f.read()

            self.send_response(200)
            if path.endswith(".html"):
                self.send_header("Content-Type", "text/html; charset=utf-8")
            elif path.endswith(".css"):
                self.send_header("Content-Type", "text/css; charset=utf-8")
            elif path.endswith(".js"):
                self.send_header("Content-Type", "application/javascript")
            elif path.endswith(".jpg") or path.endswith(".jpeg"):
                self.send_header("Content-Type", "image/jpeg")
            elif path.endswith(".png"):
                self.send_header("Content-Type", "image/png")
            elif path.endswith(".svg"):
                self.send_header("Content-Type", "image/svg+xml")
            elif path.endswith(".ico"):
                self.send_header("Content-Type", "image/x-icon")
            else:
                self.send_header("Content-Type", "application/octet-stream")
            self.send_header("Content-Length", str(len(content)))
            self.send_cors_headers()
            self.end_headers()
            self.wfile.write(content)
        except Exception as e:
            self.send_error_json(str(e), 500)

    def log_message(self, format, *args):
        pass


def main():
    global DB_PATH, WEB_ROOT, DATA_SPINE_PATH

    parser = argparse.ArgumentParser(description="House of Articles API Server")
    parser.add_argument("--port", type=int, default=8789, help="Port to listen on")
    parser.add_argument("--host", default="127.0.0.1", help="Host to bind to")
    parser.add_argument(
        "--no-browser", action="store_true", help="Do not open browser"
    )
    args = parser.parse_args()

    script_dir = Path(__file__).parent.resolve()
    project_dir = script_dir.parent

    db_path_str = Path(__file__).parent / "data" / "hoa.db"
    DB_PATH = db_path_str.resolve()

    import os
    env_db = os.environ.get("HOA_DB")
    if env_db:
        DB_PATH = Path(env_db).resolve()

    WEB_ROOT = (project_dir / "web").resolve()
    DATA_SPINE_PATH = (project_dir / "data" / "data-spine.json").resolve()

    if not DB_PATH.parent.exists():
        DB_PATH.parent.mkdir(parents=True, exist_ok=True)

    print(f"Database: {DB_PATH}")
    print(f"Web root: {WEB_ROOT}")
    print(f"Data spine: {DATA_SPINE_PATH}")

    if not DB_PATH.exists() or DB_PATH.stat().st_size == 0:
        print("Seeding database from data-spine.json...")
        init_db(str(DB_PATH), str(DATA_SPINE_PATH))
        print("Database seeded.")
    else:
        print("Database already exists.")

    server = HTTPServer((args.host, args.port), HOAHandler)
    print(f"Server running at http://{args.host}:{args.port}")

    if not args.no_browser:
        try:
            import webbrowser
            webbrowser.open(f"http://{args.host}:{args.port}")
        except Exception:
            pass

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down...")
        server.shutdown()


if __name__ == "__main__":
    main()
