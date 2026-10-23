# Lingua — internal contract (FROZEN)

**Lingua** is a Windows desktop overlay that reads Microsoft Teams **live
captions** from a screen region, OCRs them, translates them, and shows the
translation in a floating, always-on-top window.

This file is the single source of truth shared by the `engine/` and `ui/`
builders. Do not change signatures here without updating both sides.

## Problem & approach (decided, evidence-based)

Teams has no public hook that hands a third-party app its live caption text.
So we **screen-read the caption strip**: grab the pixels of the Teams caption
area, OCR them, translate the text. Two-stage pipeline.

### Verified environment (measured 2026-10-23 on this machine)

- Python `3.13.2`, `tkinter`, `Pillow 12.2.0`, `requests` — all already
  installed. No `tesseract`, no system Node.
- MaaS API key discovery order:
  1. `MAAS_API_KEY`, then `GATEWAY_API_KEY` env vars;
  2. else `~/.config/opencode/opencode.json` → the `provider.*` entry whose
     `models` keys include a name starting with the gateway prefix →
     `options.apiKey`.
- **OCR** (measured ~0.4 s on the 640 px downscaled crop):
  `POST <OCR_BASE>/chat/completions`
  `Authorization: Bearer <key>`, body:
  ```json
  {"model": "deepseek-ai/DeepSeek-OCR-2",
   "messages": [{"role": "user", "content": [
     {"type": "text", "text": "<image>\nFree OCR."},
     {"type": "image_url", "image_url": {"url": "data:image/png;base64,<...>"}}]}]}
  ```
  Result text = `choices[0].message.content`.
- **Translate** (measured 0.3–0.9 s):
  `POST <LLM_BASE>/chat/completions`
  OpenAI-compatible chat, the configured model, with a system prompt:
  *"Real-time meeting interpreter. Translate into <TARGET>. Output ONLY the
  translation."*
- **Rejected:** a single one-shot vision call doing image→JSON took **19.3 s**.
  Too slow. Always use the two-stage path.
- Available LLM models are configured via `LINGUA_LLM_MODELS`.

## Layout

```
apps/lingua/
  app.py                 entry point: `python app.py [--selftest]`
  engine/                headless logic (no tkinter): import & test on its own
    __init__.py
    config.py            settings persistence + defaults
    maas.py              key discovery + MaasClient.ocr() / .translate()
    capture.py           screen-region grab + fast change-detection hash
    pipeline.py          PURE caption dedup / delta / caching state machine
  ui/                    tkinter only
    __init__.py
    theme.py             light/dark palettes (THEMES + get())
    window.py            single always-on-top window: controls + live transcript
    region.py            fullscreen drag-to-select region picker
  tests/
    __init__.py
    run_all.py           hermetic runner, exit 0/1
    test_pipeline.py     pure-logic tests (no network, no display)
    test_maas.py         mocked-HTTP tests (no network)
    test_capture.py      crop/hash tests on synthetic images (no display)
  scripts/run.ps1        launcher (sets PYTHONUTF8, runs app.py)
  README.md
  .gitignore
```

## Interfaces (do not change)

### engine/config.py

```python
APP_NAME = "lingua"

DEFAULTS: dict  # see keys below

def config_path() -> str: ...          # %APPDATA%/lingua/config.json
def load() -> dict: ...                # merged with DEFAULTS
def save(cfg: dict) -> None: ...
```

`DEFAULTS` keys: `region` (list `[x, y, w, h]` or `null`), `source_lang`
(str), `target_lang` (str), `poll_ms` (int, e.g. 900), `font_size` (int, 20),
`opacity` (float 0.55–1.0), `click_through` (bool, default False),
`overlay_xy` (`[x, y]` or `null`).

### engine/maas.py

```python
LLM_MODEL = os.environ.get("LINGUA_LLM_MODEL", "translate-default")
OCR_MODEL = "deepseek-ai/DeepSeek-OCR-2"
OCR_BASE = os.environ.get("LINGUA_OCR_BASE_URL", "https://gateway.example.com/ocr/v1")
LLM_BASE = os.environ.get("LINGUA_LLM_BASE_URL", "https://gateway.example.com/llm/v1")

# UI-facing language picker. Keys are what the UI shows; values are the
# exact phrase handed to the model.
LANGUAGES = {
    "Auto (detect)": None,            # source only: no source hint
    "English": "English",
    "繁體中文": "Traditional Chinese (繁體中文)",
    "Bahasa Indonesia": "Indonesian (Bahasa Indonesia)",
}

def discover_api_key() -> str | None: ...

class MaasClient:
    def __init__(self, api_key=None, *, ocr_base=OCR_BASE, llm_base=LLM_BASE,
                 ocr_model=OCR_MODEL, llm_model=LLM_MODEL, timeout=30): ...
    def ocr(self, image_bytes: bytes, mime: str = "image/png") -> str: ...
    def translate(self, text: str, target_lang: str,
                  source_lang: str | None = None, on_chunk=None) -> str: ...
```

Rules: never log/print `api_key`. `translate` must return a clean single
string (strip quotes/leading blank lines). When `on_chunk` is a callable the
gateway response is streamed (SSE) and `on_chunk(partial_text)` is called with
the growing translation as it arrives, so the UI can show partial text; the
full cleaned string is still returned at the end. Raise `MaasError` on
HTTP/parse failure — callers handle it.

### engine/capture.py

```python
class Region(NamedTuple):
    x: int; y: int; w: int; h: int

def grab(region: Region):            # returns PIL.Image.Image (RGB)
def change_hash(img) -> str:         # fast perceptual key: downscale to
                                     # e.g. 64px wide, grayscale, average-hash
                                     # -> hex string. Equal hash == "unchanged".

class RegionCapture:
    def __init__(self, region: Region, min_change: float = 0.0): ...
    def capture(self) -> tuple[object, bool]:
        # -> (PIL.Image, changed). `changed` is False when the perceptual
        #    hash matches the previous frame (so we can skip OCR+translate).
```

`grab`/`change_hash` must be importable and testable with a synthetic image
passed straight to `change_hash` (no display needed).

### engine/pipeline.py  (PURE — no network, no tkinter, fully unit-testable)

```python
@dataclass
class Line:
    speaker: str | None      # leading "Name" line if it looks like one, else None
    original: str
    translation: str
    live: bool               # True while this line is still growing

class CaptionPipeline:
    def __init__(self, translate_fn, cache=None, max_lines: int = 200): ...
    def update(self, raw_text: str, on_chunk=None) -> list[Line]:
        # Split raw_text into lines, normalise whitespace, drop OCR junk
        # (bare URLs / @handles / stray "<|...|>" tokens).
        # Diff against the previous frame: find the common prefix; new tail
        # lines are candidates. The LAST non-empty line is `live=True` and may
        # be re-translated as it grows; earlier new lines are committed once.
        # Translations come from `translate_fn(original) -> str`, memoised in
        # `cache` (dict) keyed by the exact original line, so identical lines
        # are never re-translated.
        # Returns the CURRENT window of lines (last `max_lines`) after update.
    def reset(self) -> None: ...
```

`translate_fn` is injected, takes `(original, on_chunk=None)`, and is called
with `on_chunk` only for the live (last) line so that line streams while
committed lines are plain cached calls. The app passes
`lambda s, on_chunk=None: client.translate(s, target, source, on_chunk=on_chunk)`.

### engine/pipeline.py — `Transcript`

`CaptionPipeline.update()` returns only the lines currently on screen, so a
scrolling caption strip drops old lines. `Transcript` accumulates across frames
(bounds the history to `max_lines`):

```python
class Transcript:
    def __init__(self, max_lines: int = 500): ...
    def add(self, frame_lines: list[Line]) -> list[Line]: ...  # -> full history so far
    def lines(self) -> list[Line]: ...
    def reset(self) -> None: ...
```

Each frame is aligned to the tail of the history via a common-overlap length;
only the new tail is appended, and the newest line stays `live` (replaced as it
grows) until a later line commits it.

### ui/*

- `ui/region.py`: `select_region() -> Region | None` — fullscreen,
  semi-transparent tk screen; user drags a rectangle; Esc cancels.
- `ui/theme.py`: `THEMES = {"dark": {...}, "light": {...}}` and `get(name)`.
- `ui/window.py`: `class LinguaWindow` — ONE always-on-top window holding both
  the controls (start/stop, region, clear, source/target, opacity, font,
  click-through) and the transcript, fed through `engine.pipeline.Transcript`.
  It owns the worker thread: `pipeline.update(text)` then the main thread
  drains `("lines", ...)` every 50 ms and commits to the Transcript. (The
  engine can stream via `on_chunk`, but the gateway buffers SSE so the app uses
  a plain call.) Click-through uses Win32
  `WS_EX_LAYERED|WS_EX_TRANSPARENT|WS_EX_NOACTIVATE`; the header is draggable.
- Threading: all capture+OCR+translate happen in ONE background worker thread;
  results are pushed to the UI through `queue.Queue` and drained by
  `root.after(poll_ms, ...)`. tkinter is touched ONLY on the main thread.

### app.py

```python
def main(argv): ...     # builds ControlPanel + Overlay; tk mainloop
# `--selftest`: headless checks (import all modules, discover key, OCR a
# generated caption image, translate a string, run pipeline over a synthetic
# sequence); print PASS/FAIL lines; exit 0/1. NO windows in selftest.
```

## Hard rules

- **No new pip dependencies.** Only `Pillow`, `requests`, and the stdlib.
- Never print, log, or persist the API key.
- Tests in `tests/` must be **hermetic**: no network, no real display.
  (`--selftest` in `app.py` is the ONLY place that may hit the network, and it
  must degrade gracefully to a clear FAIL if offline.)
- `PYTHONUTF8=1` is assumed; still call `sys.stdout.reconfigure(encoding="utf-8")`
  in `app.py`.
- Match the repo's house style: `apps/<name>/` + README, hermetic tests,
  `scripts/*.ps1` helpers.
