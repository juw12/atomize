"""One-shot sweep: process every existing item in live Inbox and Sent Items.

Drives the daemon's own handler functions so the behavior matches the
event-driven path exactly (auto-mark-as-read, log, Move to archive PST).

Why this exists
---------------
Outlook's COM events (OnNewMailEx, Items.ItemAdd) only fire for items
that arrive *after* the daemon subscribed. Anything already sitting in
the live Inbox or Sent Items at startup is invisible to it. Run this
script once (or whenever you want to clean up existing items) and every
pre-existing mail will be archived by the same code path the daemon uses.
"""
import importlib.util
import os
import sys

# Force UTF-8 on Windows consoles so subjects with CJK / accents print cleanly.
try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location(
    "oa", os.path.join(SCRIPT_DIR, "outlook_archiver.py")
)
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)

m._connect()
print(f"connected. archive_pst={m.ARCHIVE_STORE_NAME!r}")
m._suppress_toasts = True


def snapshot(folder):
    out = []
    for it in folder.Items:
        try:
            out.append((it.EntryID, it.Subject or "(no subject)"))
        except Exception as exc:
            print(f"  WARN: could not snapshot item: {exc}")
    return out


def process(label, items, handler):
    n = len(items)
    print(f"\n--- {label}: {n} item(s) ---")
    moved = 0
    for i, (eid, subj) in enumerate(items, 1):
        try:
            handler(eid)
            moved += 1
            print(f"  [{i}/{n}] OK: {subj[:80]!r}")
        except Exception as exc:
            print(f"  [{i}/{n}] FAIL: {subj[:60]!r}: {exc}")
    print(f"--- {label}: {moved}/{n} succeeded ---")
    return moved


inbox_items = snapshot(m.inbox_folder)
sent_items = snapshot(m.sent_folder)

inbox_moved = process("INBOX", inbox_items, m.handle_new_mail)
sent_moved = process("SENT ITEMS", sent_items, m.handle_sent_add)

m._suppress_toasts = False

print()
print(f"Summary: INBOX {inbox_moved}/{len(inbox_items)} moved, "
      f"SENT {sent_moved}/{len(sent_items)} moved.")
print("Done.")
