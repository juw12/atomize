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
import socket
import socketserver
import sys
import threading
import webbrowser
from functools import partial
from pathlib import Path

WEB_DIR = (Path(__file__).resolve().parent.parent / "web").resolve()


class Handler(http.server.SimpleHTTPRequestHandler):
    """Static handler with two conveniences for a device-test tool."""

    def end_headers(self):
        # Never let the browser cache the shell while we are iterating.
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def log_message(self, fmt, *args):  # quieter, but still shows 4xx/5xx
        status = args[1] if len(args) > 1 else ""
        if isinstance(status, str) and status[:1] in ("4", "5"):
            sys.stderr.write("  %s\n" % (fmt % args))


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
    args = parser.parse_args()

    if not (WEB_DIR / "index.html").exists():
        raise SystemExit(f"index.html not found under {WEB_DIR}")

    port = free_port(args.port)
    url = f"http://127.0.0.1:{port}/"

    handler = partial(Handler, directory=str(WEB_DIR))
    socketserver.TCPServer.allow_reuse_address = True

    with socketserver.TCPServer(("127.0.0.1", port), handler) as httpd:
        print("Airiz Motor Test Console")
        print(f"  serving : {WEB_DIR}")
        print(f"  open    : {url}")
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
