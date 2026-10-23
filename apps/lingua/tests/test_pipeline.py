"""Pure pipeline tests: dedup, delta diff and translation caching."""

import os
import sys
import unittest

_APP_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _APP_DIR not in sys.path:
    sys.path.insert(0, _APP_DIR)

try:
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")
except Exception:
    pass

from engine.pipeline import CaptionPipeline, Line, Transcript, speaker_rows  # noqa: E402


class Recorder:
    """Fake translate_fn that records every call (must be called once each)."""

    def __init__(self):
        self.calls = []

    def __call__(self, text, on_chunk=None):
        self.calls.append(text)
        return "T:" + text


class GrowthAndDeltaTests(unittest.TestCase):
    def test_line_grows_then_new_line_appears(self):
        rec = Recorder()
        pipe = CaptionPipeline(rec)

        pipe.update("hello")
        pipe.update("hello world")
        pipe.update("hello world again")
        pipe.update("hello world again\nsecond line")
        lines = pipe.update("hello world again\nsecond line")  # unchanged frame
        pipe.update("hello world again\nsecond line\nthird")

        # Each distinct string translated exactly once, in encounter order.
        self.assertEqual(
            rec.calls,
            ["hello", "hello world", "hello world again", "second line", "third"],
        )
        self.assertEqual(len(rec.calls), len(set(rec.calls)))

        # The last line is live, everything before it is committed.
        self.assertEqual([l.original for l in lines], ["hello world again", "second line"])
        self.assertFalse(lines[0].live)
        self.assertTrue(lines[1].live)

    def test_unchanged_frame_never_calls_translate(self):
        rec = Recorder()
        pipe = CaptionPipeline(rec)
        pipe.update("steady line")
        before = len(rec.calls)
        pipe.update("steady line")
        pipe.update("steady line")
        self.assertEqual(len(rec.calls), before)

    def test_live_line_is_cached_when_identical(self):
        rec = Recorder()
        pipe = CaptionPipeline(rec)
        pipe.update("the quick brown fox")
        lines = pipe.update("the quick brown fox")
        self.assertEqual(len(rec.calls), 1)
        self.assertEqual(lines[-1].translation, "T:the quick brown fox")
        self.assertTrue(lines[-1].live)


class DedupTests(unittest.TestCase):
    def test_identical_lines_translated_once(self):
        rec = Recorder()
        pipe = CaptionPipeline(rec)
        lines = pipe.update("same line\nsame line")
        self.assertEqual(rec.calls, ["same line"])
        self.assertEqual(lines[0].translation, lines[1].translation)

    def test_shared_cache_across_pipelines(self):
        cache = {}
        rec_a = Recorder()
        CaptionPipeline(rec_a, cache=cache).update("shared text")
        rec_b = Recorder()
        CaptionPipeline(rec_b, cache=cache).update("shared text")
        self.assertEqual(rec_a.calls, ["shared text"])
        self.assertEqual(rec_b.calls, [])  # served from cache, no new call


class JunkFilteringTests(unittest.TestCase):
    def test_bare_url_handle_and_token_lines_dropped(self):
        rec = Recorder()
        pipe = CaptionPipeline(rec)
        lines = pipe.update(
            "http://example.com/path\n"
            "www.example.com\n"
            "@john\n"
            "<|endoftext|>\n"
            "hello world"
        )
        self.assertEqual([l.original for l in lines], ["hello world"])
        self.assertEqual(rec.calls, ["hello world"])

    def test_stray_token_inside_line_removed(self):
        rec = Recorder()
        pipe = CaptionPipeline(rec)
        lines = pipe.update("hello <|endoftext|> world")
        self.assertEqual(lines[0].original, "hello world")

    def test_whitespace_normalised(self):
        rec = Recorder()
        pipe = CaptionPipeline(rec)
        lines = pipe.update("  hello    world  \n\n")
        self.assertEqual([l.original for l in lines], ["hello world"])


class SpeakerTests(unittest.TestCase):
    def test_name_line_becomes_speaker(self):
        rec = Recorder()
        pipe = CaptionPipeline(rec)
        lines = pipe.update("Alice Chen\nhello there everyone")
        self.assertEqual(lines[0].original, "Alice Chen")
        self.assertIsNone(lines[0].speaker)
        self.assertEqual(lines[1].speaker, "Alice Chen")
        self.assertEqual(lines[1].original, "hello there everyone")

    def test_lowercase_sentence_is_not_a_speaker(self):
        rec = Recorder()
        pipe = CaptionPipeline(rec)
        lines = pipe.update("hello everyone\nhow are you")
        self.assertIsNone(lines[1].speaker)


class WindowTests(unittest.TestCase):
    def test_max_lines_window_truncates(self):
        rec = Recorder()
        pipe = CaptionPipeline(rec, max_lines=2)
        pipe.update("l1\nl2\nl3\nl4")
        lines = pipe.update("l1\nl2\nl3\nl4")
        self.assertEqual(len(lines), 2)
        self.assertEqual([l.original for l in lines], ["l3", "l4"])
        self.assertTrue(lines[-1].live)
        self.assertFalse(lines[0].live)

    def test_reset_clears_window(self):
        rec = Recorder()
        pipe = CaptionPipeline(rec)
        pipe.update("alpha beta\nsecond item")
        pipe.reset()
        lines = pipe.update("gamma delta")
        self.assertEqual([l.original for l in lines], ["gamma delta"])

    def test_empty_input_returns_empty_window(self):
        rec = Recorder()
        pipe = CaptionPipeline(rec)
        self.assertEqual(pipe.update(""), [])
        self.assertEqual(pipe.update("   \n  "), [])
        self.assertEqual(rec.calls, [])


class LineShapeTests(unittest.TestCase):
    def test_line_fields(self):
        line = Line(speaker=None, original="hola", translation="hello", live=True)
        self.assertIsNone(line.speaker)
        self.assertEqual(line.original, "hola")
        self.assertEqual(line.translation, "hello")
        self.assertTrue(line.live)


class TranscriptTests(unittest.TestCase):
    @staticmethod
    def _frame(*texts):
        return [Line(None, t, "T:" + t, False) for t in texts]

    def test_scrolling_frames_accumulate_history(self):
        t = Transcript()
        t.add(self._frame("A", "B", "C"))
        t.add(self._frame("B", "C", "D"))
        out = t.add(self._frame("C", "D", "E"))
        self.assertEqual([l.original for l in out], ["A", "B", "C", "D", "E"])

    def test_growing_live_line_is_not_duplicated(self):
        t = Transcript()
        t.add(self._frame("Hello"))
        t.add(self._frame("Hello world"))
        out = t.add(self._frame("Hello world how are you"))
        self.assertEqual([l.original for l in out], ["Hello world how are you"])

    def test_new_line_commits_previous_live(self):
        t = Transcript()
        t.add(self._frame("A", "B"))
        out = t.add(self._frame("A", "B", "C"))
        self.assertEqual([l.original for l in out], ["A", "B", "C"])
        self.assertFalse(out[0].live)
        self.assertFalse(out[1].live)
        self.assertTrue(out[2].live)

    def test_unchanged_frame_adds_nothing(self):
        t = Transcript()
        t.add(self._frame("A", "B", "C"))
        t.add(self._frame("A", "B", "C"))
        out = t.add(self._frame("A", "B", "C"))
        self.assertEqual([l.original for l in out], ["A", "B", "C"])

    def test_empty_frame_keeps_transcript(self):
        t = Transcript()
        t.add(self._frame("A", "B"))
        out = t.add([])
        self.assertEqual([l.original for l in out], ["A", "B"])

    def test_max_lines_caps_history(self):
        t = Transcript(max_lines=3)
        for text in ("a", "b", "c", "d", "e"):
            t.add(self._frame(text))
        out = t.lines()
        self.assertLessEqual(len(out), 4)
        self.assertEqual(out[-1].original, "e")

    def test_reset_clears(self):
        t = Transcript()
        t.add(self._frame("A"))
        t.reset()
        self.assertEqual(t.lines(), [])

    def test_new_speaker_preserves_previous_line(self):
        t = Transcript()
        alice = [
            Line(None, "Alice Chen", "[zh]Alice Chen", False),
            Line("Alice Chen", "hello there", "[zh]hello there", True),
        ]
        t.add(alice)
        t.add(alice)
        bob = [
            Line(None, "Bob Lee", "[zh]Bob Lee", False),
            Line("Bob Lee", "how are you", "[zh]how are you", True),
        ]
        out = t.add(bob)
        self.assertEqual(
            [l.original for l in out],
            ["Alice Chen", "hello there", "Bob Lee", "how are you"],
        )


class SpeakerRowsTests(unittest.TestCase):
    def test_name_plate_collapses_into_next_label(self):
        lines = [
            Line(None, "Alice Chen", "Alice Chen", False),
            Line("Alice Chen", "hello there", "T:hello there", True),
        ]
        self.assertEqual(speaker_rows(lines), [("Alice Chen", "T:hello there")])

    def test_no_speaker_is_a_plain_row(self):
        self.assertEqual(
            speaker_rows([Line(None, "hello", "T:hello", False)]),
            [(None, "T:hello")],
        )

    def test_trailing_name_is_kept(self):
        self.assertEqual(
            speaker_rows([Line(None, "Alice Chen", "Alice Chen", True)]),
            [(None, "Alice Chen")],
        )


if __name__ == "__main__":
    unittest.main(verbosity=2)
