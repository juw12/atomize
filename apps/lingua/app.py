#!/usr/bin/env python3
"""Lingua: Microsoft Teams live-caption translator overlay.

Usage::

    python app.py                 # launch the overlay + control panel
    python app.py --selftest      # headless checks, exit 0/1
    python app.py --read-image PICTURE [--translate]
                                  # print the words/letters in a picture
    python app.py --serve [--port 8765]
                                  # share Read picture with phones on this Wi-Fi

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


def _load_env_file() -> None:
    """Apply KEY=VALUE lines from ``lingua.env`` (gateway URLs, optional key).

    Looked up next to the program (the Windows download ships one) and in
    ``%APPDATA%\\lingua``. Real environment variables always win.
    """
    if getattr(sys, "frozen", False):
        here = os.path.dirname(sys.executable)
    else:
        here = os.path.dirname(os.path.abspath(__file__))
    candidates = [
        os.path.join(here, "lingua.env"),
        os.path.join(os.environ.get("APPDATA") or os.path.expanduser("~"), "lingua", "lingua.env"),
    ]
    for path in candidates:
        try:
            with open(path, "r", encoding="utf-8-sig") as fh:
                lines = fh.read().splitlines()
        except OSError:
            continue
        for line in lines:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            key = key.strip()
            value = value.strip().strip('"').strip("'")
            if key and value:
                os.environ.setdefault(key, value)


def main(argv: list[str] | None = None) -> int:
    """Entry point. Returns 0 on success, non-zero on failure."""
    args = argv if argv is not None else sys.argv[1:]

    _load_env_file()

    if "--selftest" in args:
        return _run_selftest()

    if "--serve" in args:
        return _run_serve(args)

    if "--read-image" in args:
        return _run_read_image(args)

    # Normal GUI run.
    from engine import config
    from ui.window import LinguaWindow

    cfg = config.load()
    window = LinguaWindow(cfg)
    window.root.mainloop()
    return 0


def _run_serve(args: list[str]) -> int:
    """CLI: run the phone server until Ctrl+C."""
    import time

    from engine.local_server import DEFAULT_PORT, LocalServer
    from engine.maas import discover_api_key

    port = DEFAULT_PORT
    if "--port" in args:
        try:
            port = int(args[args.index("--port") + 1])
        except (IndexError, ValueError):
            print("usage: python app.py --serve [--port 8765]", file=sys.stderr)
            return 2
    if discover_api_key() is None:
        print("warning: no API key found; set MAAS_API_KEY or add it to lingua.env", file=sys.stderr)
    server = LocalServer(port=port).start()
    print("Lingua is shared on this network. Open on your phone (same Wi-Fi):")
    print("  " + server.phone_url)
    print("Press Ctrl+C to stop.")
    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        server.stop()
    return 0


def _run_read_image(args: list[str]) -> int:
    """CLI: OCR one picture and print its text (plus a translation with --translate)."""
    from engine import config
    from engine.image_text import read_image
    from engine.maas import LANGUAGES, LLM_MODEL, OCR_MODEL, MaasClient, MaasError, discover_api_key

    index = args.index("--read-image")
    if index + 1 >= len(args) or args[index + 1].startswith("--"):
        print("usage: python app.py --read-image PICTURE [--translate]", file=sys.stderr)
        return 2
    path = args[index + 1]
    if not os.path.isfile(path):
        print("no such file: " + path, file=sys.stderr)
        return 2

    key = discover_api_key()
    if key is None:
        print("no API key (set MAAS_API_KEY or GATEWAY_API_KEY)", file=sys.stderr)
        return 1

    cfg = config.load()
    client = MaasClient(
        api_key=key,
        llm_model=cfg.get("llm_model", LLM_MODEL),
        ocr_model=cfg.get("ocr_model", OCR_MODEL),
    )
    target = None
    if "--translate" in args:
        target = LANGUAGES.get(cfg.get("target_lang")) or "English"
    source = LANGUAGES.get(cfg.get("source_lang"))

    try:
        reading = read_image(client, path, target_lang=target, source_lang=source)
    except MaasError as err:
        print("OCR failed: " + str(err), file=sys.stderr)
        return 1
    except OSError as err:
        print("cannot read picture: " + str(err), file=sys.stderr)
        return 1

    print(reading.text)
    if reading.translation:
        print()
        print("--- translation ({}) ---".format(target))
        print(reading.translation)
    stats = reading.stats
    print(
        "\n[{} words, {} letters, {} lines; OCR {:.1f}s]".format(
            stats.words, stats.letters, stats.lines, reading.ocr_s
        ),
        file=sys.stderr,
    )
    return 0 if reading.text else 1


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
        from ui import picture, region, share, theme, window
        from engine import maas, pipeline, capture, image_text, local_server

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

    # 10. Read a picture: synthetic "document" photo -> words and letters.
    try:
        from engine.image_text import prepare_image, read_image

        doc = Image.new("RGBA", (300, 120), (0, 0, 0, 0))
        doc_draw = ImageDraw.Draw(doc)
        try:
            doc_font = ImageFont.truetype(r"C:\Windows\Fonts\arial.ttf", 28)
        except OSError:
            doc_font = ImageFont.load_default()
        doc_draw.text((12, 20), "READ ME 42", fill=(0, 0, 0, 255), font=doc_font)
        doc_draw.text((12, 64), "Lingua picture", fill=(0, 0, 0, 255), font=doc_font)
        prepared = prepare_image(doc)
        ok = prepared.mode == "RGB" and max(prepared.size) >= 768
        report("prepare_image", ok, "size {}x{}".format(*prepared.size))

        if key:
            reading = read_image(MaasClient(api_key=key), doc)
            found = "READ" in reading.text.upper() and "42" in reading.text
            report("read_image (picture -> text)", found,
                   repr(reading.text[:60]) + " in {:.1f}s".format(reading.ocr_s))
        else:
            report("read_image (picture -> text)", False, "no API key")
    except MaasError as err:
        report("read_image (picture -> text)", False, str(err))
    except Exception as err:
        report("read_image (picture -> text)", False, str(err))

    # 11. LANGUAGES map sanity.
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
