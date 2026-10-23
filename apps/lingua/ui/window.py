"""Lingua: single combined window with controls + live transcript.

A single always-on-top tkinter window containing:
- Header: app title + theme toggle button
- Toolbar: Start/Stop, Select region, Clear, Source/Target dropdowns,
  Opacity slider, Font slider, Click-through checkbox
- Transcript area: scrolling text showing translated captions (speaker name
  on its own line when present, translation below; NO source text)
- Status line: e.g. "OCR 0.4s · translate 0.6s · running"

The window owns ONE worker thread for capture/OCR/translate. Results are
pushed through a queue and drained on the main thread via root.after(50ms)
for progressive (streamed) rendering.

Click-through uses Win32 WS_EX_LAYERED|WS_EX_TRANSPARENT|WS_EX_NOACTIVATE.
"""

from __future__ import annotations

import ctypes
import io
import queue
import threading
import tkinter as tk
from time import perf_counter
from typing import Callable

from engine import config
from engine.capture import Region, RegionCapture, downscale
from engine.maas import LANGUAGES, LLM_MODEL, MODELS, OCR_MODEL, MaasClient, MaasError, discover_api_key
from engine.pipeline import CaptionPipeline, Line, Transcript, speaker_rows
from ui.region import select_region
from ui.theme import THEMES, get as get_theme


# Win32 extended window styles
_GWL_EXSTYLE = -20
_WS_EX_LAYERED = 0x00080000
_WS_EX_TRANSPARENT = 0x00000020
_WS_EX_NOACTIVATE = 0x08000000
_GA_ROOT = 2


class LinguaWindow:
    """Single combined Lingua window: controls + transcript."""

    def __init__(self, cfg: dict | None = None) -> None:
        self.cfg = cfg if cfg is not None else config.load()
        self._theme_name = self.cfg.get("theme", "dark")
        self._theme = get_theme(self._theme_name)

        self._running = False
        self._worker: threading.Thread | None = None
        self._stop_event: threading.Event | None = None
        self._after_id: str | None = None
        self._queue: queue.Queue = queue.Queue()
        self._capture: RegionCapture | None = None
        self._client: MaasClient | None = None
        self._pipeline: CaptionPipeline | None = None
        self._transcript = Transcript()
        self._last_perf = {"ocr": 0.0, "translate": 0.0}
        self._drag_offset = (0, 0)
        self._click_through = bool(self.cfg.get("click_through", False))
        self._user_scrolled = False
        self._live_partial = ""

        # Build the root window
        self.root = tk.Tk()
        self.root.title("Lingua")
        self.root.configure(bg=self._theme["bg"])
        self.root.resizable(True, True)
        self.root.attributes("-topmost", True)
        self.root.attributes("-alpha", float(self.cfg.get("opacity", 0.85)))

        # Build UI first (so widgets exist before theme apply)
        self._build_header()
        self._build_toolbar()
        self._build_transcript()
        self._build_status()

        # Apply theme colors to all widgets
        self._apply_theme()

        # Position window
        xy = self.cfg.get("overlay_xy")
        if xy and len(xy) == 2:
            x, y = int(xy[0]), int(xy[1])
        else:
            x = max(0, self.root.winfo_screenwidth() // 2 - 260)
            y = max(0, int(self.root.winfo_screenheight() * 0.65))
        self.root.geometry(f"+{x}+{y}")

        # Start draining queue
        self._drain_queue()

        # Bind close
        self.root.protocol("WM_DELETE_WINDOW", self._on_close)

    def _build_header(self) -> None:
        """Header bar: title + theme toggle."""
        header = tk.Frame(self.root, bg=self._theme["card"], height=36)
        header.pack(fill="x", side="top")
        header.pack_propagate(False)
        self._header = header

        # Drag-to-move binding on header
        header.bind("<Button-1>", self._drag_start, add="+")
        header.bind("<B1-Motion>", self._drag_move, add="+")
        header.bind("<ButtonRelease-1>", self._drag_end, add="+")

        title = tk.Label(
            header,
            text="Lingua",
            bg=self._theme["card"],
            fg=self._theme["text"],
            font=("Segoe UI", 12, "bold"),
        )
        title.pack(side="left", padx=10, pady=8)
        self._title_label = title

        # Theme toggle button
        theme_label = "☀️" if self._theme_name == "dark" else "🌙"
        self.btn_theme = tk.Button(
            header,
            text=theme_label,
            width=3,
            bg=self._theme["button"],
            fg=self._theme["text"],
            activebackground=self._theme["button_active"],
            activeforeground=self._theme["text"],
            relief="flat",
            font=("Segoe UI", 10),
            command=self._toggle_theme,
        )
        self.btn_theme.pack(side="right", padx=8, pady=6)

    def _build_toolbar(self) -> None:
        """Toolbar with all controls."""
        toolbar = tk.Frame(self.root, bg=self._theme["bg"])
        toolbar.pack(fill="x", side="top", padx=10, pady=8)

        # Row 0: Start/Stop, Region, Clear
        row0 = tk.Frame(toolbar, bg=self._theme["bg"])
        row0.pack(fill="x", pady=(0, 6))

        self.btn_start = tk.Button(
            row0,
            text="Start",
            width=7,
            bg=self._theme["button"],
            fg=self._theme["text"],
            activebackground=self._theme["button_active"],
            activeforeground=self._theme["text"],
            relief="flat",
            font=("Segoe UI", 10),
            command=self._toggle_run,
        )
        self.btn_start.pack(side="left", padx=(0, 6))

        self.btn_region = tk.Button(
            row0,
            text="Select region",
            bg=self._theme["button"],
            fg=self._theme["text"],
            activebackground=self._theme["button_active"],
            activeforeground=self._theme["text"],
            relief="flat",
            font=("Segoe UI", 10),
            command=self._pick_region,
        )
        self.btn_region.pack(side="left", padx=6)

        self.btn_clear = tk.Button(
            row0,
            text="Clear",
            bg=self._theme["button"],
            fg=self._theme["text"],
            activebackground=self._theme["button_active"],
            activeforeground=self._theme["text"],
            relief="flat",
            font=("Segoe UI", 10),
            command=self._clear,
        )
        self.btn_clear.pack(side="left", padx=6)

        # Row 1: Language pickers
        row1 = tk.Frame(toolbar, bg=self._theme["bg"])
        row1.pack(fill="x", pady=(0, 6))

        tk.Label(
            row1, text="Source", bg=self._theme["bg"], fg=self._theme["muted"],
            font=("Segoe UI", 9)
        ).pack(side="left", padx=(0, 4))

        self.combo_source = tk.StringVar(value=self.cfg.get("source_lang", "Auto (detect)"))
        self.cmb_source = tk.OptionMenu(
            row1, self.combo_source, *LANGUAGES.keys(), command=self._on_lang_change
        )
        self.cmb_source.configure(
            bg=self._theme["button"],
            fg=self._theme["text"],
            activebackground=self._theme["button_active"],
            activeforeground=self._theme["text"],
            relief="flat",
            font=("Segoe UI", 9),
            highlightthickness=0,
            indicatoron=False,
            borderwidth=0,
            padx=6,
            pady=2,
        )
        self.cmb_source.pack(side="left", padx=(0, 12))

        tk.Label(
            row1, text="Target", bg=self._theme["bg"], fg=self._theme["muted"],
            font=("Segoe UI", 9)
        ).pack(side="left", padx=(0, 4))

        self.combo_target = tk.StringVar(value=self.cfg.get("target_lang", "繁體中文"))
        self.cmb_target = tk.OptionMenu(
            row1, self.combo_target, *LANGUAGES.keys(), command=self._on_lang_change
        )
        self.cmb_target.configure(
            bg=self._theme["button"],
            fg=self._theme["text"],
            activebackground=self._theme["button_active"],
            activeforeground=self._theme["text"],
            relief="flat",
            font=("Segoe UI", 9),
            highlightthickness=0,
            indicatoron=False,
            borderwidth=0,
            padx=6,
            pady=2,
        )
        self.cmb_target.pack(side="left")

        tk.Label(
            row1, text="Model", bg=self._theme["bg"], fg=self._theme["muted"],
            font=("Segoe UI", 9)
        ).pack(side="left", padx=(12, 4))

        self.combo_model = tk.StringVar(value=self.cfg.get("llm_model", LLM_MODEL))
        self.cmb_model = tk.OptionMenu(
            row1, self.combo_model, *MODELS, command=self._on_model_change
        )
        self.cmb_model.configure(
            bg=self._theme["button"],
            fg=self._theme["text"],
            activebackground=self._theme["button_active"],
            activeforeground=self._theme["text"],
            relief="flat",
            font=("Segoe UI", 9),
            highlightthickness=0,
            indicatoron=False,
            borderwidth=0,
            padx=6,
            pady=2,
        )
        self.cmb_model.pack(side="left")

        # Row 2: Sliders and click-through
        row2 = tk.Frame(toolbar, bg=self._theme["bg"])
        row2.pack(fill="x")

        tk.Label(
            row2, text="Opacity", bg=self._theme["bg"], fg=self._theme["muted"],
            font=("Segoe UI", 9)
        ).pack(side="left", padx=(0, 4))

        self.slider_alpha = tk.Scale(
            row2,
            from_=55,
            to=100,
            orient="horizontal",
            length=90,
            bg=self._theme["button"],
            fg=self._theme["text"],
            troughcolor=self._theme["track"],
            highlightthickness=0,
            font=("Segoe UI", 9),
            command=self._on_opacity,
        )
        self.slider_alpha.set(int(self.cfg.get("opacity", 0.85) * 100))
        self.slider_alpha.pack(side="left", padx=(0, 12))

        tk.Label(
            row2, text="Font", bg=self._theme["bg"], fg=self._theme["muted"],
            font=("Segoe UI", 9)
        ).pack(side="left", padx=(0, 4))

        self.slider_font = tk.Scale(
            row2,
            from_=14,
            to=32,
            orient="horizontal",
            length=70,
            bg=self._theme["button"],
            fg=self._theme["text"],
            troughcolor=self._theme["track"],
            highlightthickness=0,
            font=("Segoe UI", 9),
            command=self._on_font_size,
        )
        self.slider_font.set(int(self.cfg.get("font_size", 20)))
        self.slider_font.pack(side="left", padx=(0, 12))

        self.var_click = tk.BooleanVar(value=self._click_through)
        self.chk_click = tk.Checkbutton(
            row2,
            text="Click-through",
            variable=self.var_click,
            bg=self._theme["bg"],
            fg=self._theme["text"],
            selectcolor=self._theme["button"],
            activebackground=self._theme["bg"],
            activeforeground=self._theme["text"],
            font=("Segoe UI", 9),
            command=self._on_click_through,
        )
        self.chk_click.pack(side="left")

    def _build_transcript(self) -> None:
        """Transcript area with scrollbar."""
        # Container for transcript + scrollbar
        trans_frame = tk.Frame(self.root, bg=self._theme["card"])
        trans_frame.pack(fill="both", expand=True, padx=10, pady=(0, 8))
        self._trans_frame = trans_frame

        self.body = tk.Text(
            trans_frame,
            bg=self._theme["card"],
            fg=self._theme["text"],
            relief="flat",
            bd=0,
            wrap="word",
            highlightthickness=0,
            padx=8,
            pady=8,
            cursor="arrow",
            takefocus=0,
            width=60,
            height=16,
        )
        self.scroll = tk.Scrollbar(
            trans_frame,
            command=self.body.yview,
            bg=self._theme["card"],
            troughcolor=self._theme["track"],
            activebackground=self._theme["button_active"],
            highlightthickness=0,
            bd=0,
            width=12,
            relief="flat",
        )
        self.scroll.pack(side="right", fill="y")
        self.body.pack(side="left", fill="both", expand=True)
        self.body.configure(yscrollcommand=self.scroll.set, state="disabled")

        # Track user scroll position
        self.body.bind("<MouseWheel>", self._on_scroll)
        self.body.bind("<Button-4>", self._on_scroll)
        self.body.bind("<Button-5>", self._on_scroll)

        self._refresh_tags()
        self._render([])

    def _build_status(self) -> None:
        """Status line at bottom."""
        self.status = tk.Label(
            self.root,
            text="idle",
            bg=self._theme["bg"],
            fg=self._theme["muted"],
            font=("Consolas", 9),
            padx=10,
            pady=4,
            anchor="w",
        )
        self.status.pack(fill="x", side="bottom")

    def _apply_theme(self) -> None:
        """Recursively re-apply the current theme colors to every widget."""
        self.root.configure(bg=self._theme["bg"])
        self._recolor(self.root)
        self._refresh_tags()
        self._render(self._transcript.lines(), self._live_partial or None)

    def _recolor(self, parent: tk.Widget) -> None:
        for w in parent.winfo_children():
            self._color_widget(w)
            self._recolor(w)

    def _color_widget(self, w: tk.Widget) -> None:
        t = self._theme
        if isinstance(w, tk.Frame):
            card = w is getattr(self, "_header", None) or w is getattr(self, "_trans_frame", None)
            w.configure(bg=t["card"] if card else t["bg"])
        elif isinstance(w, tk.Text):
            w.configure(bg=t["card"], fg=t["text"], insertbackground=t["text"])
        elif isinstance(w, tk.Scrollbar):
            w.configure(bg=t["card"], troughcolor=t["track"], activebackground=t["button_active"])
        elif isinstance(w, tk.Scale):
            w.configure(bg=t["button"], fg=t["text"], troughcolor=t["track"])
        elif isinstance(w, tk.Checkbutton):
            w.configure(bg=t["bg"], fg=t["text"], selectcolor=t["button"],
                        activebackground=t["bg"], activeforeground=t["text"])
        elif isinstance(w, (tk.OptionMenu, tk.Menubutton)):
            w.configure(bg=t["button"], fg=t["text"],
                        activebackground=t["button_active"], activeforeground=t["text"])
        elif isinstance(w, tk.Button):
            running_stop = w is getattr(self, "btn_start", None) and self._running
            w.configure(bg=t["button"], fg=t["err"] if running_stop else t["text"],
                        activebackground=t["button_active"], activeforeground=t["text"])
        elif isinstance(w, tk.Label):
            w.configure(bg=w.master.cget("bg"),
                        fg=t["text"] if w is getattr(self, "_title_label", None) else t["muted"])

    def _refresh_tags(self) -> None:
        """Configure text tags for transcript rendering."""
        size = int(self.cfg.get("font_size", 20))
        self.body.tag_configure(
            "trans",
            font=("Segoe UI", size, "bold"),
            foreground=self._theme["text"],
            spacing1=4,
            spacing3=2,
        )
        self.body.tag_configure(
            "hint",
            font=("Segoe UI", max(9, size - 7)),
            foreground=self._theme["muted"],
            spacing3=6,
        )
        self.body.tag_configure(
            "speaker",
            font=("Segoe UI", max(9, size - 4), "bold"),
            foreground=self._theme["accent"],
        )

    def _render(self, lines: list[Line], live_partial: str | None = None) -> None:
        """Render transcript lines to the text widget."""
        at_end = self._at_bottom()
        top = self.body.yview()[0]

        self.body.configure(state="normal")
        self.body.delete("1.0", "end")

        rows = speaker_rows(lines)
        if live_partial:
            if rows:
                rows = rows[:-1] + [(rows[-1][0], live_partial)]
            else:
                rows = [(None, live_partial)]

        if rows:
            for speaker, text in rows:
                if speaker:
                    self.body.insert("end", f"{speaker}\n", ("speaker",))
                self.body.insert("end", f"{text}\n", ("trans",))
        else:
            self.body.insert("1.0", "Lingua: waiting for captions…\n", ("hint",))

        if at_end or self._user_scrolled is False:
            self.body.see("end")
        else:
            self.body.yview_moveto(top)

        self.body.configure(state="disabled")

    def _at_bottom(self) -> bool:
        """Check if scroll is at the bottom."""
        try:
            return self.body.yview()[1] >= 0.999
        except Exception:
            return True

    def _on_scroll(self, event: tk.Event) -> None:
        """Track user scroll position."""
        # Determine scroll direction
        if event.num == 5 or event.delta < 0:
            self._user_scrolled = True
        elif event.num == 4 or event.delta > 0:
            self._user_scrolled = True
        # Reset user_scrolled when at bottom
        self.root.after(100, self._check_scroll_position)

    def _check_scroll_position(self) -> None:
        """Reset user_scrolled flag when at bottom."""
        if self._at_bottom():
            self._user_scrolled = False

    # -- Theme toggle -------------------------------------------------------

    def _toggle_theme(self) -> None:
        """Switch between light and dark themes."""
        self._theme_name = "light" if self._theme_name == "dark" else "dark"
        self._theme = get_theme(self._theme_name)
        self.cfg["theme"] = self._theme_name
        config.save(self.cfg)
        self.btn_theme.configure(text="☀️" if self._theme_name == "dark" else "🌙")
        self._apply_theme()

    # -- Worker thread management -------------------------------------------

    def _toggle_run(self) -> None:
        if self._running:
            self._stop()
        else:
            self._start()

    def _start(self) -> None:
        if not self._try_init_client():
            self._set_status("no API key", self._theme["err"])
            return

        region = self._region_from_cfg()
        if region is None:
            self._set_status("pick a region first", self._theme["warn"])
            return

        self._running = True
        self.btn_start.configure(text="Stop", fg=self._theme["err"])
        self._capture = RegionCapture(region, min_change=0.0)
        self._pipeline = CaptionPipeline(
            translate_fn=lambda s, on_chunk=None: self._client.translate(
                s, self._target_phrase(), self._source_phrase(), on_chunk=on_chunk
            ),
            cache={},
            max_lines=200,
        )

        stop_event = threading.Event()
        self._stop_event = stop_event
        self._drain_stale_queue()

        self._worker = threading.Thread(
            target=self._worker_loop, args=(stop_event,), daemon=True
        )
        self._worker.start()

        self._set_status("listening…", self._theme["ok"])
        self._live_partial = ""

    def _stop(self) -> None:
        self._running = False
        if self._stop_event is not None:
            self._stop_event.set()
        if self._worker is not None:
            self._worker.join(timeout=2.0)
            self._worker = None
        self._stop_event = None
        if self._after_id is not None:
            try:
                self.root.after_cancel(self._after_id)
            except Exception:
                pass
            self._after_id = None
        self.btn_start.configure(text="Start", fg=self._theme["text"])
        self._set_status("stopped", self._theme["muted"])

    def _worker_loop(self, stop_event: threading.Event) -> None:
        """Background capture → OCR → translate → enqueue."""
        poll_s = max(0.05, self.cfg.get("poll_ms", 300) / 1000.0)
        max_w = int(self.cfg.get("ocr_max_width", 640))

        while not stop_event.is_set():
            if self._capture is None:
                self._queue.put(None)
                stop_event.wait(poll_s)
                continue

            try:
                img, changed = self._capture.capture()
                if not changed:
                    stop_event.wait(poll_s)
                    continue

                png_bytes = _pil_to_png(downscale(img, max_w))
                t1 = perf_counter()
                text = self._client.ocr(png_bytes)
                if stop_event.is_set():
                    break

                t2 = perf_counter()
                lines = self._pipeline.update(text)
                t3 = perf_counter()

                self._last_perf = {
                    "ocr": round(t2 - t1, 2),
                    "translate": round(t3 - t2, 2),
                }
                self._queue.put(("lines", lines, self._last_perf))

            except MaasError as err:
                self._queue.put(("error", str(err)))
            except Exception:
                self._queue.put(("error", "capture/OCR failed"))

    def _drain_queue(self) -> None:
        """Drain queue on main thread via root.after."""
        try:
            while True:
                item = self._queue.get_nowait()
                if item is None:
                    continue

                msg_type = item[0]

                if msg_type == "live":
                    # Streaming partial translation
                    partial = item[1]
                    self._live_partial = partial
                    self._render(self._transcript.lines(), partial)

                elif msg_type == "lines":
                    # Completed frame
                    lines = item[1]
                    perf = item[2]
                    self._transcript.add(lines)
                    self._live_partial = ""
                    self._render(self._transcript.lines())
                    self._set_status(
                        f"OCR {perf.get('ocr', 0):.1f}s · "
                        f"translate {perf.get('translate', 0):.1f}s · "
                        f"✓ running",
                        self._theme["ok"],
                    )

                elif msg_type == "error":
                    err = item[1]
                    self._set_status(f"Error: {err}", self._theme["err"])

        except queue.Empty:
            pass
        except Exception:
            pass

        if self._running:
            self._after_id = self.root.after(50, self._drain_queue)

    def _drain_stale_queue(self) -> None:
        """Drop stale queue items from previous run."""
        try:
            while True:
                self._queue.get_nowait()
        except queue.Empty:
            pass

    # -- Helpers ------------------------------------------------------------

    def _try_init_client(self) -> bool:
        if self._client is not None:
            return True
        key = discover_api_key()
        if key is None:
            return False
        self._client = MaasClient(
            api_key=key,
            llm_model=self.cfg.get("llm_model", LLM_MODEL),
            ocr_model=self.cfg.get("ocr_model", OCR_MODEL),
        )
        return True

    def _region_from_cfg(self) -> Region | None:
        r = self.cfg.get("region")
        if not r or len(r) != 4:
            return None
        return Region(int(r[0]), int(r[1]), int(r[2]), int(r[3]))

    def _source_phrase(self) -> str | None:
        src = self.combo_source.get()
        phrase = LANGUAGES.get(src)
        return None if phrase is None or src == "Auto (detect)" else phrase

    def _target_phrase(self) -> str:
        tgt = self.combo_target.get()
        phrase = LANGUAGES.get(tgt)
        return phrase if phrase else "Traditional Chinese (繁體中文)"

    def _on_model_change(self, _value: str | None = None) -> None:
        model = self.combo_model.get()
        self.cfg["llm_model"] = model
        config.save(self.cfg)
        if self._client is not None:
            self._client.llm_model = model
        self._set_status("model: " + model, self._theme["ok"])

    def _pick_region(self) -> None:
        was_running = self._running
        if was_running:
            self._stop()
        region = select_region(self.root)
        if region is not None:
            self.cfg["region"] = [region.x, region.y, region.w, region.h]
            config.save(self.cfg)
            self._set_status("region updated", self._theme["ok"])
            if was_running:
                self._start()
        else:
            self._set_status("region cancelled", self._theme["muted"])

    def _on_lang_change(self, _value: str | None = None) -> None:
        self.cfg["source_lang"] = self.combo_source.get()
        self.cfg["target_lang"] = self.combo_target.get()
        config.save(self.cfg)
        if self._pipeline is not None and self._running:
            self._pipeline = CaptionPipeline(
                translate_fn=lambda s, on_chunk=None: self._client.translate(
                    s, self._target_phrase(), self._source_phrase(), on_chunk=on_chunk
                ),
                cache={},
                max_lines=200,
            )

    def _on_opacity(self, value: str) -> None:
        alpha = int(value) / 100.0
        self.cfg["opacity"] = alpha
        self.root.attributes("-alpha", alpha)

    def _on_font_size(self, value: str) -> None:
        size = int(value)
        self.cfg["font_size"] = size
        self._refresh_tags()
        self._render(self._transcript.lines(), self._live_partial)

    def _clear(self) -> None:
        self._transcript.reset()
        self._live_partial = ""
        self._render([])
        self._set_status("transcript cleared", self._theme["muted"])

    def _on_click_through(self) -> None:
        self._click_through = self.var_click.get()
        self.cfg["click_through"] = self._click_through
        self._apply_click_through()

    def _apply_click_through(self) -> None:
        """Apply click-through mode via Win32 API."""
        self.root.update_idletasks()
        hwnd = self._root_hwnd()
        if hwnd == 0:
            return
        user32 = ctypes.windll.user32
        ex = user32.GetWindowLongW(hwnd, _GWL_EXSTYLE)
        if self._click_through:
            ex |= _WS_EX_LAYERED | _WS_EX_TRANSPARENT | _WS_EX_NOACTIVATE
        else:
            ex &= ~(_WS_EX_TRANSPARENT | _WS_EX_NOACTIVATE)
        user32.SetWindowLongW(hwnd, _GWL_EXSTYLE, ex)

    def _set_status(self, text: str, color: str) -> None:
        self.status.configure(text=text, fg=color)

    def _drag_start(self, event: tk.Event) -> None:
        self._drag_offset = (event.x_root - self.root.winfo_x(),
                             event.y_root - self.root.winfo_y())

    def _drag_move(self, event: tk.Event) -> None:
        dx, dy = self._drag_offset
        self.root.geometry(f"+{event.x_root - dx}+{event.y_root - dy}")

    def _drag_end(self, _event: tk.Event) -> None:
        self.cfg["overlay_xy"] = [self.root.winfo_x(), self.root.winfo_y()]
        try:
            config.save(self.cfg)
        except OSError:
            pass

    def _root_hwnd(self) -> int:
        self.root.update_idletasks()
        raw = self.root.winfo_id()
        return ctypes.windll.user32.GetAncestor(raw, _GA_ROOT)

    def _on_close(self) -> None:
        """Handle window close."""
        if self._running:
            self._stop()
        self.root.destroy()


def _pil_to_png(img) -> bytes:
    """Convert PIL image to PNG bytes."""
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()
