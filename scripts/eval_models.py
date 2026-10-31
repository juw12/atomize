#!/usr/bin/env python3
"""Daily model eval suite for the MaaS Pega family.

Runs a FIXED set of scored tasks across the model list (fixed inputs =
comparable day-over-day trend). Writes:
  out/eval_YYYYMMDD.csv      one row per (task, model)
  out/eval_trend.jsonl       appends one line per run: {date, model, pass_rate}
  out/latest_summary.json    per-model pass/fail for the latest run

Stdlib only. Small default: 5 tasks x 3 models = 15 requests.
"""

from __future__ import annotations

import argparse
import csv
import json
import re
import subprocess
import sys
import tempfile
import time
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import maas_client  # noqa: E402

DEFAULT_MODELS = ["Pega-Coding", "Pega-Thinking", "Pega-Chat"]
OUT_DIR = Path(__file__).resolve().parent / "eval_out"


def t_code(content: str):
    if "def flatten" not in content:
        return False, "no flatten definition"
    code = content.split("```", 2)
    if len(code) >= 2:
        body = code[1]
    else:
        body = content
    body = re.sub(r"^python\s*", "", body.strip(), flags=re.IGNORECASE)
    wrapper = (
        "import sys\n"
        "def _check():\n"
        "    " + body.replace("\n", "\n    ") + "\n"
        "    r1 = flatten([1, [2, [3, 4]], 5])\n"
        "    r2 = flatten([])\n"
        "    sys.stdout.write(repr((r1, r2)))\n"
        "_check()\n"
    )
    try:
        with tempfile.NamedTemporaryFile("w", suffix=".py", delete=False, encoding="utf-8") as f:
            f.write(wrapper)
            path = f.name
        try:
            proc = subprocess.run(
                [sys.executable, path],
                capture_output=True, text=True, timeout=5, check=False,
            )
        finally:
            try:
                Path(path).unlink()
            except OSError:
                pass
        if proc.returncode != 0 or not proc.stdout.strip():
            return False, f"exec failed (rc={proc.returncode})"
        ok = proc.stdout.strip() == "([1, 2, 3, 4, 5], [])"
        return ok, "flatten([1,[2,[3,4]],5]) correct" if ok else f"got: {proc.stdout.strip()[:80]}"
    except subprocess.TimeoutExpired:
        return False, "exec timeout (5s)"
    except Exception as exc:
        return False, f"exec error: {type(exc).__name__}"


def t_math(content: str):
    return "208" in content, "expected 208 req/min"


def t_json(content: str):
    m = re.search(r"\{.*\}", content, re.S)
    if not m:
        return False, "no json object"
    try:
        obj = json.loads(m.group(0))
        ok = "name" in obj and "version" in obj and isinstance(obj.get("features"), list) \
            and len(obj["features"]) == 3
        return ok, "keys name/version/features[3]"
    except (json.JSONDecodeError, TypeError):
        return False, "json parse failed"


def t_zh(content: str):
    cjk = re.findall(r"[\u4e00-\u9fff]", content)
    return len(cjk) >= 6, f"{len(cjk)} CJK chars"


def t_reasoning(content: str):
    low = content.lower().strip()
    return low.startswith("maybe"), f"got: {content[:40]!r}"


TASKS = [
    ("code", [
        {"role": "user", "content":
         "Write a Python function `flatten(nested)` that takes a list which may "
         "contain arbitrarily nested lists and returns a flat list. Python 3, "
         "no imports. Output only the code."}], t_code),
    ("math", [
        {"role": "user", "content":
         "A server handled 1,248 requests in 6 minutes. What is the average "
         "number of requests per minute? Reply with only the number."}], t_math),
    ("json", [
        {"role": "user", "content":
         'Return a valid JSON object describing a temperature sensor with exactly '
         'the keys "name" (string), "version" (string) and "features" (list of '
         'exactly 3 strings). No prose, no markdown.'}], t_json),
    ("zh", [
        {"role": "user", "content":
         "Translate to Traditional Chinese, one sentence only: "
         "\"The build failed because of a missing dependency.\""}], t_zh),
    ("reasoning", [
        {"role": "user", "content":
         "All blobs are red. Some red things are soft. Must all blobs be soft? "
         "Answer with exactly one word: Yes, No, or Maybe."}], t_reasoning),
]


# ------------------------------------------------------------------ runner

def main() -> int:
    ap = argparse.ArgumentParser(description="MaaS model eval suite")
    ap.add_argument("--models", nargs="+", default=DEFAULT_MODELS)
    ap.add_argument("--tasks", nargs="+", default=[t[0] for t in TASKS],
                    help="subset of task ids")
    ap.add_argument("--max-tokens", type=int, default=1024)
    ap.add_argument("--delay", type=float, default=1.0, help="seconds between requests")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    wanted = [t for t in TASKS if t[0] in args.tasks]
    if not wanted:
        raise SystemExit(f"[error] no matching tasks (ids: {[t[0] for t in TASKS]})")

    if args.dry_run:
        print(f"[dry-run] OK tasks={[t[0] for t in wanted]} models={args.models}")
        return 0

    key, base = maas_client.resolve_credential()
    OUT_DIR.mkdir(exist_ok=True)
    day = datetime.now().strftime("%Y%m%d")
    csv_path = OUT_DIR / f"eval_{day}.csv"
    new = not csv_path.exists()
    rows, per_model = [], {}

    for model in args.models:
        for tid, messages, check in wanted:
            res = maas_client.chat(key, base, model, messages,
                                   max_tokens=args.max_tokens)
            if res["ok"]:
                passed, note = check(res["content"])
            else:
                passed, note = False, res["error"][:150]
            row = {"ts": datetime.now().isoformat(timespec="seconds"),
                   "task": tid, "model": model, "pass": "y" if passed else "n",
                   "latency_ms": f"{res.get('latency_ms', 0):.0f}",
                   "total_tokens": res.get("usage", {}).get("total_tokens", 0),
                   "note": note}
            rows.append(row)
            pm = per_model.setdefault(model, {"pass": 0, "fail": 0, "errors": 0, "total": 0})
            pm["total"] += 1
            if not res["ok"]:
                pm["errors"] += 1
            elif passed:
                pm["pass"] += 1
            else:
                pm["fail"] += 1
            print(f"  [{model:<15}] {tid:<10} {'PASS' if passed else 'FAIL':<4} "
                  f"{res.get('usage', {}).get('total_tokens', 0):>5} tok "
                  f"{res.get('latency_ms', 0) / 1000:5.1f}s  {note}")
            time.sleep(args.delay)

    with csv_path.open("a", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
        if new:
            w.writeheader()
        w.writerows(rows)

    summary = {"date": day, "models": {
        m: {**v, "pass_rate": round(v["pass"] / v["total"], 3)} for m, v in per_model.items()}}
    (OUT_DIR / "latest_summary.json").write_text(json.dumps(summary, indent=2), encoding="utf-8")
    with (OUT_DIR / "eval_trend.jsonl").open("a", encoding="utf-8") as f:
        for m, v in per_model.items():
            f.write(json.dumps({"date": day, "model": m,
                                "pass_rate": round(v["pass"] / v["total"], 3),
                                "errors": v.get("errors", 0)}) + "\n")

    print(f"\n[done] {len(rows)} evals -> {csv_path}")
    for m, v in per_model.items():
        print(f"  {m:<15} {v['pass']}/{v['total']} pass "
              f"({v['pass'] / v['total'] * 100:.0f}%), errors={v.get('errors', 0)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
