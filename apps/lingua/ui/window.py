"""Lingua: single combined window with controls + live transcript.

A single always-on-top tkinter window containing:
- Header: app title + theme toggle button
- Toolbar: Start/Stop, Select region, Clear, Read picture, Share to phone, Source/Target dropdowns,
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
from tkinter import ttk
from time import perf_counter
from typing import Callable

from engine import config, updater
from engine.version import __version__
from engine.capture import Region, RegionCapture, downscale
from engine.maas import LANGUAGES, LLM_MODEL, MODELS, OCR_MODEL, MaasClient, MaasError, discover_api_key
from engine.pipeline import CaptionPipeline, Line, Transcript, speaker_rows
from ui.picture import PictureReader
from ui.region import select_region
from ui.share import ShareWindow
from ui.theme import THEMES, get as get_theme
from ui.updates import UpdateMixin


# Win32 extended window styles
_GWL_EXSTYLE = -20
_WS_EX_LAYERED = 0x00080000
_WS_EX_TRANSPARENT = 0x00000020
_WS_EX_NOACTIVATE = 0x08000000
_GA_ROOT = 2


class LinguaWindow(UpdateMixin):
    """Single combined Lingua window: controls + transcript."""

    def __init__(self, cfg: dict | None = None, just_updated: bool = False) -> None:
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
        self._picture_reader: PictureReader | None = None
        self._share_window: ShareWindow | None = None
        self._ui_calls: queue.Queue = queue.Queue()
        self._update_info: updater.UpdateInfo | None = None
        self._update_checking = False
        self._update_dialog: tk.Toplevel | None = None
        self._more_open = bool(self.cfg.get("more_open", False))

        # Build the root window
        self.root = tk.Tk()
        self.root.title("Lingua " + __version__)
        self.root.minsize(560, 360)
        self.root.configure(bg=self._theme["bg"])
        self.root.resizable(True, True)
        self.root.attributes("-topmost", True)
        self.root.attributes("-alpha", float(self.cfg.get("opacity", 0.85)))

        # Build UI first (so widgets exist before theme apply)
        self._build_header()
        self._build_banner()
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

        # Thread -> UI calls (update checks etc.) and the automatic update check
        self._pump_ui()
        if just_updated:
            self._set_status("Updated to Lingua " + __version__ + " - enjoy the new version", self._theme["ok"])
        if self.cfg.get("auto_update", True):
            self.root.after(2500, lambda: self._check_updates(manual=False))

    # -- Widget helpers ------------------------------------------------------

    def _button(self, parent: tk.Widget, text: str, command: Callable, role: str = "chip",
                tip: str | None = None, **kw) -> tk.Button:
        """Flat themed button with hover feedback. role: accent | chip | ghost | pill."""
        btn = tk.Button(
            parent,
            text=text,
            command=command,
            relief="flat",
            bd=0,
            cursor="hand2",
            font=("Segoe UI Semibold", 10) if role in ("accent", "pill") else ("Segoe UI", 10),
            padx=kw.pop("padx", 12),
            pady=kw.pop("pady", 5),
            **kw,
        )
        btn._role = role  # type: ignore[attr-defined]
        btn.bind("<Enter>", lambda _e, b=btn: b.configure(bg=self._button_colors(b)[2]), add="+")
        btn.bind("<Leave>", lambda _e, b=btn: b.configure(bg=self._button_colors(b)[0]), add="+")
        if tip:
            btn.bind("<Enter>", lambda _e, t=tip: self._hint(t), add="+")
            btn.bind("<Leave>", lambda _e: self._hint(None), add="+")
        return btn

    def _button_colors(self, btn: tk.Button) -> tuple[str, str, str]:
        """(background, foreground, hover background) for a button's role."""
        t = self._theme
        role = getattr(btn, "_role", "chip")
        if role == "accent":
            if btn is getattr(self, "btn_start", None) and self._running:
                return t["err"], "#ffffff", t["err"]
            return t["accent"], t["accent_fg"], t["accent_hover"]
        if role == "pill":
            return t["accent"], t["accent_fg"], t["accent_hover"]
        if role == "ghost":
            bg = btn.master.cget("bg")
            return bg, t["muted"], t["button_active"]
        return t["button"], t["text"], t["button_active"]

    def _hint(self, text: str | None) -> None:
        """Show a one-line hint in the status bar while hovering a button."""
        if text:
            self._hint_saved = self.status.cget("text"), self.status.cget("fg")
            self.status.configure(text=text, fg=self._theme["muted"])
        elif getattr(self, "_hint_saved", None):
            self.status.configure(text=self._hint_saved[0], fg=self._hint_saved[1])
            self._hint_saved = None

    def _label(self, parent: tk.Widget, text: str, role: str = "muted", **kw) -> tk.Label:
        lab = tk.Label(parent, text=text, font=kw.pop("font", ("Segoe UI", 9)), **kw)
        lab._role = role  # type: ignore[attr-defined]
        return lab

    def _menu(self, parent: tk.Widget, var: tk.StringVar, values, command) -> tk.OptionMenu:
        menu = tk.OptionMenu(parent, var, *values, command=command)
        menu.configure(relief="flat", bd=0, highlightthickness=0, indicatoron=False,
                       font=("Segoe UI", 10), padx=10, pady=4, cursor="hand2")
        return menu

    # -- Layout ----------------------------------------------------------------

    def _build_header(self) -> None:
        """Header: logo, title, version; Update pill, About and theme on the right."""
        header = tk.Frame(self.root, height=46)
        header._role = "card"  # type: ignore[attr-defined]
        header.pack(fill="x", side="top")
        header.pack_propagate(False)
        self._header = header

        for widget in (header,):
            widget.bind("<Button-1>", self._drag_start, add="+")
            widget.bind("<B1-Motion>", self._drag_move, add="+")
            widget.bind("<ButtonRelease-1>", self._drag_end, add="+")

        self._logo = tk.Canvas(header, width=24, height=24, highlightthickness=0, bd=0)
        self._logo.pack(side="left", padx=(12, 6), pady=11)

        title = self._label(header, "Lingua", role="title", font=("Segoe UI Semibold", 13))
        title.pack(side="left")
        self._title_label = title
        self._version_label = self._label(header, "v" + __version__, font=("Segoe UI", 9))
        self._version_label.pack(side="left", padx=(6, 0), pady=(4, 0))

        theme_label = "☀" if self._theme_name == "dark" else "☾"
        self.btn_theme = self._button(header, theme_label, self._toggle_theme, role="ghost",
                                      tip="Switch light / dark theme", padx=10)
        self.btn_theme.configure(font=("Segoe UI Symbol", 12))
        self.btn_theme.pack(side="right", padx=(0, 8))

        self.btn_about = self._button(header, "ⓘ", self._open_about, role="ghost",
                                      tip="About Lingua, updates and install", padx=10)
        self.btn_about.configure(font=("Segoe UI Symbol", 12))
        self.btn_about.pack(side="right")

        self.btn_update_pill = self._button(header, "⬆ Update", self._open_update_dialog, role="pill",
                                            tip="A new version of Lingua is ready", padx=12, pady=3)
        # packed only when an update is available

    def _build_banner(self) -> None:
        """Update banner (hidden until a newer release is found)."""
        banner = tk.Frame(self.root)
        banner._role = "banner"  # type: ignore[attr-defined]
        self._banner = banner
        self._banner_text = self._label(banner, "", role="banner_text", font=("Segoe UI", 10))
        self._banner_text.pack(side="left", padx=(12, 8), pady=8)
        close = self._button(banner, "✕", self._dismiss_banner, role="ghost", padx=8, pady=2)
        close.pack(side="right", padx=(0, 8))
        self._button(banner, "Update now", self._open_update_dialog, role="pill",
                     padx=12, pady=3).pack(side="right", padx=4)
        self._button(banner, "What's new", self._open_update_dialog, role="ghost",
                     padx=8, pady=3).pack(side="right")

    def _build_toolbar(self) -> None:
        """Primary actions, language row and the collapsible More panel."""
        toolbar = tk.Frame(self.root)
        toolbar.pack(fill="x", side="top", padx=12, pady=(10, 6))
        self._toolbar = toolbar

        # Row 0: primary actions
        row0 = tk.Frame(toolbar)
        row0.pack(fill="x", pady=(0, 8))
        self.btn_start = self._button(row0, "▶  Start", self._toggle_run, role="accent",
                                      tip="Start / stop translating the captions region", padx=16)
        self.btn_start.pack(side="left", padx=(0, 8))
        self.btn_region = self._button(row0, "⬚  Region", self._pick_region,
                                       tip="Drag a box around the Teams captions")
        self.btn_region.pack(side="left", padx=(0, 6))
        self.btn_picture = self._button(row0, "🖼  Read picture", self._open_picture_reader,
                                        tip="Turn a picture into words and letters (and translate)")
        self.btn_picture.pack(side="left", padx=(0, 6))
        self.btn_phone = self._button(row0, "📱  Phone", self._open_share_window,
                                      tip="Use Read picture on your phone (same Wi-Fi, scan QR)")
        self.btn_phone.pack(side="left", padx=(0, 6))
        self.btn_clear = self._button(row0, "Clear", self._clear, role="ghost",
                                      tip="Clear the transcript")
        self.btn_clear.pack(side="right")

        # Row 1: From ⇄ To, More
        row1 = tk.Frame(toolbar)
        row1.pack(fill="x")
        self._label(row1, "From").pack(side="left", padx=(0, 6))
        self.combo_source = tk.StringVar(value=self.cfg.get("source_lang", "Auto (detect)"))
        self.cmb_source = self._menu(row1, self.combo_source, LANGUAGES.keys(), self._on_lang_change)
        self.cmb_source.pack(side="left")
        self.btn_swap = self._button(row1, "⇄", self._swap_languages, role="ghost",
                                     tip="Swap languages", padx=8)
        self.btn_swap.configure(font=("Segoe UI Symbol", 11))
        self.btn_swap.pack(side="left", padx=4)
        self._label(row1, "To").pack(side="left", padx=(0, 6))
        self.combo_target = tk.StringVar(value=self.cfg.get("target_lang", "繁體中文"))
        self.cmb_target = self._menu(row1, self.combo_target, LANGUAGES.keys(), self._on_lang_change)
        self.cmb_target.pack(side="left")

        self.btn_more = self._button(row1, "", self._toggle_more, role="ghost",
                                     tip="Model, opacity, font size, click-through")
        self.btn_more.pack(side="right")

        # More panel: model, opacity, font, click-through
        more = tk.Frame(toolbar)
        more._role = "panel"  # type: ignore[attr-defined]
        self._more = more
        inner = tk.Frame(more)
        inner._role = "panel"  # type: ignore[attr-defined]
        inner.pack(fill="x", padx=10, pady=8)

        self._label(inner, "Model").grid(row=0, column=0, sticky="w", padx=(0, 6))
        self.combo_model = tk.StringVar(value=self.cfg.get("llm_model", LLM_MODEL))
        self.cmb_model = self._menu(inner, self.combo_model, MODELS, self._on_model_change)
        self.cmb_model.grid(row=0, column=1, columnspan=5, sticky="w", pady=(0, 6))

        self._label(inner, "Opacity").grid(row=1, column=0, sticky="w", padx=(0, 6))
        self.slider_alpha = ttk.Scale(inner, from_=55, to=100, orient="horizontal", length=120,
                                      style="Lingua.Horizontal.TScale",
                                      command=lambda v: self._on_opacity(str(int(float(v)))))
        self.slider_alpha.set(int(self.cfg.get("opacity", 0.85) * 100))
        self.slider_alpha.grid(row=1, column=1, sticky="w")
        self.lbl_alpha = self._label(inner, "%d%%" % int(self.cfg.get("opacity", 0.85) * 100), width=5)
        self.lbl_alpha.grid(row=1, column=2, sticky="w", padx=(4, 12))

        self._label(inner, "Font").grid(row=1, column=3, sticky="w", padx=(0, 6))
        self.slider_font = ttk.Scale(inner, from_=14, to=32, orient="horizontal", length=100,
                                     style="Lingua.Horizontal.TScale",
                                     command=lambda v: self._on_font_size(str(int(float(v)))))
        self.slider_font.set(int(self.cfg.get("font_size", 20)))
        self.slider_font.grid(row=1, column=4, sticky="w")
        self.lbl_font = self._label(inner, "%d px" % int(self.cfg.get("font_size", 20)), width=5)
        self.lbl_font.grid(row=1, column=5, sticky="w", padx=(4, 12))

        self.var_click = tk.BooleanVar(value=self._click_through)
        self.chk_click = tk.Checkbutton(inner, text="Click-through", variable=self.var_click,
                                        font=("Segoe UI", 9), bd=0, highlightthickness=0,
                                        command=self._on_click_through)
        self.chk_click.grid(row=1, column=6, sticky="w")
        self._sync_more()

    def _build_transcript(self) -> None:
        """Transcript area with scrollbar."""
        # Container for transcript + scrollbar
        trans_frame = tk.Frame(self.root, bg=self._theme["card"])
        trans_frame.pack(fill="both", expand=True, padx=12, pady=(4, 6))
        self._trans_frame = trans_frame

        self.body = tk.Text(
            trans_frame,
            bg=self._theme["card"],
            fg=self._theme["text"],
            relief="flat",
            bd=0,
            wrap="word",
            highlightthickness=0,
            padx=14,
            pady=12,
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
        """Status bar: coloured dot + message, version / update state on the right."""
        bar = tk.Frame(self.root)
        bar.pack(fill="x", side="bottom")
        self._status_bar = bar
        self.status_dot = self._label(bar, "●", font=("Segoe UI", 9))
        self.status_dot.pack(side="left", padx=(12, 4), pady=5)
        self.status = tk.Label(bar, text="Ready - pick a region, then press Start",
                               font=("Segoe UI", 9), anchor="w")
        self.status._role = "status"  # type: ignore[attr-defined]
        self.status.pack(side="left", fill="x", expand=True)
        self.status_right = self._label(bar, "v" + __version__, font=("Segoe UI", 8))
        self.status_right.pack(side="right", padx=12)

    def _sync_more(self) -> None:
        self.btn_more.configure(text=("⚙  Less ▴" if self._more_open else "⚙  More ▾"))
        if self._more_open:
            self._more.pack(fill="x", pady=(8, 0))
        else:
            self._more.pack_forget()

    def _toggle_more(self) -> None:
        self._more_open = not self._more_open
        self.cfg["more_open"] = self._more_open
        try:
            config.save(self.cfg)
        except OSError:
            pass
        self._sync_more()

    def _swap_languages(self) -> None:
        src, tgt = self.combo_source.get(), self.combo_target.get()
        if src == "Auto (detect)":
            self._set_status("Pick a source language first to swap", self._theme["warn"])
            return
        self.combo_source.set(tgt)
        self.combo_target.set(src)
        self._on_lang_change()
        self._set_status("Swapped: " + tgt + " → " + src, self._theme["ok"])

    def _draw_logo(self) -> None:
        t = self._theme
        c = self._logo
        c.configure(bg=t["card"])
        c.delete("all")
        c.create_oval(1, 1, 23, 23, fill=t["accent"], outline="")
        c.create_text(12, 12, text="L", fill=t["accent_fg"], font=("Segoe UI Semibold", 11))

    # -- Theme -----------------------------------------------------------------

    def _apply_theme(self) -> None:
        """Recursively re-apply the current theme colors to every widget."""
        self.root.configure(bg=self._theme["bg"])
        self._recolor(self.root)
        self._draw_logo()
        self._style_ttk()
        self._refresh_tags()
        self._render(self._transcript.lines(), self._live_partial or None)

    def _style_ttk(self) -> None:
        t = self._theme
        style = ttk.Style(self.root)
        try:
            style.theme_use("clam")
        except tk.TclError:
            pass
        style.configure("Lingua.Horizontal.TScale", background=t["accent"], troughcolor=t["track"],
                        bordercolor=t["panel"], lightcolor=t["accent"], darkcolor=t["accent"],
                        sliderthickness=14, gripcount=0)
        style.map("Lingua.Horizontal.TScale", background=[("active", t["accent_hover"])])
        style.configure("Lingua.Horizontal.TProgressbar", troughcolor=t["track"], background=t["accent"],
                        bordercolor=t["card"], lightcolor=t["accent"], darkcolor=t["accent"], thickness=8)

    def _recolor(self, parent: tk.Widget) -> None:
        for w in parent.winfo_children():
            self._color_widget(w)
            self._recolor(w)

    def _color_widget(self, w: tk.Widget) -> None:
        t = self._theme
        role = getattr(w, "_role", None)
        if isinstance(w, (tk.Toplevel, ttk.Widget)):
            return  # ttk widgets are styled in _style_ttk
        if isinstance(w, tk.Frame):
            w.configure(bg={"card": t["card"], "banner": t["banner"], "panel": t["panel"]}.get(role, t["bg"]))
            if w is getattr(self, "_trans_frame", None):
                w.configure(bg=t["card"])
        elif isinstance(w, tk.Canvas):
            w.configure(bg=w.master.cget("bg"))
        elif isinstance(w, tk.Text):
            w.configure(bg=t["card"], fg=t["text"], insertbackground=t["text"])
        elif isinstance(w, tk.Scrollbar):
            w.configure(bg=t["card"], troughcolor=t["card"], activebackground=t["button_active"])
        elif isinstance(w, tk.Scale):
            bg = w.master.cget("bg")
            w.configure(bg=bg, fg=t["muted"], troughcolor=t["track"], activebackground=t["accent"])
        elif isinstance(w, tk.Checkbutton):
            bg = w.master.cget("bg")
            w.configure(bg=bg, fg=t["text"], selectcolor=t["card"],
                        activebackground=bg, activeforeground=t["text"])
        elif isinstance(w, (tk.OptionMenu, tk.Menubutton)):
            w.configure(bg=t["button"], fg=t["text"],
                        activebackground=t["button_active"], activeforeground=t["text"])
            try:
                w["menu"].configure(bg=t["card"], fg=t["text"], activebackground=t["accent"],
                                    activeforeground=t["accent_fg"], bd=0, font=("Segoe UI", 10))
            except tk.TclError:
                pass
        elif isinstance(w, tk.Button):
            bg, fg, _hover = self._button_colors(w)
            w.configure(bg=bg, fg=fg, activebackground=_hover, activeforeground=fg)
        elif isinstance(w, tk.Label):
            bg = w.master.cget("bg")
            if role == "title":
                fg = t["text"]
            elif role == "banner_text":
                fg = t["text"]
            elif role == "status":
                fg = w.cget("fg") if getattr(self, "_status_colored", False) else t["muted"]
            else:
                fg = t["muted"]
            w.configure(bg=bg, fg=fg)

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
            "empty_title",
            font=("Segoe UI Semibold", max(11, size - 4)),
            foreground=self._theme["text"],
            spacing1=6,
            spacing3=8,
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
            self.body.insert("1.0", "Live captions appear here.\n", ("empty_title",))
            self.body.insert("end", "1.  ⬚ Region: drag a box around the Teams captions\n"
                                    "2.  ▶ Start: Lingua reads and translates them live\n"
                                    "3.  🖼 Read picture: turn any picture into words\n", ("hint",))

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
        self.btn_theme.configure(text="☀" if self._theme_name == "dark" else "☾")
        self._apply_theme()

    # -- Worker thread management -------------------------------------------

    def _toggle_run(self) -> None:
        if self._running:
            self._stop()
        else:
            self._start()

    def _start(self) -> None:
        if not self._try_init_client():
            self._set_status("No API key found - add MAAS_API_KEY to lingua.env next to Lingua.exe",
                             self._theme["err"])
            return

        region = self._region_from_cfg()
        if region is None:
            self._set_status("Pick a region first: press ⬚ Region and drag over the captions",
                             self._theme["warn"])
            return

        self._running = True
        self.btn_start.configure(text="■  Stop")
        self._color_widget(self.btn_start)
        self._capture = RegionCapture(region, min_change=0.0)
        self._pipeline = CaptionPipeline(
            translate_fn=lambda s, on_chunk=None: self._client.translate_live(
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
        self.btn_start.configure(text="▶  Start")
        self._color_widget(self.btn_start)
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
                translate_fn=lambda s, on_chunk=None: self._client.translate_live(
                    s, self._target_phrase(), self._source_phrase(), on_chunk=on_chunk
                ),
                cache={},
                max_lines=200,
            )

    def _on_opacity(self, value: str) -> None:
        alpha = int(value) / 100.0
        if hasattr(self, "lbl_alpha"):
            self.lbl_alpha.configure(text="%d%%" % int(value))
        self.cfg["opacity"] = alpha
        self.root.attributes("-alpha", alpha)

    def _on_font_size(self, value: str) -> None:
        size = int(value)
        if not hasattr(self, "body"):
            return  # slider initialising before the transcript exists
        if self.cfg.get("font_size") == size and hasattr(self, "lbl_font"):
            return
        self.cfg["font_size"] = size
        if hasattr(self, "lbl_font"):
            self.lbl_font.configure(text="%d px" % size)
        self._refresh_tags()
        self._render(self._transcript.lines(), self._live_partial)

    def _open_picture_reader(self) -> None:
        """Open (or focus) the Read-picture window: image -> words and letters."""
        if self._picture_reader is not None and self._picture_reader.exists():
            self._picture_reader.focus()
            return
        self._picture_reader = PictureReader(
            self.root,
            self._theme,
            get_client=lambda: self._client if self._try_init_client() else None,
            get_target=lambda: (self.combo_target.get(), self._target_phrase()),
            get_source=self._source_phrase,
        )

    def _open_share_window(self) -> None:
        """Share Read picture with a phone on the same Wi-Fi (QR code + link)."""
        if self._share_window is not None and self._share_window.exists():
            self._share_window.focus()
            return
        self._share_window = ShareWindow(self.root, self._theme)

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
        self._hint_saved = None
        self._status_colored = True
        self.status.configure(text=text, fg=color)
        self.status_dot.configure(fg=color)

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
        if self._share_window is not None and self._share_window.exists():
            self._share_window.close()
        self.root.destroy()


def _pil_to_png(img) -> bytes:
    """Convert PIL image to PNG bytes."""
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()
