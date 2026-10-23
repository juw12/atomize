#!/usr/bin/env python3
"""
Desk Verdict - AI tool verdict API server
Zero-dependency Python stdlib only. Serves static files + JSON API.
"""

import argparse
import json
import os
import sqlite3
import threading
import urllib.parse
from datetime import datetime, timezone
from http.server import HTTPServer, SimpleHTTPRequestHandler
from pathlib import Path

LOCK = threading.Lock()
DB_PATH = None
WEB_ROOT = None

SCORECARD_CRITERIA = [
    {"key": "time_saved", "label": "Time saved on a real task"},
    {"key": "output_quality", "label": "Quality of output"},
    {"key": "ease_of_use", "label": "Ease for a non-technical person"},
    {"key": "cost_value", "label": "Cost vs. value"},
    {"key": "work_safety", "label": "Work-safety (data privacy & company-policy risk)"},
]
SCORECARD_VERDICTS = [
    {"key": "USE", "label": "Use it"},
    {"key": "WAIT", "label": "Wait"},
    {"key": "SKIP", "label": "Skip"},
]
VERDICT_THRESHOLDS = {"use": 4.0, "wait": 3.0}

SCORE_KEYS = ("time_saved", "output_quality", "ease_of_use", "cost_value", "work_safety")

RECORD_COLUMNS = (
    "id",
    "tool",
    "task",
    "category",
    "time_saved",
    "output_quality",
    "ease_of_use",
    "cost_value",
    "work_safety",
    "avg",
    "verdict",
    "time_with_min",
    "time_without_min",
    "one_right",
    "one_wrong",
    "use_it_for",
    "skip_it_for",
    "affiliate",
    "tested",
    "notes",
    "created_at",
)


def compute_verdict(scores: dict) -> tuple:
    """Pure function: scores -> (verdict, avg).

    Safety gate first: if work_safety <= 2 -> SKIP regardless of avg.
    Then by mean of 5 scores (rounded to 1 decimal):
        avg >= 4.0 -> USE
        avg >= 3.0 -> WAIT
        otherwise -> SKIP
    """
    avg = round(sum(scores[k] for k in SCORE_KEYS) / len(SCORE_KEYS), 1)
    if scores["work_safety"] <= 2:
        return ("SKIP", avg)
    if avg >= VERDICT_THRESHOLDS["use"]:
        return ("USE", avg)
    if avg >= VERDICT_THRESHOLDS["wait"]:
        return ("WAIT", avg)
    return ("SKIP", avg)


def get_db_path():
    return DB_PATH


def get_web_root():
    return WEB_ROOT


def init_db(db_path):
    conn = sqlite3.connect(db_path)
    cur = conn.cursor()
    cur.executescript(
        """
        CREATE TABLE IF NOT EXISTS verdicts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            tool TEXT NOT NULL,
            task TEXT NOT NULL,
            category TEXT NOT NULL,
            time_saved INTEGER NOT NULL,
            output_quality INTEGER NOT NULL,
            ease_of_use INTEGER NOT NULL,
            cost_value INTEGER NOT NULL,
            work_safety INTEGER NOT NULL,
            avg REAL NOT NULL,
            verdict TEXT NOT NULL,
            time_with_min INTEGER NOT NULL,
            time_without_min INTEGER NOT NULL,
            one_right TEXT NOT NULL,
            one_wrong TEXT NOT NULL,
            use_it_for TEXT NOT NULL,
            skip_it_for TEXT NOT NULL,
            affiliate INTEGER NOT NULL,
            tested TEXT NOT NULL,
            notes TEXT NOT NULL DEFAULT '',
            created_at TEXT NOT NULL
        );
        """
    )

    cur.execute("SELECT COUNT(*) FROM verdicts")
    count = cur.fetchone()[0]
    if count == 0:
        seed_records = [
            {
                "tool": "ChatGPT",
                "task": "Turn messy meeting notes into a follow-up email",
                "category": "admin",
                "scores": {
                    "time_saved": 5,
                    "output_quality": 4,
                    "ease_of_use": 5,
                    "cost_value": 3,
                    "work_safety": 4,
                },
                "time_with_min": 5,
                "time_without_min": 45,
                "one_right": "a clean, ready-to-send email in one pass",
                "one_wrong": "invented a deadline I never mentioned",
                "use_it_for": "meeting recaps and follow-up emails",
                "skip_it_for": "anything with legal or HR confidentiality",
                "affiliate": 0,
                "tested": "2026-10-23",
                "notes": "",
            },
            {
                "tool": "Claude Projects",
                "task": "Answer questions across a folder of project PDFs",
                "category": "project-management",
                "scores": {
                    "time_saved": 5,
                    "output_quality": 5,
                    "ease_of_use": 4,
                    "cost_value": 4,
                    "work_safety": 4,
                },
                "time_with_min": 10,
                "time_without_min": 60,
                "one_right": "grounded answers that cite the source",
                "one_wrong": "occasionally misses a document it should read",
                "use_it_for": "Q&A over your own project files",
                "skip_it_for": "live data it cannot see",
                "affiliate": 0,
                "tested": "2026-10-23",
                "notes": "",
            },
            {
                "tool": "Gemini in Google Sheets",
                "task": "Categorize a 200-row expense export",
                "category": "finance",
                "scores": {
                    "time_saved": 4,
                    "output_quality": 4,
                    "ease_of_use": 3,
                    "cost_value": 4,
                    "work_safety": 4,
                },
                "time_with_min": 15,
                "time_without_min": 90,
                "one_right": "did most of the categorizing",
                "one_wrong": "mislabeled roughly 10% of ambiguous vendors",
                "use_it_for": "first-pass cleanup of messy exports",
                "skip_it_for": "anything with account numbers you must not upload",
                "affiliate": 0,
                "tested": "2026-10-23",
                "notes": "",
            },
            {
                "tool": "Otter.ai",
                "task": "Live-transcribe a 30-minute client call",
                "category": "sales",
                "scores": {
                    "time_saved": 4,
                    "output_quality": 3,
                    "ease_of_use": 5,
                    "cost_value": 3,
                    "work_safety": 2,
                },
                "time_with_min": 30,
                "time_without_min": 120,
                "one_right": "accurate speaker labels",
                "one_wrong": "no obvious consent prompt, risky on external calls",
                "use_it_for": "internal calls you are allowed to record",
                "skip_it_for": "external calls without consent",
                "affiliate": 0,
                "tested": "2026-10-23",
                "notes": "",
            },
        ]

        now = datetime.now(timezone.utc).replace(microsecond=0).isoformat()
        for rec in seed_records:
            verdict, avg = compute_verdict(rec["scores"])
            cur.execute(
                """
                INSERT INTO verdicts (
                    tool, task, category,
                    time_saved, output_quality, ease_of_use, cost_value, work_safety,
                    avg, verdict,
                    time_with_min, time_without_min,
                    one_right, one_wrong,
                    use_it_for, skip_it_for,
                    affiliate, tested, notes, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    rec["tool"],
                    rec["task"],
                    rec["category"],
                    rec["scores"]["time_saved"],
                    rec["scores"]["output_quality"],
                    rec["scores"]["ease_of_use"],
                    rec["scores"]["cost_value"],
                    rec["scores"]["work_safety"],
                    avg,
                    verdict,
                    rec["time_with_min"],
                    rec["time_without_min"],
                    rec["one_right"],
                    rec["one_wrong"],
                    rec["use_it_for"],
                    rec["skip_it_for"],
                    rec["affiliate"],
                    rec["tested"],
                    rec["notes"],
                    now,
                ),
            )

    conn.commit()
    conn.close()


def record_to_dict(row):
    rec = dict(zip(RECORD_COLUMNS, row))
    scores = {
        "time_saved": rec.pop("time_saved"),
        "output_quality": rec.pop("output_quality"),
        "ease_of_use": rec.pop("ease_of_use"),
        "cost_value": rec.pop("cost_value"),
        "work_safety": rec.pop("work_safety"),
    }
    rec["scores"] = scores
    return rec


def fetch_verdicts(query_params):
    """Return list of records (newest first), applying filters."""
    q = (query_params.get("q", [None])[0] or "").strip().lower()
    verdict_filter = (query_params.get("verdict", [None])[0] or "").strip().upper()
    category_filter = (query_params.get("category", [None])[0] or "").strip().lower()

    where_clauses = []
    params = []
    if q:
        like = f"%{q}%"
        where_clauses.append(
            "(LOWER(tool) LIKE ? OR LOWER(task) LIKE ? OR LOWER(one_right) LIKE ?"
            " OR LOWER(one_wrong) LIKE ? OR LOWER(use_it_for) LIKE ?"
            " OR LOWER(skip_it_for) LIKE ? OR LOWER(notes) LIKE ?"
            " OR LOWER(category) LIKE ?)"
        )
        params.extend([like] * 8)
    if verdict_filter:
        where_clauses.append("verdict = ?")
        params.append(verdict_filter)
    if category_filter:
        where_clauses.append("LOWER(category) = ?")
        params.append(category_filter)

    sql = "SELECT " + ", ".join(RECORD_COLUMNS) + " FROM verdicts"
    if where_clauses:
        sql += " WHERE " + " AND ".join(where_clauses)
    sql += " ORDER BY id DESC"

    with LOCK:
        conn = sqlite3.connect(get_db_path())
        cur = conn.cursor()
        cur.execute(sql, params)
        rows = cur.fetchall()
        conn.close()

    return [record_to_dict(r) for r in rows]


class DVHandler(SimpleHTTPRequestHandler):
    def send_cors_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")

    def send_json(self, data, status=200):
        body = json.dumps(data).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.send_cors_headers()
        self.end_headers()
        self.wfile.write(body)

    def send_error_json(self, message, status=400):
        self.send_json({"error": message}, status)

    def _read_body(self):
        length = self.headers.get("Content-Length")
        if not length:
            return b""
        try:
            size = int(length)
        except (TypeError, ValueError):
            return b""
        if size <= 0:
            return b""
        return self.rfile.read(size)

    def _parse_post_body(self):
        """Return (ok, value_or_error_message). Malformed -> (False, 'malformed JSON body')."""
        raw = self._read_body()
        if not raw:
            return False, "malformed JSON body"
        try:
            data = json.loads(raw.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError):
            return False, "malformed JSON body"
        if not isinstance(data, dict):
            return False, "malformed JSON body"
        return True, data

    def do_OPTIONS(self):
        if self.path.startswith("/api/"):
            self.send_response(204)
            self.send_cors_headers()
            self.end_headers()
        else:
            self.send_response(404)
            self.end_headers()

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path
        query = urllib.parse.parse_qs(parsed.query)
        if path.startswith("/api/"):
            self.handle_api_get(path, query)
        else:
            self.handle_static(path)

    def do_POST(self):
        parsed = urllib.parse.urlparse(self.path)
        self.handle_api_post(parsed.path)

    def do_DELETE(self):
        parsed = urllib.parse.urlparse(self.path)
        self.handle_api_delete(parsed.path)

    def handle_api_get(self, path, query):
        if path == "/api/health":
            self.send_json(
                {"status": "ok", "app": "desk-verdict", "version": "1.0"}
            )
            return

        if path == "/api/scorecard":
            self.send_json(
                {
                    "criteria": SCORECARD_CRITERIA,
                    "verdicts": SCORECARD_VERDICTS,
                    "thresholds": dict(VERDICT_THRESHOLDS),
                }
            )
            return

        if path == "/api/verdicts":
            self.send_json(fetch_verdicts(query))
            return

        if path.startswith("/api/verdicts/"):
            rec_id_str = path[len("/api/verdicts/"):]
            try:
                rec_id = int(rec_id_str)
            except ValueError:
                self.send_error_json("Invalid ID", 400)
                return
            self._return_verdict(rec_id)
            return

        self.send_error_json("Not found", 404)

    def _return_verdict(self, rec_id):
        with LOCK:
            conn = sqlite3.connect(get_db_path())
            cur = conn.cursor()
            cur.execute(
                "SELECT " + ", ".join(RECORD_COLUMNS) + " FROM verdicts WHERE id = ?",
                (rec_id,),
            )
            row = cur.fetchone()
            conn.close()

        if not row:
            self.send_error_json(f"Verdict '{rec_id}' not found", 404)
            return
        self.send_json(record_to_dict(row))

    def handle_api_post(self, path):
        if path != "/api/verdicts":
            self.send_error_json("Not found", 404)
            return

        ok, payload = self._parse_post_body()
        if not ok:
            self.send_error_json(payload, 400)
            return

        try:
            tool = str(payload["tool"]).strip()
            task = str(payload["task"]).strip()
            category = str(payload["category"]).strip()
            scores_in = payload["scores"]
            assert isinstance(scores_in, dict)
            score_dict = {
                "time_saved": int(scores_in["time_saved"]),
                "output_quality": int(scores_in["output_quality"]),
                "ease_of_use": int(scores_in["ease_of_use"]),
                "cost_value": int(scores_in["cost_value"]),
                "work_safety": int(scores_in["work_safety"]),
            }
            time_with_min = int(payload["time_with_min"])
            time_without_min = int(payload["time_without_min"])
            one_right = str(payload["one_right"])
            one_wrong = str(payload["one_wrong"])
            use_it_for = str(payload["use_it_for"])
            skip_it_for = str(payload["skip_it_for"])
            affiliate = int(payload.get("affiliate", 0))
            tested = str(payload.get("tested", ""))
            notes = str(payload.get("notes", ""))
        except (KeyError, ValueError, TypeError, AssertionError):
            self.send_error_json("malformed JSON body", 400)
            return

        verdict, avg = compute_verdict(score_dict)
        now = datetime.now(timezone.utc).replace(microsecond=0).isoformat()

        with LOCK:
            conn = sqlite3.connect(get_db_path())
            cur = conn.cursor()
            cur.execute(
                """
                INSERT INTO verdicts (
                    tool, task, category,
                    time_saved, output_quality, ease_of_use, cost_value, work_safety,
                    avg, verdict,
                    time_with_min, time_without_min,
                    one_right, one_wrong,
                    use_it_for, skip_it_for,
                    affiliate, tested, notes, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    tool,
                    task,
                    category,
                    score_dict["time_saved"],
                    score_dict["output_quality"],
                    score_dict["ease_of_use"],
                    score_dict["cost_value"],
                    score_dict["work_safety"],
                    avg,
                    verdict,
                    time_with_min,
                    time_without_min,
                    one_right,
                    one_wrong,
                    use_it_for,
                    skip_it_for,
                    affiliate,
                    tested,
                    notes,
                    now,
                ),
            )
            new_id = cur.lastrowid
            conn.commit()
            conn.close()

        record = {
            "id": new_id,
            "tool": tool,
            "task": task,
            "category": category,
            "scores": score_dict,
            "avg": avg,
            "verdict": verdict,
            "time_with_min": time_with_min,
            "time_without_min": time_without_min,
            "one_right": one_right,
            "one_wrong": one_wrong,
            "use_it_for": use_it_for,
            "skip_it_for": skip_it_for,
            "affiliate": affiliate,
            "tested": tested,
            "notes": notes,
            "created_at": now,
        }
        self.send_json(record, status=201)

    def handle_api_delete(self, path):
        if not path.startswith("/api/verdicts/"):
            self.send_error_json("Not found", 404)
            return
        rec_id_str = path[len("/api/verdicts/"):]
        try:
            rec_id = int(rec_id_str)
        except ValueError:
            self.send_error_json("Invalid ID", 400)
            return

        with LOCK:
            conn = sqlite3.connect(get_db_path())
            cur = conn.cursor()
            cur.execute("DELETE FROM verdicts WHERE id = ?", (rec_id,))
            changes = cur.rowcount
            conn.commit()
            conn.close()

        if changes == 0:
            self.send_error_json(f"Verdict '{rec_id}' not found", 404)
            return
        self.send_json({"deleted": True}, status=200)

    def handle_static(self, path):
        if path.startswith("/data/"):
            self.send_error_json("Forbidden", 403)
            return
        if ".." in path:
            self.send_error_json("Forbidden", 403)
            return
        if path == "/":
            path = "/index.html"

        clean_path = path.lstrip("/")
        file_path = get_web_root() / clean_path
        if not file_path.exists() or not file_path.is_file():
            self.send_error_json("Not found", 404)
            return

        try:
            with open(file_path, "rb") as f:
                content = f.read()

            self.send_response(200)
            if path.endswith(".html"):
                self.send_header("Content-Type", "text/html; charset=utf-8")
            elif path.endswith(".css"):
                self.send_header("Content-Type", "text/css; charset=utf-8")
            elif path.endswith(".js"):
                self.send_header("Content-Type", "application/javascript")
            elif path.endswith(".jpg") or path.endswith(".jpeg"):
                self.send_header("Content-Type", "image/jpeg")
            elif path.endswith(".png"):
                self.send_header("Content-Type", "image/png")
            elif path.endswith(".svg"):
                self.send_header("Content-Type", "image/svg+xml")
            elif path.endswith(".ico"):
                self.send_header("Content-Type", "image/x-icon")
            elif path.endswith(".json"):
                self.send_header("Content-Type", "application/json")
            else:
                self.send_header("Content-Type", "application/octet-stream")
            self.send_header("Content-Length", str(len(content)))
            self.send_cors_headers()
            self.end_headers()
            self.wfile.write(content)
        except Exception as exc:
            self.send_error_json(str(exc), 500)

    def log_message(self, format, *args):
        pass


def main():
    global DB_PATH, WEB_ROOT

    parser = argparse.ArgumentParser(description="Desk Verdict API Server")
    parser.add_argument("--port", type=int, default=8790, help="Port to listen on")
    parser.add_argument("--host", default="127.0.0.1", help="Host to bind to")
    parser.add_argument(
        "--no-browser", action="store_true", help="Do not open browser"
    )
    args = parser.parse_args()

    script_dir = Path(__file__).parent.resolve()
    project_dir = script_dir.parent

    db_path_str = script_dir / "data" / "desk-verdict.db"
    DB_PATH = db_path_str.resolve()

    env_db = os.environ.get("DESK_VERDICT_DB")
    if env_db:
        DB_PATH = Path(env_db).resolve()

    WEB_ROOT = (project_dir / "web").resolve()

    if not DB_PATH.parent.exists():
        DB_PATH.parent.mkdir(parents=True, exist_ok=True)

    print(f"Database: {DB_PATH}")
    print(f"Web root: {WEB_ROOT}")

    if not DB_PATH.exists() or DB_PATH.stat().st_size == 0:
        print("Seeding database...")
        init_db(str(DB_PATH))
        print("Database seeded.")
    else:
        print("Database already exists.")

    server = HTTPServer((args.host, args.port), DVHandler)
    print(f"Server running at http://{args.host}:{args.port}")

    if not args.no_browser:
        try:
            import webbrowser

            webbrowser.open(f"http://{args.host}:{args.port}")
        except Exception:
            pass

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down...")
        server.shutdown()


if __name__ == "__main__":
    main()
