Lingua for Windows
==================

Lingua translates live Teams captions and reads the words and letters in any picture.

Install
-------
1. Unzip this folder.
2. Make sure lingua.env sits next to Lingua.exe with your gateway settings
   (copy lingua.env.example to lingua.env and fill it in if it is missing).
3. Double-click "Install Lingua.cmd". Lingua is installed for you (no admin):
   %LOCALAPPDATA%\Programs\Lingua, Start menu + Desktop shortcut, and an entry
   in Settings -> Apps (uninstall from there). Then you can delete the zip.
   Windows SmartScreen may warn because the app is not code-signed:
   click "More info" -> "Run anyway".
   (Prefer portable? Just double-click Lingua.exe instead.)

Updates
-------
Lingua checks for a new version when it starts and every 4 hours while open.
Click the "Updates" button (top right) to check any time. When one is ready you see a
blue "Update" button: click it, then "Update now". Lingua downloads the new
version, restarts itself, and keeps your settings, history and lingua.env.
Check by hand any time: (i) button -> Check for updates.

Use
---
- Text: paste or type text and translate it, with tone, context, glossary,
  alternatives and word-choice notes.
- Read picture: open a photo/screenshot, paste (Ctrl+V) or grab a screen area.
  You get the text, a word/letter/line count, Copy, and optional translation.
- Share to phone: shows a QR code. Scan it with your iPhone or Android phone
  (same Wi-Fi) to read pictures with the phone camera. The API key stays on
  the laptop. iPhone: Share -> Add to Home Screen. Android: menu -> Add to Home screen.
  Windows may ask to allow Lingua through the firewall: allow it on private networks.
- Start / Select region: live Teams caption translation (as before).

Translation when the company models are down
---------------------------------------------
If the gateway translation models fail, Lingua translates on this laptop
instead: first with local AI if Ollama is installed (ollama pull qwen3:8b,
best quality), otherwise (offline language packs, ~70 MB per language pair). In the picture
window click "Get offline translation", or (i) -> Translation -> "Download
packs for my languages". The first translation after starting takes ~20 s,
then 2-3 s. Online services (Google/MyMemory) are OFF unless you tick
"Also allow online translation" there, because they send text outside the company.

The gateway must be reachable from this laptop (office network or VPN).
