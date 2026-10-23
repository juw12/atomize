"""PURE caption state machine: dedup, delta diff and translation caching.

No network access and no tkinter here - ``translate_fn`` is injected. Given the
raw OCR text of each frame, :meth:`CaptionPipeline.update` returns the current
window of :class:`Line` objects.

Algorithm per frame:

1. Split the raw text into lines, normalise whitespace, drop OCR junk
   (bare URLs, ``@handles`` and stray ``<|...|>`` tokens).
2. Diff against the previous frame's lines by their common prefix; only the
   new tail is a candidate for translation.
3. The last line is ``live=True`` (it may still be growing and can be
   re-translated as it changes); earlier new lines are committed once.
4. Every translation is memoised in ``cache`` keyed by the exact original
   string, so identical lines are translated exactly once.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

_WS = re.compile(r"\s+")
_URL = re.compile(r"^(?:https?://|www\.)\S+$", re.IGNORECASE)
_HANDLE = re.compile(r"^@\w[\w.\-]*$")
_TOKEN = re.compile(r"<\|[^|]*\|>")
_ALNUM = re.compile(r"[A-Za-z0-9\u4e00-\u9fff]")
_CJK = re.compile(r"[\u4e00-\u9fff]")
_SENTENCE_END = ".?!。？！:：,，;；\"'”）)"


@dataclass
class Line:
    speaker: str | None
    original: str
    translation: str
    live: bool


def _is_junk(text: str) -> bool:
    if _URL.match(text) or _HANDLE.match(text):
        return True
    # Lines with no letters/digits/CJK at all are pure OCR noise.
    return _ALNUM.search(text) is None


def _normalize_lines(raw_text: str) -> list:
    """Split/normalise a frame into clean, non-empty caption lines."""
    if not raw_text:
        return []
    out = []
    for raw in raw_text.split("\n"):
        # Tokens must be stripped before the whitespace collapse, else a
        # removed token leaves a double space in the normalised line.
        text = _WS.sub(" ", _TOKEN.sub("", raw)).strip()
        if not text or _is_junk(text):
            continue
        out.append(text)
    return out


def _common_prefix_len(a: list, b: list) -> int:
    n = 0
    for x, y in zip(a, b):
        if x != y:
            break
        n += 1
    return n


def _looks_like_speaker(text: str, next_line: str | None) -> bool:
    """Heuristic: does ``text`` look like a speaker name for ``next_line``?

    Conservative on purpose. A name is short, unpunctuated, and (for Latin
    script) every word is capitalised - which rules out most spoken words like
    "Hello everyone". A candidate also needs a following line to label.
    """
    if not text or next_line is None:
        return False
    if len(text) > 30 or text[-1] in _SENTENCE_END:
        return False

    words = text.split()
    if not (1 <= len(words) <= 3):
        return False

    if _CJK.search(text):
        return len(text) <= 8

    for word in words:
        head = word[:1]
        if not head.isalpha() or not head.isupper():
            return False
    # A caption usually ends with punctuation or is longer than the name.
    return len(next_line) > len(text) or next_line[-1:] in _SENTENCE_END


def _detect_speaker(lines: list, index: int) -> str | None:
    if index <= 0:
        return None
    prev = lines[index - 1]
    if _looks_like_speaker(prev, lines[index]):
        return prev
    return None


class CaptionPipeline:
    def __init__(self, translate_fn, cache=None, max_lines: int = 200):
        self.translate_fn = translate_fn
        self.cache = cache if cache is not None else {}
        self.max_lines = max_lines
        self._prev_norm: list = []
        self._window: list = []

    def _translate_cached(self, original: str, on_chunk=None) -> str:
        if original in self.cache:
            return self.cache[original]
        result = self.translate_fn(original, on_chunk)
        self.cache[original] = result
        return result

    def update(self, raw_text: str, on_chunk=None) -> list:
        norm = _normalize_lines(raw_text)
        if not norm:
            return list(self._window)
        prefix = _common_prefix_len(self._prev_norm, norm)
        prefix = min(prefix, len(self._window))

        # Copy reused lines so mutating the new window never rewrites a list
        # already handed back to a caller.
        reused = [
            Line(ln.speaker, ln.original, ln.translation, False)
            for ln in self._window[:prefix]
        ]
        tail = norm[prefix:]

        built = []
        for offset, text in enumerate(tail):
            index = prefix + offset
            speaker = _detect_speaker(norm, index)
            live = offset == len(tail) - 1
            translation = self._translate_cached(text, on_chunk if live else None)
            built.append(Line(speaker, text, translation, False))

        window = reused + built
        if window:
            for line in window:
                line.live = False
            window[-1].live = True

        if self.max_lines and len(window) > self.max_lines:
            window = window[-self.max_lines:]

        self._window = window
        self._prev_norm = norm[-self.max_lines:] if self.max_lines else norm
        return list(window)

    def reset(self) -> None:
        self._prev_norm = []
        self._window = []


def _overlap(recorded: list, incoming: list) -> int:
    """Longest ``k`` with ``recorded[-k:] == incoming[:k]``; 0 when none."""
    for k in range(min(len(recorded), len(incoming)), 0, -1):
        if recorded[-k:] == incoming[:k]:
            return k
    return 0


def _commit(line: Line) -> Line:
    return Line(line.speaker, line.original, line.translation, False)


def _grows(previous: str, current: str) -> bool:
    """True when ``current`` looks like the same line as ``previous``, grown.

    Compares shared prefix length, so OCR jitter on a still-growing line does
    not read as a brand-new line (which would duplicate it in the transcript).
    """
    if not previous or not current:
        return False
    if previous == current:
        return True
    shared = 0
    for a, b in zip(previous, current):
        if a != b:
            break
        shared += 1
    return shared >= max(3, int(0.6 * min(len(previous), len(current))))


def speaker_rows(lines: list) -> list:
    """Return ``(speaker, translation)`` rows with name plates collapsed.

    A line whose ``original`` is used as the next line's ``speaker`` is a bare
    name plate: it is dropped, and its text becomes the following line's label,
    so the speaker is not shown twice.
    """
    rows = []
    for i, line in enumerate(lines):
        if (
            i + 1 < len(lines)
            and line.original
            and lines[i + 1].speaker == line.original
        ):
            continue
        rows.append((line.speaker, line.translation))
    return rows


class Transcript:
    """Accumulates per-frame caption windows into one running transcript.

    ``CaptionPipeline`` returns only the lines currently on screen, so a
    scrolling caption strip drops old lines. ``Transcript`` keeps every line it
    has seen (up to ``max_lines``) so the overlay can show the meeting history.

    Each frame is aligned against the tail of what is already recorded; only the
    genuinely new tail is appended, and the newest line stays ``live`` (replaced
    as it grows) until a later line commits it.
    """

    def __init__(self, max_lines: int = 500):
        self.max_lines = max_lines
        self._history: list = []
        self._pending = None

    def add(self, frame_lines: list) -> list:
        """Record one frame's lines and return the accumulated transcript."""
        if not frame_lines:
            return self.lines()
        incoming = [line.original for line in frame_lines]
        known = [line.original for line in self._history]
        if self._pending is not None:
            known.append(self._pending.original)
        overlap = _overlap(known, incoming)
        tail = frame_lines[overlap:]
        if tail:
            if self._pending is not None:
                grew = overlap == 0 and _grows(
                    self._pending.original, tail[-1].original
                )
                if not grew:
                    self._history.append(_commit(self._pending))
            self._pending = None
            for line in tail[:-1]:
                self._history.append(_commit(line))
            last = tail[-1]
            if self._history and self._history[-1].original == last.original:
                self._pending = None
            else:
                self._pending = Line(
                    last.speaker, last.original, last.translation, True
                )
            if self.max_lines and len(self._history) > self.max_lines:
                self._history = self._history[-self.max_lines:]
        return self.lines()

    def lines(self) -> list:
        if self._pending is None:
            return list(self._history)
        return list(self._history) + [self._pending]

    def reset(self) -> None:
        self._history = []
        self._pending = None
