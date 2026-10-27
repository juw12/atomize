"""Lingua window mixin: update banner/pill, Update dialog and About dialog.

Mixed into ``LinguaWindow``; relies on its ``root``, ``cfg``, ``_theme``,
``_button``, ``_recolor``, ``_color_widget``, ``_set_status``, ``_stop`` and
``_on_close`` members plus the widgets built in ``_build_header`` /
``_build_banner`` / ``_build_status``.
"""

from __future__ import annotations

import queue
import os
import threading
import tkinter as tk
import webbrowser
from tkinter import messagebox, ttk
from typing import Callable

from engine import config, updater
from engine.version import RELEASES_PAGE, __version__


def size_text(num: int) -> str:
    """Human-friendly byte size, e.g. ``21.5 MB``."""
    if not num:
        return ""
    size = float(num)
    for unit in ("B", "KB", "MB", "GB"):
        if size < 1024 or unit == "GB":
            return ("%.0f %s" if unit in ("B", "KB") else "%.1f %s") % (size, unit)
        size /= 1024
    return ""


class UpdateMixin:
    # -- thread -> UI ---------------------------------------------------------

    def _call_ui(self, fn: Callable[[], None]) -> None:
        """Run ``fn`` on the Tk main thread (safe to call from worker threads)."""
        self._ui_calls.put(fn)

    def _pump_ui(self) -> None:
        try:
            while True:
                fn = self._ui_calls.get_nowait()
                try:
                    fn()
                except Exception:
                    pass
        except queue.Empty:
            pass
        try:
            self.root.after(120, self._pump_ui)
        except tk.TclError:
            pass

    # -- checking -------------------------------------------------------------

    def _update_recheck_ms(self) -> int:
        """How often a running Lingua looks for a new release (default every 4 hours)."""
        try:
            minutes = float(os.environ.get("LINGUA_UPDATE_EVERY_MIN", "240"))
        except ValueError:
            minutes = 240.0
        return max(1, int(minutes * 60 * 1000))

    def _periodic_update_check(self) -> None:
        """Re-check in the background so an all-day session still sees new versions."""
        if self.cfg.get("auto_update", True) and self._update_info is None:
            self._check_updates(manual=False)
        try:
            self.root.after(self._update_recheck_ms(), self._periodic_update_check)
        except tk.TclError:
            pass

    def _open_update_or_check(self) -> None:
        if self._update_info is not None:
            self._open_update_dialog()
        else:
            self._check_updates(manual=True)

    def _check_updates(self, manual: bool = False) -> None:
        if self._update_checking:
            return
        self._update_checking = True
        if manual:
            self._set_status("Checking for updates…", self._theme["muted"])
            button = getattr(self, "btn_check_updates", None)
            if button is not None:
                button.configure(text="⟳ Checking…")

        def work() -> None:
            try:
                info = updater.check_for_update()
                self._call_ui(lambda: self._on_update_result(info, None, manual))
            except updater.UpdateError as err:
                message = str(err)
                self._call_ui(lambda: self._on_update_result(None, message, manual))

        threading.Thread(target=work, daemon=True).start()

    def _on_update_result(self, info, error: str | None, manual: bool) -> None:
        self._update_checking = False
        button = getattr(self, "btn_check_updates", None)
        if button is not None:
            button.configure(text="⟳ Updates")
        if info is not None:
            self._update_info = info
            self._show_update_available(info)
            if manual:
                self._open_update_dialog()
            return
        if error:
            self.status_right.configure(text="v" + __version__ + " · update check failed")
            if manual:
                self._set_status("Could not check for updates (offline?)", self._theme["warn"])
                messagebox.showwarning("Lingua updates", error, parent=self.root)
            return
        self.status_right.configure(text="v" + __version__ + " · up to date")
        if manual:
            self._set_status("Lingua " + __version__ + " is the latest version", self._theme["ok"])
            messagebox.showinfo(
                "Lingua updates",
                "You're up to date.\n\nLingua " + __version__ + " is the latest version.",
                parent=self.root,
            )

    def _show_update_available(self, info) -> None:
        self._banner_text.configure(
            text="✨  Lingua " + info.version + " is available  (you have " + __version__ + ")"
        )
        if not self._banner.winfo_ismapped() and not getattr(self, "_banner_dismissed", False):
            self._banner.pack(fill="x", side="top", after=self._header)
        self.btn_update_pill.configure(text="⬆ Update to " + info.version)
        button = getattr(self, "btn_check_updates", None)
        if button is not None and button.winfo_ismapped():
            button.pack_forget()
        if not self.btn_update_pill.winfo_ismapped():
            self.btn_update_pill.pack(side="right", padx=(0, 6), pady=9)
        self.status_right.configure(text="v" + __version__ + " · update " + info.version + " ready")
        self._color_widget(self._banner)
        self._recolor(self._banner)
        self._color_widget(self.btn_update_pill)

    def _dismiss_banner(self) -> None:
        self._banner_dismissed = True
        self._banner.pack_forget()

    # -- update dialog ----------------------------------------------------------

    def _open_update_dialog(self) -> None:
        info = self._update_info
        if info is None:
            self._check_updates(manual=True)
            return
        if self._update_dialog is not None and self._update_dialog.winfo_exists():
            self._update_dialog.lift()
            return
        t = self._theme
        dlg = tk.Toplevel(self.root)
        self._update_dialog = dlg
        dlg.title("Update Lingua")
        dlg.configure(bg=t["card"])
        dlg.attributes("-topmost", True)
        dlg.resizable(False, False)
        dlg.transient(self.root)

        tk.Label(dlg, text="Lingua " + info.version + " is ready", bg=t["card"], fg=t["text"],
                 font=("Segoe UI Semibold", 14)).pack(anchor="w", padx=20, pady=(18, 0))
        tk.Label(dlg, text="You have " + __version__ + ". Your settings, history and lingua.env are kept.",
                 bg=t["card"], fg=t["muted"], font=("Segoe UI", 9)).pack(anchor="w", padx=20, pady=(2, 10))

        notes = tk.Text(dlg, width=58, height=9, wrap="word", relief="flat", bd=0, padx=10, pady=8,
                        bg=t["bg"], fg=t["text"], font=("Segoe UI", 9), highlightthickness=0)
        notes.insert("1.0", updater.short_notes(info.notes) or "Bug fixes and improvements.")
        notes.configure(state="disabled")
        notes.pack(fill="x", padx=20)

        progress = ttk.Progressbar(dlg, style="Lingua.Horizontal.TProgressbar", mode="determinate",
                                   maximum=100, length=420)
        progress.pack(fill="x", padx=20, pady=(14, 4))
        info_label = tk.Label(dlg, text="Download " + size_text(info.size), bg=t["card"], fg=t["muted"],
                              font=("Segoe UI", 9), anchor="w")
        info_label.pack(fill="x", padx=20)

        row = tk.Frame(dlg, bg=t["card"])
        row.pack(fill="x", padx=20, pady=(12, 18))
        later = self._button(row, "Later", dlg.destroy)
        later.pack(side="right")
        go = self._button(row, "Update now", lambda: start(), role="accent")
        go.pack(side="right", padx=(0, 8))
        if info.page:
            self._button(row, "Release page", lambda: webbrowser.open(info.page), role="ghost").pack(side="left")
        for child in row.winfo_children():
            self._color_widget(child)

        def start() -> None:
            if not updater.is_frozen():
                messagebox.showinfo(
                    "Lingua updates",
                    "This copy runs from the source code, so it updates with git:\n\n"
                    "    git pull\n\nThe release page will open so you can also download the app.",
                    parent=dlg,
                )
                webbrowser.open(info.page or RELEASES_PAGE)
                return
            go.configure(state="disabled", text="Updating…")
            later.configure(state="disabled")
            if self._running:
                self._stop()

            def on_progress(done: int, total: int) -> None:
                pct = (done * 100.0 / total) if total else 0.0
                text = "Downloading… " + size_text(done) + (" of " + size_text(total) if total else "")

                def show() -> None:
                    progress.configure(value=pct)
                    info_label.configure(text=text)

                self._call_ui(show)

            def work() -> None:
                try:
                    zip_path = updater.download_update(info, progress=on_progress)
                    self._call_ui(lambda: info_label.configure(text="Unpacking…"))
                    staged = updater.stage_update(zip_path)
                    updater.launch_apply(staged)
                except Exception as err:  # noqa: BLE001 - shown to the user
                    message = str(err)

                    def fail() -> None:
                        go.configure(state="normal", text="Try again")
                        later.configure(state="normal")
                        info_label.configure(text="Update failed: " + message, fg=t["err"])

                    self._call_ui(fail)
                    return

                def restart() -> None:
                    progress.configure(value=100)
                    info_label.configure(text="Restarting Lingua…", fg=t["ok"])
                    self.root.after(700, self._on_close)

                self._call_ui(restart)

            threading.Thread(target=work, daemon=True).start()

    # -- about dialog -------------------------------------------------------------

    def _open_about(self) -> None:
        from engine import installer

        t = self._theme
        dlg = tk.Toplevel(self.root)
        dlg.title("About Lingua")
        dlg.configure(bg=t["card"])
        dlg.attributes("-topmost", True)
        dlg.resizable(False, False)
        dlg.transient(self.root)
        self._about_dialog = dlg

        head = tk.Frame(dlg, bg=t["card"])
        head.pack(fill="x", padx=20, pady=(18, 6))
        logo = tk.Canvas(head, width=40, height=40, highlightthickness=0, bd=0, bg=t["card"])
        logo.create_oval(2, 2, 38, 38, fill=t["accent"], outline="")
        logo.create_text(20, 20, text="L", fill=t["accent_fg"], font=("Segoe UI Semibold", 18))
        logo.pack(side="left", padx=(0, 12))
        text_col = tk.Frame(head, bg=t["card"])
        text_col.pack(side="left")
        tk.Label(text_col, text="Lingua " + __version__, bg=t["card"], fg=t["text"],
                 font=("Segoe UI Semibold", 14)).pack(anchor="w")
        tk.Label(text_col, text="Live caption translator · Read picture (OCR) · phone sharing",
                 bg=t["card"], fg=t["muted"], font=("Segoe UI", 9)).pack(anchor="w")

        frozen = updater.is_frozen()
        installed = frozen and installer.is_installed_copy()
        where = updater.current_install_dir()
        state = "Installed" if installed else ("Portable copy" if frozen else "Running from source")
        tk.Label(dlg, text=state + ":  " + where, bg=t["card"], fg=t["muted"], font=("Segoe UI", 8),
                 wraplength=440, justify="left").pack(anchor="w", padx=20, pady=(6, 8))

        auto = tk.BooleanVar(value=bool(self.cfg.get("auto_update", True)))

        def on_auto() -> None:
            self.cfg["auto_update"] = bool(auto.get())
            try:
                config.save(self.cfg)
            except OSError:
                pass

        tk.Checkbutton(dlg, text="Check for updates automatically when Lingua starts", variable=auto,
                       command=on_auto, bg=t["card"], fg=t["text"], selectcolor=t["bg"],
                       activebackground=t["card"], activeforeground=t["text"], bd=0,
                       highlightthickness=0, font=("Segoe UI", 9)).pack(anchor="w", padx=16)

        # -- translation engines ------------------------------------------------
        from engine import offline_translate as ot

        tk.Frame(dlg, bg=t["edge"], height=1).pack(fill="x", padx=20, pady=(12, 8))
        tk.Label(dlg, text="Translation when the company service is down", bg=t["card"], fg=t["text"],
                 font=("Segoe UI Semibold", 10)).pack(anchor="w", padx=20)
        packs_label = tk.Label(dlg, text="", bg=t["card"], fg=t["muted"], font=("Segoe UI", 9),
                               wraplength=440, justify="left")
        packs_label.pack(anchor="w", padx=20, pady=(2, 4))

        def refresh_packs() -> None:
            pairs = ot.installed_pairs()
            if not ot.engine_available():
                packs_label.configure(text="Offline engine not available in this copy.")
            elif pairs:
                names = ", ".join("{}→{}".format(ot.NAME_BY_CODE.get(a, a), ot.NAME_BY_CODE.get(b, b)) for a, b in pairs)
                packs_label.configure(text="Offline on this PC (private, nothing leaves the laptop): " + names)
            else:
                packs_label.configure(text="No offline language packs yet. Download them once (~70 MB each).")

        refresh_packs()
        pack_row = tk.Frame(dlg, bg=t["card"])
        pack_row.pack(fill="x", padx=20)
        pack_status = tk.Label(pack_row, text="", bg=t["card"], fg=t["muted"], font=("Segoe UI", 8))

        def download_mine() -> None:
            names = {self.combo_target.get(), self.combo_source.get(), "English"}
            codes = sorted({ot.code_for(n) for n in names if ot.code_for(n)})
            wanted = []
            for a in codes:
                for b in codes:
                    if a != b and (a == "en" or b == "en"):
                        wanted.append((a, b))
            dl_button.configure(state="disabled")

            def work() -> None:
                try:
                    index = ot.load_index()
                    todo = [p for p in wanted if not ot.is_installed(*p)]
                    for n, (a, b) in enumerate(todo, 1):
                        def progress(done, total, a=a, b=b, n=n):
                            if total:
                                text = "{}/{}  {}→{}  {:.0f}/{:.0f} MB".format(
                                    n, len(todo), ot.NAME_BY_CODE.get(a, a), ot.NAME_BY_CODE.get(b, b), done / 1e6, total / 1e6)
                                self._call_ui(lambda: pack_status.configure(text=text))
                        ot.install_pack(a, b, progress=progress, index=index)
                    self._call_ui(lambda: (pack_status.configure(text="Done ✓"), refresh_packs(),
                                           dl_button.configure(state="normal")))
                except Exception as err:  # noqa: BLE001
                    message = str(err)
                    self._call_ui(lambda: (pack_status.configure(text="Download failed: " + message[:80]),
                                           dl_button.configure(state="normal")))

            threading.Thread(target=work, daemon=True).start()

        dl_button = self._button(pack_row, "Download packs for my languages", download_mine)
        dl_button.pack(side="left")
        pack_status.pack(side="left", padx=8)
        self._color_widget(dl_button)

        online = tk.BooleanVar(value=bool(self.cfg.get("allow_online_translation", False)))

        def on_online() -> None:
            self.cfg["allow_online_translation"] = bool(online.get())
            try:
                config.save(self.cfg)
            except OSError:
                pass

        tk.Checkbutton(dlg, text="Also allow online translation (Google / MyMemory) – text leaves the company network",
                       variable=online, command=on_online, bg=t["card"], fg=t["text"], selectcolor=t["bg"],
                       activebackground=t["card"], activeforeground=t["text"], bd=0, highlightthickness=0,
                       font=("Segoe UI", 9), wraplength=440, justify="left").pack(anchor="w", padx=16, pady=(6, 0))

        row = tk.Frame(dlg, bg=t["card"])
        row.pack(fill="x", padx=20, pady=(14, 18))

        def check_now() -> None:
            dlg.destroy()
            self._check_updates(manual=True)

        self._button(row, "Check for updates", check_now, role="accent").pack(side="left")
        if frozen and not installed:
            def do_install() -> None:
                try:
                    exe = installer.install()
                except Exception as err:  # noqa: BLE001
                    messagebox.showerror("Install Lingua", str(err), parent=dlg)
                    return
                messagebox.showinfo(
                    "Install Lingua",
                    "Lingua is installed for you.\n\nStart menu and Desktop shortcuts were added, "
                    "and it shows under Settings → Apps.\n\n" + exe,
                    parent=dlg,
                )
                dlg.destroy()

            self._button(row, "Install on this PC", do_install).pack(side="left", padx=8)
        self._button(row, "Releases", lambda: webbrowser.open(RELEASES_PAGE), role="ghost").pack(side="left", padx=4)
        self._button(row, "Close", dlg.destroy).pack(side="right")
        for child in row.winfo_children():
            self._color_widget(child)
