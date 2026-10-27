"""Lingua: "Share to phone" window.

Starts :class:`engine.local_server.LocalServer` and shows the pairing link as
a QR code (when the optional ``qrcode`` package is installed) plus plain text.
The phone must be on the same Wi-Fi / network as the laptop. Closing the
window stops sharing.
"""

from __future__ import annotations

import tkinter as tk

from PIL import ImageTk

from engine.local_server import DEFAULT_PORT, LocalServer

try:  # optional: pure-Python QR generator (bundled in the Windows download)
    import qrcode
except ImportError:  # pragma: no cover - depends on the environment
    qrcode = None


def _qr_image(text: str, box: int = 6):
    if qrcode is None:
        return None
    qr = qrcode.QRCode(border=2, box_size=box, error_correction=qrcode.constants.ERROR_CORRECT_M)
    qr.add_data(text)
    qr.make(fit=True)
    return qr.make_image(fill_color="black", back_color="white").get_image().convert("RGB")


class ShareWindow:
    """Toplevel that owns the phone server for as long as it is open."""

    def __init__(self, master: tk.Misc, theme: dict) -> None:
        self._theme = theme
        self.server: LocalServer | None = None
        self.win = tk.Toplevel(master)
        self.win.title("Lingua - Share to phone")
        self.win.configure(bg=theme["bg"])
        self.win.attributes("-topmost", True)
        self.win.resizable(False, False)
        self.win.protocol("WM_DELETE_WINDOW", self.close)

        try:
            self.server = LocalServer(port=DEFAULT_PORT).start()
        except OSError:
            # Port busy (another Lingua?): let the OS pick a free one.
            try:
                self.server = LocalServer(port=0).start()
            except OSError as err:
                self._label("Could not start sharing: {}".format(err), theme["err"])
                return
        self._build()

    def _label(self, text: str, color: str, font=("Segoe UI", 10), **pack) -> tk.Label:
        label = tk.Label(self.win, text=text, bg=self._theme["bg"], fg=color, font=font,
                         justify="left", wraplength=360)
        label.pack(padx=16, anchor="w", **pack)
        return label

    def _build(self) -> None:
        t = self._theme
        url = self.server.phone_url
        self._label("Read pictures on your phone", t["text"], ("Segoe UI", 13, "bold"), pady=(14, 2))
        self._label("1. Connect the phone to the same Wi-Fi as this laptop.\n"
                    "2. Scan the code with the phone camera (or type the link).\n"
                    "3. iPhone: Share → Add to Home Screen. Android: menu → Add to Home screen.",
                    t["muted"], pady=(0, 8))

        image = _qr_image(url)
        if image is not None:
            self._qr = ImageTk.PhotoImage(image)
            tk.Label(self.win, image=self._qr, bg="white", bd=0).pack(padx=16, pady=4)
        else:
            self._label("(Install the 'qrcode' package to show a QR code here.)", t["warn"])

        entry = tk.Entry(self.win, font=("Consolas", 10), relief="flat", width=46,
                         bg=t["card"], fg=t["text"], readonlybackground=t["card"],
                         insertbackground=t["text"])
        entry.insert(0, url)
        entry.configure(state="readonly")
        entry.pack(padx=16, pady=(8, 4), fill="x")

        row = tk.Frame(self.win, bg=t["bg"])
        row.pack(fill="x", padx=16, pady=(4, 6))
        tk.Button(row, text="Copy link", relief="flat", bg=t["button"], fg=t["text"],
                  activebackground=t["button_active"], command=lambda: self._copy(url)).pack(side="left")
        tk.Button(row, text="Stop sharing", relief="flat", bg=t["button"], fg=t["err"],
                  activebackground=t["button_active"], command=self.close).pack(side="right")
        self.status = self._label("Sharing is on while this window is open. The API key stays on this laptop.",
                                  t["muted"], ("Segoe UI", 9), pady=(0, 12))

    def _copy(self, url: str) -> None:
        self.win.clipboard_clear()
        self.win.clipboard_append(url)
        self.status.configure(text="Link copied.", fg=self._theme["ok"])

    def focus(self) -> None:
        self.win.deiconify()
        self.win.lift()

    def exists(self) -> bool:
        try:
            return bool(self.win.winfo_exists())
        except tk.TclError:
            return False

    def close(self) -> None:
        if self.server is not None:
            self.server.stop()
            self.server = None
        self.win.destroy()
