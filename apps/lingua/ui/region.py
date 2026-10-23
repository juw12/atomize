"""Lingua: fullscreen drag-to-select region picker.

Pure tkinter. ``select_region`` shows a semi-transparent fullscreen overlay,
lets the user drag a bright rectangle over the Teams caption strip, and
returns an :class:`engine.capture.Region`. Pressing ``Esc`` (or dragging a
region that is too small) cancels and returns ``None``.
"""

from __future__ import annotations

import ctypes
import tkinter as tk

from engine.capture import Region

# --- visual tokens (local, unobtrusive overlay palette) -----------------
_DIM_BG = "#0b0e14"        # near-ink background of the dim sheet
_DIM_ALPHA = 0.45          # how see-through the picker is over the desktop
_ACCENT = "#7dd3fc"        # bright selection outline (sky)
_ACCENT_SOFT = "#38506b"   # inner guide line
_TEXT = "#e7edf5"          # high-contrast label text
_TEXT_DIM = "#9fb0c3"      # secondary label text
_FONT_UI = ("Segoe UI", 11)
_FONT_MONO = ("Consolas", 10)
_MIN_EDGE = 6              # ignore accidental micro-drags


def select_region(root: "tk.Misc | None" = None) -> Region | None:
    """Block the caller while the user drags a rectangle on screen.

    Args:
        root: an existing Tk root/Tk to parent the picker to. When ``None`` a
            throwaway root is created for the duration of the selection so the
            picker can run completely stand-alone.

    Returns:
        A :class:`Region` (x, y, w, h) in screen coordinates, or ``None`` if
        the user pressed ``Esc`` or drew a region that is too small.
    """
    own_root = root is None
    if own_root:
        root = tk.Tk()
        root.withdraw()

    top = tk.Toplevel(root)
    top.title("Select caption region")
    top.overrideredirect(True)          # borderless
    top.attributes("-topmost", True)    # float above Teams while choosing
    top.attributes("-alpha", _DIM_ALPHA)

    origin_x, origin_y, screen_w, screen_h = _virtual_screen(top)
    top.geometry(f"{screen_w}x{screen_h}+{origin_x}+{origin_y}")
    top.configure(bg=_DIM_BG)
    top.focus_force()
    top.grab_set()

    canvas = tk.Canvas(
        top,
        width=screen_w,
        height=screen_h,
        bg=_DIM_BG,
        highlightthickness=0,
        bd=0,
        cursor="crosshair",
    )
    canvas.pack(fill="both", expand=True)

    # Instruction chip near the top so the user knows what to do.
    hint = (
        "Drag a rectangle over the Teams caption strip   ·   "
        "release to confirm   ·   Esc to cancel"
    )
    canvas.create_text(
        screen_w // 2,
        40,
        text=hint,
        fill=_TEXT,
        font=_FONT_UI,
        anchor="n",
    )

    state = {"x0": 0, "y0": 0, "x1": 0, "y1": 0, "rect": None, "size": None}
    result: dict[str, Region | None] = {"region": None}

    def on_press(event: tk.Event) -> None:
        state["x0"] = _clamp(event.x, 0, screen_w)
        state["y0"] = _clamp(event.y, 0, screen_h)
        state["x1"], state["y1"] = state["x0"], state["y0"]
        if state["rect"] is None:
            state["rect"] = canvas.create_rectangle(
                state["x0"],
                state["y0"],
                state["x1"],
                state["y1"],
                outline=_ACCENT,
                width=2,
            )
            state["size"] = canvas.create_text(
                state["x0"],
                state["y0"] - 12,
                text="",
                fill=_ACCENT,
                font=_FONT_MONO,
                anchor="s",
            )

    def on_drag(event: tk.Event) -> None:
        if state["rect"] is None:
            return
        state["x1"] = _clamp(event.x, 0, screen_w)
        state["y1"] = _clamp(event.y, 0, screen_h)
        canvas.coords(state["rect"], state["x0"], state["y0"],
                      state["x1"], state["y1"])
        w = abs(state["x1"] - state["x0"])
        h = abs(state["y1"] - state["y0"])
        canvas.coords(state["size"], min(state["x0"], state["x1"]),
                      min(state["y0"], state["y1"]) - 8)
        canvas.itemconfigure(state["size"], text=f"{w} × {h}")

    def on_release(_event: tk.Event) -> None:
        x0, y0 = state["x0"], state["y0"]
        x1, y1 = state["x1"], state["y1"]
        x, y = min(x0, x1), min(y0, y1)
        w, h = abs(x1 - x0), abs(y1 - y0)
        if w >= _MIN_EDGE and h >= _MIN_EDGE:
            result["region"] = Region(origin_x + x, origin_y + y, w, h)
        top.destroy()

    def on_cancel(_event: tk.Event) -> None:
        result["region"] = None
        top.destroy()

    canvas.bind("<Button-1>", on_press)
    canvas.bind("<B1-Motion>", on_drag)
    canvas.bind("<ButtonRelease-1>", on_release)
    top.bind("<Escape>", on_cancel)

    if own_root:
        top.wait_window()
        root.destroy()
    else:
        root.wait_window(top)

    return result["region"]


def _clamp(value: int, low: int, high: int) -> int:
    return max(low, min(high, value))


def _virtual_screen(widget) -> tuple:
    """Bounds (x, y, w, h) of the full virtual desktop across all monitors.

    Falls back to the primary monitor when the Win32 metrics are unavailable.
    """
    try:
        user32 = ctypes.windll.user32
        x = user32.GetSystemMetrics(76)   # SM_XVIRTUALSCREEN
        y = user32.GetSystemMetrics(77)   # SM_YVIRTUALSCREEN
        w = user32.GetSystemMetrics(78)   # SM_CXVIRTUALSCREEN
        h = user32.GetSystemMetrics(79)   # SM_CYVIRTUALSCREEN
        if w > 0 and h > 0:
            return x, y, w, h
    except Exception:
        pass
    return 0, 0, widget.winfo_screenwidth(), widget.winfo_screenheight()
