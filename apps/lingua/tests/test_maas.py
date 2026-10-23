"""MaaS tests with the HTTP layer mocked. No network is touched."""

import json
import os
import sys
import tempfile
import unittest
from unittest import mock

_APP_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _APP_DIR not in sys.path:
    sys.path.insert(0, _APP_DIR)

try:
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")
except Exception:
    pass

from engine import maas  # noqa: E402

TEST_KEY = "test-key-123456"


class FakeResponse:
    def __init__(self, status_code=200, payload=None, text=""):
        self.status_code = status_code
        self._payload = payload
        self.text = text

    def json(self):
        if self._payload is None:
            raise ValueError("no JSON body")
        return self._payload


def _reply(content):
    return {"choices": [{"message": {"content": content}}]}


class OcrRequestShapeTests(unittest.TestCase):
    def _call(self, content="Hello caption"):
        client = maas.MaasClient(api_key=TEST_KEY)
        with mock.patch.object(maas.requests, "post",
                               return_value=FakeResponse(200, _reply(content))) as post:
            result = client.ocr(b"\x89PNG-bytes", "image/png")
        return result, post.call_args

    def test_ocr_endpoint_and_headers(self):
        _, args = self._call()
        self.assertEqual(args.args[0], maas.OCR_BASE + "/chat/completions")
        headers = args.kwargs["headers"]
        self.assertEqual(headers["Authorization"], "Bearer " + TEST_KEY)

    def test_ocr_payload_shape(self):
        _, args = self._call()
        payload = args.kwargs["json"]
        self.assertEqual(payload["model"], maas.OCR_MODEL)
        parts = payload["messages"][0]["content"]
        self.assertEqual(parts[0], {"type": "text", "text": "<image>\nFree OCR."})
        url = parts[1]["image_url"]["url"]
        self.assertTrue(url.startswith("data:image/png;base64,"))

    def test_ocr_returns_clean_text(self):
        result, _ = self._call("  \n  Hello caption  \n")
        self.assertEqual(result, "Hello caption")


class TranslateRequestShapeTests(unittest.TestCase):
    def _call(self, text, target, source=None, content="Bonjour"):
        client = maas.MaasClient(api_key=TEST_KEY)
        with mock.patch.object(maas.requests, "post",
                               return_value=FakeResponse(200, _reply(content))) as post:
            result = client.translate(text, target, source)
        return result, post.call_args

    def test_translate_endpoint_model_and_system_prompt(self):
        _, args = self._call("Hello", "Traditional Chinese (繁體中文)")
        self.assertEqual(args.args[0], maas.LLM_BASE + "/chat/completions")
        payload = args.kwargs["json"]
        self.assertEqual(payload["model"], maas.LLM_MODEL)
        system = payload["messages"][0]
        self.assertEqual(system["role"], "system")
        self.assertEqual(
            system["content"],
            "Real-time meeting interpreter. Translate into "
            "Traditional Chinese (繁體中文). Output ONLY the translation.",
        )
        self.assertEqual(payload["messages"][1]["role"], "user")
        self.assertEqual(payload["messages"][1]["content"], "Hello")

    def test_translate_includes_source_hint_when_given(self):
        _, args = self._call("Hello", "English", source="Traditional Chinese (繁體中文)")
        user = args.kwargs["json"]["messages"][1]["content"]
        self.assertIn("Traditional Chinese (繁體中文)", user)
        self.assertIn("Hello", user)

    def test_translate_strips_wrapping_quotes(self):
        result, _ = self._call("Hello", "English", content='"Bonjour le monde"')
        self.assertEqual(result, "Bonjour le monde")

    def test_translate_strips_leading_blank_lines(self):
        result, _ = self._call("Hello", "English", content="\n\nBonjour\n")
        self.assertEqual(result, "Bonjour")


class ErrorHandlingTests(unittest.TestCase):
    def test_http_error_raises_maas_error(self):
        client = maas.MaasClient(api_key=TEST_KEY)
        with mock.patch.object(maas.requests, "post",
                               return_value=FakeResponse(500, text="boom")):
            with self.assertRaises(maas.MaasError):
                client.ocr(b"data")

    def test_invalid_json_raises_maas_error(self):
        client = maas.MaasClient(api_key=TEST_KEY)
        with mock.patch.object(maas.requests, "post",
                               return_value=FakeResponse(200, payload=None)):
            with self.assertRaises(maas.MaasError):
                client.translate("Hello", "English")

    def test_unexpected_shape_raises_maas_error(self):
        client = maas.MaasClient(api_key=TEST_KEY)
        with mock.patch.object(maas.requests, "post",
                               return_value=FakeResponse(200, {"choices": []})):
            with self.assertRaises(maas.MaasError):
                client.translate("Hello", "English")

    def test_maas_error_is_exception_subclass(self):
        self.assertTrue(issubclass(maas.MaasError, Exception))

    def test_missing_key_raises_before_request(self):
        client = maas.MaasClient(api_key="")
        with mock.patch.object(maas.requests, "post") as post:
            with self.assertRaises(maas.MaasError):
                client.ocr(b"data")
        post.assert_not_called()


class DiscoverKeyTests(unittest.TestCase):
    def _clear_env(self):
        patcher = mock.patch.dict(os.environ, {}, clear=False)
        patcher.start()
        self.addCleanup(patcher.stop)
        os.environ.pop("MAAS_API_KEY", None)
        os.environ.pop("GATEWAY_API_KEY", None)

    def test_env_var_order_maas_wins(self):
        with mock.patch.dict(os.environ,
                             {"MAAS_API_KEY": "  key-one  ", "GATEWAY_API_KEY": "key-two"},
                             clear=False):
            self.assertEqual(maas.discover_api_key(), "key-one")

    def test_gateway_env_used_when_maas_absent(self):
        self._clear_env()
        os.environ["GATEWAY_API_KEY"] = "key-two"
        self.assertEqual(maas.discover_api_key(), "key-two")

    def test_opencode_json_fallback(self):
        self._clear_env()
        data = {"provider": {
            "gateway": {
                "models": {"translate-default": {}, "translate-fast": {}},
                "options": {"apiKey": "json-key-abc"},
            }
        }}
        fh = tempfile.NamedTemporaryFile("w", suffix=".json", delete=False, encoding="utf-8")
        json.dump(data, fh)
        fh.close()
        self.addCleanup(os.unlink, fh.name)
        with mock.patch.object(maas, "OPENCODE_JSON", fh.name):
            self.assertEqual(maas.discover_api_key(), "json-key-abc")

    def test_non_gateway_provider_skipped(self):
        self._clear_env()
        data = {"provider": {
            "other": {
                "models": {"Some-Model": {}},
                "options": {"apiKey": "should-not-be-used"},
            }
        }}
        fh = tempfile.NamedTemporaryFile("w", suffix=".json", delete=False, encoding="utf-8")
        json.dump(data, fh)
        fh.close()
        self.addCleanup(os.unlink, fh.name)
        with mock.patch.object(maas, "OPENCODE_JSON", fh.name):
            self.assertIsNone(maas.discover_api_key())

    def test_missing_file_returns_none(self):
        self._clear_env()
        with mock.patch.object(maas, "OPENCODE_JSON", os.path.join(_APP_DIR, "does-not-exist.json")):
            self.assertIsNone(maas.discover_api_key())


class StreamTranslateTests(unittest.TestCase):
    def _stream_response(self, chunks):
        resp = mock.Mock()
        resp.status_code = 200
        resp.iter_lines = lambda decode_unicode=False: iter(
            ["data: " + json.dumps({"choices": [{"delta": {"content": c}}]}) for c in chunks]
            + ["data: [DONE]"]
        )
        return resp

    def test_streams_chunks_to_on_chunk_and_returns_full_text(self):
        seen = []
        resp = self._stream_response(["大家", "好，", "歡迎"])
        client = maas.MaasClient(api_key=TEST_KEY)
        with mock.patch.object(maas.requests, "post", return_value=resp) as post:
            out = client.translate(
                "Hello everyone", "Traditional Chinese (繁體中文)", on_chunk=seen.append
            )
        self.assertEqual(out, "大家好，歡迎")
        self.assertEqual(seen[-1], "大家好，歡迎")
        self.assertEqual(len(seen), 3)
        self.assertTrue(post.call_args.kwargs["json"]["stream"])

    def test_stream_http_error_raises(self):
        resp = mock.Mock()
        resp.status_code = 500
        resp.text = "boom"
        client = maas.MaasClient(api_key=TEST_KEY)
        with mock.patch.object(maas.requests, "post", return_value=resp):
            with self.assertRaises(maas.MaasError):
                client.translate("x", "English", on_chunk=lambda _s: None)


if __name__ == "__main__":
    unittest.main(verbosity=2)
