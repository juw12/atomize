"""Share Lingua with your phone over Wi-Fi.

The MaaS gateway is a plain-HTTP endpoint that sends no CORS headers, so a
phone browser cannot call it directly from any web page (and it is usually
only reachable from the office network). This module runs a tiny web server
on the laptop that:

* serves the PWA in ``web/`` (Read picture, Mobile, Web pages);
* relays ``/gateway/<token>/ocr/chat/completions`` and
  ``/gateway/<token>/llm/chat/completions`` to the real gateway, adding the
  laptop's API key server-side, so the key never reaches the phone;
* hands the page its settings at ``/local-config.json?pair=<token>``.

Only devices that opened the pairing link (it carries a random token) can use
the relay; every other request to ``/gateway/`` gets 403. Only the two
``chat/completions`` endpoints are relayed. No tkinter here; stdlib only.
"""

from __future__ import annotations

import json
import os
import secrets
import socket
import threading
import urllib.error
import urllib.request
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

from engine import maas

#: Default port for the phone link (http://<laptop-ip>:8765/picture.html).
DEFAULT_PORT = 8765

#: Largest request body relayed to the gateway (a 1600 px picture is ~1-3 MB of base64).
MAX_BODY = 20 * 1024 * 1024

WEB_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "web")


def lan_ip() -> str:
    """Best guess at this machine's Wi-Fi/LAN address (no packets are sent)."""
    probe = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        probe.connect(("10.255.255.255", 1))
        return probe.getsockname()[0]
    except OSError:
        return "127.0.0.1"
    finally:
        probe.close()


class _Handler(SimpleHTTPRequestHandler):
    server_version = "LinguaLocal/1.0"

    # Set per server instance via functools-free subclassing in LocalServer.
    token: str = ""
    targets: dict = {}
    api_key_fn = staticmethod(lambda: None)

    def log_message(self, fmt, *args):  # keep the console quiet (and keys out of logs)
        pass

    def end_headers(self):
        # Pages must not be cached aggressively: the phone should pick up updates.
        self.send_header("Cache-Control", "no-cache")
        super().end_headers()

    # -- helpers -------------------------------------------------------------

    def _json(self, status: int, payload: dict) -> None:
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _token_ok(self, candidate: str) -> bool:
        return bool(candidate) and secrets.compare_digest(candidate, self.token)

    # -- routes --------------------------------------------------------------

    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.path == "/local-config.json":
            pair = (parse_qs(parsed.query).get("pair") or [""])[0]
            if not self._token_ok(pair):
                self._json(403, {"error": "open the pairing link shown in Lingua on your laptop"})
                return
            self._json(200, {
                "gatewayOcrBase": "/gateway/{}/ocr".format(self.token),
                "gatewayLlmBase": "/gateway/{}/llm".format(self.token),
                "apiKey": "relayed-by-laptop",
                "relay": True,
                "llmModel": self.targets.get("llm_model"),
                "models": self.targets.get("models"),
            })
            return
        if parsed.path in ("", "/"):
            self.send_response(302)
            self.send_header("Location", "/picture.html")
            self.end_headers()
            return
        super().do_GET()

    def do_POST(self):
        parts = urlparse(self.path).path.strip("/").split("/")
        # gateway/<token>/<ocr|llm>/chat/completions
        if len(parts) != 5 or parts[0] != "gateway" or parts[3:] != ["chat", "completions"]:
            self._json(404, {"error": "not found"})
            return
        if not self._token_ok(parts[1]):
            self._json(403, {"error": "not paired"})
            return
        base = self.targets.get(parts[2])
        if not base:
            self._json(404, {"error": "unknown gateway"})
            return
        key = self.api_key_fn()
        if not key:
            self._json(500, {"error": "the laptop has no MaaS API key configured"})
            return
        try:
            length = int(self.headers.get("Content-Length") or 0)
        except ValueError:
            length = 0
        if length <= 0 or length > MAX_BODY:
            self._json(413, {"error": "request too large or empty"})
            return
        body = self.rfile.read(length)

        upstream = urllib.request.Request(
            base.rstrip("/") + "/chat/completions",
            data=body,
            method="POST",
            headers={"Authorization": "Bearer " + key, "Content-Type": "application/json"},
        )
        try:
            with urllib.request.urlopen(upstream, timeout=90) as resp:
                status, payload = resp.status, resp.read()
                ctype = resp.headers.get("Content-Type", "application/json")
        except urllib.error.HTTPError as err:
            status, payload = err.code, err.read()
            ctype = err.headers.get("Content-Type", "text/plain")
        except (urllib.error.URLError, OSError) as err:
            self._json(502, {"error": "laptop could not reach the gateway: {}".format(err)})
            return
        self.send_response(status)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)


class LocalServer:
    """Background web server + gateway relay for phones on the same network."""

    def __init__(self, port: int = DEFAULT_PORT, host: str = "0.0.0.0", web_dir: str = WEB_DIR,
                 token: str | None = None, ocr_base: str | None = None,
                 llm_base: str | None = None, api_key_fn=None) -> None:
        self.token = token or secrets.token_urlsafe(9)
        targets = {
            "ocr": ocr_base or maas.OCR_BASE,
            "llm": llm_base or maas.LLM_BASE,
            "llm_model": maas.LLM_MODEL,
            "models": list(maas.MODELS),
        }
        handler = type("LinguaHandler", (_Handler,), {
            "token": self.token,
            "targets": targets,
            "api_key_fn": staticmethod(api_key_fn or maas.discover_api_key),
        })
        directory = web_dir

        def factory(*args, **kwargs):
            return handler(*args, directory=directory, **kwargs)

        self.httpd = ThreadingHTTPServer((host, port), factory)
        self.port = self.httpd.server_address[1]
        self._thread: threading.Thread | None = None

    @property
    def phone_url(self) -> str:
        return "http://{}:{}/picture.html?pair={}".format(lan_ip(), self.port, self.token)

    def start(self) -> "LocalServer":
        self._thread = threading.Thread(target=self.httpd.serve_forever, daemon=True)
        self._thread.start()
        return self

    def stop(self) -> None:
        self.httpd.shutdown()
        self.httpd.server_close()
