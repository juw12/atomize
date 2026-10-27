"""Phone-sharing relay tests: fake gateway on localhost, no real network."""

import json
import os
import sys
import threading
import unittest
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

# Local test servers must never go through a (possibly dead) HTTP proxy.
os.environ["NO_PROXY"] = "127.0.0.1,localhost," + os.environ.get("NO_PROXY", "")
os.environ["no_proxy"] = os.environ["NO_PROXY"]
_APP_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault("LINGUA_LOCAL_FALLBACK", "0")
if _APP_DIR not in sys.path:
    sys.path.insert(0, _APP_DIR)

try:
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")
except Exception:
    pass

from engine.local_server import LocalServer  # noqa: E402

SECRET = "laptop-secret-key"
TOKEN = "pair-token-123"


class FakeGateway(BaseHTTPRequestHandler):
    seen = []

    def log_message(self, *args):
        pass

    def do_POST(self):
        body = self.rfile.read(int(self.headers["Content-Length"]))
        FakeGateway.seen.append((self.path, self.headers.get("Authorization"), json.loads(body)))
        reply = json.dumps({"choices": [{"message": {"content": "echo " + self.path}}]}).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(reply)))
        self.end_headers()
        self.wfile.write(reply)


def _request(url, data=None, headers=None):
    req = urllib.request.Request(url, data=data, headers=headers or {}, method="POST" if data else "GET")
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            return resp.status, resp.read()
    except urllib.error.HTTPError as err:
        return err.code, err.read()


class LocalServerTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.gateway = ThreadingHTTPServer(("127.0.0.1", 0), FakeGateway)
        threading.Thread(target=cls.gateway.serve_forever, daemon=True).start()
        gw = "http://127.0.0.1:{}".format(cls.gateway.server_address[1])
        cls.server = LocalServer(
            port=0, host="127.0.0.1", token=TOKEN,
            ocr_base=gw + "/ocr/v1", llm_base=gw + "/llm/v1",
            api_key_fn=lambda: SECRET,
        ).start()
        cls.base = "http://127.0.0.1:{}".format(cls.server.port)

    @classmethod
    def tearDownClass(cls):
        cls.server.stop()
        cls.gateway.shutdown()

    def setUp(self):
        FakeGateway.seen.clear()

    def _post(self, path, payload=None, headers=None):
        data = json.dumps(payload or {"model": "m", "messages": []}).encode()
        hdrs = {"Content-Type": "application/json"}
        hdrs.update(headers or {})
        return _request(self.base + path, data, hdrs)

    def test_serves_picture_page(self):
        status, body = _request(self.base + "/picture.html")
        self.assertEqual(status, 200)
        self.assertIn(b"Read picture", body)

    def test_root_redirects_to_picture_page(self):
        status, body = _request(self.base + "/")
        self.assertEqual(status, 200)  # urllib follows the 302
        self.assertIn(b"Picture in, words out", body)

    def test_config_needs_pairing_token(self):
        status, _ = _request(self.base + "/local-config.json")
        self.assertEqual(status, 403)
        status, _ = _request(self.base + "/local-config.json?pair=wrong")
        self.assertEqual(status, 403)

    def test_config_with_token_never_contains_real_key(self):
        status, body = _request(self.base + "/local-config.json?pair=" + TOKEN)
        self.assertEqual(status, 200)
        cfg = json.loads(body)
        self.assertTrue(cfg["relay"])
        self.assertEqual(cfg["gatewayOcrBase"], "/gateway/{}/ocr".format(TOKEN))
        self.assertNotIn(SECRET, body.decode())

    def test_relay_adds_laptop_key_and_ignores_phone_header(self):
        status, body = self._post(
            "/gateway/{}/ocr/chat/completions".format(TOKEN),
            {"model": "deepseek", "messages": [{"role": "user", "content": "hi"}]},
            {"Authorization": "Bearer relayed-by-laptop"},
        )
        self.assertEqual(status, 200)
        self.assertEqual(json.loads(body)["choices"][0]["message"]["content"], "echo /ocr/v1/chat/completions")
        path, auth, payload = FakeGateway.seen[0]
        self.assertEqual(auth, "Bearer " + SECRET)
        self.assertEqual(payload["model"], "deepseek")

    def test_llm_route(self):
        status, _ = self._post("/gateway/{}/llm/chat/completions".format(TOKEN))
        self.assertEqual(status, 200)
        self.assertEqual(FakeGateway.seen[0][0], "/llm/v1/chat/completions")

    def test_relay_rejects_wrong_token(self):
        status, _ = self._post("/gateway/wrong/ocr/chat/completions")
        self.assertEqual(status, 403)
        self.assertEqual(FakeGateway.seen, [])

    def test_relay_rejects_other_paths(self):
        for path in (
            "/gateway/{}/ocr/models".format(TOKEN),
            "/gateway/{}/other/chat/completions".format(TOKEN),
            "/somewhere",
        ):
            status, _ = self._post(path)
            self.assertIn(status, (403, 404), path)
        self.assertEqual(FakeGateway.seen, [])

    def test_phone_url_has_token_and_picture_page(self):
        url = self.server.phone_url
        self.assertTrue(url.startswith("http://"))
        self.assertIn("/picture.html?pair=" + TOKEN, url)


if __name__ == "__main__":
    result = unittest.main(exit=False, verbosity=1).result
    sys.exit(0 if result.wasSuccessful() else 1)
