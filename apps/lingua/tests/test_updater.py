"""Self-update + installer tests (local HTTP server and temp folders; no internet, no registry)."""

import hashlib
import http.server
import io
import json
import os
import sys
import tempfile
import threading
import unittest
import zipfile

# Local test servers must never go through a (possibly dead) HTTP proxy.
os.environ["NO_PROXY"] = "127.0.0.1,localhost," + os.environ.get("NO_PROXY", "")
os.environ["no_proxy"] = os.environ["NO_PROXY"]
_APP_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _APP_DIR not in sys.path:
    sys.path.insert(0, _APP_DIR)

try:
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")
except Exception:
    pass

from engine import installer, updater  # noqa: E402


def _release(tag, asset="Lingua-windows.zip", draft=False, prerelease=False, body="", url="http://x/z.zip"):
    return {
        "tag_name": tag,
        "draft": draft,
        "prerelease": prerelease,
        "body": body,
        "html_url": "https://github.com/juw12/projects/releases/tag/" + tag,
        "assets": [{"name": asset, "browser_download_url": url, "size": 123}] if asset else [],
    }


def _zip_bytes(files):
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as archive:
        for name, data in files.items():
            archive.writestr(name, data)
    return buf.getvalue()


class VersionTests(unittest.TestCase):
    def test_parse(self):
        self.assertEqual(updater.parse_version("lingua-v2.1.0"), (2, 1, 0))
        self.assertEqual(updater.parse_version("v2.1"), (2, 1, 0))
        self.assertIsNone(updater.parse_version("latest"))

    def test_newer(self):
        self.assertTrue(updater.is_newer("2.10.0", "2.9.9"))
        self.assertFalse(updater.is_newer("2.1.0", "2.1.0"))
        self.assertFalse(updater.is_newer("2.0.9", "2.1.0"))


class PickTests(unittest.TestCase):
    def test_picks_newest_valid(self):
        releases = [
            _release("lingua-v2.2.0"),
            _release("lingua-v2.4.0", draft=True),
            _release("lingua-v2.5.0", prerelease=True),
            _release("lingua-v2.3.0", body="notes\nsha256: " + "b" * 64),
            _release("lingua-v2.6.0", asset=None),
            _release("orbis-v9.0.0"),
            _release("lingua-v2.0.0"),
        ]
        info = updater.pick_update(releases, "2.1.0")
        self.assertIsNotNone(info)
        self.assertEqual(info.version, "2.3.0")
        self.assertEqual(info.sha256, "b" * 64)
        self.assertEqual(updater.short_notes(info.notes), "notes")

    def test_up_to_date(self):
        self.assertIsNone(updater.pick_update([_release("lingua-v2.1.0")], "2.1.0"))
        self.assertIsNone(updater.pick_update([], "2.1.0"))


class _Handler(http.server.BaseHTTPRequestHandler):
    routes = {}

    def do_GET(self):  # noqa: N802
        body = self.routes.get(self.path)
        if body is None:
            self.send_response(404)
            self.end_headers()
            return
        self.send_response(200)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *args):
        pass


class DownloadTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), _Handler)
        cls.base = "http://127.0.0.1:%d" % cls.server.server_address[1]
        threading.Thread(target=cls.server.serve_forever, daemon=True).start()

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.zip_data = _zip_bytes({"Lingua/Lingua.exe": b"new exe", "Lingua/_internal/x.dll": b"dll"})
        digest = hashlib.sha256(self.zip_data).hexdigest()
        releases = [_release("lingua-v9.9.9", url=self.base + "/dl.zip", body="Fixes\nsha256: " + digest)]
        _Handler.routes = {"/releases": json.dumps(releases).encode(), "/dl.zip": self.zip_data,
                           "/bad.zip": b"not a zip"}

    def tearDown(self):
        self.tmp.cleanup()

    def test_check_download_stage(self):
        info = updater.check_for_update("2.1.0", url=self.base + "/releases")
        self.assertEqual(info.version, "9.9.9")
        seen = []
        path = updater.download_update(info, self.tmp.name, progress=lambda d, t: seen.append((d, t)))
        self.assertTrue(os.path.isfile(path))
        self.assertEqual(seen[-1], (len(self.zip_data), len(self.zip_data)))
        staged = updater.stage_update(path)
        self.assertTrue(os.path.isfile(os.path.join(staged, "Lingua.exe")))

    def test_checksum_mismatch_rejected(self):
        info = updater.check_for_update("2.1.0", url=self.base + "/releases")
        info.sha256 = "0" * 64
        with self.assertRaises(updater.UpdateError):
            updater.download_update(info, self.tmp.name)

    def test_not_a_zip_rejected(self):
        info = updater.UpdateInfo("9.9.9", "lingua-v9.9.9", "", self.base + "/bad.zip", 9, "")
        with self.assertRaises(updater.UpdateError):
            updater.download_update(info, self.tmp.name)

    def test_offline_is_update_error(self):
        with self.assertRaises(updater.UpdateError):
            updater.check_for_update("2.1.0", url="http://127.0.0.1:9/none")

    def test_zip_without_exe_rejected(self):
        path = os.path.join(self.tmp.name, "x.zip")
        with open(path, "wb") as fh:
            fh.write(_zip_bytes({"readme.txt": b"hi"}))
        with self.assertRaises(updater.UpdateError):
            updater.stage_update(path)

    def test_zip_slip_rejected(self):
        path = os.path.join(self.tmp.name, "evil.zip")
        with open(path, "wb") as fh:
            fh.write(_zip_bytes({"../evil.txt": b"x", "Lingua.exe": b"x"}))
        with self.assertRaises(updater.UpdateError):
            updater.stage_update(path)


class ApplyScriptTests(unittest.TestCase):
    def test_script_waits_copies_keeps_env_and_relaunches(self):
        script = updater.build_apply_script(r"C:\t\staged\Lingua", r"C:\Apps\Lingua", 4242, r"C:\t\log.txt")
        self.assertIn('"PID eq 4242"', script)
        self.assertIn('robocopy "C:\\t\\staged\\Lingua" "C:\\Apps\\Lingua" /E /XF "lingua.env"', script)
        self.assertIn('start "" "C:\\Apps\\Lingua\\Lingua.exe" --updated', script)
        self.assertLess(script.index("robocopy"), script.index('start ""'))


class InstallerTests(unittest.TestCase):
    def test_copy_program_keeps_existing_env(self):
        with tempfile.TemporaryDirectory() as src, tempfile.TemporaryDirectory() as dst:
            os.makedirs(os.path.join(src, "_internal"))
            for rel, data in {"Lingua.exe": "new", "_internal/a.dll": "dll", "lingua.env": "NEW=1"}.items():
                with open(os.path.join(src, rel), "w") as fh:
                    fh.write(data)
            with open(os.path.join(dst, "lingua.env"), "w") as fh:
                fh.write("MINE=1")
            installer.copy_program(src, dst)
            with open(os.path.join(dst, "lingua.env")) as fh:
                self.assertEqual(fh.read(), "MINE=1")
            with open(os.path.join(dst, "Lingua.exe")) as fh:
                self.assertEqual(fh.read(), "new")
            self.assertTrue(os.path.isfile(os.path.join(dst, "_internal", "a.dll")))

    def test_default_install_dir_is_per_user(self):
        path = installer.default_install_dir()
        self.assertTrue(path.lower().endswith(os.path.join("programs", "lingua")))
        self.assertTrue(installer.is_installed_copy(path))
        self.assertFalse(installer.is_installed_copy(tempfile.gettempdir()))

    def test_install_requires_exe(self):
        with tempfile.TemporaryDirectory() as src, tempfile.TemporaryDirectory() as dst:
            with self.assertRaises(FileNotFoundError):
                installer.install(src, dst, shortcuts=False)


if __name__ == "__main__":
    unittest.main(verbosity=2)
