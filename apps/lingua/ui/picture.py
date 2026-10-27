"""Lingua: "Read picture" window (image -> words and letters).

Inputs: Open (one or many files; many = batch), Paste (Ctrl+V), Grab screen area.
Tools: rotate left/right, read again. Output: Text / Translation tabs with a
word, letter and line count, a translate-to picker (all Lingua languages, with
model fallback and a clear banner when the service is down), Listen (Windows
voices), Copy, Save .txt, and a History menu of recent scans (stored on this PC).
OCR runs on a background thread; the UI never blocks.
"""

from __future__ import annotations

import os
import queue
import threading
import time
import tkinter as tk
from tkinter import filedialog, messagebox

from PIL import Image, ImageGrab, ImageOps, ImageTk

from engine import history, speech
from engine.capture import grab
from engine.image_text import IMAGE_EXTENSIONS, ImageReading, read_image, text_stats
from engine.maas import LANGUAGES, MaasError
from ui.region import select_region

_PREVIEW_W = 460
_PREVIEW_H = 240
_FONT = "Segoe UI"


class PictureReader:
    """Read-a-picture window bound to a parent :class:`ui.window.LinguaWindow`."""

    def __init__(self, master, theme, get_client, get_target, get_source) -> None:
        self._t = theme
        self._get_client = get_client
        self._get_source = get_source
        self._queue: queue.Queue = queue.Queue()
        self._busy = False
        self._images: list[tuple[Image.Image, str]] = []  # batch: (image, label)
        self._index = 0
        self._preview_ref = None
        self._entry_id: str | None = None
        self._tab = "text"
        self._last_dir = os.path.expanduser("~")

        self.win = tk.Toplevel(master)
        self.win.title("Lingua - Read picture")
        self.win.configure(bg=theme["bg"])
        self.win.attributes("-topmost", True)
        self.win.minsize(560, 640)
        self.win.geometry("600x760")

        target_label = get_target()[0]
        self.var_target = tk.StringVar(value=target_label if target_label in LANGUAGES else "English")
        self.var_auto = tk.BooleanVar(value=False)

        self._build()
        for seq in ("<Control-v>", "<Control-V>"):
            self.win.bind(seq, lambda _e: self.paste())
        self.win.bind("<Control-o>", lambda _e: self.open_files())
        self.win.bind("<Control-s>", lambda _e: self.save_txt())
        self.win.bind("<Control-Return>", lambda _e: self._run())
        self.win.protocol("WM_DELETE_WINDOW", self.close)
        self._poll()

    # ------------------------------------------------------------------ layout

    def _button(self, parent, text, command, primary=False, **kw):
        t = self._t
        return tk.Button(
            parent, text=text, command=command, relief="flat", cursor="hand2",
            bg=t["accent"] if primary else t["button"],
            fg=t["bg"] if primary else t["text"],
            activebackground=t["button_active"], activeforeground=t["text"],
            font=(_FONT, 10, "bold" if primary else "normal"), padx=10, pady=5, bd=0, **kw,
        )

    def _option(self, parent, var, values, command=None):
        t = self._t
        menu = tk.OptionMenu(parent, var, *values, command=command)
        menu.configure(bg=t["button"], fg=t["text"], activebackground=t["button_active"],
                       activeforeground=t["text"], relief="flat", highlightthickness=0,
                       font=(_FONT, 9), indicatoron=False, bd=0, padx=8, pady=4)
        menu["menu"].configure(bg=t["card"], fg=t["text"], activebackground=t["button_active"])
        return menu

    def _build(self) -> None:
        t = self._t
        pad = {"padx": 12}

        bar = tk.Frame(self.win, bg=t["bg"])
        bar.pack(fill="x", pady=(12, 8), **pad)
        self._button(bar, "📂  Open…", self.open_files).pack(side="left")
        self._button(bar, "📋  Paste", self.paste).pack(side="left", padx=6)
        self._button(bar, "✂  Grab screen area", self.grab_area).pack(side="left")
        self.btn_history = self._button(bar, "🕘  History ▾", self._show_history)
        self.btn_history.pack(side="right")

        stage = tk.Frame(self.win, bg=t["card"])
        stage.pack(fill="x", **pad)
        self.preview = tk.Label(
            stage, bg=t["card"], fg=t["muted"], height=11, justify="center",
            text="Open, paste (Ctrl+V) or grab a picture with text in it.\n"
                 "Several files at once are read as a batch.",
            font=(_FONT, 10),
        )
        self.preview.pack(fill="x", pady=8)
        tools = tk.Frame(stage, bg=t["card"])
        tools.pack(fill="x", padx=8, pady=(0, 8))
        self._button(tools, "⟲", lambda: self._rotate(90), width=3).pack(side="left")
        self._button(tools, "⟳", lambda: self._rotate(-90), width=3).pack(side="left", padx=4)
        self.lbl_batch = tk.Label(tools, text="", bg=t["card"], fg=t["muted"], font=(_FONT, 9))
        self.lbl_batch.pack(side="left", padx=8)
        self.btn_read = self._button(tools, "Read picture  (Ctrl+Enter)", self._run, primary=True)
        self.btn_read.pack(side="right")

        opts = tk.Frame(self.win, bg=t["bg"])
        opts.pack(fill="x", pady=(10, 4), **pad)
        tk.Checkbutton(
            opts, variable=self.var_auto, text="Translate automatically to",
            bg=t["bg"], fg=t["text"], selectcolor=t["button"], activebackground=t["bg"],
            activeforeground=t["text"], font=(_FONT, 9),
        ).pack(side="left")
        langs = [k for k in LANGUAGES if k != "Auto (detect)"]
        self._option(opts, self.var_target, langs).pack(side="left", padx=4)
        self._button(opts, "Translate now", self._translate_now).pack(side="left", padx=4)

        tabs = tk.Frame(self.win, bg=t["bg"])
        tabs.pack(fill="x", pady=(6, 0), **pad)
        self.tab_text = self._button(tabs, "Text", lambda: self._set_tab("text"))
        self.tab_text.pack(side="left")
        self.tab_trans = self._button(tabs, "Translation", lambda: self._set_tab("trans"))
        self.tab_trans.pack(side="left", padx=4)

        self.banner = tk.Label(self.win, text="", bg=t["bg"], fg=t["err"], font=(_FONT, 9),
                               anchor="w", justify="left", wraplength=560)
        self.banner.pack(fill="x", **pad)
        self.btn_pack = self._button(self.win, "⬇  Get offline translation (works without the company service)",
                                     self._get_offline_packs)

        # Bottom-anchored rows first so they never get pushed off-screen.
        self.status = tk.Label(self.win, text="ready", anchor="w", bg=t["bg"], fg=t["muted"],
                               font=("Consolas", 9), padx=12, pady=6)
        self.status.pack(fill="x", side="bottom")
        actions = tk.Frame(self.win, bg=t["bg"])
        actions.pack(fill="x", side="bottom", pady=(6, 2), **pad)
        self._button(actions, "⧉  Copy", self.copy).pack(side="left")
        self.btn_listen = self._button(actions, "🔊  Listen", self.listen)
        self.btn_listen.pack(side="left", padx=6)
        self._button(actions, "💾  Save .txt", self.save_txt).pack(side="left")
        if not speech.available():
            self.btn_listen.configure(state="disabled")

        box = tk.Frame(self.win, bg=t["card"])
        box.pack(fill="both", expand=True, pady=(4, 0), **pad)
        self.text = self._textbox(box)
        self.trans = self._textbox(box)
        self.text.pack(side="left", fill="both", expand=True)
        self._scroll = tk.Scrollbar(box, command=self._yview, width=12, relief="flat")
        self._scroll.pack(side="right", fill="y")
        for widget in (self.text, self.trans):
            widget.configure(yscrollcommand=self._scroll.set)
            widget.bind("<<Modified>>", self._on_edit)

        self._set_tab("text")

    def _textbox(self, parent) -> tk.Text:
        t = self._t
        return tk.Text(parent, wrap="word", relief="flat", bd=0, highlightthickness=0,
                       bg=t["card"], fg=t["text"], insertbackground=t["text"],
                       font=(_FONT, 12), padx=10, pady=10, undo=True, spacing1=2, spacing3=2,
                       height=6, width=40)

    def _yview(self, *args):
        (self.trans if self._tab == "trans" else self.text).yview(*args)

    def _set_tab(self, tab: str) -> None:
        t = self._t
        self._tab = tab
        shown, hidden = (self.trans, self.text) if tab == "trans" else (self.text, self.trans)
        hidden.pack_forget()
        shown.pack(side="left", fill="both", expand=True, before=self._scroll)
        for button, active in ((self.tab_text, tab == "text"), (self.tab_trans, tab == "trans")):
            button.configure(bg=t["accent"] if active else t["button"], fg=t["bg"] if active else t["text"])
        self._show_stats()

    # ------------------------------------------------------------------ inputs

    def open_files(self) -> None:
        patterns = " ".join("*" + ext for ext in IMAGE_EXTENSIONS)
        paths = filedialog.askopenfilenames(
            parent=self.win, title="Open pictures", initialdir=self._last_dir,
            filetypes=[("Images", patterns), ("All files", "*.*")],
        )
        images = []
        for path in paths:
            try:
                with Image.open(path) as img:
                    img.load()
                    images.append((ImageOps.exif_transpose(img.copy()), os.path.basename(path)))
            except (OSError, ValueError) as err:
                self._set_status("cannot open {}: {}".format(os.path.basename(path), err), "err")
        if paths:
            self._last_dir = os.path.dirname(paths[0])
        if images:
            self.set_images(images)

    def paste(self) -> None:
        try:
            clip = ImageGrab.grabclipboard()
        except (OSError, NotImplementedError) as err:
            self._set_status("clipboard unavailable: {}".format(err), "err")
            return
        if isinstance(clip, Image.Image):
            self.set_image(clip, "clipboard image")
            return
        if isinstance(clip, list):
            images = []
            for path in clip:
                if str(path).lower().endswith(IMAGE_EXTENSIONS):
                    try:
                        with Image.open(path) as img:
                            img.load()
                            images.append((ImageOps.exif_transpose(img.copy()), os.path.basename(path)))
                    except (OSError, ValueError):
                        continue
            if images:
                self.set_images(images)
                return
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
        self.set_images([(ImageOps.exif_transpose(img), label)])

    def set_images(self, images: list) -> None:
        self._images = list(images)
        self._index = 0
        self._show_preview()
        self._run()

    def _show_preview(self) -> None:
        if not self._images:
            return
        img, label = self._images[self._index]
        preview = img.convert("RGB")
        preview.thumbnail((_PREVIEW_W, _PREVIEW_H))
        self._preview_ref = ImageTk.PhotoImage(preview)
        self.preview.configure(image=self._preview_ref, text="", height=_PREVIEW_H)
        many = len(self._images) > 1
        self.lbl_batch.configure(text="{} pictures (batch)".format(len(self._images)) if many
                                 else "{} · {}×{} px".format(label, img.width, img.height))

    def _rotate(self, degrees: int) -> None:
        if not self._images or self._busy:
            return
        img, label = self._images[self._index]
        self._images[self._index] = (img.rotate(degrees, expand=True), label)
        self._show_preview()
        self._set_status("rotated - press Read picture", "muted")

    # ------------------------------------------------------------------ work

    def _target_phrase(self) -> str:
        return LANGUAGES.get(self.var_target.get()) or "English"

    def _run(self) -> None:
        if not self._images:
            self._set_status("open, paste or grab a picture first", "warn")
            return
        if self._busy:
            return
        client = self._get_client()
        if client is None:
            self._set_status("no API key (set MAAS_API_KEY or add it to lingua.env)", "err")
            return
        target = self._target_phrase() if self.var_auto.get() else None
        self._busy = True
        self.btn_read.configure(state="disabled", text="Reading…")
        self.banner.configure(text="")
        self._set_status("reading {} picture{}…".format(len(self._images), "s" if len(self._images) > 1 else ""), "ok")
        jobs = [(img.copy(), label) for img, label in self._images]
        threading.Thread(target=self._work, args=(client, jobs, target, self._get_source()), daemon=True).start()

    def _work(self, client, jobs, target, source) -> None:
        try:
            if len(jobs) == 1:
                reading = read_image(client, jobs[0][0], target_lang=target, source_lang=source)
                self._queue.put(("done", reading))
                return
            parts, total_ocr = [], 0.0
            for i, (img, label) in enumerate(jobs, 1):
                self._queue.put(("progress", "reading {} of {}…".format(i, len(jobs))))
                try:
                    reading = read_image(client, img, source_lang=source)
                    total_ocr += reading.ocr_s
                    parts.append("— {} —\n{}".format(label, reading.text or "(no text found)"))
                except MaasError as err:
                    parts.append("— {} —\n(error: {})".format(label, err))
            combined = ImageReading(text="\n\n".join(parts), ocr_s=round(total_ocr, 2))
            self._queue.put(("done", combined))
        except MaasError as err:
            self._queue.put(("error", str(err)))
        except Exception as err:
            self._queue.put(("error", "could not read picture: {}".format(err)))

    def _translate_now(self) -> None:
        text = self.text.get("1.0", "end-1c").strip()
        if not text:
            self._set_status("nothing to translate yet", "warn")
            return
        if self._busy:
            return
        client = self._get_client()
        if client is None:
            self._set_status("no API key", "err")
            return
        self._busy = True
        self.banner.configure(text="")
        self._set_status("translating to {}…".format(self.var_target.get()), "ok")
        target, source = self._target_phrase(), self._get_source()

        def work():
            started = time.perf_counter()
            try:
                if hasattr(client, "translate_with_fallback"):
                    out, model = client.translate_with_fallback(text, target, source, purpose="document")
                else:
                    out, model = client.translate(text, target, source, purpose="document"), None
                self._queue.put(("translated", (out, model, round(time.perf_counter() - started, 1))))
            except Exception as err:
                self._queue.put(("translate_error", str(err)))

        threading.Thread(target=work, daemon=True).start()

    # -- offline language packs ------------------------------------------------

    def _offer_packs(self, message: str) -> None:
        """Show the one-click download when only an offline pack is missing."""
        text = str(message or "")
        if "language pack needed" in text or "offline pack" in text:
            self.btn_pack.configure(state="normal",
                                    text="⬇  Get offline translation (works without the company service)")
            self.btn_pack.pack(fill="x", padx=12, pady=(0, 4), after=self.banner)

    def _get_offline_packs(self) -> None:
        from engine import offline_translate as ot

        text = self.text.get("1.0", "end-1c").strip() or "Hello"
        target = ot.code_for(self._target_phrase())
        source_phrase = self._get_source()
        source = ot.code_for(source_phrase) if source_phrase else None
        self.btn_pack.configure(state="disabled", text="Downloading offline language pack…")

        def work() -> None:
            try:
                index = ot.load_index()
                missing = ot.needed_for(text, source, target, index)
                for a, b in missing:
                    label = "{} → {}".format(ot.NAME_BY_CODE.get(a, a), ot.NAME_BY_CODE.get(b, b))

                    def progress(done, total, label=label):
                        if total:
                            self._queue.put(("progress", "downloading offline pack {}  {:.0f}/{:.0f} MB".format(
                                label, done / 1e6, total / 1e6)))

                    ot.install_pack(a, b, progress=progress, index=index)
                self._queue.put(("packs_ready", len(missing)))
            except Exception as err:  # noqa: BLE001 - shown in the banner
                self._queue.put(("packs_error", str(err)))

        threading.Thread(target=work, daemon=True).start()

    def _poll(self) -> None:
        try:
            while True:
                kind, payload = self._queue.get_nowait()
                if kind == "progress":
                    self._set_status(payload, "ok")
                    continue
                self._busy = False
                self.btn_read.configure(state="normal", text="Read picture  (Ctrl+Enter)")
                if kind == "done":
                    self._show(payload)
                elif kind == "translated":
                    out, model, secs = payload
                    self._fill(self.trans, out)
                    self._set_tab("trans")
                    if self._entry_id:
                        history.update_translation(self._entry_id, out, self.var_target.get())
                    self._show_stats(extra="translate {:.1f}s".format(secs) + (" · {}".format(engine_label(model)) if model else ""))
                    self.btn_pack.pack_forget()
                elif kind == "translate_error":
                    self.banner.configure(text="Translation is unavailable right now - the text is still yours to copy. ({})".format(payload))
                    self._set_status("translation service unavailable", "err")
                    self._offer_packs(payload)
                elif kind == "packs_ready":
                    self.btn_pack.pack_forget()
                    self.banner.configure(text="")
                    self._set_status("offline translation ready - translating…", "ok")
                    self._translate_now()
                elif kind == "packs_error":
                    self.btn_pack.configure(state="normal", text="⬇  Try the download again")
                    self.banner.configure(text="Could not download the offline language pack: " + payload)
                else:
                    self._set_status("Error: " + payload, "err")
        except queue.Empty:
            pass
        if self.exists():
            self.win.after(80, self._poll)

    def _fill(self, widget: tk.Text, value: str) -> None:
        widget.delete("1.0", "end")
        widget.insert("1.0", value or "")
        widget.edit_modified(False)

    def _show(self, reading) -> None:
        self._fill(self.text, reading.text)
        self._fill(self.trans, reading.translation or "")
        if getattr(reading, "translation_error", None):
            self.banner.configure(text="Picture read, but translation is unavailable right now. ({})".format(reading.translation_error))
            self._offer_packs(reading.translation_error)
        else:
            self.btn_pack.pack_forget()
        if not reading.text:
            self._set_status("no words or letters found - try rotating or a sharper picture", "warn")
            return
        entry = history.add(reading.text, reading.translation,
                            self.var_target.get() if reading.translation else "",
                            words=text_stats(reading.text).words)
        self._entry_id = entry["id"] if entry else None
        self._set_tab("trans" if reading.translation else "text")
        extra = ["OCR {:.1f}s".format(reading.ocr_s)] if reading.ocr_s else []
        if reading.translation and reading.translate_s:
            extra.append("translate {:.1f}s".format(reading.translate_s))
            if getattr(reading, "model_used", None):
                extra.append(engine_label(reading.model_used))
        self._show_stats(extra=" · ".join(extra))

    def _show_stats(self, extra: str = "") -> None:
        widget = self.trans if self._tab == "trans" else self.text
        stats = text_stats(widget.get("1.0", "end-1c"))
        parts = ["{} words".format(stats.words), "{} letters".format(stats.letters), "{} lines".format(stats.lines)]
        if extra:
            parts.append(extra)
        self._set_status(" · ".join(parts), "ok")

    def _on_edit(self, event=None) -> None:
        widget = event.widget if event else self.text
        if widget.edit_modified():
            widget.edit_modified(False)
            self._show_stats()

    # ------------------------------------------------------------------ history

    def _show_history(self) -> None:
        t = self._t
        menu = tk.Menu(self.win, tearoff=0, bg=t["card"], fg=t["text"], activebackground=t["button_active"])
        entries = history.load()[:15]
        if not entries:
            menu.add_command(label="No scans yet", state="disabled")
        for entry in entries:
            stamp = time.strftime("%d %b %H:%M", time.localtime(entry.get("at", 0)))
            menu.add_command(label="{}   ·   {}".format(history.title(entry), stamp),
                             command=lambda e=entry: self._restore(e))
        if entries:
            menu.add_separator()
            menu.add_command(label="Clear history…", command=self._clear_history)
        x = self.btn_history.winfo_rootx()
        y = self.btn_history.winfo_rooty() + self.btn_history.winfo_height()
        menu.tk_popup(x, y)

    def _restore(self, entry: dict) -> None:
        self._entry_id = entry.get("id")
        self._fill(self.text, entry.get("text", ""))
        self._fill(self.trans, entry.get("translation", ""))
        if entry.get("target") in LANGUAGES:
            self.var_target.set(entry["target"])
        self.banner.configure(text="")
        self._set_tab("trans" if entry.get("translation") else "text")

    def _clear_history(self) -> None:
        if messagebox.askyesno("Lingua", "Delete all saved scans on this PC?", parent=self.win):
            history.clear()
            self._set_status("history cleared", "muted")

    # ------------------------------------------------------------------ output

    def _active_text(self) -> str:
        return (self.trans if self._tab == "trans" else self.text).get("1.0", "end-1c").strip()

    def copy(self) -> None:
        content = self._active_text()
        if not content:
            self._set_status("nothing to copy yet", "warn")
            return
        self.win.clipboard_clear()
        self.win.clipboard_append(content)
        self._set_status("copied {} characters".format(len(content)), "ok")

    def listen(self) -> None:
        if speech.speaking():
            speech.stop()
            self.btn_listen.configure(text="🔊  Listen")
            return
        content = self._active_text()
        if not content:
            self._set_status("nothing to read aloud yet", "warn")
            return
        if speech.speak(content):
            self.btn_listen.configure(text="■  Stop")
            self._watch_speech()

    def _watch_speech(self) -> None:
        if speech.speaking():
            self.win.after(300, self._watch_speech)
        elif self.exists():
            self.btn_listen.configure(text="🔊  Listen")

    def save_txt(self) -> None:
        text = self.text.get("1.0", "end-1c").strip()
        translation = self.trans.get("1.0", "end-1c").strip()
        if not text and not translation:
            self._set_status("nothing to save yet", "warn")
            return
        path = filedialog.asksaveasfilename(
            parent=self.win, title="Save text", defaultextension=".txt", initialdir=self._last_dir,
            initialfile=time.strftime("lingua-%Y%m%d-%H%M.txt"), filetypes=[("Text", "*.txt")],
        )
        if not path:
            return
        body = text + ("\n\n--- {} ---\n{}".format(self.var_target.get(), translation) if translation else "")
        with open(path, "w", encoding="utf-8") as fh:
            fh.write(body + "\n")
        self._set_status("saved " + os.path.basename(path), "ok")

    # ------------------------------------------------------------------ misc

    def _set_status(self, message: str, level: str) -> None:
        self.status.configure(text=message, fg=self._t.get(level, self._t["muted"]))

    def focus(self) -> None:
        self.win.deiconify()
        self.win.lift()
        self.win.focus_force()

    def close(self) -> None:
        speech.stop()
        self.win.destroy()

    def exists(self) -> bool:
        try:
            return bool(self.win.winfo_exists())
        except tk.TclError:
            return False


def engine_label(engine: str | None) -> str:
    """Friendly name for the engine that produced a translation."""
    if not engine:
        return ""
    if engine == "offline":
        return "offline on this PC"
    if engine.startswith("online:"):
        return "online ({})".format(engine.split(":", 1)[1])
    return engine
