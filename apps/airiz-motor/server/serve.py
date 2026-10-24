#!/usr/bin/env python3
"""Serve the Airiz Motor Test Console on localhost.

The Web Serial API only works in a *secure context*. ``http://localhost``
(and ``http://127.0.0.1``) counts as secure, but ``file://`` does not — so the
app must be served, not opened as a file. This script does exactly that using
only the Python standard library: no dependencies, no build step.

Usage:
    python server/serve.py                # serve web/ on a free port, open browser
    python server/serve.py --port 8777    # fixed port
    python server/serve.py --no-browser   # don't auto-open a browser
"""

import argparse
import http.server
import json
import socket
import socketserver
import sys
import threading
import webbrowser
from functools import partial
from pathlib import Path
from urllib.parse import parse_qs, urlparse

WEB_DIR = (Path(__file__).resolve().parent.parent / "web").resolve()

AUDIO_DIR_DEFAULT = Path(r"E:\Work\RD ME\Project\1-Juwen Project\ARLO\ZIRIS\Console\Audio")


class Handler(http.server.SimpleHTTPRequestHandler):
    """Static handler with two conveniences for a device-test tool."""

    audio_dir = AUDIO_DIR_DEFAULT

    def end_headers(self):
        # Never let the browser cache the shell while we are iterating.
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def log_message(self, fmt, *args):  # quieter, but still shows 4xx/5xx
        status = args[1] if len(args) > 1 else ""
        if isinstance(status, str) and status[:1] in ("4", "5"):
            sys.stderr.write("  %s\n" % (fmt % args))

    def _send_json(self, code, payload):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self):
        parsed = urlparse(self.path)
        if parsed.path != "/api/audio":
            self._send_json(404, {"ok": False, "error": "unknown endpoint"})
            return
        try:
            safe_name = (parse_qs(parsed.query).get("name", [""])[0] or "").strip()
            safe_name = Path(safe_name).name
            if not safe_name or not safe_name.lower().endswith(".wav"):
                self._send_json(400, {"ok": False, "error": "invalid filename"})
                return
            length = int(self.headers.get("Content-Length") or 0)
            if length <= 0:
                self._send_json(400, {"ok": False, "error": "empty body"})
                return
            data = self.rfile.read(length)
            self.audio_dir.mkdir(parents=True, exist_ok=True)
            dest = self.audio_dir / safe_name
            dest.write_bytes(data)
            self._send_json(200, {"ok": True, "path": str(dest), "bytes": len(data)})
        except Exception as exc:
            self._send_json(500, {"ok": False, "error": str(exc)})


def free_port(preferred):
    """Return `preferred` if free, otherwise an OS-assigned free port."""
    for candidate in (preferred, 0):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            try:
                s.bind(("127.0.0.1", candidate))
                return s.getsockname()[1]
            except OSError:
                continue
    raise SystemExit("could not find a free TCP port on 127.0.0.1")


def main():
    parser = argparse.ArgumentParser(description="Serve the Airiz Motor Test Console.")
    parser.add_argument("--port", type=int, default=8777, help="preferred port (default 8777)")
    parser.add_argument("--no-browser", action="store_true", help="do not open a browser")
    parser.add_argument("--audio-dir", default=str(AUDIO_DIR_DEFAULT),
                        help="folder where device audio recordings are saved")
    args = parser.parse_args()

    if not (WEB_DIR / "index.html").exists():
        raise SystemExit(f"index.html not found under {WEB_DIR}")

    port = free_port(args.port)
    url = f"http://127.0.0.1:{port}/"

    Handler.audio_dir = Path(args.audio_dir)
    handler = partial(Handler, directory=str(WEB_DIR))
    socketserver.TCPServer.allow_reuse_address = True

    with socketserver.TCPServer(("127.0.0.1", port), handler) as httpd:
        print("Airiz Motor Test Console")
        print(f"  serving : {WEB_DIR}")
        print(f"  open    : {url}")
        print(f"  audio   : {Handler.audio_dir}")
        print("  note    : connect via Chrome/Edge; use 'Demo Device' with no hardware.")
        print("  stop    : Ctrl+C")
        print(flush=True)

        if not args.no_browser:
            threading.Timer(0.6, lambda: webbrowser.open(url)).start()

        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nshutting down")


if __name__ == "__main__":
    main()
