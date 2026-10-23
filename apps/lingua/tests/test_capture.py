"""Capture/hash tests on synthetic images. No screen needed.

``grab`` is monkeypatched so ``RegionCapture`` can be exercised headlessly.
"""

import os
import sys
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

from PIL import Image, ImageDraw  # noqa: E402

from engine import capture  # noqa: E402


def _scene(seed: int) -> Image.Image:
    """A deterministic synthetic frame (same seed -> identical pixels)."""
    img = Image.new("RGB", (200, 100), (250, 250, 250))
    draw = ImageDraw.Draw(img)
    draw.rectangle([10, 10, 60 + seed, 40], fill=(20, 20, 20))
    draw.text((12, 60), "caption {}".format(seed), fill=(0, 0, 0))
    return img


class ChangeHashTests(unittest.TestCase):
    def test_region_is_namedtuple(self):
        r = capture.Region(x=1, y=2, w=3, h=4)
        self.assertEqual((r.x, r.y, r.w, r.h), (1, 2, 3, 4))
        x, y, w, h = r
        self.assertEqual((x, y, w, h), (1, 2, 3, 4))

    def test_identical_pixels_have_equal_hash(self):
        a = _scene(0)
        b = _scene(0)
        self.assertEqual(capture.change_hash(a), capture.change_hash(b))

    def test_changed_pixels_have_different_hash(self):
        a = _scene(0)
        b = _scene(40)
        self.assertNotEqual(capture.change_hash(a), capture.change_hash(b))

    def test_hash_is_hex_string_and_64px_wide(self):
        h = capture.change_hash(_scene(0))
        self.assertTrue(h)
        int(h, 16)  # parses as hex
        # 64 wide x proportional height, 4 bits per nibble.
        expected_h = max(1, round(100 * 64 / 200))
        self.assertEqual(len(h), (64 * expected_h + 3) // 4)


class RegionCaptureTests(unittest.TestCase):
    def test_first_frame_is_changed(self):
        region = capture.Region(0, 0, 200, 100)
        with mock.patch.object(capture, "grab", return_value=_scene(0)):
            img, changed = capture.RegionCapture(region).capture()
        self.assertIsInstance(img, Image.Image)
        self.assertTrue(changed)

    def test_unchanged_frame_reports_false(self):
        region = capture.Region(0, 0, 200, 100)
        cap = capture.RegionCapture(region)
        with mock.patch.object(capture, "grab", return_value=_scene(0)):
            cap.capture()                     # first frame
            _, changed = cap.capture()        # same pixels
        self.assertFalse(changed)

    def test_changed_frame_reports_true(self):
        region = capture.Region(0, 0, 200, 100)
        cap = capture.RegionCapture(region)
        with mock.patch.object(capture, "grab", return_value=_scene(0)):
            cap.capture()
        with mock.patch.object(capture, "grab", return_value=_scene(40)):
            _, changed = cap.capture()
        self.assertTrue(changed)

    def test_min_change_threshold_skips_small_diff(self):
        region = capture.Region(0, 0, 200, 100)
        cap = capture.RegionCapture(region, min_change=0.99)
        with mock.patch.object(capture, "grab", return_value=_scene(0)):
            cap.capture()
        with mock.patch.object(capture, "grab", return_value=_scene(40)):
            _, changed = cap.capture()  # large diff but below 0.99 ratio
        self.assertFalse(changed)


class DownscaleTests(unittest.TestCase):
    def test_caps_width_keeping_aspect(self):
        img = Image.new("RGB", (1000, 200))
        self.assertEqual(capture.downscale(img, 640).size, (640, 128))

    def test_small_image_returned_unchanged(self):
        img = Image.new("RGB", (300, 60))
        self.assertIs(capture.downscale(img, 640), img)

    def test_zero_max_width_is_a_noop(self):
        img = Image.new("RGB", (1000, 200))
        self.assertIs(capture.downscale(img, 0), img)


if __name__ == "__main__":
    unittest.main(verbosity=2)
