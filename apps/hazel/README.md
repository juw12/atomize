# Hazel

A desktop studio for creators: film the messy take once, Hazel auto-cuts the
silences and pauses (and, coming soon, the "ums" and retakes), then fans one
clip out to every platform and shows you what pulled traffic.

> Film once. Post everywhere. Learn what works.

## Status

**v0.2** — the full loop works end to end: import → auto-cut → repurpose →
publish → traffic → storage. Retake removal and the API posting path are next.

## What works today

- **Import** a video (native file picker) and read its metadata via `ffprobe`.
- **Auto-cut** silences / long pauses with `ffmpeg`'s `silencedetect`, tunable pause threshold.
- **Filler words** — `um`/`uh`/... via Whisper word timestamps (faster-whisper),
  installed in a local `.venv`; runs fully offline once the model is present
  (`scripts/fetch-model.ps1`).
- **Preview** the clip and review the **detected-cut list** (silence + filler).
- **Export** the clean cut to `~/Videos/Hazel/<name>-hazel.mp4`.
- **Repurpose** — one edit → 9:16 / 1:1 / 16:9 with platform **safe-zones**
  (vertical/square use a blurred-pad framing that keeps the subject clear of UI).
- **Publish (manual-first)** — pick a platform, write a caption, get a publish
  **package** (right format + `caption.txt` + `README.txt`) and a one-tap deep
  link to the platform's uploader. No API keys, no app review needed.
- **Queue** — line up posts locally (persisted in the app's userData).
- **Traffic** — import a platform CSV export and see one unified view: totals,
  per-platform split, and your top performers.
- **Storage** — scan a folder for usage, find duplicate raws, archive them, and
  optionally auto-archive the raw after each export.

## Coming

- Retake / false-start removal.
- A generated first draft for captions/hashtags (currently you type them).
- Publish *auto path* — direct posting via a platform-approval aggregator
  (Ayrshare/Blotato), accepting X's per-post billing.
- Traffic API read-back (replacing manual CSV import).

## Structure

```
apps/hazel/
  electron/   main process + preload (IPC bridge)
  engine/     auto-cut · transcribe · repurpose · publish · analytics · storage
  src/        renderer (HTML/CSS/JS — no build step)
  scripts/    fetch-model.ps1 (Whisper model downloader)
  tests/      hermetic end-to-end engine tests (5 suites)
```

## Run

This machine has **no system Node.js or ffmpeg**; Hazel uses the portable
Node.js and bundles ffmpeg, so it runs anywhere.

```powershell
$pn="~\.config\opencode\skills\portable-nodejs\bin\node-v24.14.1-win-x64"
$env:PATH="$pn;$env:PATH"
npm install        # electron + ffmpeg-static + ffprobe-static
npm start
```

### If Electron's binary is missing

The corporate proxy blocks Electron's own postinstall download. If
`node_modules\electron\dist\electron.exe` is absent, fetch it with
`Invoke-WebRequest` (which uses the working system proxy):

```powershell
$ver = (Get-Content node_modules\electron\package.json | ConvertFrom-Json).version
$url = "https://github.com/electron/electron/releases/download/v$ver/electron-v$ver-win32-x64.zip"
Invoke-WebRequest $url -OutFile "$env:TEMP\electron.zip"
Expand-Archive "$env:TEMP\electron.zip" node_modules\electron\dist -Force
Set-Content node_modules\electron\path.txt "electron.exe" -NoNewline
```

## Test

```powershell
node tests/verify_autocut.js
```

Generates a clip with a known silent gap, checks the segment math and verifies
detection + render. Exits `0` on pass, `1` on fail.

## Note on monorepo conventions

Unlike the other `apps/*` (zero-dependency static PWAs), Hazel is a **native
desktop app** and necessarily depends on npm packages (Electron + a bundled
ffmpeg). It keeps the repo's spirit where it can: **local-first**, no servers,
and no build step for the renderer.
