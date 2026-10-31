#!/usr/bin/env python3
"""Hermetic tests for scripts/maas_client.py credential resolution + URL formatting."""

import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import maas_client


class TestDefaultURL(unittest.TestCase):
    def test_default_is_https(self):
        self.assertTrue(maas_client.DEFAULT_BASE_URL.startswith("https://"))


class TestCredentialResolution(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.mkdtemp()
        self._env_patch = mock.patch.dict(
            os.environ,
            {"HOME": self._tmp, "USERPROFILE": self._tmp},
            clear=True,
        )
        self._env_patch.start()

    def tearDown(self):
        self._env_patch.stop()
        import shutil
        shutil.rmtree(self._tmp, ignore_errors=True)

    def test_missing_key_exits(self):
        with self.assertRaises(SystemExit):
            maas_client.resolve_credential()

    def test_explicit_env_key(self):
        os.environ["PEGA_API_KEY"] = "test-key"
        key, base = maas_client.resolve_credential()
        self.assertEqual(key, "test-key")
        self.assertTrue(base.startswith("https://"))

    def test_dotenv_fallback(self):
        env_path = Path(self._tmp) / ".env"
        env_path.write_text("PEGA_API_KEY=dotenv-key\n", encoding="utf-8")
        cwd = Path.cwd()
        try:
            os.chdir(self._tmp)
            key, _ = maas_client.resolve_credential()
            self.assertEqual(key, "dotenv-key")
        finally:
            os.chdir(cwd)


class TestChatPayloadShape(unittest.TestCase):
    def test_post_builds_bearer_header(self):
        captured = {}

        def fake_urlopen(req, **kw):
            from urllib.error import HTTPError
            captured["url"] = req.full_url
            captured["headers"] = dict(req.headers)
            raise HTTPError(req.full_url, 500, "stub", {}, None)

        import urllib.request
        original = urllib.request.urlopen
        urllib.request.urlopen = fake_urlopen
        try:
            result = maas_client.chat("k", "https://x", "m", [{"role": "user", "content": "hi"}], timeout=1.0)
            self.assertFalse(result["ok"])
            self.assertEqual(captured["headers"]["Authorization"], "Bearer k")
            self.assertEqual(captured["url"], "https://x/chat/completions")
        finally:
            urllib.request.urlopen = original


if __name__ == "__main__":
    unittest.main()
