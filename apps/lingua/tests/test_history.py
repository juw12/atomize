"""Scan history + read-aloud helper tests (temp folder, no network, no audio)."""

import os
import sys
import tempfile
import unittest

_APP_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _APP_DIR not in sys.path:
    sys.path.insert(0, _APP_DIR)

try:
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")
except Exception:
    pass

from engine import config, history, speech  # noqa: E402


class HistoryTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self._orig = config.config_path
        config.config_path = lambda: os.path.join(self.tmp.name, "config.json")

    def tearDown(self):
        config.config_path = self._orig
        self.tmp.cleanup()

    def test_add_newest_first_and_no_duplicates(self):
        history.add("first scan")
        history.add("second scan")
        history.add("first scan")
        self.assertEqual([e["text"] for e in history.load()], ["first scan", "second scan"])

    def test_empty_text_is_ignored(self):
        self.assertIsNone(history.add("   "))
        self.assertEqual(history.load(), [])

    def test_cap(self):
        for i in range(history.MAX_ENTRIES + 7):
            history.add("scan {}".format(i))
        self.assertEqual(len(history.load()), history.MAX_ENTRIES)

    def test_search_update_delete_clear(self):
        a = history.add("MEETING ROOM 3B")
        history.add("Exit only")
        history.update_translation(a["id"], "會議室 3B", "繁體中文")
        self.assertEqual(len(history.search("會議")), 1)
        self.assertEqual(len(history.search("exit")), 1)
        history.delete(a["id"])
        self.assertEqual([e["text"] for e in history.load()], ["Exit only"])
        history.clear()
        self.assertEqual(history.load(), [])

    def test_broken_file_is_tolerated(self):
        os.makedirs(os.path.dirname(history.history_path()), exist_ok=True)
        with open(history.history_path(), "w", encoding="utf-8") as fh:
            fh.write("{not json")
        self.assertEqual(history.load(), [])
        self.assertIsNotNone(history.add("works again"))

    def test_title(self):
        self.assertEqual(history.title({"text": "\n\n  Hello world  \nmore"}), "Hello world")
        self.assertTrue(history.title({"text": "x" * 80}, width=10).endswith("…"))


class SpeechTests(unittest.TestCase):
    def test_guess_culture(self):
        self.assertEqual(speech.guess_culture("Hello"), "en")
        self.assertEqual(speech.guess_culture("請保持門關閉"), "zh")
        self.assertEqual(speech.guess_culture("こんにちは"), "ja")
        self.assertEqual(speech.guess_culture("안녕하세요"), "ko")

    def test_empty_text_does_not_speak(self):
        self.assertFalse(speech.speak("   "))
        self.assertFalse(speech.speaking())


if __name__ == "__main__":
    result = unittest.main(exit=False, verbosity=1).result
    sys.exit(0 if result.wasSuccessful() else 1)
