#!/usr/bin/env python3
"""Integrity checks for the Airiz Motor Test Console data + shell.

Stdlib only (matches the repo's test convention: exit 0 = pass, 1 = fail).

What it protects:
  * the command library still contains every command from
    the device command list (the source of truth),
  * the motor parameter ranges are the documented ones,
  * the three TeraTerm macros are preserved and every macro placeholder
    resolves to a declared parameter,
  * the web shell stays sub-path safe and dependency free
    (no absolute-root refs, no CDNs, no inline handlers).
"""

import json
import re
import sys
from pathlib import Path

# Keep output readable regardless of the Windows console code page.
try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

APP_DIR = Path(__file__).resolve().parent.parent
WEB_DIR = APP_DIR / "web"
DATA_DIR = WEB_DIR / "data"

FAILURES = []


def check(condition, message):
    if condition:
        print(f"  [ok]   {message}")
    else:
        print(f"  [FAIL] {message}")
        FAILURES.append(message)


# --------------------------------------------------------------------------
# A tolerant reader for our own "JS object literal" data files.
# We strip comments and quote bare keys, then hand the result to json.loads.
# --------------------------------------------------------------------------
def _tokenize(text):
    pieces = []
    i, n = 0, len(text)
    while i < n:
        ch = text[i]
        if ch in ('"', "'"):
            q = ch
            k = i + 1
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


def load_js_object(path, varname):
    text = path.read_text(encoding="utf-8")
    anchor = re.search(rf"\b{re.escape(varname)}\s*=", text)
    if not anchor:
        raise ValueError(f"{varname} not found in {path.name}")
    start = text.index("{", anchor.end())

    # take the balanced {...}
    depth, end = 0, start
    for idx in range(start, len(text)):
        if text[idx] == "{":
            depth += 1
        elif text[idx] == "}":
            depth -= 1
            if depth == 0:
                end = idx
                break
    literal = text[start:end + 1]

    strings = {}
    buf = []
    for i, (is_str, piece) in enumerate(_tokenize(literal)):
        if is_str:
            strings[i] = piece
            buf.append(f"\x00{i}\x00")
        else:
            buf.append(piece)
    s = "".join(buf)

    s = re.sub(r"/\*.*?\*/", "", s, flags=re.S)      # block comments
    s = re.sub(r"//[^\n]*", "", s)                    # line comments
    s = re.sub(r"([{,]\s*)([A-Za-z_][A-Za-z0-9_]*)(\s*:)", r'\1"\2"\3', s)  # quote keys
    s = re.sub(r"\x00(\d+)\x00", lambda m: strings[int(m.group(1))], s)     # restore strings
    return json.loads(s)


PLACEHOLDER = re.compile(r"\{([A-Za-z_][A-Za-z0-9_]*)\}")


def main():
    print("Airiz Motor Test Console — data integrity")
    print("=" * 52)

    commands = load_js_object(DATA_DIR / "commands.js", "window.AIRIZ_COMMANDS")
    macros = load_js_object(DATA_DIR / "macros.js", "window.AIRIZ_MACROS")

    # ---- command library vs the Excel ------------------------------------
    print("\n[ command library ]")
    check(commands["meta"]["fwVersion"] == "0.0.0.9",
          "documented FW version is 0.0.0.9")
    groups = commands["groups"]
    check(len(groups) == 21, f"21 command groups (got {len(groups)})")
    check(all(g.get("commands") for g in groups), "no empty groups")

    ids = [g["id"] for g in groups]
    check(len(ids) == len(set(ids)), "group ids are unique")

    templates = "\n".join(c["cmd"] for g in groups for c in g["commands"])
    expected = [
        "diag ver sw",
        "diag usbmode set uvc", "diag usbmode set cdc",
        "diag wifi connect {ssid} {password} mlan0",
        "diag ble on", "diag thread on",
        "diag audio init", "diag audio volume {level}",
        "diag audio play /audio/16K_16bit_Stereo_Loud.wav",
        "diag audio record -p -t {seconds} -v {level}",
        "diag spotled on", "diag spotled duty {duty}",
        "diag irled on", "diag irled duty {duty}",
        "diag led on", "diag led_r on", "diag led_g on", "diag led_b on",
        "diag ircut day", "diag ircut night",
        "diag als id", "diag als value",
        "diag nfc id", "diag acc id", "diag acc attr",
        "diag rled id", "diag rled report", "diag rled palette {r} {g} {b} {bNight} {bBriExtend}",
        "diag rled chasing {speed_ms} {color_r} {color_g} {color_b} {night_mode} {reversal}",
        "diag rled breathing {fSpeed} {fMinLevel} {fMaxLevel} {fade_rate} {eColor} {night_mode}",
        "diag zg23 check", "diag zg23 get fw_ver", "diag zg23 reset",
        "diag zg23 fw_recovery_mode", "diag zg23 otw {image}",
        "diag motor pan forward {x} {y}", "diag motor pan reverse {x} {y}",
        "diag motor rising forward {x} {y}", "diag motor rising reverse {x} {y}",
        "diag button get rising-det", "diag button get  sync-btn",
        "diag rftest on", "diag rftest wifi1", "diag rftest wifi2", "diag rftest off",
    ]
    missing = [c for c in expected if c not in templates]
    check(not missing, f"all {len(expected)} expected commands present"
          + ("" if not missing else f" — MISSING: {missing}"))

    # Commands the device answers with "unknown command" must stay out of the library.
    rejected = [
        "diag rled on",
        "diag rled start",
        "diag rled stop",
        "diag zg23 pc-controller start",
        "diag zg23 pc-controller stop",
    ]
    still_there = [c for c in rejected if c in templates]
    check(not still_there, "commands the device rejects are not offered"
          + ("" if not still_there else f" — still present: {still_there}"))

    # ---- parameter ranges -------------------------------------------------
    print("\n[ parameter ranges ]")
    by_id = {c["id"]: c for g in groups for c in g["commands"]}
    for cmd_id, key, lo, hi in [
        ("pan-fwd", "x", 1, 17), ("pan-rev", "x", 1, 17),
        ("rising-fwd", "x", 1, 30), ("rising-rev", "x", 1, 30),
    ]:
        p = next((p for p in by_id[cmd_id]["params"] if p["key"] == key), None)
        check(p is not None and p.get("min") == lo and p.get("max") == hi,
              f"{cmd_id}.{key} range is {lo}–{hi}")
    for cmd_id in ("pan-fwd", "pan-rev", "rising-fwd", "rising-rev"):
        p = next(p for p in by_id[cmd_id]["params"] if p["key"] == "y")
        check(p.get("max") == 99999, f"{cmd_id}.y max is 99999")

    # every command placeholder must resolve to a declared param
    bad = []
    for g in groups:
        for c in g["commands"]:
            declared = {p["key"] for p in c.get("params", [])}
            for ph in PLACEHOLDER.findall(c["cmd"]):
                if ph not in declared:
                    bad.append(f"{c['id']}:{{{ph}}}")
    check(not bad, "every command placeholder resolves to a declared param"
          + ("" if not bad else f" — {bad}"))

    # ---- macros -----------------------------------------------------------
    print("\n[ macros ]")
    macs = macros["macros"]
    check(len(macs) == 6, f"6 macros (got {len(macs)})")
    sources = {m.get("source") for m in macs}
    for ttl in ("test_motor.ttl", "test_motor2 (no light).ttl", "test_motor3 (1100).ttl"):
        check(ttl in sources, f"TeraTerm macro preserved: {ttl}")

    valid_types = {"blank", "command", "wait", "pause", "note"}
    ok_steps, bad_steps = True, []
    for m in macs:
        for s in m["steps"]:
            if s["type"] not in valid_types:
                ok_steps = False
                bad_steps.append(f"{m['id']}:{s['type']}")
    check(ok_steps, "all macro steps have a valid type"
          + ("" if ok_steps else f" — {bad_steps}"))

    bad_ph = []
    for m in macs:
        declared = {p["key"] for p in m.get("params", [])}
        for s in m["steps"]:
            if s["type"] == "command":
                for ph in PLACEHOLDER.findall(s["text"]):
                    if ph not in declared:
                        bad_ph.append(f"{m['id']}:{{{ph}}}")
    check(not bad_ph, "every macro placeholder resolves to a declared param"
          + ("" if not bad_ph else f" — {bad_ph}"))

    # the "with light" mode must still send the LED chasing command
    with_light = next(m for m in macs if m["id"] == "mode-with-light")
    check(any(s.get("text", "").startswith("diag rled chasing") for s in with_light["steps"]),
          "with-light mode sends 'diag rled chasing'")
    no_light = next(m for m in macs if m["id"] == "mode-no-light")
    check(not any(s.get("text", "").startswith("diag rled") for s in no_light["steps"]),
          "no-light mode sends no rled command")

    # ---- web shell safety -------------------------------------------------
    print("\n[ web shell ]")
    html = (WEB_DIR / "index.html").read_text(encoding="utf-8")
    order = [html.find("data/commands.js"), html.find("data/macros.js"), html.find("app.js")]
    check(all(i >= 0 for i in order) and order == sorted(order),
          "index.html loads commands.js → macros.js → app.js in order")

    web_files = [p for p in WEB_DIR.rglob("*") if p.suffix.lower() in (".html", ".js", ".webmanifest")]
    offenders = []
    for p in web_files:
        txt = p.read_text(encoding="utf-8")
        for ref in re.findall(r'(?:href|src)\s*=\s*(["\'])(.*?)\1', txt):
            r = ref[1]
            if r.startswith("/") or r.startswith("//") or re.match(r"^[a-z]+://", r):
                offenders.append(f"{p.name}: {r}")
        if re.search(r"onclick\s*=", txt):
            offenders.append(f"{p.name}: inline onclick")
        if re.search(r"(unpkg|jsdelivr|cdnjs|googleapis)", txt):
            offenders.append(f"{p.name}: external CDN reference")
    check(not offenders, "no absolute-root refs / CDNs / inline handlers"
          + ("" if not offenders else f" — {offenders}"))

    print("\n" + "=" * 52)
    if FAILURES:
        print(f"FAILED: {len(FAILURES)} check(s)")
        return 1
    print("PASSED: all data integrity checks")
    return 0


if __name__ == "__main__":
    sys.exit(main())
