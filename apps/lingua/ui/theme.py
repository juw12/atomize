"""Lingua: light/dark theme palettes.

Provides two complete color themes with good contrast for a transcription app.
All palette keys are consistent across themes for easy swapping.
"""

from __future__ import annotations

THEMES = {
    "dark": {
        "bg": "#0b0e14",          # main window background
        "card": "#151a21",        # control card / panel background
        "edge": "#1b2530",        # borders, dividers
        "text": "#f3f7fb",        # primary text (transcript)
        "muted": "#8ba0b6",       # secondary/hint text
        "accent": "#7dd3fc",      # speaker labels, highlights
        "button": "#1a2330",      # button background
        "button_active": "#253244",  # button hover/active
        "track": "#38506b",       # slider trough
        "ok": "#7dd3fc",          # status OK (cyan)
        "warn": "#fbbf24",        # status warning (amber)
        "err": "#f87171",         # status error (red)
        "accent_fg": "#04202e",   # text on accent buttons
        "accent_hover": "#a5e4fd",  # accent button hover
        "banner": "#0f2a3d",      # update banner background
        "panel": "#11161d",       # collapsible settings panel
    },
    "light": {
        "bg": "#f8fafc",          # main window background
        "card": "#ffffff",        # control card / panel background
        "edge": "#e2e8f0",        # borders, dividers
        "text": "#1e293b",        # primary text (transcript)
        "muted": "#64748b",       # secondary/hint text
        "accent": "#0284c7",      # speaker labels, highlights (deep sky blue)
        "button": "#e2e8f0",      # button background
        "button_active": "#cbd5e1",  # button hover/active
        "track": "#94a3b8",       # slider trough
        "ok": "#0284c7",          # status OK
        "warn": "#d97706",        # status warning
        "err": "#dc2626",         # status error
        "accent_fg": "#ffffff",   # text on accent buttons
        "accent_hover": "#0369a1",  # accent button hover
        "banner": "#e0f2fe",      # update banner background
        "panel": "#f1f5f9",       # collapsible settings panel
    },
}


def get(name: str) -> dict:
    """Return a theme palette by name. Falls back to 'dark' if unknown."""
    return THEMES.get(name, THEMES["dark"])
