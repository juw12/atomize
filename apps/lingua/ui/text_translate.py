"""Lingua: "Translate text" window.

Paste or type text, pick From / To, a tone and (optionally) context and a
glossary, then Translate (Ctrl+Enter). The translation streams in from the best
available engine: company AI, local AI on this PC (Ollama), offline packs, or
online services when allowed. "Alternatives & notes" asks the AI for two other
phrasings plus English word-choice notes. Review warnings flag changed numbers,
links and unused glossary terms. Nothing typed here is saved.
"""

from __future__ import annotations

import os
import queue
import threading
import tkinter as tk
from tkinter import filedialog, messagebox

from engine import local_ai, text_desk
from engine.maas import LANGUAGES

_FONT = "Segoe UI"
_AUTO = "Auto (detect)"


class TextTranslator:
    """Translate-text desk bound to a parent :class:`ui.window.LinguaWindow`."""

    def __init__(self, master, theme, get_client, get_target, get_source_label) -> None:
        self._t = theme
        self._get_client = get_client
        self._queue: queue.Queue = queue.Queue()
        self._cancel = threading.Event()
        self._busy = False
        self._extras_open = False
        self._last_job: text_desk.TextJob | None = None
        self._last_engine = ""
        self._last_dir = os.path.expanduser("~")

        self.win = tk.Toplevel(master)
        self.win.title("Lingua - Translate text")
        self.win.configure(bg=theme["bg"])
        self.win.attributes("-topmost", True)
        self.win.minsize(720, 520)
        self.win.geometry("920x640")

        target_label = get_target()[0]
        source_label = get_source_label()
        self.var_source = tk.StringVar(value=source_label if source_label in LANGUAGES else _AUTO)
        self.var_target = tk.StringVar(value=target_label if target_label in LANGUAGES else "English")
        self.var_tone = tk.StringVar(value="Natural")
        self.var_engine = tk.StringVar(value=text_desk.ENGINES["auto"])

        self._build()
        self.win.bind("<Control-Return>", lambda _e: self.translate())
        self.win.bind("<Escape>", lambda _e: self.stop())
        self.win.bind("<Control-s>", lambda _e: self.save_txt())
        self.win.protocol("WM_DELETE_WINDOW", self.close)
        self.src.focus_set()
        self._poll()
        threading.Thread(target=self._probe_engines, daemon=True).start()

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

    def _label(self, parent, text, muted=True, **kw):
        t = self._t
        return tk.Label(parent, text=text, bg=kw.pop("bg", t["bg"]),
                        fg=t["muted"] if muted else t["text"], font=kw.pop("font", (_FONT, 9)), **kw)

    def _editor(self, parent, height, readonly=False, size=12):
        t = self._t
        box = tk.Text(
            parent, height=height, wrap="word", undo=not readonly, relief="flat", bd=0,
            bg=t["card"], fg=t["text"], insertbackground=t["text"], font=(_FONT, size),
            padx=10, pady=8, selectbackground=t["button_active"], highlightthickness=1,
            highlightbackground=t["edge"], highlightcolor=t["accent"],
        )
        if readonly:
            box.configure(state="disabled")
        return box

    def _build(self) -> None:
        t = self._t
        pad = {"padx": 12}

        # Row 1: languages, tone, engine
        bar = tk.Frame(self.win, bg=t["bg"])
        bar.pack(fill="x", pady=(12, 8), **pad)
        self._label(bar, "From").pack(side="left", padx=(0, 6))
        self._option(bar, self.var_source, list(LANGUAGES)).pack(side="left")
        self._button(bar, "⇄", self.swap, width=3).pack(side="left", padx=4)
        self._label(bar, "To").pack(side="left", padx=(0, 6))
        targets = [k for k in LANGUAGES if k != _AUTO]
        self._option(bar, self.var_target, targets).pack(side="left")
        self._label(bar, "Tone").pack(side="left", padx=(16, 6))
        self._option(bar, self.var_tone, list(text_desk.TONES)).pack(side="left")
        self._option(bar, self.var_engine, list(text_desk.ENGINES.values())).pack(side="right")
        self._label(bar, "Engine").pack(side="right", padx=(0, 6))

        # Bottom-anchored rows first so they never get pushed off-screen.
        self.status = tk.Label(self.win, text="ready", anchor="w", bg=t["bg"], fg=t["muted"],
                               font=("Consolas", 9), padx=12, pady=6)
        self.status.pack(fill="x", side="bottom")

        self.insights_box = self._editor(self.win, 6, readonly=True, size=10)
        self.warnings = tk.Label(self.win, text="", anchor="w", justify="left", bg=t["bg"],
                                 fg=t["warn"], font=(_FONT, 9), wraplength=880)
        self.warnings.pack(fill="x", side="bottom", **pad)

        actions = tk.Frame(self.win, bg=t["bg"])
        actions.pack(fill="x", side="bottom", pady=(6, 2), **pad)
        self.btn_translate = self._button(actions, "Translate  (Ctrl+Enter)", self.translate, primary=True)
        self.btn_translate.pack(side="left")
        self.btn_stop = self._button(actions, "Stop", self.stop)
        self.btn_stop.pack(side="left", padx=6)
        self.btn_insights = self._button(actions, "✨  Alternatives & notes", self.insights)
        self.btn_insights.pack(side="left")
        self._button(actions, "Clear", self.clear).pack(side="right")
        self._button(actions, "💾  Save .txt", self.save_txt).pack(side="right", padx=6)
        self._button(actions, "⧉  Copy", self.copy).pack(side="right")
        self._button(actions, "📋  Paste", self.paste).pack(side="right", padx=6)

        # Context & glossary (collapsible)
        self.extras_toggle = self._button(self.win, "", self.toggle_extras)
        self.extras_toggle.configure(anchor="w", bg=t["bg"], fg=t["muted"])
        self.extras_toggle.pack(fill="x", side="bottom", **pad)
        self.extras = tk.Frame(self.win, bg=t["bg"])
        ctx_col = tk.Frame(self.extras, bg=t["bg"])
        ctx_col.pack(side="left", fill="both", expand=True, padx=(0, 6))
        self._label(ctx_col, "Context (optional) - who it is for, what it is about").pack(anchor="w")
        self.context = self._editor(ctx_col, 3, size=10)
        self.context.pack(fill="both", expand=True)
        glo_col = tk.Frame(self.extras, bg=t["bg"])
        glo_col.pack(side="left", fill="both", expand=True, padx=(6, 0))
        self._label(glo_col, "Glossary (optional) - one per line: term = preferred translation").pack(anchor="w")
        self.glossary = self._editor(glo_col, 3, size=10)
        self.glossary.pack(fill="both", expand=True)
        self._sync_extras()

        # Editors side by side
        panes = tk.Frame(self.win, bg=t["bg"])
        panes.pack(fill="both", expand=True, **pad)
        panes.columnconfigure(0, weight=1, uniform="pane")
        panes.columnconfigure(1, weight=1, uniform="pane")
        panes.rowconfigure(0, weight=1)
        left = tk.Frame(panes, bg=t["bg"])
        left.grid(row=0, column=0, sticky="nsew", padx=(0, 6))
        right = tk.Frame(panes, bg=t["bg"])
        right.grid(row=0, column=1, sticky="nsew", padx=(6, 0))
        self.src = self._editor(left, 12)
        self.src.pack(fill="both", expand=True)
        self.src.bind("<<Modified>>", self._on_src_change)
        self.lbl_count = self._label(left, "0 / {:,}".format(text_desk.MAX_TEXT), anchor="w")
        self.lbl_count.pack(fill="x", pady=(4, 0))
        self.out = self._editor(right, 12, readonly=True)
        self.out.pack(fill="both", expand=True)
        self.lbl_engine = self._label(right, "", anchor="w")
        self.lbl_engine.pack(fill="x", pady=(4, 0))
        self._set_busy(False)

    # ---------------------------------------------------------------- helpers

    @staticmethod
    def _value(widget: tk.Text) -> str:
        return widget.get("1.0", "end-1c")

    @staticmethod
    def _replace(widget: tk.Text, value: str) -> None:
        readonly = widget.cget("state") == "disabled"
        if readonly:
            widget.configure(state="normal")
        widget.delete("1.0", "end")
        widget.insert("1.0", value)
        if readonly:
            widget.configure(state="disabled")

    def _set_status(self, text: str, kind: str = "muted") -> None:
        self.status.configure(text=text, fg=self._t.get(kind, self._t["muted"]))

    def _set_busy(self, busy: bool) -> None:
        self._busy = busy
        self.btn_translate.configure(state="disabled" if busy else "normal")
        self.btn_insights.configure(state="disabled" if busy else "normal")
        self.btn_stop.configure(state="normal" if busy else "disabled")

    def _engine_key(self) -> str:
        label = self.var_engine.get()
        return next((key for key, name in text_desk.ENGINES.items() if name == label), "auto")

    def _job(self) -> text_desk.TextJob:
        source = self.var_source.get()
        target = self.var_target.get()
        return text_desk.TextJob(
            text=self._value(self.src),
            source=None if source == _AUTO else LANGUAGES.get(source),
            target=LANGUAGES.get(target) or target,
            tone=self.var_tone.get(),
            context=self._value(self.context).strip(),
            glossary=self._value(self.glossary).strip(),
        )

    def _on_src_change(self, _event=None) -> None:
        if not self.src.edit_modified():
            return
        self.src.edit_modified(False)
        count = len(self._value(self.src))
        over = count > text_desk.MAX_TEXT
        self.lbl_count.configure(
            text="{:,} / {:,}{}".format(count, text_desk.MAX_TEXT, "  - too long, split it" if over else ""),
            fg=self._t["err"] if over else self._t["muted"],
        )

    def _sync_extras(self) -> None:
        arrow = "▴" if self._extras_open else "▾"
        self.extras_toggle.configure(text="Context & glossary " + arrow)
        if self._extras_open:
            self.extras.pack(fill="x", side="bottom", pady=(0, 4), padx=12, before=self.extras_toggle)
        else:
            self.extras.pack_forget()

    def _probe_engines(self) -> None:
        models = local_ai.list_models(refresh=True)
        note = ("local AI ready (" + local_ai.pick_model() + ")") if models else "local AI not running"
        self._queue.put(("info", "ready - " + note))

    # ---------------------------------------------------------------- actions

    def toggle_extras(self) -> None:
        self._extras_open = not self._extras_open
        self._sync_extras()

    def swap(self) -> None:
        source = self.var_source.get()
        if source == _AUTO:
            self._set_status("Pick a source language first to swap", "warn")
            return
        self.var_source.set(self.var_target.get())
        self.var_target.set(source)
        translated = self._value(self.out)
        if translated.strip():
            self._replace(self.src, translated)
            self._replace(self.out, "")

    def paste(self) -> None:
        try:
            text = self.win.clipboard_get()
        except tk.TclError:
            self._set_status("Clipboard has no text", "warn")
            return
        self.src.insert("insert", text)

    def copy(self) -> None:
        text = self._value(self.out)
        if not text.strip():
            self._set_status("Nothing to copy yet", "warn")
            return
        self.win.clipboard_clear()
        self.win.clipboard_append(text)
        self._set_status("Translation copied", "ok")

    def clear(self) -> None:
        self.stop()
        for box in (self.src, self.out, self.context, self.glossary):
            self._replace(box, "")
        self.src.edit_reset()
        self.warnings.configure(text="")
        self.lbl_engine.configure(text="")
        self.insights_box.pack_forget()
        self._set_status("cleared")

    def save_txt(self) -> None:
        text = self._value(self.out)
        if not text.strip():
            self._set_status("Nothing to save yet", "warn")
            return
        path = filedialog.asksaveasfilename(
            parent=self.win, initialdir=self._last_dir, defaultextension=".txt",
            filetypes=[("Text", "*.txt")], title="Save translation",
        )
        if not path:
            return
        self._last_dir = os.path.dirname(path)
        with open(path, "w", encoding="utf-8") as fh:
            fh.write(text + "\n")
        self._set_status("Saved " + os.path.basename(path), "ok")

    def stop(self) -> None:
        if self._busy:
            self._cancel.set()
            self._set_status("stopping…", "warn")

    def translate(self) -> None:
        if self._busy:
            return
        try:
            job = self._job()
            job.validate()
        except ValueError as err:
            self._set_status(str(err), "warn")
            return
        self._cancel = threading.Event()
        self._last_job = job
        self._replace(self.out, "")
        self.warnings.configure(text="")
        self.lbl_engine.configure(text="")
        self.insights_box.pack_forget()
        self._set_busy(True)
        self._set_status("translating…")
        engine = self._engine_key()
        cancel = self._cancel

        def work() -> None:
            try:
                client = self._get_client() if engine in ("auto", "company") else None
                text, used, warnings = text_desk.translate_text(
                    job, client, engine=engine, cancel=cancel,
                    on_chunk=lambda partial: self._queue.put(("partial", partial)),
                )
                self._queue.put(("done", (text, used, warnings)))
            except local_ai.Cancelled:
                self._queue.put(("stopped", None))
            except Exception as err:
                self._queue.put(("error", str(err)))

        threading.Thread(target=work, daemon=True).start()

    def insights(self) -> None:
        if self._busy:
            return
        translated = self._value(self.out)
        if not translated.strip() or self._last_job is None:
            self._set_status("Translate something first", "warn")
            return
        self._cancel = threading.Event()
        self._set_busy(True)
        self._set_status("asking the AI for alternatives and notes…")
        job = self._last_job
        engine = self._engine_key()
        cancel = self._cancel

        def work() -> None:
            try:
                client = self._get_client() if engine in ("auto", "company", "offline") else None
                info = text_desk.insights(job, translated, client, engine=engine, cancel=cancel)
                self._queue.put(("insights", info))
            except local_ai.Cancelled:
                self._queue.put(("stopped", None))
            except Exception as err:
                self._queue.put(("error", str(err)))

        threading.Thread(target=work, daemon=True).start()

    # ------------------------------------------------------------------ queue

    def _poll(self) -> None:
        try:
            while True:
                kind, payload = self._queue.get_nowait()
                self._handle(kind, payload)
        except queue.Empty:
            pass
        if self.exists():
            self.win.after(80, self._poll)

    def _handle(self, kind: str, payload) -> None:
        if kind == "info":
            if not self._busy:
                self._set_status(payload)
        elif kind == "partial":
            self._replace(self.out, payload)
            self.out.see("end")
        elif kind == "done":
            text, used, warnings = payload
            self._replace(self.out, text)
            self._last_engine = used
            self.lbl_engine.configure(text="by " + text_desk.engine_label(used))
            self.warnings.configure(text="\n".join("⚠ " + w for w in warnings))
            self._set_busy(False)
            self._set_status("done - {} characters".format(len(text)), "ok")
        elif kind == "insights":
            lines = []
            for index, alternative in enumerate(payload.get("alternatives") or [], 1):
                lines.append("Alternative {}:  {}".format(index, alternative))
            if payload.get("notes"):
                lines.append("")
                lines.extend("• " + note for note in payload["notes"])
            self._replace(self.insights_box, "\n".join(lines))
            self.insights_box.pack(fill="x", side="bottom", padx=12, pady=(4, 0), before=self.warnings)
            self._set_busy(False)
            self._set_status("alternatives and notes ready", "ok")
        elif kind == "stopped":
            self._set_busy(False)
            self._set_status("stopped", "warn")
        elif kind == "error":
            self._set_busy(False)
            self._set_status("could not translate", "err")
            messagebox.showwarning("Lingua - Translate text", payload, parent=self.win)

    # -------------------------------------------------------------- lifecycle

    def exists(self) -> bool:
        try:
            return bool(self.win.winfo_exists())
        except tk.TclError:
            return False

    def focus(self) -> None:
        self.win.deiconify()
        self.win.lift()
        self.src.focus_set()

    def close(self) -> None:
        self._cancel.set()
        self.win.destroy()
