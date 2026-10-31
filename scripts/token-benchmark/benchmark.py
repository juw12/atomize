#!/usr/bin/env python3
"""Weekday LLM token benchmark for the PEGATRON MaaS gateway.

Sends a rotating suite of real, validated prompts (code, math, JSON,
summarization, sentiment, translation, code review, creative) until the
daily token target is reached, a request cap is hit, or the service
degrades. Weekdays only (Mon-Fri) unless --force is given.

Credential resolution (first hit wins) - nothing is hardcoded:
  1. env var PEGA_API_KEY
  2. .env file next to this script (PEGA_API_KEY=...)
  3. ~/.config/opencode/opencode.json -> provider.pegaai.options.{apiKey,baseURL}

Outputs:
  state.json            daily accumulator (auto-resets per calendar day)
  logs/bench_YYYYMMDD.csv  one row per request
"""

from __future__ import annotations

import argparse
import csv
import json
import random
import re
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime
from pathlib import Path

HERE = Path(__file__).resolve().parent
STATE_FILE = HERE / "state.json"
LOG_DIR = HERE / "logs"
CONFIG_FILE = HERE / "config.json"

DEFAULT_CONFIG = {
        "base_url": "https://aicc-gateway.pegatroncorp.com/pegaai/v1",
    "model": "Pega-Chat",
    "daily_target_tokens": 500000,
    "max_tokens_per_request": 2048,
    "delay_seconds": 1.0,
    "max_requests": 1500,
    "temperature": 0.3,
    "timeout_seconds": 180,
    "consecutive_hard_error_limit": 5,
}

SUMMARY_SOURCE = (
    "The quarterly review of the assembly line automation program closed on Friday. "
    "Overall yield improved from 94.2 percent to 96.8 percent after the new vision "
    "inspection cells were commissioned on lines 3 and 5. Cycle time on the torque "
    "station was reduced by eleven seconds through a firmware update that batched "
    "sensor reads. Two open risks remain: the conveyor on line 2 is still running "
    "on a temporary drive, and the spare-part buffer for the pick-and-place heads "
    "has not been replenished. The finance team will confirm the capex write-off "
    "next month, and the safety committee will re-audit the guarding in December."
)

SENTENCES = [
    ("The shipment arrived two days early and every unit passed inspection.", "positive"),
    ("The server crashed three times overnight and customer data was at risk.", "negative"),
    ("The meeting will be held in room 4B at three o'clock on Tuesday.", "neutral"),
    ("We are thrilled that the new battery pack exceeded every durability target.", "positive"),
    ("The vendor missed the delivery deadline for the fourth consecutive week.", "negative"),
    ("According to the schedule, the train departs from platform seven.", "neutral"),
]

BUGGY_SNIPPETS = [
    ("def total(prices):\n    s = 0\n    for p in prices:\n        s = s + p\n    return s + 1",
     "returns one too many"),
    ("def average(xs):\n    if len(xs) == 0:\n        return 0\n    return sum(xs) / len(xs) - 1",
     "subtracts one from the mean"),
    ("def first_even(xs):\n    for x in xs:\n        if x % 2 == 0:\n            continue\n    return None",
     "never returns the value it finds"),
]

TRANSLATE_SENTENCES = [
    "The new firmware reduces boot time by thirty percent.",
    "Please confirm the delivery window before Friday noon.",
    "The lighthouse keeper logged the fog signal in his journal every morning.",
    "Our warehouse robot now charges itself while idle.",
]


def load_config() -> dict:
    cfg = dict(DEFAULT_CONFIG)
    if CONFIG_FILE.exists():
        try:
            cfg.update(json.loads(CONFIG_FILE.read_text(encoding="utf-8")))
        except (json.JSONDecodeError, OSError) as exc:
            print(f"[warn] bad config.json ({exc}); using defaults")
    return cfg


def resolve_credential(cfg: dict) -> tuple[str, str]:
    """Return (api_key, base_url) without printing the key."""
    base = cfg["base_url"].rstrip("/")
    key = ""
    try:
        import os
        key = os.environ.get("PEGA_API_KEY", "")
        if not key and (HERE / ".env").exists():
            for line in (HERE / ".env").read_text(encoding="utf-8").splitlines():
                line = line.strip()
                if line.startswith("PEGA_API_KEY="):
                    key = line.split("=", 1)[1].strip().strip('"').strip("'")
                    break
    except OSError:
        pass
    if not key:
        opencode_cfg = Path.home() / ".config" / "opencode" / "opencode.json"
        if opencode_cfg.exists():
            try:
                data = json.loads(opencode_cfg.read_text(encoding="utf-8"))
                opts = data["provider"]["pegaai"]["options"]
                key = opts.get("apiKey", "")
                if opts.get("baseURL"):
                    base = opts["baseURL"].rstrip("/")
            except (json.JSONDecodeError, KeyError, TypeError) as exc:
                print(f"[warn] could not read opencode config ({exc})")
    if not key:
        sys.exit("[error] no API key found. Set PEGA_API_KEY env var or create .env")
    return key, base


# ---------------------------------------------------------------- prompt suite

def gen_math(rng: random.Random):
    a, b = rng.randint(11, 99), rng.randint(11, 99)
    prompt = f"What is {a} * {b}? Reply with only the number."
    def check(content: str):
        return str(a * b) in content, "exact product"
    return "math", prompt, check

def gen_ini_code(rng: random.Random):
    sections = {f"sec{i}": {f"key{j}": str(rng.randint(1, 999)) for j in range(rng.randint(2, 3))}
                for i in range(rng.randint(2, 4))}
    text = "\n".join(f"[{s}]\n" + "\n".join(f"{k}={v}" for k, v in kv.items())
                     for s, kv in sections.items())
    prompt = (f"Here is an INI text:\n{text}\n\n"
              "Write a Python function `parse_ini(text) -> dict` that returns "
              "{section: {key: value}} with values as strings. Only the code.")
    def check(content: str):
        ok = "def parse_ini" in content and "def " in content
        return ok, "function present"
    return "ini_code", prompt, check

def gen_json_person(rng: random.Random):
    name, city = rng.choice(["Ada", "Lin", "Marco", "Wei"]), rng.choice(["Taipei", "Berlin", "Austin"])
    age = rng.randint(18, 70)
    prompt = (f"Return a valid JSON object with exactly the keys name, age, city. "
              f"name={name!r}, age={age}, city={city!r}. No prose, no markdown.")
    def check(content: str):
        m = re.search(r"\{.*\}", content, re.S)
        if not m:
            return False, "no json object"
        try:
            obj = json.loads(m.group(0))
            ok = obj.get("name") == name and int(obj.get("age", -1)) == age and obj.get("city") == city
            return ok, "json fields match"
        except (json.JSONDecodeError, TypeError, ValueError):
            return False, "json parse failed"
    return "json_person", prompt, check

def gen_summary(rng: random.Random):
    prompt = f"Summarize the following in at most 40 words:\n\n{SUMMARY_SOURCE}"
    def check(content: str):
        words = len(content.split())
        return 8 <= words <= 60, f"{words} words"
    return "summary", prompt, check

def gen_sentiment(rng: random.Random):
    text, label = rng.choice(SENTENCES)
    prompt = (f"Classify the sentiment of this sentence as positive, negative, or neutral. "
              f"Reply with only the label.\n\n\"{text}\"")
    def check(content: str):
        low = content.lower()
        return label in low, f"expected {label}"
    return "sentiment", prompt, check

def gen_translate(rng: random.Random):
    text = rng.choice(TRANSLATE_SENTENCES)
    prompt = f"Translate to Traditional Chinese, one sentence only: \"{text}\""
    def check(content: str):
        stripped = content.strip()
        ok = len(stripped) >= 6 and not re.fullmatch(r"[ -~\n]+", stripped)
        return bool(ok), "non-trivial output"
    return "translate", prompt, check

def gen_code_review(rng: random.Random):
    code, hint = rng.choice(BUGGY_SNIPPETS)
    prompt = f"This Python function has one bug. Find it and give the corrected line.\n\n{code}"
    def check(content: str):
        return len(content.strip()) >= 15, "non-trivial answer"
    return "code_review", prompt, check

def gen_creative(rng: random.Random):
    day = rng.randint(1, 365)
    prompt = f"Write exactly five sentences about a lighthouse keeper on day {day}."
    def check(content: str):
        n = len([s for s in re.split(r"(?<=[.!?])\s+", content.strip()) if s])
        return 3 <= n <= 9, f"{n} sentences"
    return "creative", prompt, check

GENERATORS = [gen_math, gen_ini_code, gen_json_person, gen_summary,
              gen_sentiment, gen_translate, gen_code_review, gen_creative]


# ------------------------------------------------------------------ runner

def load_state() -> dict:
    today = datetime.now().date().isoformat()
    if STATE_FILE.exists():
        try:
            st = json.loads(STATE_FILE.read_text(encoding="utf-8"))
            if st.get("date") == today:
                return st
        except (json.JSONDecodeError, OSError):
            pass
    return {"date": today, "requests": 0, "prompt_tokens": 0, "completion_tokens": 0,
            "total_tokens": 0, "soft_pass": 0, "soft_fail": 0, "hard_errors": 0,
            "started_at": datetime.now().isoformat(timespec="seconds"),
            "updated_at": datetime.now().isoformat(timespec="seconds")}


def save_state(st: dict) -> None:
    st["updated_at"] = datetime.now().isoformat(timespec="seconds")
    STATE_FILE.write_text(json.dumps(st, indent=2), encoding="utf-8")


def _post_chat(url: str, key: str, payload: dict, timeout: float):
    """urllib POST. Returns (status_code, body_dict_or_str)."""
    req = urllib.request.Request(
        url, data=json.dumps(payload).encode("utf-8"), method="POST",
        headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.status, json.loads(r.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        try:
            body = e.read().decode("utf-8", "replace")[:200]
        except OSError:
            body = ""
        return e.code, body
    except (urllib.error.URLError, TimeoutError, OSError) as e:
        return -1, f"{type(e).__name__}: {str(e)[:160]}"


def one_request(url: str, key: str, model: str, prompt: str, cfg: dict) -> dict:
    """Returns dict(ok, content, usage, latency_ms, error, model_used)."""
    base_payload = {"messages": [{"role": "user", "content": prompt}],
                    "max_tokens": cfg["max_tokens_per_request"],
                    "temperature": cfg["temperature"]}
    last_err = ""
    for attempt in range(3):
        used_model = model
        if attempt == 1 and "/" not in model:
            used_model = f"pegaai/{model}"  # 404 fallback: try org/model form
        elif attempt == 2 and used_model.startswith("pegaai/"):
            used_model = model
        t0 = time.monotonic()
        status, data = _post_chat(url, key, {**base_payload, "model": used_model},
                                  cfg["timeout_seconds"])
        latency = (time.monotonic() - t0) * 1000
        if status == 404:
            last_err = "404 model not found"
            continue
        if status in (429, 500, 502, 503, 504) or status < 0:
            last_err = f"HTTP {status}" if status > 0 else str(data)
            time.sleep(5 * (attempt + 1))
            continue
        if status != 200:
            return {"ok": False, "error": f"HTTP {status}: {str(data)[:200]}"}
        content = (data.get("choices") or [{}])[0].get("message", {}).get("content", "")
        usage = data.get("usage") or {}
        if not content and not usage:
            return {"ok": False, "error": "empty response body"}
        est = 0
        if not usage.get("total_tokens"):
            est = len(prompt) // 4 + len(content) // 4
            usage = {"prompt_tokens": usage.get("prompt_tokens", len(prompt) // 4),
                     "completion_tokens": usage.get("completion_tokens", len(content) // 4),
                     "total_tokens": est}
        return {"ok": True, "content": content, "usage": usage,
                "latency_ms": latency, "error": "", "model_used": used_model,
                "estimated": bool(est)}
    return {"ok": False, "error": last_err, "latency_ms": 0.0}


def main() -> int:
    ap = argparse.ArgumentParser(description="Weekday MaaS token benchmark")
    ap.add_argument("--force", action="store_true", help="run even on weekends")
    ap.add_argument("--max-requests", type=int, default=None, help="override request cap for this run")
    ap.add_argument("--daily-target", type=int, default=None, help="override daily token target")
    ap.add_argument("--model", default=None)
    ap.add_argument("--dry-run", action="store_true", help="validate config/credential, send nothing")
    args = ap.parse_args()

    now = datetime.now()
    if now.weekday() >= 5 and not args.force:
        print(f"[skip] {now:%A} is a weekend; use --force to run anyway")
        return 0

    cfg = load_config()
    if args.model:
        cfg["model"] = args.model
    if args.daily_target:
        cfg["daily_target_tokens"] = args.daily_target
    cap = args.max_requests if args.max_requests is not None else cfg["max_requests"]

    key, base = resolve_credential(cfg)
    if args.dry_run:
        print(f"[dry-run] OK base={base} model={cfg['model']} "
              f"target={cfg['daily_target_tokens']} cap={cap}")
        return 0

    st = load_state()
    remaining = cfg["daily_target_tokens"] - st["total_tokens"]
    print(f"[start] {now:%Y-%m-%d %H:%M} already={st['total_tokens']:,} "
          f"target={cfg['daily_target_tokens']:,} remaining={remaining:,} "
          f"model={cfg['model']} cap={cap}")
    if remaining <= 0:
        print("[done] daily target already reached; nothing to do")
        save_state(st)
        return 0

    LOG_DIR.mkdir(exist_ok=True)
    csv_path = LOG_DIR / f"bench_{now:%Y%m%d}.csv"
    new_file = not csv_path.exists()
    csvf = csv_path.open("a", newline="", encoding="utf-8")
    w = csv.writer(csvf)
    if new_file:
        w.writerow(["ts", "prompt_id", "latency_ms", "prompt_tokens", "completion_tokens",
                    "total_tokens", "estimated", "hard_ok", "soft_pass", "note"])

    rng = random.Random()
    url = base + "/chat/completions"
    consec_hard = 0
    run_reqs = 0
    suite = list(GENERATORS)
    random.Random(now.toordinal()).shuffle(suite)  # stable order per day

    try:
        while st["total_tokens"] < cfg["daily_target_tokens"] and run_reqs < cap:
            gen = suite[run_reqs % len(suite)]
            pid, prompt, check = gen(rng)
            res = one_request(url, key, cfg["model"], prompt, cfg)
            run_reqs += 1
            if res["ok"]:
                consec_hard = 0
                soft, note = check(res["content"])
                u = res["usage"]
                st["requests"] += 1
                st["prompt_tokens"] += u["prompt_tokens"]
                st["completion_tokens"] += u["completion_tokens"]
                st["total_tokens"] += u["total_tokens"]
                st["soft_pass" if soft else "soft_fail"] += 1
                w.writerow([now.isoformat(timespec="seconds"), pid,
                            f"{res['latency_ms']:.0f}", u["prompt_tokens"],
                            u["completion_tokens"], u["total_tokens"],
                            "y" if res.get("estimated") else "n", "y",
                            "y" if soft else "n", note])
            else:
                consec_hard += 1
                st["requests"] += 1
                st["hard_errors"] += 1
                w.writerow([now.isoformat(timespec="seconds"), pid, "0", "0", "0", "0",
                            "n", "n", "n", res.get("error", "")[:180]])
                if consec_hard >= cfg["consecutive_hard_error_limit"]:
                    print(f"[abort] {consec_hard} consecutive hard errors; service degraded")
                    break
            save_state(st)
            csvf.flush()
            if res["ok"]:
                print(f"  [{run_reqs:4d}] {pid:<12} {res['usage']['total_tokens']:>6} tok "
                      f"(day {st['total_tokens']:,}/{cfg['daily_target_tokens']:,}) "
                      f"soft={'ok' if soft else 'FAIL'} {res['latency_ms'] / 1000:.1f}s")
            else:
                print(f"  [{run_reqs:4d}] {pid:<12} ERROR: {res.get('error', '')[:120]}")
            time.sleep(cfg["delay_seconds"])
    finally:
        csvf.close()
        save_state(st)

    rate = (st["soft_pass"] / max(1, st["soft_pass"] + st["soft_fail"])) * 100
    print(f"[done] day={st['date']} requests={st['requests']} tokens={st['total_tokens']:,} "
          f"({st['prompt_tokens']:,} in / {st['completion_tokens']:,} out) "
          f"soft-pass={rate:.1f}% hard-errors={st['hard_errors']}")
    print(f"[files] state={STATE_FILE}\n[files] log={csv_path}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
