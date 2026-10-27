"""Read text aloud on Windows using the built-in System.Speech voices.

Runs PowerShell in the background (no extra packages, works offline). The text
is passed through an environment variable, never on the command line, so any
characters are safe. ``speak`` returns immediately; ``stop`` cancels.
On non-Windows systems ``available()`` is False and ``speak`` does nothing.
"""

from __future__ import annotations

import os
import re
import subprocess
import sys

_SCRIPT = (
    "Add-Type -AssemblyName System.Speech; "
    "$s = New-Object System.Speech.Synthesis.SpeechSynthesizer; "
    "$culture = $env:LINGUA_TTS_CULTURE; "
    "if ($culture) { "
    "  $v = $s.GetInstalledVoices() | Where-Object { $_.Enabled -and $_.VoiceInfo.Culture.Name -like ($culture + '*') } | Select-Object -First 1; "
    "  if ($v) { $s.SelectVoice($v.VoiceInfo.Name) } "
    "}; "
    "$s.Rate = 0; $s.Speak($env:LINGUA_TTS_TEXT)"
)

#: Script -> culture prefix, used to pick an installed voice when one exists.
_SCRIPT_CULTURES = [
    (re.compile(r"[\u3040-\u30ff]"), "ja"),
    (re.compile(r"[\uac00-\ud7af]"), "ko"),
    (re.compile(r"[\u0e00-\u0e7f]"), "th"),
    (re.compile(r"[\u0600-\u06ff]"), "ar"),
    (re.compile(r"[\u0900-\u097f]"), "hi"),
    (re.compile(r"[\u0400-\u04ff]"), "ru"),
    (re.compile(r"[\u4e00-\u9fff]"), "zh"),
]

_proc: subprocess.Popen | None = None


def available() -> bool:
    return sys.platform.startswith("win")


def guess_culture(text: str) -> str:
    for pattern, culture in _SCRIPT_CULTURES:
        if pattern.search(text or ""):
            return culture
    return "en"


def speaking() -> bool:
    return _proc is not None and _proc.poll() is None


def speak(text: str, culture: str | None = None) -> bool:
    """Start reading ``text`` aloud; returns False when not possible."""
    global _proc
    stop()
    if not available() or not (text or "").strip():
        return False
    env = dict(os.environ)
    env["LINGUA_TTS_TEXT"] = text[:20000]
    env["LINGUA_TTS_CULTURE"] = culture or guess_culture(text)
    try:
        _proc = subprocess.Popen(
            ["powershell", "-NoProfile", "-NonInteractive", "-Command", _SCRIPT],
            env=env,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
        )
    except OSError:
        _proc = None
        return False
    return True


def stop() -> None:
    global _proc
    if _proc is not None and _proc.poll() is None:
        _proc.terminate()
    _proc = None
