"""
Outlook Archiver Daemon
=======================

Subscribes to Outlook COM events and, for every new Inbox arrival and Sent
Items entry in the live mailbox:
  1. Logs full sender / subject / body to a rolling log file.
  2. Shows a Windows toast with the content.
  3. Marks Inbox items as read (auto-read).
  4. Moves the item from the live mailbox into the "Archives" PST
     (Outlook data file D:\\Outlook\\20261004.pst, display name "Archives"),
     specifically into that PST's Inbox / Sent Items folder. The live
     mailbox's Inbox and Sent Items views stay empty.

Run modes:
  - Foreground (testing):  double-click run_archiver.bat
  - Background (production): Windows Task Scheduler triggers run_archiver.bat
                            at user logon. See register_task.ps1.

Requires:
  - Outlook desktop signed in
  - Python 3.10+ with pywin32 and winotify
  - Outlook option "Save copies of messages in Sent Items folder" must be ON,
    otherwise the SentItem hook will not fire.
  - The "Archives" PST (D:\\Outlook\\20261004.pst) must be added to the
    Outlook profile and contain an "Inbox" and a "Sent Items" folder at its
    root (they will be auto-created if missing).

Stop:
  - Foreground: Ctrl+C
  - Background: Task Manager -> end python.exe, or
                Task Scheduler -> disable "Outlook Archiver" task.
"""

from __future__ import annotations

import logging
import os
import sys
import time
import traceback
from logging.handlers import RotatingFileHandler

import win32com.client
import pythoncom
import winotify
from winotify import Notification, audio

# ----------------------------- configuration -----------------------------

LOG_FILE = os.environ.get("OUTLOOK_ARCHIVER_LOG") or os.path.join(os.path.expanduser("~"), "outlook_archive.log")

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PIDFILE = os.path.join(SCRIPT_DIR, "daemon.pid")
STOP_FLAG = os.path.join(SCRIPT_DIR, "daemon.stop")

ARCHIVE_STORE_NAME = "20261020"
ARCHIVE_INBOX_NAME = "Inbox"
ARCHIVE_SENT_NAME = "Sent Items"

APP_ID = "Outlook Archiver"
TOAST_BODY_MAX = 320
LOG_BODY_MAX = 2000

OL_FOLDER_INBOX = 6
OL_FOLDER_SENT = 5

# Outlook-retry behavior at startup so a slow Outlook launch (e.g. just after
# laptop reboot) doesn't kill the daemon before it can subscribe to events.
OUTLOOK_CONNECT_TIMEOUT_S = 300
OUTLOOK_CONNECT_RETRY_S = 10

# ------------------------------- logging --------------------------------

logger = logging.getLogger("outlook_archiver")
logger.setLevel(logging.INFO)
# make idempotent if module re-imported
logger.handlers.clear()

_file_handler = RotatingFileHandler(
    LOG_FILE,
    maxBytes=2_000_000,
    backupCount=3,
    encoding="utf-8",
    errors="replace",
)
_file_handler.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(message)s"))
logger.addHandler(_file_handler)

_stderr_handler = logging.StreamHandler(sys.stderr)
_stderr_handler.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(message)s"))
logger.addHandler(_stderr_handler)

# prevent double-logging if root logger already has handlers
logger.propagate = False


# ----------------------------- helpers ----------------------------------

def _collapse_ws(s: str) -> str:
    return " ".join((s or "").split())


def _truncate(s: str, n: int) -> str:
    s = _collapse_ws(s)
    return s if len(s) <= n else s[: max(0, n - 1)] + "\u2026"


_suppress_toasts = False


def _toast(title: str, body: str) -> None:
    """Best-effort Windows toast. Failures are logged, never raised."""
    if _suppress_toasts:
        return
    try:
        n = Notification(
            app_id=APP_ID,
            title=title,
            msg=_truncate(body, TOAST_BODY_MAX),
            duration="short",
        )
        try:
            n.set_audio(audio.Default, loop=False)
        except Exception:
            pass
        n.show()
    except Exception:
        logger.warning("toast failed: %s", traceback.format_exc())


def _safe_body(item) -> str:
    for prop in ("Body", "HTMLBody"):
        try:
            value = getattr(item, prop, None)
            if value:
                return value if prop == "Body" else f"[html]\n{value}"
        except Exception:
            continue
    return ""


def _safe_sender(item) -> str:
    try:
        name = item.SenderName or ""
        addr = item.SenderEmailAddress or ""
        if name and addr:
            return f"{name} <{addr}>"
        return name or addr
    except Exception:
        return ""


def _safe_recipients(item) -> str:
    try:
        to = item.To or ""
        cc = item.CC or ""
        if cc:
            return f"To: {to} | Cc: {cc}"
        return f"To: {to}" if to else ""
    except Exception:
        return ""


def _archive_in_outlook(mail_item, target_folder, log_prefix: str) -> None:
    if log_prefix == "INBOX":
        try:
            mail_item.UnRead = False
            mail_item.Save()
        except Exception:
            logger.warning(
                "[%s] could not mark as read: %s", log_prefix, traceback.format_exc()
            )
    mail_item.Move(target_folder)
    logger.info(
        "[%s] moved to %r inside archive PST", log_prefix, target_folder.Name
    )


# --------------------------- handlers -----------------------------------

def handle_new_mail(entry_id: str) -> None:
    """Called on Application.OnNewMailEx."""
    namespace = outlook.GetNamespace("MAPI")
    try:
        item = namespace.GetItemFromID(entry_id)
    except Exception as exc:
        logger.warning("GetItemFromID failed for %r: %s", entry_id, exc)
        return
    if item is None:
        return
    try:
        if int(getattr(item, "Class", -1)) != 43:  # 43 == olMail
            return
    except Exception:
        return

    sender = _safe_sender(item)
    subject = (item.Subject or "(no subject)")
    received = getattr(item, "ReceivedTime", None)
    body = _safe_body(item)

    logger.info(
        "[INBOX] received=%s sender=%s subject=%r\n  body=%s",
        received,
        sender or "?",
        subject,
        _truncate(body, LOG_BODY_MAX),
    )
    _toast(
        f"\u2709 New mail: {sender or 'unknown sender'}",
        f"{subject}\n{_truncate(body, 400)}",
    )

    try:
        _archive_in_outlook(item, archive_inbox_folder, "INBOX")
    except Exception:
        logger.error("[INBOX] archive failed: %s", traceback.format_exc())


def handle_sent_add(entry_id) -> None:
    """Resolve a sent item by EntryID and archive it.

    Called on SentItems.Items.ItemAdd (passing item.EntryID) and from the
    startup sweep (passing EntryIDs collected via snapshot).
    """
    namespace = outlook.GetNamespace("MAPI")
    try:
        item = namespace.GetItemFromID(entry_id)
    except Exception as exc:
        logger.warning("GetItemFromID failed for %r: %s", entry_id, exc)
        return
    if item is None:
        return
    try:
        if int(getattr(item, "Class", -1)) != 43:
            return
    except Exception:
        return

    subject = getattr(item, "Subject", "") or "(no subject)"
    sent_to = _safe_recipients(item)
    sent_time = getattr(item, "SentOn", None)
    body = _safe_body(item)

    logger.info(
        "[SENT] sent=%s %s subject=%r\n  body=%s",
        sent_time,
        sent_to,
        subject,
        _truncate(body, LOG_BODY_MAX),
    )
    _toast(
        f"\u2709 Sent: {(item.To if getattr(item, 'To', None) else 'unknown recipient')}",
        f"{subject}\n{_truncate(body, 400)}",
    )

    try:
        _archive_in_outlook(item, archive_sent_folder, "SENT")
    except Exception:
        logger.error("[SENT] archive failed: %s", traceback.format_exc())


# ---------------------- COM event sink classes --------------------------

class InboxEvents:
    """Listens for Application.OnNewMailEx."""

    def OnNewMailEx(self, entry_id):  # noqa: N802 (Outlook naming)
        try:
            handle_new_mail(entry_id)
        except Exception:
            logger.error("OnNewMailEx crashed: %s", traceback.format_exc())


class SentItemsEvents:
    """Listens for Items.ItemAdd on the Sent Items folder."""

    def OnItemAdd(self, item):  # noqa: N802 (Outlook naming)
        try:
            handle_sent_add(item.EntryID)
        except Exception:
            logger.error("SentItemsEvents.OnItemAdd crashed: %s", traceback.format_exc())


# ----------------------------- bootstrap --------------------------------

outlook = None
inbox_folder = None
sent_folder = None
archive_inbox_folder = None
archive_sent_folder = None
_inbox_watcher = None
_sent_watcher = None


def _resolve_archive_root():
    """Find the Outlook store whose display name == ARCHIVE_STORE_NAME."""
    namespace = outlook.GetNamespace("MAPI")
    for store in namespace.Stores:
        try:
            if store.DisplayName == ARCHIVE_STORE_NAME:
                return store.GetRootFolder()
        except Exception:
            continue
    raise RuntimeError(
        f"archive PST with display name {ARCHIVE_STORE_NAME!r} not found in Outlook profile"
    )


def _get_or_create_child(parent, child_name):
    """Find a direct subfolder of `parent` named `child_name` (case-insensitive); create if missing."""
    for sub in parent.Folders:
        try:
            if str(sub.Name).lower() == child_name.lower():
                return sub
        except Exception:
            continue
    logger.info("creating missing %r folder in archive PST", child_name)
    return parent.Folders.Add(child_name)


def _connect():
    """(Re)connect to Outlook and grab live + archive folders."""
    global outlook, inbox_folder, sent_folder, archive_inbox_folder, archive_sent_folder
    pythoncom.CoInitialize()
    outlook = win32com.client.Dispatch("Outlook.Application")
    namespace = outlook.GetNamespace("MAPI")
    inbox_folder = namespace.GetDefaultFolder(OL_FOLDER_INBOX)
    sent_folder = namespace.GetDefaultFolder(OL_FOLDER_SENT)
    archive_root = _resolve_archive_root()
    archive_inbox_folder = _get_or_create_child(archive_root, ARCHIVE_INBOX_NAME)
    archive_sent_folder = _get_or_create_child(archive_root, ARCHIVE_SENT_NAME)
    logger.info(
        "connected. live_inbox=%s live_sent=%s archive_store=%r archive_inbox=%s archive_sent=%s",
        inbox_folder.Name,
        sent_folder.Name,
        ARCHIVE_STORE_NAME,
        archive_inbox_folder.Name,
        archive_sent_folder.Name,
    )


def _reset_globals():
    global outlook, inbox_folder, sent_folder, archive_inbox_folder, archive_sent_folder
    outlook = None
    inbox_folder = None
    sent_folder = None
    archive_inbox_folder = None
    archive_sent_folder = None


def _connect_with_retry():
    """Try _connect() repeatedly until Outlook is responsive or the timeout expires."""
    deadline = time.time() + OUTLOOK_CONNECT_TIMEOUT_S
    attempt = 0
    last_error = None
    while time.time() < deadline:
        attempt += 1
        try:
            _connect()
            if attempt > 1:
                logger.info("connected to Outlook after %d attempt(s)", attempt)
            return
        except Exception as exc:
            last_error = exc
            logger.warning(
                "Outlook not ready (attempt %d): %s; retrying in %ds",
                attempt,
                exc,
                OUTLOOK_CONNECT_RETRY_S,
            )
            _reset_globals()
            try:
                pythoncom.CoUninitialize()
            except Exception:
                pass
            time.sleep(OUTLOOK_CONNECT_RETRY_S)
    raise RuntimeError(
        f"could not connect to Outlook within {OUTLOOK_CONNECT_TIMEOUT_S}s: {last_error}"
    )


def _sweep_existing_on_startup():
    """Process items already in live Inbox/Sent when daemon starts.

    Every activation of the daemon (AtLogon trigger, toggle start, manual
    Start-ScheduledTask) sweeps pre-existing items into the archive PST.
    After this runs, the live mailbox is empty immediately, so the user
    never has to manually run sweep_existing.bat.

    Toasts are suppressed for the duration of the sweep so a large
    pre-existing mailbox doesn't flood the user with notifications; every
    item is still logged to the rolling log file.
    """
    global _suppress_toasts
    _suppress_toasts = True
    try:
        for source_folder, handler, label in (
            (inbox_folder, handle_new_mail, "INBOX"),
            (sent_folder, handle_sent_add, "SENT ITEMS"),
        ):
            eids = []
            for it in source_folder.Items:
                try:
                    eids.append(it.EntryID)
                except Exception:
                    pass
            n = len(eids)
            if n == 0:
                continue
            logger.info("startup sweep: processing %d existing %s item(s)", n, label)
            moved = 0
            for eid in eids:
                try:
                    handler(eid)
                    moved += 1
                except Exception as exc:
                    logger.error("startup sweep %s error: %s", label, exc)
            logger.info("startup sweep: %s done (%d/%d moved)", label, moved, n)
    finally:
        _suppress_toasts = False


def _write_pidfile():
    with open(PIDFILE, "w", encoding="utf-8") as f:
        f.write(str(os.getpid()))


def _remove_pidfile():
    try:
        os.remove(PIDFILE)
    except FileNotFoundError:
        pass
    except Exception as exc:
        logger.warning("could not remove pidfile %s: %s", PIDFILE, exc)


def _install_ctrl_c_suppressor():
    """Make the daemon ignore Ctrl+C / Ctrl+Break at both Python and OS levels.

    Two layers of suppression are needed:
      1. Python's internal SIGINT handler raises KeyboardInterrupt on Ctrl+C,
         which would exit the daemon even if the OS-level signal is ignored.
      2. Windows console ctrl events (Ctrl+Break) need a SetConsoleCtrlHandler
         that returns TRUE.

    Without both, Stop-Process -Force (used by the toggle's stop action)
    sends Ctrl-Break and Python raises KeyboardInterrupt, killing the
    daemon. With both, the daemon survives until something escalates to
    TerminateProcess (taskkill /F, Task Manager End Task, or the toggle's
    TerminateProcess fallback after its 10-sec graceful-stop timeout).

    To stop the daemon deliberately: taskkill /F, Task Manager End Task,
    or the toggle action (which writes daemon.stop, polls for exit, then
    escalates to TerminateProcess).
    """
    import signal
    try:
        signal.signal(signal.SIGINT, signal.SIG_IGN)
        logger.info("Python SIGINT ignored (Ctrl+C will not raise KeyboardInterrupt)")
    except Exception as exc:
        logger.warning("could not install Python SIG_IGN: %s", exc)

    try:
        import win32api
    except ImportError:
        logger.warning("win32api not available; Ctrl+Break suppression disabled")
        return
    def _handler(ctrl_type):
        logger.warning(
            "ignoring console ctrl event (type=%s); daemon continues",
            ctrl_type,
        )
        return True  # True = handled; default handler (kill) is skipped
    try:
        win32api.SetConsoleCtrlHandler(_handler, True)
        logger.info("Windows console ctrl handler installed (Ctrl+Break suppressed)")
    except Exception as exc:
        logger.warning("could not install console ctrl handler: %s", exc)


def main():
    logger.info("=" * 60)
    logger.info("outlook_archiver starting pid=%s log=%s", os.getpid(), LOG_FILE)
    _install_ctrl_c_suppressor()
    try:
        _connect_with_retry()
    except Exception as exc:
        logger.error("startup failed: %s", exc)
        return

    _sweep_existing_on_startup()

    try:
        # Wrap the Sent Items Items collection so ItemAdd fires when a sent mail lands.
        global _inbox_watcher, _sent_watcher
        _sent_watcher = win32com.client.DispatchWithEvents(
            sent_folder.Items, SentItemsEvents
        )
        # Hook the Application-level NewMailEx event for incoming mail.
        _inbox_watcher = win32com.client.DispatchWithEvents(
            "Outlook.Application", InboxEvents
        )
    except Exception as exc:
        logger.error("event subscription failed: %s", traceback.format_exc())
        return

    _write_pidfile()
    logger.info(
        "pidfile=%s  listening. stop with Ctrl+C (foreground) or end python.exe (background).",
        PIDFILE,
    )

    last_heartbeat = time.time()
    HEARTBEAT_INTERVAL_S = 300
    try:
        while True:
            if os.path.exists(STOP_FLAG):
                logger.info("stop flag detected; exiting cleanly")
                try:
                    os.remove(STOP_FLAG)
                except Exception:
                    pass
                break
            try:
                pythoncom.PumpWaitingMessages()
            except Exception as exc:
                logger.error("PumpWaitingMessages crashed: %s", traceback.format_exc())
                time.sleep(5)
            time.sleep(0.5)
            if time.time() - last_heartbeat >= HEARTBEAT_INTERVAL_S:
                logger.info("heartbeat: still alive")
                last_heartbeat = time.time()
    except KeyboardInterrupt:
        logger.info("interrupted, exiting")
    finally:
        _remove_pidfile()


if __name__ == "__main__":
    main()
