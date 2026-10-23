# Outlook Archiver

A small **Windows** daemon that keeps your live Outlook **Inbox** and **Sent
Items** clean by automatically archiving every message into a separate
*"Archives"* Outlook data file (PST) — while still logging each one and popping
a desktop toast so nothing is missed.

It subscribes to Outlook COM events and, for every new Inbox arrival and every
Sent Items entry, it:

1. Logs full sender / subject / body to a rolling log file.
2. Shows a Windows toast with the content.
3. Marks Inbox items as read (auto-read).
4. Moves the item from the live mailbox into the *Archives* PST (its Inbox /
   Sent Items folder). The live mailbox's Inbox and Sent Items views stay empty.

## Contents

| File | Purpose |
|------|---------|
| `outlook_archiver.py` | The daemon: COM event sinks, archive logic, logging, toasts. |
| `outlook_archiver_ctl.ps1` | Start / stop / toggle / status control script. |
| `register_task.ps1` | Registers a Windows Task Scheduler job (start at logon). |
| `watchdog.ps1` | Restarts the daemon if it dies. |
| `pin_to_taskbar.ps1` | Pins a launcher to the taskbar. |
| `run_archiver.bat` | Foreground launcher (for testing). |
| `start.bat` / `stop.bat` / `toggle.bat` / `restart.bat` | Convenience wrappers. |
| `sweep_existing.py` / `sweep_existing.bat` | One-shot sweep of items already in the live mailbox. |
| `reinstall.bat` | Reinstalls / refreshes the scheduled task. |
| `outlook_archiver.ico` | App / shortcut icon. |

## Requirements

- Windows 10/11 with **Outlook desktop** installed, signed in and running.
- Python 3.10+ with **`pywin32`** and **`winotify`**.
- An *"Archives"* PST added to your Outlook profile, containing an **Inbox** and
  a **Sent Items** folder at its root (they are created automatically if missing).
- Outlook option *"Save copies of messages in Sent Items folder"* must be **ON**,
  otherwise the Sent-Items hook will not fire.

## Configuration

The store name, folder names, log path and timing constants are defined at the
top of `outlook_archiver.py` (the `ARCHIVE_STORE_NAME`, `ARCHIVE_INBOX_NAME`,
`ARCHIVE_SENT_NAME` and `LOG_FILE` constants). Point these at your own profile /
PST before running.

## Usage

```powershell
# Foreground (testing) — double-click, or:
python outlook_archiver.py

# Background (production) — register the logon task once:
powershell -ExecutionPolicy Bypass -File register_task.ps1

# One-shot: archive everything already sitting in the live Inbox / Sent Items:
python sweep_existing.py
```

Stop it from the foreground with Ctrl+C, or from Task Manager / the control
script (`outlook_archiver_ctl.ps1`) when running in the background.

## License

Personal project — provided as-is.
