#!/usr/bin/env python3
"""Generate docs/Commands.md from web/data/commands.js and macros.js.

Run from the app root:  python tools/gen_docs.py
"""

import json
import re
import sys
from pathlib import Path

APP = Path(__file__).resolve().parent.parent
DATA = APP / "web" / "data"
OUT = APP / "docs" / "Commands.md"

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass


def tokenize(text):
    pieces, i, n = [], 0, len(text)
    while i < n:
        if text[i] in ('"', "'"):
            q, k = text[i], i + 1
            while k < n:
                if text[k] == "\\":
                    k += 2
                    continue
                if text[k] == q:
                    break
                k += 1
            pieces.append((True, text[i:k + 1]))
            i = k + 1
        else:
            k = i
            while k < n and text[k] not in ('"', "'"):
                k += 1
            pieces.append((False, text[i:k]))
            i = k
    return pieces


def load(path, varname):
    text = path.read_text(encoding="utf-8")
    anchor = re.search(rf"\b{re.escape(varname)}\s*=", text)
    start = text.index("{", anchor.end())
    depth, end = 0, start
    for i in range(start, len(text)):
        if text[i] == "{":
            depth += 1
        elif text[i] == "}":
            depth -= 1
            if depth == 0:
                end = i
                break
    strings, buf = {}, []
    for i, (is_str, piece) in enumerate(tokenize(text[start:end + 1])):
        if is_str:
            strings[i] = piece
            buf.append(f"\x00{i}\x00")
        else:
            buf.append(piece)
    s = "".join(buf)
    s = re.sub(r"/\*.*?\*/", "", s, flags=re.S)
    s = re.sub(r"//[^\n]*", "", s)
    s = re.sub(r"([{,]\s*)([A-Za-z_][A-Za-z0-9_]*)(\s*:)", r'\1"\2"\3', s)
    s = re.sub(r"\x00(\d+)\x00", lambda m: strings[int(m.group(1))], s)
    return json.loads(s)


def param_table(params):
    rows = ["| Param | Type | Range / options | Default | Hint |",
            "| --- | --- | --- | --- | --- |"]
    for p in params:
        if p["type"] == "sfx":
            rng = "built-in sound effect"
        elif p["type"] == "enum":
            rng = " · ".join(p.get("options", []))
        elif p["type"] == "text":
            rng = "text"
        elif p.get("min") is not None:
            rng = f"{p['min']} – {p['max']}"
        else:
            rng = "—"
        rows.append(f"| `{p['key']}` | {p['type']} | {rng} | `{p.get('default','')}` | {p.get('hint','')} |")
    return "\n".join(rows)


def main():
    cmds = load(DATA / "commands.js", "window.AIRIZ_COMMANDS")
    macros = load(DATA / "macros.js", "window.AIRIZ_MACROS")
    meta = cmds["meta"]

    L = []
    L.append("# Airiz diagnostic command reference")
    L.append("")
    L.append("Auto-generated from `web/data/commands.js` by `tools/gen_docs.py`. Do not edit by hand.")
    L.append("")
    L.append(f"- Firmware documented: **{meta['fwVersion']}**  ")
    L.append(f"- Source: {meta['source']} (sheet *Command List*)  ")
    L.append(f"- Compiled {meta['compiled']}")
    L.append("")
    L.append("> The device shell prompt is `~ #`. Commands are sent as a line terminated by CRLF.")
    L.append("")

    cats = {}
    for g in cmds["groups"]:
        cats.setdefault(g["category"], []).append(g)

    L.append("## Groups")
    L.append("")
    for cat in cats:
        names = ", ".join(g["item"] for g in cats[cat])
        L.append(f"- **{cat}** — {names}")
    L.append("")

    for cat in cats:
        L.append(f"## {cat}")
        L.append("")
        for g in cats[cat]:
            L.append(f"### {g['item']}")
            L.append("")
            if g.get("desc"):
                L.append(g["desc"])
                L.append("")
            for c in g["commands"]:
                L.append(f"**`{c['cmd']}`** — {c['label']}")
                L.append("")
                if c.get("params"):
                    L.append(param_table(c["params"]))
                    L.append("")
                if c.get("note"):
                    L.append(f"> {c['note']}")
                    L.append("")
                if c.get("destructive"):
                    L.append("> ⚠ Destructive — the device reboots.")
                    L.append("")

    L.append("## Macros")
    L.append("")
    L.append(f"Prompt pattern: `{macros['meta']['prompt']}`")
    L.append("")
    for m in macros["macros"]:
        L.append(f"### {m['name']}")
        L.append("")
        L.append(m["desc"])
        L.append("")
        L.append(f"- id: `{m['id']}`  ")
        L.append(f"- source: `{m['source']}`  ")
        L.append(f"- default repeat: {m['repeat']}  ")
        if m.get("params"):
            pairs = ", ".join("`{}`={}".format(p["key"], p["default"]) for p in m["params"])
            L.append(f"- params: {pairs}")
        L.append("")
        L.append("Steps:")
        L.append("")
        for s in m["steps"]:
            t = s["type"]
            if t == "command":
                L.append(f"- `command` — {s['text']}")
            elif t == "wait":
                L.append(f"- `wait` — for `{s['pattern']}` (≤ {s['timeout']} ms)")
            elif t == "pause":
                L.append(f"- `pause` — {s['seconds']} s")
            elif t == "note":
                L.append(f"- `note` — {s['text']}")
            else:
                L.append("- `blank`")
        L.append("")

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text("\n".join(L) + "\n", encoding="utf-8")
    print(f"wrote {OUT} ({len(L)} lines)")


if __name__ == "__main__":
    main()
