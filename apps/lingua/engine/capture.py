"""Screen-region capture and a fast perceptual change-detection hash.

``grab`` needs a display, but ``change_hash`` works on any PIL image, so the
hash logic is fully testable with synthetic images (no screen required).
"""

from __future__ import annotations

from typing import NamedTuple

from PIL import Image, ImageGrab

#: Width the image is downscaled to before hashing.
_HASH_WIDTH = 64


class Region(NamedTuple):
    x: int
    y: int
    w: int
    h: int


def grab(region: Region):
    """Grab the on-screen pixels for ``region`` and return an RGB PIL image."""
    bbox = (region.x, region.y, region.x + region.w, region.y + region.h)
    try:
        img = ImageGrab.grab(bbox=bbox, all_screens=True)
    except TypeError:
        img = ImageGrab.grab(bbox=bbox)
    return img.convert("RGB")


def downscale(img, max_width: int):
    """Return ``img`` shrunk so its width is at most ``max_width``.

    Smaller OCR inputs cut the vision-model latency substantially.
    """
    width, height = img.size
    if max_width <= 0 or width <= max_width:
        return img
    new_h = max(1, round(height * max_width / width))
    return img.resize((max_width, new_h), Image.Resampling.LANCZOS)


def change_hash(img) -> str:
    """Average-hash key: 64px-wide grayscale, compared against the mean.

    Returns a hex string. Two frames with the same hash are "unchanged".
    """
    gray = img.convert("L")
    width, height = gray.size
    if width <= 0 or height <= 0:
        return ""

    new_h = max(1, round(height * _HASH_WIDTH / width))
    small = gray.resize((_HASH_WIDTH, new_h), Image.Resampling.LANCZOS)
    pixels = list(small.tobytes())
    if not pixels:
        return ""

    mean = sum(pixels) / len(pixels)
    bits = "".join("1" if p >= mean else "0" for p in pixels)

    # Pack groups of 4 bits into a hex nibble (pad the tail with zeros).
    pad = (-len(bits)) % 4
    bits += "0" * pad
    return "".join(
        format(int(bits[i:i + 4], 2), "x") for i in range(0, len(bits), 4)
    )


def _diff_ratio(a: str, b: str) -> float:
    """Fraction of differing hex nibbles between two equal-length hashes."""
    if not a or not b or len(a) != len(b):
        return 1.0
    differing = sum(1 for ca, cb in zip(a, b) if ca != cb)
    return differing / len(a)


class RegionCapture:
    """Grabs a region and reports whether it changed since the last frame."""

    def __init__(self, region: Region, min_change: float = 0.0):
        self.region = region
        self.min_change = min_change
        self._last_hash = None

    def capture(self) -> tuple:
        """Return ``(image, changed)``; ``changed`` is False when unchanged.

        The first frame is always reported as changed. With ``min_change <= 0``
        a change requires the hash to differ; otherwise the hash-difference
        ratio must exceed ``min_change``.
        """
        img = grab(self.region)
        current = change_hash(img)

        if self._last_hash is None:
            changed = True
        elif self.min_change <= 0:
            changed = current != self._last_hash
        else:
            changed = _diff_ratio(current, self._last_hash) > self.min_change

        self._last_hash = current
        return img, changed
