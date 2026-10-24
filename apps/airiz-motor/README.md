# Airiz Motor Test Console

A complete, production-quality, dependency-free browser app that replaces the TeraTerm/CWD serial workflow for AIRIZ device motor testing.

## Features

- **Command Library**: Browse all diagnostic commands by category, with live parameter inputs
- **Serial Console**: Dark terminal with scrollback, log saving, and raw command input
- **Macro Notepad**: Visual step editor for creating and running test macros
- **PWA Support**: Installable app with offline caching via service worker
- **Demo Mode**: Test the full UI without hardware connected

## Files

```
apps/airiz-motor/web/
  index.html           # Main application page
  styles.css           # All styles (CSS custom properties, responsive)
  app.js               # Application logic (Web Serial, macro runner)
  manifest.webmanifest # PWA manifest
  sw.js                # Service worker (cache-first strategy)
  icons/
    app-icon.svg       # Application icon
  data/
    commands.js        # Command library (read-only)
    macros.js          # Macro definitions (read-only)
```

## Running the App

The Web Serial API only works in a **secure context** — `http://localhost` counts, `file://` does not. So the app must be *served*, not opened as a file. Use the bundled stdlib server (no dependencies, no build):

```bash
python server/serve.py                 # serve web/ on a free port and open the browser
python server/serve.py --port 8777     # pin the port
python server/serve.py --no-browser    # don't auto-open
```

It prints the URL (e.g. `http://127.0.0.1:8777/`). Open it in **Chrome or Edge** (the only browsers with Web Serial). Any other static server also works as long as it serves over `http://localhost` or `https://`.

> This app is intentionally **not** wired into the public GitHub Pages build
> (`scripts/build_site.py`) because it exposes internal device commands.

## Tests

```bash
python tests/test_command_data.py      # data integrity — stdlib only, exit 0/1
python tools/gen_docs.py               # regenerate docs/Commands.md from the data
```

`tests/test_command_data.py` asserts the command library still matches the source Excel (every documented command, the correct motor parameter ranges), that the three TeraTerm macros are preserved, and that the web shell stays sub-path safe and dependency-free.

## Usage

### Connecting to Hardware

1. Click **Connect** in the status bar
2. Select the FT232R USB-serial port
3. Choose baud rate (default: 115200)
4. Device prompt `~ #` should appear

### Demo Mode

If no hardware is available or Web Serial is unsupported:

1. Click **Demo Device** in the status bar
2. All UI features work with simulated responses

### Command Library

- Search commands by name or description
- Commands with parameters show live input controls
- Destructive commands (reboots) require confirmation
- Click **Send** to execute over serial

### Console

- **Clear**: Clear scrollback
- **Save Log**: Download timestamped `.txt` file
- **Autoscroll**: Toggle automatic scroll-to-bottom
- **Raw Input**: Type commands directly (Enter sends, CRLF appended)

### Macro Notepad

1. **Select** a built-in or user macro
2. **Adjust parameters** (speed, steps, pause duration)
3. **Edit steps** visually:
   - Add steps: Blank, Command, Wait, Pause, Note
   - Reorder: ↑ / ↓ buttons
   - Duplicate: ⧉ button
   - Delete: × button
   - Inline edit: Click text fields
4. **Set repeat count**
5. **Run** the macro

#### Macro Step Types

| Type | Description |
|------|-------------|
| `blank` | Send empty line (CRLF), wait for prompt |
| `command` | Send command text, wait for prompt |
| `wait` | Wait for pattern in output (with timeout) |
| `pause` | Wait fixed seconds |
| `note` | Log marker (not sent to device) |

#### Saving Macros

- **Save**: Update current user macro (built-ins prompt "Save As")
- **Save As…**: Create new user macro (stored in localStorage)
- **Delete**: Remove user macro (built-ins cannot be deleted)
- **Export .ttl**: Generate TeraTerm macro code

#### Running Macros

- **Run**: Execute macro steps in sequence
- **Pause**: Suspend execution (resumes with **Resume**)
- **Stop**: Cancel macro immediately
- Progress shows `Current Test Count = n` and `n / repeat`

## Technical Details

### Web Serial API

- `navigator.serial.requestPort()` for device selection
- `port.open({ baudRate, dataBits:8, stopBits:1, parity:'none', flowControl:'none' })`
- Read loop: `port.readable.getReader()` + `TextDecoder`
- Write: `port.writable.getWriter()` + `TextEncoder`
- Clean disconnect with try/catch for all operations

### Demo Device

Simulates device behavior:
- Echoes sent commands
- Returns expected responses from `commands.js`
- Appends `~ #` prompt after each command
- Supports macro `wait` pattern matching

### Storage

- User macros: `localStorage` key `airiz.macros.v1`
- Merged with built-in macros at runtime

### PWA

- **Manifest**: `display:standalone`, `start_url:./index.html`
- **Service Worker**: Cache-first strategy, network fallback
- **Installable**: Add to home screen / desktop

## Browser Support

- **Chrome/Edge**: Full support (Web Serial available)
- **Firefox**: Demo mode only (no Web Serial support)
- **Safari**: Demo mode only (no Web Serial support)

**Note**: Web Serial requires HTTPS or localhost (secure context).

## Command Data Source

- **Firmware version**: 0.0.0.9
- **Source**: the device command list → sheet *Command List*
- **Compiled**: 2026-06-12 (v1.2)

## Macro Data Source

- **Source files**: `test_motor.ttl`, `test_motor2 (no light).ttl`, `test_motor3 (1100).ttl`, `指令.txt`

## License

Part of the PEGAAi OpenCode project.
