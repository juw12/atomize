"""Lingua: "Read picture" window (image -> words and letters).

A Toplevel that turns a picture into text:

- **Open image...** picks a PNG/JPEG/BMP/GIF/WebP/TIFF file;
- **Paste** (or Ctrl+V) reads an image, or a copied image file, off the clipboard;
- **Grab screen area** reuses the drag-a-rectangle picker to read anything on screen.

The picture is previewed, OCR runs on a background thread (the UI never
blocks), and the text lands in an editable, selectable box with a
word / letter / line count. "Translate to <target>" adds a translation using
the main window's target language and model. "Copy" puts the text (and the
translation, when shown) on the clipboard.
"""

from __future__ import annotations

import os
import queue
import threading
import tkinter as tk
from tkinter import filedialog
from typing import Callable

from PIL import Image, ImageGrab, ImageOps, ImageTk

from engine.capture import grab
from engine.image_text import IMAGE_EXTENSIONS, read_image, text_stats
from engine.maas import MaasError
from ui.region import select_region

_PREVIEW_W = 420
_PREVIEW_H = 220


class PictureReader:
    """Read-a-picture window bound to a parent :class:`ui.window.LinguaWindow`."""

    def __init__(
        self,
        master: tk.Misc,
        theme: dict,
        get_client: Callable[[], object | None],
        get_target: Callable[[], tuple[str, str]],
        get_source: Callable[[], str | None],
    ) -> None:
        self._theme = theme
        self._get_client = get_client
        self._get_target = get_target  # -> (ui label, model phrase)
        self._get_source = get_source
        self._queue: queue.Queue = queue.Queue()
        self._busy = False
        self._image: Image.Image | None = None
        self._preview_ref = None  # keep the PhotoImage alive
        self._last_dir = os.path.expanduser("~")

        self.win = tk.Toplevel(master)
        self.win.title("Lingua - Read picture")
        self.win.configure(bg=theme["bg"])
        self.win.attributes("-topmost", True)
        self.win.minsize(460, 520)

        self._build()
        self.win.bind("<Control-v>", lambda _e: self.paste())
        self.win.bind("<Control-V>", lambda _e: self.paste())
        self.win.bind("<Control-o>", lambda _e: self.open_file())
        self.win.protocol("WM_DELETE_WINDOW", self.close)
        self._poll()

    # -- layout --------------------------------------------------------------

    def _button(self, parent, text, command):
        t = self._theme
        return tk.Button(
            parent, text=text, command=command, relief="flat",
            bg=t["button"], fg=t["text"], activebackground=t["button_active"],
            activeforeground=t["text"], font=("Segoe UI", 10), padx=8,
        )

    def _build(self) -> None:
        t = self._theme
        bar = tk.Frame(self.win, bg=t["bg"])
        bar.pack(fill="x", padx=10, pady=(10, 6))
        self._button(bar, "Open image...", self.open_file).pack(side="left")
        self._button(bar, "Paste", self.paste).pack(side="left", padx=6)
        self._button(bar, "Grab screen area", self.grab_area).pack(side="left")

        self.preview = tk.Label(
            self.win, bg=t["card"], fg=t["muted"], height=10,
            text="Open, paste (Ctrl+V) or grab a picture with text in it",
            font=("Segoe UI", 10),
        )
        self.preview.pack(fill="x", padx=10)

        opts = tk.Frame(self.win, bg=t["bg"])
        opts.pack(fill="x", padx=10, pady=6)
        self.var_translate = tk.BooleanVar(value=False)
        self.chk_translate = tk.Checkbutton(
            opts, variable=self.var_translate, command=self._retranslate,
            text="Translate to " + self._get_target()[0],
            bg=t["bg"], fg=t["text"], selectcolor=t["button"],
            activebackground=t["bg"], activeforeground=t["text"], font=("Segoe UI", 9),
        )
        self.chk_translate.pack(side="left")
        self._button(opts, "Copy", self.copy).pack(side="right")
        self._button(opts, "Read again", self._run).pack(side="right", padx=6)

        box = tk.Frame(self.win, bg=t["card"])
        box.pack(fill="both", expand=True, padx=10)
        self.text = tk.Text(
            box, wrap="word", relief="flat", bd=0, highlightthickness=0,
            bg=t["card"], fg=t["text"], insertbackground=t["text"],
            font=("Segoe UI", 12), padx=8, pady=8, width=50, height=12, undo=True,
        )
        scroll = tk.Scrollbar(box, command=self.text.yview, width=12, relief="flat")
        scroll.pack(side="right", fill="y")
        self.text.pack(side="left", fill="both", expand=True)
        self.text.configure(yscrollcommand=scroll.set)
        self.text.tag_configure("heading", foreground=t["accent"],
                                font=("Segoe UI", 10, "bold"), spacing1=8)
        self.text.bind("<<Modified>>", self._on_edit)

        self.status = tk.Label(
            self.win, text="ready", anchor="w", bg=t["bg"], fg=t["muted"],
            font=("Consolas", 9), padx=10, pady=4,
        )
        self.status.pack(fill="x", side="bottom")

    # -- inputs --------------------------------------------------------------

    def open_file(self) -> None:
        patterns = " ".join("*" + ext for ext in IMAGE_EXTENSIONS)
        path = filedialog.askopenfilename(
            parent=self.win, title="Open a picture", initialdir=self._last_dir,
            filetypes=[("Images", patterns), ("All files", "*.*")],
        )
        if not path:
            return
        self._last_dir = os.path.dirname(path)
        try:
            with Image.open(path) as img:
                img.load()
                self.set_image(img.copy(), os.path.basename(path))
        except (OSError, ValueError) as err:
            self._set_status("cannot open image: {}".format(err), "err")

    def paste(self) -> None:
        try:
            clip = ImageGrab.grabclipboard()
        except (OSError, NotImplementedError) as err:
            self._set_status("clipboard unavailable: {}".format(err), "err")
            return
        if isinstance(clip, Image.Image):
            self.set_image(clip, "clipboard image")
            return
        if isinstance(clip, list):  # files copied in Explorer
            for path in clip:
                if str(path).lower().endswith(IMAGE_EXTENSIONS):
                    try:
                        with Image.open(path) as img:
                            img.load()
                            self.set_image(img.copy(), os.path.basename(path))
                        return
                    except (OSError, ValueError):
                        continue
        self._set_status("no picture on the clipboard (copy an image or press Win+Shift+S)", "warn")

    def grab_area(self) -> None:
        self.win.withdraw()
        try:
            region = select_region(self.win.master)
        finally:
            self.win.deiconify()
            self.win.lift()
        if region is None:
            self._set_status("grab cancelled", "muted")
            return
        try:
            self.set_image(grab(region), "screen area")
        except OSError as err:
            self._set_status("screen grab failed: {}".format(err), "err")

    def set_image(self, img: Image.Image, label: str) -> None:
        img = ImageOps.exif_transpose(img)  # phone photos: show and read upright
        self._image = img
        preview = img.convert("RGB")
        preview.thumbnail((_PREVIEW_W, _PREVIEW_H))
        self._preview_ref = ImageTk.PhotoImage(preview)
        self.preview.configure(image=self._preview_ref, text="", height=_PREVIEW_H)
        self._set_status("{} - {}x{} px".format(label, img.width, img.height), "muted")
        self._run()

    # -- work ----------------------------------------------------------------

    def _run(self) -> None:
        if self._image is None:
            self._set_status("open, paste or grab a picture first", "warn")
            return
        if self._busy:
            return
        client = self._get_client()
        if client is None:
            self._set_status("no API key (set MAAS_API_KEY)", "err")
            return
        target = self._get_target()[1] if self.var_translate.get() else None
        source = self._get_source()
        image = self._image.copy()
        self._busy = True
        self._set_status("reading picture...", "ok")
        threading.Thread(
            target=self._work, args=(client, image, target, source), daemon=True
        ).start()

    def _work(self, client, image, target, source) -> None:
        try:
            reading = read_image(client, image, target_lang=target, source_lang=source)
            self._queue.put(("done", reading))
        except MaasError as err:
            self._queue.put(("error", str(err)))
        except Exception as err:  # unreadable image etc.
            self._queue.put(("error", "could not read picture: {}".format(err)))

    def _retranslate(self) -> None:
        label = self._get_target()[0]
        self.chk_translate.configure(text="Translate to " + label)
        if self._image is not None and not self._busy:
            self._run()

    def _poll(self) -> None:
        try:
            while True:
                kind, payload = self._queue.get_nowait()
                self._busy = False
                if kind == "done":
                    self._show(payload)
                else:
                    self._set_status("Error: " + payload, "err")
        except queue.Empty:
            pass
        if self.win.winfo_exists():
            self.win.after(80, self._poll)

    def _show(self, reading) -> None:
        self.text.delete("1.0", "end")
        if not reading.text:
            self.text.insert("1.0", "")
            self._set_status("no words or letters found in this picture", "warn")
            return
        if reading.translation:
            self.text.insert("end", "Text in picture\n", ("heading",))
            self.text.insert("end", reading.text + "\n")
            self.text.insert("end", "Translation ({})\n".format(self._get_target()[0]), ("heading",))
            self.text.insert("end", reading.translation)
        else:
            self.text.insert("end", reading.text)
        self.text.edit_modified(False)
        self._reading = reading
        self._show_stats(reading.text, reading.ocr_s, reading.translate_s)

    def _show_stats(self, text: str, ocr_s: float = 0.0, translate_s: float = 0.0) -> None:
        stats = text_stats(text)
        parts = [
            "{} words".format(stats.words),
            "{} letters".format(stats.letters),
            "{} lines".format(stats.lines),
        ]
        if ocr_s:
            parts.append("OCR {:.1f}s".format(ocr_s))
        if translate_s:
            parts.append("translate {:.1f}s".format(translate_s))
        self._set_status(" · ".join(parts), "ok")

    def _on_edit(self, _event=None) -> None:
        if not self.text.edit_modified():
            return
        self.text.edit_modified(False)
        if getattr(self, "_reading", None) is not None and not self._reading.translation:
            self._show_stats(self.text.get("1.0", "end-1c"))

    def copy(self) -> None:
        content = self.text.get("1.0", "end-1c").strip()
        if not content:
            self._set_status("nothing to copy yet", "warn")
            return
        self.win.clipboard_clear()
        self.win.clipboard_append(content)
        self._set_status("copied {} characters".format(len(content)), "ok")

    # -- misc ----------------------------------------------------------------

    def _set_status(self, message: str, level: str) -> None:
        self.status.configure(text=message, fg=self._theme.get(level, self._theme["muted"]))

    def focus(self) -> None:
        self.win.deiconify()
        self.win.lift()
        self.win.focus_force()

    def close(self) -> None:
        self.win.destroy()

    def exists(self) -> bool:
        try:
            return bool(self.win.winfo_exists())
        except tk.TclError:
            return False
