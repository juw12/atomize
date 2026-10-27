"""Picture-reader tests: image prep, OCR text cleanup, counts, mocked client.

No network and no display: images are synthetic and the client is a fake.
"""

import io
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

from PIL import Image  # noqa: E402

from engine import image_text, maas  # noqa: E402
from engine.image_text import (  # noqa: E402
    DOC_MAX_SIDE,
    DOC_MIN_SIDE,
    clean_ocr_text,
    prepare_image,
    read_image,
    text_stats,
)


class FakeClient:
    def __init__(self, ocr_text="Hello world", translation="Halo dunia"):
        self.ocr_text = ocr_text
        self.translation = translation
        self.ocr_calls = []
        self.translate_calls = []

    def ocr(self, png_bytes, mime="image/png", prompt=None):
        self.ocr_calls.append((png_bytes, mime, prompt))
        return self.ocr_text

    def translate(self, text, target, source=None, on_chunk=None, *, purpose="meeting"):
        self.translate_calls.append((text, target, source, purpose))
        return self.translation


def _png(img):
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


class PrepareImageTests(unittest.TestCase):
    def test_large_image_is_capped_on_longest_side(self):
        out = prepare_image(Image.new("RGB", (4000, 1000), "white"))
        self.assertEqual(max(out.size), DOC_MAX_SIDE)
        self.assertEqual(out.size, (DOC_MAX_SIDE, 400))

    def test_portrait_photo_is_capped_on_height(self):
        out = prepare_image(Image.new("RGB", (1500, 3000), "white"))
        self.assertEqual(out.size, (800, DOC_MAX_SIDE))

    def test_tiny_image_is_enlarged(self):
        out = prepare_image(Image.new("RGB", (200, 50), "white"))
        self.assertEqual(max(out.size), DOC_MIN_SIDE)

    def test_mid_size_image_is_untouched(self):
        out = prepare_image(Image.new("RGB", (1000, 600), "white"))
        self.assertEqual(out.size, (1000, 600))

    def test_transparency_is_flattened_onto_white(self):
        img = Image.new("RGBA", (1000, 600), (0, 0, 0, 0))
        img.putpixel((10, 10), (0, 0, 0, 255))
        out = prepare_image(img)
        self.assertEqual(out.mode, "RGB")
        self.assertEqual(out.getpixel((500, 300)), (255, 255, 255))
        self.assertEqual(out.getpixel((10, 10)), (0, 0, 0))

    def test_exif_rotation_is_applied(self):
        img = Image.new("RGB", (1000, 800), "white")
        exif = img.getexif()
        exif[0x0112] = 6  # orientation: rotate 90 CW to display
        buf = io.BytesIO()
        img.save(buf, format="JPEG", exif=exif.tobytes())
        out = prepare_image(buf.getvalue())
        self.assertEqual(out.size, (800, 1000))

    def test_accepts_path_bytes_and_file_object(self):
        img = Image.new("L", (900, 900), 128)
        data = _png(img)
        with tempfile.TemporaryDirectory() as tmp:
            path = os.path.join(tmp, "pic.png")
            with open(path, "wb") as fh:
                fh.write(data)
            self.assertEqual(prepare_image(path).size, (900, 900))
        self.assertEqual(prepare_image(data).size, (900, 900))
        self.assertEqual(prepare_image(io.BytesIO(data)).mode, "RGB")

    def test_rejects_unknown_source(self):
        with self.assertRaises(TypeError):
            prepare_image(12345)


class CleanTextTests(unittest.TestCase):
    def test_grounding_markup_is_removed_but_text_kept(self):
        raw = "<|ref|>Total<|/ref|><|det|>[[10, 20, 30, 40]]<|/det|> 42\n<|grounding|>Paid"
        self.assertEqual(clean_ocr_text(raw), "Total 42\nPaid")

    def test_line_layout_kept_and_blank_runs_collapsed(self):
        raw = "Line one   \r\nLine two\n\n\n\nLine three\n"
        self.assertEqual(clean_ocr_text(raw), "Line one\nLine two\n\nLine three")  # mixed: kept

    def test_blank_line_between_every_line_is_tightened(self):
        raw = "MEETING ROOM 3B\n\nPlease keep the door closed.\n\n請保持門關閉"
        self.assertEqual(clean_ocr_text(raw), "MEETING ROOM 3B\nPlease keep the door closed.\n請保持門關閉")

    def test_real_paragraphs_are_kept(self):
        raw = "Title\nSubtitle\n\nFirst paragraph line one\nline two"
        self.assertEqual(clean_ocr_text(raw), raw)

    def test_non_string_is_empty(self):
        self.assertEqual(clean_ocr_text(None), "")


class StatsTests(unittest.TestCase):
    def test_english_words_and_letters(self):
        stats = text_stats("Hello, world! It's 2026.\nBye")
        self.assertEqual(stats.words, 5)  # Hello, world, It's, 2026, Bye
        self.assertEqual(stats.letters, 20)
        self.assertEqual(stats.lines, 2)

    def test_cjk_counts_each_character_as_a_word(self):
        stats = text_stats("你好世界 OK")
        self.assertEqual(stats.words, 5)
        self.assertEqual(stats.letters, 6)

    def test_empty(self):
        self.assertEqual(tuple(text_stats("")), (0, 0, 0))


class ReadImageTests(unittest.TestCase):
    def test_ocr_only(self):
        client = FakeClient(ocr_text="  <|ref|>STOP<|/ref|>\nsign  ")
        reading = read_image(client, Image.new("RGB", (1000, 500), "white"))
        self.assertEqual(reading.text, "STOP\nsign")
        self.assertIsNone(reading.translation)
        self.assertEqual(client.translate_calls, [])
        png, mime, prompt = client.ocr_calls[0]
        self.assertTrue(png.startswith(b"\x89PNG"))
        self.assertEqual(mime, "image/png")
        self.assertEqual(prompt, image_text.READ_PROMPT)

    def test_with_translation_uses_document_prompt(self):
        client = FakeClient()
        reading = read_image(client, Image.new("RGB", (1000, 500)),
                             target_lang="Indonesian", source_lang="English")
        self.assertEqual(reading.translation, "Halo dunia")
        self.assertEqual(client.translate_calls,
                         [("Hello world", "Indonesian", "English", "document")])

    def test_empty_ocr_skips_translation(self):
        client = FakeClient(ocr_text="   ")
        reading = read_image(client, Image.new("RGB", (1000, 500)), target_lang="English")
        self.assertEqual(reading.text, "")
        self.assertIsNone(reading.translation)
        self.assertEqual(client.translate_calls, [])

    def test_real_client_payload_carries_prompt_and_document_system(self):
        replies = iter([
            {"choices": [{"message": {"content": "Hello"}}]},
            {"choices": [{"message": {"content": "Halo"}}]},
        ])

        class Resp:
            status_code = 200
            text = ""

            def json(self):
                return next(replies)

        client = maas.MaasClient(api_key="k")
        with mock.patch.object(maas.requests, "post", return_value=Resp()) as post:
            reading = read_image(client, Image.new("RGB", (900, 900)), target_lang="Indonesian")
        self.assertEqual((reading.text, reading.translation), ("Hello", "Halo"))
        ocr_payload = post.call_args_list[0].kwargs["json"]
        self.assertEqual(ocr_payload["messages"][0]["content"][0]["text"], image_text.READ_PROMPT)
        system = post.call_args_list[1].kwargs["json"]["messages"][0]["content"]
        self.assertIn("read from a picture", system)
        self.assertIn("Indonesian", system)


class TranslationResilienceTests(unittest.TestCase):
    def test_translation_failure_keeps_text(self):
        class Down(FakeClient):
            def translate(self, *a, **k):
                raise maas.MaasError("HTTP 503: upstream down")

        reading = read_image(Down(ocr_text="Exit"), Image.new("RGB", (900, 900)), target_lang="Thai")
        self.assertEqual(reading.text, "Exit")
        self.assertIsNone(reading.translation)
        self.assertIn("503", reading.translation_error)

    def test_fallback_tries_next_model(self):
        client = maas.MaasClient(api_key="k", llm_model="a")
        calls = []

        def fake_translate(text, target, source=None, on_chunk=None, *, purpose="meeting"):
            calls.append(client.llm_model)
            if client.llm_model != "c":
                raise maas.MaasError("HTTP 503")
            return "ok"

        client.translate = fake_translate
        out, used = client.translate_with_fallback("hi", "English", models=["a", "b", "c"])
        self.assertEqual((out, used), ("ok", "c"))
        self.assertEqual(calls, ["a", "b", "c"])
        self.assertEqual(client.llm_model, "a")  # restored

    def test_fallback_all_down_raises_clear_error(self):
        client = maas.MaasClient(api_key="k", llm_model="a")

        def down(*a, **k):
            raise maas.MaasError("HTTP 503")

        client.translate = down
        with self.assertRaises(maas.MaasError) as ctx:
            client.translate_with_fallback("hi", "English", models=["a", "b"])
        self.assertIn("tried 2 models", str(ctx.exception))

    def test_language_list_has_new_languages(self):
        for label in ("简体中文", "日本語", "한국어", "Español", "Tiếng Việt"):
            self.assertIn(label, maas.LANGUAGES)


if __name__ == "__main__":
    result = unittest.main(exit=False, verbosity=1).result
    sys.exit(0 if result.wasSuccessful() else 1)
