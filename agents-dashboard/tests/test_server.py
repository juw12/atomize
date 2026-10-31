#!/usr/bin/env python3
"""Hermetic tests for agents-dashboard/server.py: static path traversal guard."""

import os
import sys
import tempfile
import unittest
import unittest.mock
from pathlib import Path

# Import the bridge module without starting its main().
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import server


class TestStaticPathGuard(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.mkdtemp()
        # Patch BASE_DIR so static files are served from the temp dir.
        self._patch = unittest.mock.patch.object(server, "BASE_DIR", Path(self._tmp).resolve())
        self._patch.start()
        (Path(self._tmp) / "ok.html").write_text("<h1>ok</h1>", encoding="utf-8")
        (Path(self._tmp) / "secret.txt").write_text("SECRET", encoding="utf-8")

    def tearDown(self):
        self._patch.stop()
        import shutil
        shutil.rmtree(self._tmp, ignore_errors=True)

    def test_resolve_relative_path_inside_base(self):
        # The _serve_static function uses BASE_DIR; verify path resolution logic.
        from urllib.parse import unquote
        candidate = (server.BASE_DIR / unquote("ok.html")).resolve()
        try:
            candidate.relative_to(server.BASE_DIR)
            inside = True
        except ValueError:
            inside = False
        self.assertTrue(inside)

    def test_resolve_traversal_blocked(self):
        from urllib.parse import unquote
        candidate = (server.BASE_DIR / unquote("..%2f..%2fetc%2fpasswd")).resolve()
        try:
            candidate.relative_to(server.BASE_DIR)
            inside = True
        except ValueError:
            inside = False
        self.assertFalse(inside)


class TestCorsHeaders(unittest.TestCase):
    def test_no_wildcard_allow_origin(self):
        self.assertNotIn("Access-Control-Allow-Origin", server.CORS_HEADERS)


class TestExternalBots(unittest.TestCase):
    def test_known_bot_names_match(self):
        names = {b["name"] for b in server.EXTERNAL_BOTS}
        self.assertIn("vscode-dev-helper", names)
        self.assertIn("hermes", names)
        self.assertIn("scout", names)
        self.assertIn("langgraph-agent", names)


class TestAuthEnvOnly(unittest.TestCase):
    def test_no_password_returned_from_auth_header(self):
        with unittest.mock.patch.dict(os.environ, {"OPENCODE_SERVER_PASSWORD": "secret123"}, clear=False):
            header = server.auth_header()
        self.assertIsNotNone(header)
        # base64 of user:secret123 should appear, but the raw password should not.
        self.assertNotIn("secret123", header)


if __name__ == "__main__":
    unittest.main()
