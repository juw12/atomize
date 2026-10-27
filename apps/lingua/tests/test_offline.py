"""Translation fallback tests: detection, routing, fallback chain, online opt-in, phone relay.

No real network. A live offline check runs only when the engine and the
English->Traditional Chinese pack are installed on this PC (otherwise skipped).
"""

import json
import os
import sys
import threading
import unittest
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from unittest import mock

# Local test servers must never go through a (possibly dead) HTTP proxy.
os.environ["NO_PROXY"] = "127.0.0.1,localhost," + os.environ.get("NO_PROXY", "")
os.environ["no_proxy"] = os.environ["NO_PROXY"]
os.environ["LINGUA_LOCAL_AI"] = "0"  # these tests cover the offline packs
_APP_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _APP_DIR not in sys.path:
    sys.path.insert(0, _APP_DIR)

try:
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")
except Exception:
    pass

from engine import maas, offline_translate as ot  # noqa: E402
from engine.local_server import LocalServer  # noqa: E402


class DetectTests(unittest.TestCase):
    def test_scripts(self):
        self.assertEqual(ot.detect("請保持門關閉"), "zt")
        self.assertEqual(ot.detect("请保持门关闭"), "zh")
        self.assertEqual(ot.detect("会議は午後三時から"), "ja")
        self.assertEqual(ot.detect("회의실"), "ko")
        self.assertEqual(ot.detect("ห้องประชุม"), "th")
        self.assertEqual(ot.detect("Пожалуйста"), "ru")

    def test_latin(self):
        self.assertEqual(ot.detect("Please keep the door closed."), "en")
        self.assertEqual(ot.detect("Harap pintu ditutup."), "id")
        self.assertEqual(ot.detect("Vui lòng đóng cửa phòng họp."), "vi")
        self.assertEqual(ot.detect("Por favor cierre la puerta."), "es")

    def test_codes(self):
        self.assertEqual(ot.code_for("繁體中文"), "zt")
        self.assertEqual(ot.code_for("Traditional Chinese (繁體中文)"), "zt")
        self.assertEqual(ot.code_for("Japanese (日本語)"), "ja")
        self.assertEqual(ot.code_for("English"), "en")
        self.assertIsNone(ot.code_for("Klingon"))


class RouteTests(unittest.TestCase):
    def test_codes_kept_out_of_model(self):
        split = ot._split_codes
        self.assertEqual(split("MEETING ROOM 3B"), ("", "MEETING ROOM", "3B"))
        self.assertEqual(split("Gate B12"), ("", "Gate", "B12"))
        self.assertEqual(split("#4 Exit"), ("#4", "Exit", ""))
        self.assertEqual(split("1st floor"), ("", "1st floor", ""))
        self.assertEqual(split("3B"), ("", "3B", ""))

    def setUp(self):
        self.index = [{"from_code": a, "to_code": b} for a, b in
                      [("en", "zt"), ("zt", "en"), ("ja", "en"), ("en", "ja"), ("id", "en")]]

    def test_direct_and_pivot(self):
        with mock.patch.object(ot, "is_installed", return_value=False):
            self.assertEqual(ot.route("en", "zt", self.index), [("en", "zt")])
            self.assertEqual(ot.route("ja", "zt", self.index), [("ja", "en"), ("en", "zt")])
            self.assertEqual(ot.route("zt", "zt", self.index), [])

    def test_needed_for_mixed_sign(self):
        sign = "Please keep the door closed.\n請保持門關閉\nHarap pintu ditutup."
        with mock.patch.object(ot, "is_installed", return_value=False):
            needed = ot.needed_for(sign, None, "zt", self.index)
        self.assertIn(("en", "zt"), needed)
        self.assertIn(("id", "en"), needed)
        self.assertNotIn(("zt", "en"), needed)  # Chinese line is already in the target language

    def test_missing_pack_message(self):
        with mock.patch.object(ot, "engine_available", return_value=True), \
                mock.patch.object(ot, "is_installed", return_value=False):
            with self.assertRaises(ot.OfflineError) as ctx:
                ot.translate("Hello", "繁體中文")
        self.assertIn("language pack needed", str(ctx.exception))


class FailingClient(maas.MaasClient):
    def translate(self, *args, **kwargs):
        raise maas.MaasError("HTTP 503: down")


class ChainTests(unittest.TestCase):
    def setUp(self):
        maas.reset_model_health()
        self.client = FailingClient(api_key="k", llm_model="m1")

    def test_offline_after_gateway(self):
        with mock.patch.object(ot, "translate", return_value="請關門") as offline:
            text, engine = self.client.translate_with_fallback("Close the door", "繁體中文",
                                                               models=["m1", "m2"], local_fallback=True,
                                                               allow_online=False)
        self.assertEqual((text, engine), ("請關門", "offline"))
        offline.assert_called_once()

    def test_dead_models_skipped_next_time(self):
        calls = []

        class Counting(FailingClient):
            def translate(self, *args, **kwargs):
                calls.append(self.llm_model)
                raise maas.MaasError("HTTP 404")

        client = Counting(api_key="k", llm_model="m1")
        with mock.patch.object(ot, "translate", return_value="ok"):
            client.translate_with_fallback("x", "English", models=["m1", "m2"], local_fallback=True, allow_online=False)
            client.translate_with_fallback("x", "English", models=["m1", "m2"], local_fallback=True, allow_online=False)
        self.assertEqual(calls, ["m1", "m2"])  # second call goes straight to offline

    def test_online_only_when_allowed(self):
        from engine import online_translate

        with mock.patch.object(ot, "translate", side_effect=ot.OfflineError("offline language pack needed: x")), \
                mock.patch.object(online_translate, "translate", return_value=("門", "Google")) as online:
            with self.assertRaises(maas.MaasError):
                self.client.translate_with_fallback("door", "繁體中文", models=["m1"],
                                                    local_fallback=True, allow_online=False)
            online.assert_not_called()
            maas.reset_model_health()
            text, engine = self.client.translate_with_fallback("door", "繁體中文", models=["m1"],
                                                               local_fallback=True, allow_online=True)
        self.assertEqual((text, engine), ("門", "online:Google"))

    def test_disabled_fallback_raises(self):
        with self.assertRaises(maas.MaasError):
            self.client.translate_with_fallback("x", "English", models=["m1"], local_fallback=False)


class DownGateway(BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def do_POST(self):
        self.rfile.read(int(self.headers["Content-Length"]))
        self.send_response(503)
        self.send_header("Content-Length", "4")
        self.end_headers()
        self.wfile.write(b"down")


class RelayFallbackTests(unittest.TestCase):
    def test_phone_gets_laptop_translation_when_gateway_down(self):
        maas.reset_model_health()
        gateway = ThreadingHTTPServer(("127.0.0.1", 0), DownGateway)
        threading.Thread(target=gateway.serve_forever, daemon=True).start()
        gw = "http://127.0.0.1:{}".format(gateway.server_address[1])
        server = LocalServer(port=0, host="127.0.0.1", api_key_fn=lambda: "secret", token="tok",
                             ocr_base=gw + "/ocr/v1", llm_base=gw + "/llm/v1").start()
        try:
            port = server.port
            body = json.dumps({
                "model": "m1",
                "messages": [
                    {"role": "system", "content": "Translator. The text was read from a picture by OCR. "
                                                  "Translate it into Traditional Chinese (繁體中文), keeping its line breaks. "
                                                  "Output ONLY the translation."},
                    {"role": "user", "content": "(source language: English) Please keep the door closed."},
                ],
            }).encode()
            seen = {}

            def fake_fallback(self, text, target, source=None, **kwargs):
                seen.update(text=text, target=target, source=source, purpose=kwargs.get("purpose"))
                return "請保持門關閉", "offline"

            with mock.patch.object(maas.MaasClient, "translate_with_fallback", fake_fallback):
                req = urllib.request.Request("http://127.0.0.1:{}/gateway/tok/llm/chat/completions".format(port),
                                             data=body, method="POST", headers={"Content-Type": "application/json"})
                with urllib.request.urlopen(req, timeout=20) as resp:
                    status, data = resp.status, json.loads(resp.read())
        finally:
            server.stop()
            gateway.shutdown()
        self.assertEqual(status, 200)
        self.assertEqual(data["choices"][0]["message"]["content"], "請保持門關閉")
        self.assertEqual(data["lingua_engine"], "offline")
        self.assertEqual(seen["text"], "Please keep the door closed.")
        self.assertEqual(seen["source"], "English")
        self.assertIn("Traditional Chinese", seen["target"])
        self.assertEqual(seen["purpose"], "document")


@unittest.skipUnless(ot.engine_available() and ot.is_installed("en", "zt"), "offline pack en->zt not installed")
class LiveOfflineTests(unittest.TestCase):
    def test_real_translation(self):
        out = ot.translate("MEETING ROOM 3B\nPlease keep the door closed.\n請保持門關閉", "繁體中文")
        lines = out.splitlines()
        self.assertEqual(len(lines), 3)
        self.assertNotIn("\u2581", out)
        self.assertEqual(lines[2], "請保持門關閉")  # already Chinese: kept as is
        self.assertTrue(any("\u4e00" <= ch <= "\u9fff" for ch in lines[1]))


if __name__ == "__main__":
    unittest.main(verbosity=2)
