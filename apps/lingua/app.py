#!/usr/bin/env python3
"""Lingua: Microsoft Teams live-caption translator overlay.

Usage::

    python app.py                 # launch the overlay + control panel
    python app.py --selftest      # headless checks, exit 0/1

The app creates a small control panel (start/stop, language pickers,
region selector, opacity/font controls, click-through toggle) and a
borderless always-on-top overlay that floats over Teams showing the
translated captions.
"""

from __future__ import annotations

import io
import os
import sys
import tkinter as tk
from typing import TYPE_CHECKING

# Ensure UTF-8 stdout/stderr on Windows PowerShell.
# Under pythonw.exe (no console) these can be None, so guard against that.
if sys.stdout is not None:
    sys.stdout.reconfigure(encoding="utf-8")
if sys.stderr is not None:
    sys.stderr.reconfigure(encoding="utf-8")

if TYPE_CHECKING:
    from engine.maas import MaasClient
    from engine.pipeline import CaptionPipeline


def main(argv: list[str] | None = None) -> int:
    """Entry point. Returns 0 on success, non-zero on failure."""
    args = argv if argv is not None else sys.argv[1:]

    if "--selftest" in args:
        return _run_selftest()

    # Normal GUI run.
    from engine import config
    from ui.window import LinguaWindow

    cfg = config.load()
    window = LinguaWindow(cfg)
    window.root.mainloop()
    return 0


def _run_selftest() -> int:
    """Headless self-test: imports, key discovery, OCR+translate sanity,
    pipeline flow. Returns 0 on all PASS, 1 on any FAIL."""
    from engine import config
    from engine.capture import Region, RegionCapture, change_hash, grab
    from engine.maas import (
        LANGUAGES,
        LLM_MODEL,
        OCR_MODEL,
        MaasClient,
        MaasError,
        discover_api_key,
    )
    from engine.pipeline import CaptionPipeline

    failures = 0

    def report(name: str, ok: bool, msg: str = "") -> None:
        nonlocal failures
        status = "✓ PASS" if ok else "✗ FAIL"
        line = f"{status}  {name}"
        if msg:
            line += f": {msg}"
        print(line)
        if not ok:
            failures += 1

    # 1. Import every module.
    try:
        from ui import region, theme, window
        from engine import maas, pipeline, capture

        report("import engine.*", True)
        report("import ui.*", True)
    except ImportError as err:
        report("import modules", False, str(err))
        return 1

    # 2. Config load/save sanity, via a temp path so the real config is untouched.
    try:
        import tempfile

        tmp = os.path.join(tempfile.gettempdir(), "lingua_selftest_config.json")
        real_path = config.config_path
        config.config_path = lambda: tmp
        try:
            cfg = config.load()
            assert isinstance(cfg, dict)
            cfg["test_key"] = 123
            config.save(cfg)
            cfg2 = config.load()
            report("config load/save", cfg2.get("test_key") == 123)
        finally:
            config.config_path = real_path
            try:
                os.remove(tmp)
            except OSError:
                pass
    except Exception as err:
        report("config load/save", False, str(err))

    # 3. API key discovery.
    key = discover_api_key()
    report("discover_api_key", key is not None,
           "no key found (env or opencode.json)" if key is None else "")

    # 4. Synthetic caption image: English + CJK line.
    try:
        from PIL import Image, ImageDraw, ImageFont

        # Build a 420×90 RGBA image with two lines.
        img = Image.new("RGB", (420, 90), color=(12, 16, 22))
        draw = ImageDraw.Draw(img)

        # Try to load a Windows CJK font; fall back to default.
        font_path = r"C:\Windows\Fonts\msyh.ttc"
        try:
            font_big = ImageFont.truetype(font_path, 22)
            font_small = ImageFont.truetype(font_path, 14)
        except OSError:
            font_big = ImageFont.load_default()
            font_small = ImageFont.load_default()

        draw.text((14, 14), "Hello, this is a test caption.",
                  fill=(245, 247, 251), font=font_big)
        draw.text((14, 46), "你好，這是測試字幕。",
                  fill=(245, 247, 251), font=font_small)

        buf = io.BytesIO()
        img.save(buf, format="PNG")
        png_bytes = buf.getvalue()

        report("synthetic caption PNG", len(png_bytes) > 0)
    except Exception as err:
        report("synthetic caption PNG", False, str(err))
        png_bytes = None

    # 5. OCR the synthetic image (requires network + key).
    ocr_text = ""
    if png_bytes and key:
        try:
            client = MaasClient(api_key=key)
            ocr_text = client.ocr(png_bytes)
            ok = isinstance(ocr_text, str) and len(ocr_text.strip()) > 0
            report("MaasClient.ocr", ok,
                   "empty response" if not ok else f"got {len(ocr_text)} chars")
        except MaasError as err:
            report("MaasClient.ocr", False, str(err))
        except Exception as err:
            report("MaasClient.ocr", False, str(err))
    elif not key:
        report("MaasClient.ocr", False, "no API key")
    else:
        report("MaasClient.ocr", False, "no PNG bytes")

    # 6. Translate to Traditional Chinese.
    if key and ocr_text:
        try:
            client = MaasClient(api_key=key)
            translated = client.translate(ocr_text, "Traditional Chinese (繁體中文)")
            ok = isinstance(translated, str) and len(translated.strip()) > 0
            report("MaasClient.translate", ok,
                   "empty response" if not ok else f"got {len(translated)} chars")
        except MaasError as err:
            report("MaasClient.translate", False, str(err))
        except Exception as err:
            report("MaasClient.translate", False, str(err))
    elif not key:
        report("MaasClient.translate", False, "no API key")
    else:
        report("MaasClient.translate", False, "no OCR text")

    # 7. CaptionPipeline over a synthetic 3-step sequence.
    try:
        fake_translate = lambda s, on_chunk=None: f"[{s}→zh]"  # noqa: E731
        pipe = CaptionPipeline(translate_fn=fake_translate, cache={}, max_lines=200)

        # Step 1
        lines1 = pipe.update("Hello")
        ok1 = (len(lines1) == 1 and
               lines1[0].original == "Hello" and
               lines1[0].translation == "[Hello→zh]" and
               lines1[0].live is True)

        # Step 2: grow the live line
        lines2 = pipe.update("Hello world")
        ok2 = (len(lines2) == 1 and
               lines2[0].original == "Hello world" and
               lines2[0].live is True)

        # Step 3: new line appears, previous becomes committed
        lines3 = pipe.update("Hello world\nNext line")
        ok3 = (len(lines3) == 2 and
               lines3[0].live is False and
               lines3[1].live is True)

        ok = ok1 and ok2 and ok3
        report("CaptionPipeline 3-step", ok)
        if not ok:
            if not ok1:
                print("    step1 lines:", lines1)
            if not ok2:
                print("    step2 lines:", lines2)
            if not ok3:
                print("    step3 lines:", lines3)
    except Exception as err:
        report("CaptionPipeline 3-step", False, str(err))

    # 8. RegionCapture / change_hash on synthetic images.
    try:
        # Use images with actual patterns - uniform colors all hash the same.
        img1 = Image.new("RGB", (64, 64), color=(10, 10, 10))
        img2 = img1.copy()  # identical

        # Create a checkerboard pattern that will hash differently.
        img3 = Image.new("RGB", (64, 64), color=(200, 200, 200))
        for y in range(0, 64, 8):
            for x in range(0, 64, 8):
                if (x // 8 + y // 8) % 2 == 0:
                    for dy in range(8):
                        for dx in range(8):
                            img3.putpixel((x + dx, y + dy), (50, 50, 50))

        h1 = change_hash(img1)
        h2 = change_hash(img2)
        h3 = change_hash(img3)

        ok = (h1 == h2) and (h1 != h3) and isinstance(h1, str) and len(h1) > 0
        report("change_hash", ok)
    except Exception as err:
        report("change_hash", False, str(err))

    # 9. grab() on a synthetic region (headless: just verify import/type).
    try:
        # We can't actually grab without a display, but we can ensure the
        # function exists and the Region type is sane.
        r = Region(10, 20, 100, 80)
        ok = (r.x == 10 and r.y == 20 and r.w == 100 and r.h == 80)
        report("Region type", ok)
    except Exception as err:
        report("Region type", False, str(err))

    # 10. LANGUAGES map sanity.
    try:
        ok = ("Auto (detect)" in LANGUAGES and
              "English" in LANGUAGES and
              "繁體中文" in LANGUAGES)
        report("LANGUAGES map", ok)
    except Exception as err:
        report("LANGUAGES map", False, str(err))

    print()
    if failures == 0:
        print("All checks passed.")
        return 0
    else:
        print(f"{failures} check(s) failed.")
        return 1


if __name__ == "__main__":
    sys.exit(main())
