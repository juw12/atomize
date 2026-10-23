# Lingua

Lingua floats a translated-caption window over Microsoft Teams. It reads the
live-caption strip off your screen, OCRs the text, and translates it as the
speaker talks, so a mixed-language meeting lands on your screen in your own
language.

> Teams talks. You read along, translated.

## Status

**v0.1** (new). The whole app is one two-stage pipeline: screen-read the
Teams caption strip, OCR it, translate it, show it. The two MaaS model calls
are verified on this machine (see "How it works"), and the headless path is
covered by `--selftest`.

## How it works

Teams has no public hook that hands a third-party app its live-caption text,
so Lingua does not ask Teams for anything. It **screen-reads the caption
strip**: it grabs the pixels of the region where Teams draws its captions,
OCRs them, and translates the resulting text. The pipeline is two separate
MaaS model calls, run back to back, with the crop **downscaled to 640 px wide**
before OCR (a smaller image is markedly faster):

1. **OCR** (measured ~0.4 s on the downscaled crop): `POST <OCR_BASE>/chat/completions`,
   model `deepseek-ai/DeepSeek-OCR-2`. The caption crop goes in as a base64
   `image_url`; the raw caption text comes back in `choices[0].message.content`.
2. **Translate** (measured 0.3 to 1.0 s): `POST <LLM_BASE>/chat/completions`,
   an OpenAI-compatible chat call to the configured model with a system prompt
   that says, in effect, "real-time meeting interpreter; translate into
   <TARGET>; output only the translation." A plain (non-streamed) call: the
   gateway buffers SSE responses, so streaming gained nothing and was dropped.

A single one-shot vision call that did image-to-translation in one request was
measured at **19.3 s** and rejected as far too slow for live captions. The
two-stage path is always used.

> `<OCR_BASE>`, `<LLM_BASE>` and the models are configured via environment
> variables (`LINGUA_OCR_BASE_URL`, `LINGUA_LLM_BASE_URL`, `LINGUA_LLM_MODEL`).

### Measured (2026-10-23, on this machine)

| step | model | latency |
| --- | --- | --- |
| OCR (640 px crop) | `deepseek-ai/DeepSeek-OCR-2` | ~0.4 s |
| OCR (full 1000 px) | `deepseek-ai/DeepSeek-OCR-2` | ~1.0 s |
| Translate | configured model | 0.3 to 0.9 s |
| Translate (alternative) | configured model | 0.7 to 4.3 s |
| Rejected one-call vision | one-shot vision model | 19.3 s (too slow) |

The translation model is pickable in the window (the **Model** dropdown, from
`LINGUA_LLM_MODELS`) and saved as `llm_model` in the config.

## What works today

- **Region capture**: pick the Teams caption strip once with a drag-a-
  rectangle picker, then Lingua grabs just that region on a fixed poll
  interval (default ~900 ms).
- **Change detection**: each frame is reduced to a small perceptual hash;
  when the hash matches the previous frame, Lingua skips OCR and translate
  entirely, so an idle caption strip costs nothing.
- **OCR + translate**: the two MaaS calls above, run on a background worker
  thread; the UI is never blocked.
- **Live-line handling**: the pipeline marks the last (still-growing) line as
  live so it can be re-translated as more words arrive, and memoises
  translations so an identical line is never sent to the model twice.
- **Running transcript**: a `Transcript` accumulator keeps every line seen, so
  lines that scroll off the Teams caption strip stay in the overlay. The card
  auto-scrolls to the newest line unless you have scrolled up to read back.
- **One window**: a single always-on-top window holds both the controls
  (start/stop, region, clear, source/target languages, translation model,
  opacity, font, click-through) and the live transcript, so there is nothing to
  Alt-Tab to.
- **Light / dark theme**: a toggle in the header switches the whole window, and
  the choice is saved.
- **Live transcript**: target language only (no source text), speaker name on
  its own line when detected, a scrollbar, and auto-scroll to the newest line
  unless you have scrolled up.
- **Status line**: reports the live OCR and translate latencies.
- **Languages**: source is Auto (detect), English, 繁體中文, and
  Bahasa Indonesia; target is the same list minus the auto option.

## API key & config

Lingua never stores its own key. It discovers the MaaS key in this order:

1. the `MAAS_API_KEY` env var, then `GATEWAY_API_KEY`;
2. else the gateway provider in `~\.config\opencode\opencode.json`: the
   `provider.*` entry whose `models` include a name starting with the gateway
   prefix (`LINGUA_GATEWAY_MODEL_PREFIX`), reading its `options.apiKey`.

The key is used only in the `Authorization: Bearer` header and is never
printed, logged, or written to disk.

All settings persist under `%APPDATA%\lingua\config.json` and are reloaded on
the next launch (region, source/target language, poll interval, OCR crop
width, translation model, font size, opacity, click-through, overlay
position).

## Coming

- Auto-finding the caption strip without a manual region pick.
- A small latency / status readout in the overlay itself, not just the
  control panel.

## Structure

```
apps/lingua/
  app.py             entry point: python app.py [--selftest]
  engine/            headless logic (no tkinter); import and test on its own
    config.py        settings persistence + defaults
    maas.py          key discovery + MaasClient.ocr() / .translate()
    capture.py       screen-region grab + fast change-detection hash
    pipeline.py      pure caption dedup/delta/cache + Transcript accumulator
  ui/                tkinter only
    window.py        single always-on-top window: controls + live transcript
    theme.py         light/dark palettes
    region.py        full-screen drag-to-select region picker
  tests/
    run_all.py       hermetic runner, exit 0/1
    test_pipeline.py pure-logic tests (no network, no display)
    test_maas.py     mocked-HTTP tests (no network)
    test_capture.py  crop/hash tests on synthetic images (no display)
  scripts/run.ps1    launcher (sets the UTF-8 env, runs app.py)
  README.md
```

## Run

This is a native desktop app (Python + tkinter), not a web build. The machine
already has Python 3.13.2, tkinter, Pillow, and requests; there is no
tesseract and no system Node, and none is needed.

```powershell
python apps\lingua\app.py
```

Or use the launcher, which sets the UTF-8 environment and forwards any
arguments:

```powershell
powershell -File apps\lingua\scripts\run.ps1
```

### Self-test

`--selftest` runs the headless checks: import every module, discover the API
key, OCR a generated caption image, translate a string, and run the pipeline
over a synthetic caption sequence. It prints PASS/FAIL lines, exits 0/1, and
opens no windows. It is the only path that may hit the network, and it
degrades to a clear FAIL if you are offline.

```powershell
python apps\lingua\app.py --selftest
```

## Test

The test suite is hermetic (no network, no real display): pure pipeline
logic, mocked HTTP, and crop/hash checks on synthetic images.

```powershell
python apps\lingua\tests\run_all.py
```

Exits `0` on pass, `1` on fail.

## Note on monorepo conventions

Unlike the other `apps/*` (zero-dependency static PWAs), Lingua is a
**native desktop app** (Python + tkinter) and, like Hazel, is an exception to
the static-first rule. It keeps the repo's spirit where it can: no server, no
build step, hermetic tests, and a `scripts/*.ps1` helper. It pulls in exactly
two third-party packages, both already installed (Pillow and requests), so
there is nothing to `pip install`.
