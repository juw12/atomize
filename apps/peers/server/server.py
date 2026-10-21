#!/usr/bin/env python3
"""Peers prototype backend.

Zero-dependency HTTP server (Python standard library only) that serves the
static Peers front-end and exposes a small JSON persistence API backed by
SQLite. State injection happens at serve-time: index.html and mobile.html
are read from disk, injected with a small shim script, and served without
modifying the on-disk files.

Usage:
    python server.py                 # http://127.0.0.1:8788/ (opens browser)
    python server.py --port 9000     # custom port
    python server.py --no-browser    # do not open a browser

The same API is reachable from a page opened directly via file:// because all
responses carry permissive CORS headers.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sqlite3
import threading
import webbrowser
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlparse

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

BASE_DIR = Path(__file__).resolve().parent
WEB_DIR = BASE_DIR.parent / "web"
APP_NAME = "peers"
APP_VERSION = "1.0"

DB_PATH = Path(os.environ.get("PEERS_DB") or (BASE_DIR / "data" / "peers.db"))

CONTENT_TYPES = {
    ".html": "text/html; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".mjs": "application/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".webmanifest": "application/manifest+json; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".ico": "image/x-icon",
    ".txt": "text/plain; charset=utf-8",
    ".md": "text/markdown; charset=utf-8",
    ".woff": "font/woff",
    ".woff2": "font/woff2",
}

_DB_LOCK = threading.Lock()

LS_KEY_INDEX = "peers_demo_v3"
LS_KEY_MOBILE = "peers_mobile_v1"

# ---------------------------------------------------------------------------
# Seed data
# ---------------------------------------------------------------------------


def build_seed_state() -> dict:
    """Return the full first-run seed document for the Peers app."""
    return {
        "meId": "user_demo_001",
        "me": {
            "name": "Demo User",
            "id": "user_demo_001",
            "bio": "Exploring places and trying new foods. Love photography and travel."
        },
        "language": "en",
        "country": "US",
        "currency": "USD",
        "currencySymbol": "$",
        "timezone": "America/New_York",
        "users": [
            {"id": "user_demo_001", "name": "Demo User", "avatar": ""},
            {"id": "user_002", "name": "Alice Chen", "avatar": ""},
            {"id": "user_003", "name": "Bob Martinez", "avatar": ""},
        ],
        "places": [
            {
                "id": "place_001",
                "name": "Central Park Cafe",
                "lat": 40.785091,
                "lng": -73.968285,
                "address": "Central Park, New York, NY",
                "rating": 4.5,
                "reviewCount": 128,
                "category": "cafe",
                "photos": [],
                "description": "Cozy cafe with great coffee and park views."
            },
            {
                "id": "place_002",
                "name": "Brooklyn Bridge Park",
                "lat": 40.702324,
                "lng": -73.996864,
                "address": "Brooklyn, NY",
                "rating": 4.8,
                "reviewCount": 256,
                "category": "park",
                "photos": [],
                "description": "Waterfront park with stunning Manhattan views."
            },
        ],
        "reviews": [
            {
                "id": "review_001",
                "placeId": "place_001",
                "userId": "user_002",
                "rating": 5,
                "text": "Amazing coffee and atmosphere!",
                "date": "2026-10-15T14:30:00Z",
                "photos": []
            },
            {
                "id": "review_002",
                "placeId": "place_002",
                "userId": "user_003",
                "rating": 4,
                "text": "Great for weekend walks. Can get crowded.",
                "date": "2026-10-18T10:00:00Z",
                "photos": []
            },
        ],
        "collections": [
            {
                "id": "collection_001",
                "name": "NYC Favorites",
                "userId": "user_demo_001",
                "placeIds": ["place_001", "place_002"],
                "created": "2026-10-01T00:00:00Z"
            },
        ],
        "sellers": [
            {
                "id": "seller_001",
                "name": "Artisan Goods Co",
                "userId": "user_002",
                "rating": 4.7,
                "productCount": 24
            },
        ],
        "products": [
            {
                "id": "product_001",
                "sellerId": "seller_001",
                "name": "Handmade Ceramic Mug",
                "price": 28.00,
                "currency": "USD",
                "description": "Beautiful handcrafted ceramic mug.",
                "photos": [],
                "category": "home"
            },
        ],
        "productReviews": [
            {
                "id": "prev_001",
                "productId": "product_001",
                "userId": "user_demo_001",
                "rating": 5,
                "text": "Love this mug! Perfect size and weight.",
                "date": "2026-10-20T09:00:00Z"
            },
        ],
        "orders": [
            {
                "id": "order_001",
                "userId": "user_demo_001",
                "sellerId": "seller_001",
                "productIds": ["product_001"],
                "total": 28.00,
                "status": "delivered",
                "date": "2026-10-10T00:00:00Z"
            },
        ],
        "complaints": [],
        "reports": [],
        "cart": [],
        "following": ["user_002", "user_003"],
        "visited": ["place_001"],
        "translations": {},
        "notifications": [
            {
                "id": "notif_001",
                "type": "review",
                "text": "Alice Chen reviewed Central Park Cafe",
                "date": "2026-10-15T14:30:00Z",
                "read": False
            },
        ],
        "threads": [],
        "subscriptions": [],
        "auth": {},
        "placeTab": "about",
        "mapFilter": "all",
        "marketSort": "popular"
    }


# ---------------------------------------------------------------------------
# Persistence
# ---------------------------------------------------------------------------


def _connect() -> sqlite3.Connection:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    return sqlite3.connect(str(DB_PATH), timeout=10)


def init_db() -> None:
    """Create the tables and seed on first run."""
    with _DB_LOCK:
        conn = _connect()
        try:
            conn.execute(
                "CREATE TABLE IF NOT EXISTS store ("
                "collection TEXT PRIMARY KEY, value TEXT NOT NULL)"
            )
            conn.execute(
                "CREATE TABLE IF NOT EXISTS users ("
                "id INTEGER PRIMARY KEY AUTOINCREMENT, "
                "email TEXT UNIQUE NOT NULL, "
                "password_hash TEXT NOT NULL, "
                "name TEXT NOT NULL, "
                "created TEXT NOT NULL)"
            )
            conn.commit()
            existing = {row[0] for row in conn.execute("SELECT collection FROM store").fetchall()}
        finally:
            conn.close()
    
    all_keys = [
        "meId", "me", "language", "country", "currency", "currencySymbol",
        "timezone", "users", "places", "reviews", "collections", "sellers",
        "products", "productReviews", "orders", "complaints", "reports",
        "cart", "following", "visited", "translations", "notifications",
        "threads", "subscriptions", "auth", "placeTab", "mapFilter", "marketSort"
    ]
    missing = [name for name in all_keys if name not in existing]
    if missing:
        seed_missing(missing)


def seed_all() -> None:
    seeds = build_seed_state()
    with _DB_LOCK:
        conn = _connect()
        try:
            for name, value in seeds.items():
                conn.execute(
                    "INSERT OR REPLACE INTO store(collection, value) VALUES(?, ?)",
                    (name, json.dumps(value, ensure_ascii=False)),
                )
            conn.commit()
        finally:
            conn.close()


def seed_missing(names) -> None:
    """Insert seed rows only for collections not yet present."""
    seeds = build_seed_state()
    with _DB_LOCK:
        conn = _connect()
        try:
            for name in names:
                conn.execute(
                    "INSERT OR REPLACE INTO store(collection, value) VALUES(?, ?)",
                    (name, json.dumps(seeds[name], ensure_ascii=False)),
                )
            conn.commit()
        finally:
            conn.close()


def reset_db() -> None:
    with _DB_LOCK:
        conn = _connect()
        try:
            conn.execute("DELETE FROM store")
            conn.execute("DELETE FROM users")
            conn.commit()
        finally:
            conn.close()
    seed_all()


def get_value(name: str):
    with _DB_LOCK:
        conn = _connect()
        try:
            row = conn.execute(
                "SELECT value FROM store WHERE collection = ?", (name,)
            ).fetchone()
        finally:
            conn.close()
    return json.loads(row[0]) if row else None


def set_value(name: str, value) -> None:
    payload = json.dumps(value, ensure_ascii=False)
    with _DB_LOCK:
        conn = _connect()
        try:
            conn.execute(
                "INSERT OR REPLACE INTO store(collection, value) VALUES(?, ?)",
                (name, payload),
            )
            conn.commit()
        finally:
            conn.close()


def get_all() -> dict:
    with _DB_LOCK:
        conn = _connect()
        try:
            rows = conn.execute("SELECT collection, value FROM store").fetchall()
        finally:
            conn.close()
    data = {}
    for name, raw in rows:
        data[name] = json.loads(raw)
    return data


def create_user(email: str, password_hash: str, name: str) -> dict:
    with _DB_LOCK:
        conn = _connect()
        try:
            conn.execute(
                "INSERT INTO users(email, password_hash, name, created) VALUES(?, ?, ?, ?)",
                (email, password_hash, name, now_iso()),
            )
            conn.commit()
            row = conn.execute(
                "SELECT id, email, name, created FROM users WHERE email = ?",
                (email,)
            ).fetchone()
        finally:
            conn.close()
    return {"id": row[0], "email": row[1], "name": row[2], "created": row[3]}


def get_user_by_email(email: str):
    with _DB_LOCK:
        conn = _connect()
        try:
            row = conn.execute(
                "SELECT id, email, name, created, password_hash FROM users WHERE email = ?",
                (email,)
            ).fetchone()
        finally:
            conn.close()
    if not row:
        return None
    return {"id": row[0], "email": row[1], "name": row[2], "created": row[3], "password_hash": row[4]}


def now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def build_state() -> dict:
    return get_all()


# ---------------------------------------------------------------------------
# HTML Injection
# ---------------------------------------------------------------------------


def build_injection_shim(ls_key: str, server_state: dict) -> str:
    """Build the injection script that hydrates localStorage and syncs writes."""
    state_json = json.dumps(server_state, ensure_ascii=False)
    state_json_escaped = state_json.replace('\\', '\\\\').replace('</script>', '<\\/script>')
    
    shim = f"""<script>
(function(){{
  var KEY={json.dumps(ls_key)};
  var serverState={state_json_escaped};
  if(serverState&&typeof localStorage!=='undefined'){{
    try{{
      localStorage.setItem(KEY,JSON.stringify(serverState));
    }}catch(e){{}}
  }}
  var origSetItem=Storage.prototype.setItem;
  var origRemoveItem=Storage.prototype.removeItem;
  var apiBase=(location.pathname.replace(/[^/]*$/,'')+'api').replace(/\\/+/g,'/');
  Storage.prototype.setItem=function(key,value){{
    origSetItem.call(this,key,value);
    if(key===KEY){{
      fetch(apiBase+'/state',{{method:'PUT',headers:{{'Content-Type':'application/json'}},body:value}}).catch(function(){{}});
    }}
  }};
  Storage.prototype.removeItem=function(key){{
    origRemoveItem.call(this,key);
    if(key===KEY){{
      fetch(apiBase+'/state',{{method:'PUT',headers:{{'Content-Type':'application/json'}},body:JSON.stringify({{}})}}).catch(function(){{}});
    }}
  }};
}})();
</script>"""
    return shim


def inject_html(content: str, ls_key: str, server_state: dict) -> str:
    """Inject the shim script before the first <script tag."""
    shim = build_injection_shim(ls_key, server_state)
    match = re.search(r'<script', content, re.IGNORECASE)
    if match:
        return content[:match.start()] + shim + content[match.start():]
    return shim + content


# ---------------------------------------------------------------------------
# HTTP handler
# ---------------------------------------------------------------------------


class PeersHandler(BaseHTTPRequestHandler):
    server_version = "Peers/" + APP_VERSION
    protocol_version = "HTTP/1.1"

    def _send_bytes(self, status, body: bytes, content_type, extra=None) -> None:
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        if extra:
            for key, value in extra.items():
                self.send_header(key, value)
        self.end_headers()
        if self.command != "HEAD":
            try:
                self.wfile.write(body)
            except (BrokenPipeError, ConnectionResetError):
                pass

    def send_json(self, status, obj, extra=None) -> None:
        body = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        headers = {"Cache-Control": "no-store"}
        if extra:
            headers.update(extra)
        self._send_bytes(status, body, "application/json; charset=utf-8", headers)

    def send_error_json(self, status, message) -> None:
        self.send_json(status, {"error": message})

    def _read_body(self):
        length = self.headers.get("Content-Length")
        if not length:
            return b""
        try:
            size = int(length)
        except (TypeError, ValueError):
            return b""
        if size <= 0:
            return b""
        return self.rfile.read(size)

    def _parse_body_json(self):
        raw = self._read_body()
        if not raw:
            return False, "request body is empty"
        try:
            return True, json.loads(raw.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError):
            return False, "malformed JSON body"

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header(
            "Access-Control-Allow-Methods", "GET, PUT, POST, OPTIONS"
        )
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Access-Control-Max-Age", "86400")
        self.send_header("Content-Length", "0")
        self.end_headers()

    def do_HEAD(self):
        self._route("GET")

    def do_GET(self):
        self._route("GET")

    def do_PUT(self):
        self._route("PUT")

    def do_POST(self):
        self._route("POST")

    def do_DELETE(self):
        self.send_error_json(404, "not found")

    def _route(self, method):
        path = urlparse(self.path).path
        if path.startswith("/api/"):
            self._handle_api(method, path[len("/api/"):])
        elif path == "/api":
            self.send_error_json(404, "not found")
        else:
            self._serve_static(path, method)

    def _handle_api(self, method, rest):
        segments = [seg for seg in rest.split("/") if seg]
        if not segments:
            self.send_error_json(404, "not found")
            return
        name = segments[0]

        if method == "GET":
            self._api_get(name, segments[1:] if len(segments) > 1 else None)
        elif method == "PUT":
            self._api_put(name)
        elif method == "POST":
            self._api_post(name)
        else:
            self.send_error_json(404, "not found")

    def _api_get(self, name, subpath):
        if name == "health":
            self.send_json(200, {"status": "ok", "app": APP_NAME, "version": APP_VERSION})
            return
        if name == "state":
            self.send_json(200, build_state())
            return
        if name == "users" and subpath and subpath[0] == "me":
            self.send_json(200, {"ok": True, "user": None})
            return
        self.send_error_json(404, "unknown endpoint")

    def _api_put(self, name):
        if name == "state":
            ok, value = self._parse_body_json()
            if not ok:
                self.send_error_json(400, value)
                return
            if not isinstance(value, dict):
                self.send_error_json(400, "state must be a JSON object")
                return
            for k, v in value.items():
                set_value(k, v)
            self.send_json(200, {"ok": True})
            return
        self.send_error_json(404, "not found")

    def _api_post(self, name):
        if name == "reset":
            reset_db()
            self.send_json(200, {"ok": True})
            return
        if name == "auth":
            ok, body = self._parse_body_json()
            if not ok:
                self.send_error_json(400, body)
                return
            action = body.get("action") if isinstance(body, dict) else None
            if action == "signup":
                email = body.get("email", "").strip().lower()
                password = body.get("password", "")
                name = body.get("name", "").strip() or email.split("@")[0]
                if not email or "@" not in email:
                    self.send_error_json(400, "invalid email")
                    return
                if len(password) < 6:
                    self.send_error_json(400, "password too short")
                    return
                import hashlib
                pw_hash = hashlib.sha256(password.encode()).hexdigest()
                try:
                    user = create_user(email, pw_hash, name)
                    self.send_json(200, {"ok": True, "user": {"id": user["id"], "email": user["email"], "name": user["name"]}})
                except sqlite3.IntegrityError:
                    self.send_error_json(400, "email already exists")
                return
            if action == "signin":
                email = body.get("email", "").strip().lower()
                password = body.get("password", "")
                if not email or not password:
                    self.send_error_json(400, "email and password required")
                    return
                import hashlib
                pw_hash = hashlib.sha256(password.encode()).hexdigest()
                user = get_user_by_email(email)
                if user and user["password_hash"] == pw_hash:
                    self.send_json(200, {"ok": True, "user": {"id": user["id"], "email": user["email"], "name": user["name"]}})
                else:
                    self.send_error_json(401, "invalid credentials")
                return
            if action == "logout":
                self.send_json(200, {"ok": True})
                return
            self.send_error_json(400, "unknown auth action")
            return
        self.send_error_json(404, "not found")

    def _serve_static(self, path, method):
        if path in ("", "/"):
            rel = "index.html"
        else:
            rel = unquote(path).lstrip("/")

        first = rel.replace("\\", "/").split("/", 1)[0]
        if first == "data":
            self.send_error_json(404, "not found")
            return

        try:
            target = (WEB_DIR / rel).resolve()
            target.relative_to(WEB_DIR)
        except ValueError:
            self.send_error_json(404, "not found")
            return

        if not target.is_file():
            self.send_error_json(404, "not found")
            return

        content_type = CONTENT_TYPES.get(
            target.suffix.lower(), "application/octet-stream"
        )
        
        body = target.read_bytes()
        
        if rel == "index.html":
            state = build_state()
            html_content = body.decode("utf-8")
            injected = inject_html(html_content, LS_KEY_INDEX, state)
            body = injected.encode("utf-8")
            content_type = "text/html; charset=utf-8"
        elif rel == "mobile.html":
            state = build_state()
            html_content = body.decode("utf-8")
            injected = inject_html(html_content, LS_KEY_MOBILE, state)
            body = injected.encode("utf-8")
            content_type = "text/html; charset=utf-8"

        self._send_bytes(200, body, content_type, {"Cache-Control": "no-cache"})

    def log_message(self, fmt, *args):
        print("[peers] %s - %s" % (self.address_string(), fmt % args))


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------


def main() -> None:
    parser = argparse.ArgumentParser(description="Peers prototype server")
    parser.add_argument("--port", type=int, default=8788,
                        help="port to listen on (default 8788)")
    parser.add_argument("--host", default="127.0.0.1",
                        help="host to bind (default 127.0.0.1)")
    parser.add_argument("--no-browser", action="store_true",
                        help="do not open a browser window on start")
    args = parser.parse_args()

    init_db()

    httpd = ThreadingHTTPServer((args.host, args.port), PeersHandler)
    httpd.daemon_threads = True
    url = "http://%s:%d/" % (args.host, args.port)

    print("Peers prototype server")
    print("  serving: %s" % WEB_DIR)
    print("  database: %s" % DB_PATH)
    print("  url: %s" % url)
    print("  press Ctrl+C to stop")

    if not args.no_browser:
        try:
            webbrowser.open(url)
        except Exception:
            pass

    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n[peers] shutting down")
    finally:
        httpd.server_close()


if __name__ == "__main__":
    main()
