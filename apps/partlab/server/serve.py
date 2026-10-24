#!/usr/bin/env python3
"""Part Lab local server.

Zero-dependency HTTP server (Python standard library only) that serves the
static Part Lab front-end (``web/``) and exposes a tiny JSON parts API backed
by SQLite. The server is **optional**: the front-end works fully offline; when
this is running it adds local save/load of part definitions (PartDoc JSON).

Usage:
    python server/serve.py                 # http://127.0.0.1:8791/ (opens browser)
    python server/serve.py --port 9000     # custom port
    python server/serve.py --no-browser    # do not open a browser

Environment:
    PARTLAB_DB    override the SQLite database path (used by tests)

All responses carry permissive CORS headers, so the same API is reachable from
a page opened directly via ``file://``.
"""

from __future__ import annotations

import argparse
import json
import os
import sqlite3
import threading
import uuid
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
APP_NAME = "partlab"
APP_VERSION = "1.0"

DB_PATH = Path(os.environ.get("PARTLAB_DB") or (BASE_DIR / "data" / "partlab.db"))

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

# ---------------------------------------------------------------------------
# Persistence
# ---------------------------------------------------------------------------


def _connect() -> sqlite3.Connection:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    return sqlite3.connect(str(DB_PATH), timeout=10)


def init_db() -> None:
    """Create the parts table on first run."""
    with _DB_LOCK:
        conn = _connect()
        try:
            conn.execute(
                "CREATE TABLE IF NOT EXISTS parts ("
                "id TEXT PRIMARY KEY, name TEXT, doc TEXT, updated TEXT)"
            )
            conn.commit()
        finally:
            conn.close()


def now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def _part_name(doc) -> str | None:
    """Extract the display name from a PartDoc, if present and a string."""
    if isinstance(doc, dict):
        name = doc.get("name")
        if isinstance(name, str):
            return name
    return None


def list_parts() -> list:
    """Return the parts index: [{id, name, updated}], newest first."""
    with _DB_LOCK:
        conn = _connect()
        try:
            rows = conn.execute(
                "SELECT id, name, updated FROM parts ORDER BY updated DESC"
            ).fetchall()
        finally:
            conn.close()
    return [{"id": row[0], "name": row[1], "updated": row[2]} for row in rows]


def get_part(part_id: str):
    """Return the stored PartDoc for ``part_id`` or None if missing."""
    with _DB_LOCK:
        conn = _connect()
        try:
            row = conn.execute(
                "SELECT doc FROM parts WHERE id = ?", (part_id,)
            ).fetchone()
        finally:
            conn.close()
    return json.loads(row[0]) if row else None


def upsert_part(part_id: str, doc) -> None:
    """Insert or replace the PartDoc stored under ``part_id``."""
    payload = json.dumps(doc, ensure_ascii=False)
    with _DB_LOCK:
        conn = _connect()
        try:
            conn.execute(
                "INSERT OR REPLACE INTO parts(id, name, doc, updated) "
                "VALUES(?, ?, ?, ?)",
                (part_id, _part_name(doc), payload, now_iso()),
            )
            conn.commit()
        finally:
            conn.close()


def create_part(doc) -> str:
    """Create a new part with a server-generated id; return the id."""
    part_id = "p_" + uuid.uuid4().hex[:12]
    upsert_part(part_id, doc)
    return part_id


def reset_db() -> None:
    """Wipe the parts store."""
    with _DB_LOCK:
        conn = _connect()
        try:
            conn.execute("DELETE FROM parts")
            conn.commit()
        finally:
            conn.close()


# ---------------------------------------------------------------------------
# HTTP handler
# ---------------------------------------------------------------------------


class PartLabHandler(BaseHTTPRequestHandler):
    server_version = "PartLab/" + APP_VERSION
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

    def _read_body(self) -> bytes:
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
        name = unquote(segments[0])

        if name == "health":
            if method == "GET":
                self.send_json(
                    200,
                    {"status": "ok", "app": APP_NAME, "version": APP_VERSION},
                )
            else:
                self.send_error_json(404, "not found")
            return

        if name == "parts":
            self._api_parts(method, segments[1:])
            return

        if name == "reset":
            if method == "POST":
                reset_db()
                self.send_json(200, {"ok": True})
            else:
                self.send_error_json(404, "not found")
            return

        self.send_error_json(404, "unknown endpoint")

    def _api_parts(self, method, subpath):
        if not subpath:
            # /api/parts
            if method == "GET":
                self.send_json(200, {"parts": list_parts()})
                return
            if method == "POST":
                ok, doc = self._parse_body_json()
                if not ok:
                    self.send_error_json(400, doc)
                    return
                part_id = create_part(doc)
                self.send_json(200, {"ok": True, "id": part_id})
                return
            self.send_error_json(404, "not found")
            return

        # /api/parts/<id>
        part_id = unquote(subpath[0])
        if method == "GET":
            doc = get_part(part_id)
            if doc is None:
                self.send_error_json(404, "not found")
            else:
                self.send_json(200, doc)
            return
        if method == "PUT":
            ok, doc = self._parse_body_json()
            if not ok:
                self.send_error_json(400, doc)
                return
            upsert_part(part_id, doc)
            self.send_json(200, {"ok": True, "id": part_id})
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
        self._send_bytes(200, body, content_type, {"Cache-Control": "no-cache"})

    def log_message(self, fmt, *args):
        # Quiet: suppress the default per-request logging.
        pass


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------


def main() -> None:
    parser = argparse.ArgumentParser(description="Part Lab local server")
    parser.add_argument("--port", type=int, default=8791,
                        help="port to listen on (default 8791)")
    parser.add_argument("--host", default="127.0.0.1",
                        help="host to bind (default 127.0.0.1)")
    parser.add_argument("--no-browser", action="store_true",
                        help="do not open a browser window on start")
    args = parser.parse_args()

    init_db()

    httpd = ThreadingHTTPServer((args.host, args.port), PartLabHandler)
    httpd.daemon_threads = True
    url = "http://%s:%d/" % (args.host, args.port)

    print("Part Lab server")
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
        print("\n[partlab] shutting down")
    finally:
        httpd.server_close()


if __name__ == "__main__":
    main()
