"""Picture reader: turn any image (photo, screenshot, scan) into text.

This is the "read a picture" mode that sits beside the live-caption overlay.
It reuses the same OCR model as the caption pipeline but prepares the image
for *documents* rather than caption strips:

* phone photos are rotated upright from their EXIF orientation;
* transparency is flattened onto white (dark text on a transparent PNG would
  otherwise turn into black-on-black);
* large images are shrunk so the longest side is at most ``DOC_MAX_SIDE``
  (letters stay legible, uploads stay small);
* tiny images are enlarged to at least ``DOC_MIN_SIDE`` so small letters get
  enough pixels for the model.

Everything here is headless (no tkinter) and, apart from the injected client,
does no I/O, so it is fully testable offline.
"""

from __future__ import annotations

import io
import os
import re
from dataclasses import dataclass
from time import perf_counter
from typing import NamedTuple

from PIL import Image, ImageOps

#: Longest side, in pixels, the image is downscaled to before OCR. Documents
#: need more resolution than the 640 px caption strip so small print survives.
DOC_MAX_SIDE = 1600

#: Images whose longest side is below this are upscaled before OCR.
DOC_MIN_SIDE = 768

#: Prompt that asks the OCR model for plain text, keeping the line layout.
READ_PROMPT = "<image>\nFree OCR."

#: File extensions offered in the desktop "Open image" dialog.
IMAGE_EXTENSIONS = (".png", ".jpg", ".jpeg", ".bmp", ".gif", ".webp", ".tif", ".tiff")

# DeepSeek-OCR can emit grounding markup: <|ref|>text<|/ref|><|det|>[[x,y,...]]<|/det|>.
# Keep the text inside ref tags, drop the boxes, then drop any leftover <|token|>.
_REF_RE = re.compile(r"<\|ref\|>(.*?)<\|/ref\|>", re.S)
_DET_RE = re.compile(r"<\|det\|>.*?<\|/det\|>", re.S)
_TOKEN_RE = re.compile(r"<\|[^|>]*\|>")
_TRAILING_WS_RE = re.compile(r"[ \t]+$", re.M)
_MANY_BLANKS_RE = re.compile(r"\n{3,}")

# A "word" is a run of letters/digits (any script); CJK ideographs, kana and
# hangul syllables count one word per character, since those scripts do not
# separate words with spaces.
_CJK_CHAR = r"\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uac00-\ud7af\uf900-\ufaff"
_WORD_RE = re.compile(r"[" + _CJK_CHAR + r"]|[^\W_" + _CJK_CHAR + r"]+(?:['\u2019\-][^\W_]+)*")


class TextStats(NamedTuple):
    words: int
    letters: int
    lines: int


@dataclass
class ImageReading:
    """Result of :func:`read_image`."""

    text: str
    translation: str | None = None
    ocr_s: float = 0.0
    translate_s: float = 0.0
    translation_error: str | None = None
    model_used: str | None = None

    @property
    def stats(self) -> TextStats:
        return text_stats(self.text)


def load_image(source) -> Image.Image:
    """Open ``source`` (path, raw bytes, file object or PIL image) as a PIL image."""
    if isinstance(source, Image.Image):
        return source
    if isinstance(source, (bytes, bytearray)):
        return Image.open(io.BytesIO(bytes(source)))
    if isinstance(source, (str, os.PathLike)):
        with open(source, "rb") as fh:
            return Image.open(io.BytesIO(fh.read()))
    if hasattr(source, "read"):
        return Image.open(io.BytesIO(source.read()))
    raise TypeError("unsupported image source: {!r}".format(type(source).__name__))


def prepare_image(source, max_side: int = DOC_MAX_SIDE, min_side: int = DOC_MIN_SIDE) -> Image.Image:
    """Return an upright RGB copy of ``source`` sized for document OCR."""
    img = load_image(source)
    try:
        img.seek(0)  # first frame of an animated GIF / multi-page TIFF
    except (AttributeError, EOFError):
        pass
    img = ImageOps.exif_transpose(img)

    if img.mode in ("RGBA", "LA") or (img.mode == "P" and "transparency" in img.info):
        rgba = img.convert("RGBA")
        flat = Image.new("RGB", rgba.size, (255, 255, 255))
        flat.paste(rgba, mask=rgba.split()[-1])
        img = flat
    else:
        img = img.convert("RGB")

    width, height = img.size
    longest = max(width, height)
    if longest <= 0:
        raise ValueError("image has no pixels")

    scale = 1.0
    if max_side and longest > max_side:
        scale = max_side / longest
    elif min_side and longest < min_side:
        scale = min_side / longest
    if scale != 1.0:
        size = (max(1, round(width * scale)), max(1, round(height * scale)))
        img = img.resize(size, Image.Resampling.LANCZOS)
    return img


def to_png_bytes(img: Image.Image) -> bytes:
    buf = io.BytesIO()
    img.save(buf, format="PNG", optimize=True)
    return buf.getvalue()


def clean_ocr_text(raw: str) -> str:
    """Strip OCR markup tokens and tidy whitespace, keeping the line layout."""
    if not isinstance(raw, str):
        return ""
    text = _REF_RE.sub(r"\1", raw)
    text = _DET_RE.sub("", text)
    text = _TOKEN_RE.sub("", text)
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    text = _TRAILING_WS_RE.sub("", text)
    text = _MANY_BLANKS_RE.sub("\n\n", text).strip()
    # The OCR model often puts a blank line between *every* line. When no
    # single line break exists at all, those blanks carry no paragraph
    # meaning, so tighten them (real paragraphs mix single and double breaks).
    if "\n\n" in text and not re.search(r"[^\n]\n[^\n]", text):
        text = text.replace("\n\n", "\n")
    return text


def text_stats(text: str) -> TextStats:
    """Count words, letters (alphanumeric characters) and non-empty lines."""
    if not text:
        return TextStats(0, 0, 0)
    words = len(_WORD_RE.findall(text))
    letters = sum(1 for ch in text if ch.isalnum())
    lines = sum(1 for line in text.splitlines() if line.strip())
    return TextStats(words, letters, lines)


def read_image(client, source, *, target_lang: str | None = None,
               source_lang: str | None = None, max_side: int = DOC_MAX_SIDE) -> ImageReading:
    """OCR ``source`` with ``client`` and optionally translate the result.

    ``client`` is anything with ``ocr(png_bytes, mime, prompt=...)`` and
    ``translate(text, target, source)``, i.e. :class:`engine.maas.MaasClient`.
    OCR failures raise (``MaasError``, ``OSError`` / ``PIL.UnidentifiedImageError``);
    a translation failure does not: the text is kept and ``translation_error`` is set.
    """
    png = to_png_bytes(prepare_image(source, max_side=max_side))

    started = perf_counter()
    text = clean_ocr_text(client.ocr(png, "image/png", prompt=READ_PROMPT))
    reading = ImageReading(text=text, ocr_s=round(perf_counter() - started, 2))

    if target_lang and text:
        started = perf_counter()
        try:
            if hasattr(client, "translate_with_fallback"):
                reading.translation, reading.model_used = client.translate_with_fallback(
                    text, target_lang, source_lang, purpose="document")
            else:
                reading.translation = client.translate(text, target_lang, source_lang, purpose="document")
        except Exception as err:  # keep the OCR text even when translation is down
            reading.translation_error = str(err) or type(err).__name__
        reading.translate_s = round(perf_counter() - started, 2)
    return reading
