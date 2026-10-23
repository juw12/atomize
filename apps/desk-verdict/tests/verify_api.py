#!/usr/bin/env python3
"""
Hermetic API verification test for Desk Verdict server.
Spins up the server with a temp DB and a free port, exercises every endpoint,
then shuts it down. Exit 0 if all checks pass, 1 if any fail.
"""

import json
import os
import socket
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request
from pathlib import Path


def find_free_port():
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(("127.0.0.1", 0))
        s.listen(1)
        port = s.getsockname()[1]
    return port


def wait_for_server(host, port, timeout=20):
    start = time.time()
    while time.time() - start < timeout:
        try:
            with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
                s.connect((host, port))
                return True
        except ConnectionRefusedError:
            time.sleep(0.25)
    return False


def make_request(url, method="GET", data=None, raw_body=None, headers=None, timeout=10):
    hdrs = dict(headers or {})
    body = None
    if raw_body is not None:
        body = raw_body
    elif data is not None:
        body = json.dumps(data).encode("utf-8")
        hdrs.setdefault("Content-Type", "application/json")
    req = urllib.request.Request(url, data=body, headers=hdrs, method=method)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return resp.status, dict(resp.headers), resp.read().decode("utf-8")
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8") if exc.fp else ""
        return exc.code, dict(exc.headers), body
    except Exception as exc:
        return None, {}, str(exc)


def main():
    script_dir = Path(__file__).parent.resolve()
    project_dir = script_dir.parent
    server_script = project_dir / "server" / "server.py"

    if not server_script.exists():
        print("FAIL: server.py not found")
        sys.exit(1)

    all_pass = True

    def check(cond, label):
        nonlocal all_pass
        if cond:
            print(f"OK: {label}")
        else:
            print(f"FAIL: {label}")
            all_pass = False

    with tempfile.TemporaryDirectory() as tmpdir:
        tmp_db = Path(tmpdir) / "desk-verdict-test.db"
        port = find_free_port()
        host = "127.0.0.1"

        env = os.environ.copy()
        env["DESK_VERDICT_DB"] = str(tmp_db)
        env["PYTHONUNBUFFERED"] = "1"

        proc = subprocess.Popen(
            [
                sys.executable,
                str(server_script),
                "--port",
                str(port),
                "--host",
                host,
                "--no-browser",
            ],
            env=env,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
        )

        try:
            if not wait_for_server(host, port):
                print("FAIL: Server did not start in time")
                try:
                    out, _ = proc.communicate(timeout=5)
                    print(out.decode("utf-8", "replace"))
                except Exception:
                    pass
                proc.terminate()
                proc.wait()
                sys.exit(1)

            base_url = f"http://{host}:{port}"

            # 1. health
            status, headers, body = make_request(f"{base_url}/api/health")
            if status == 200:
                data = json.loads(body)
                check(
                    data.get("status") == "ok" and data.get("app") == "desk-verdict",
                    "GET /api/health",
                )
                check(data.get("version") == "1.0", "GET /api/health.version == 1.0")
            else:
                check(False, f"GET /api/health - status {status}")

            # 2. scorecard shape
            status, _, body = make_request(f"{base_url}/api/scorecard")
            if status == 200:
                sc = json.loads(body)
                criteria = sc.get("criteria", [])
                verdicts = sc.get("verdicts", [])
                thresholds = sc.get("thresholds", {})
                check(
                    isinstance(criteria, list) and len(criteria) == 5,
                    "scorecard has 5 criteria",
                )
                keys = [c.get("key") for c in criteria]
                check(
                    set(keys) == {
                        "time_saved",
                        "output_quality",
                        "ease_of_use",
                        "cost_value",
                        "work_safety",
                    },
                    "scorecard criteria keys are correct",
                )
                for c in criteria:
                    check(
                        isinstance(c.get("label"), str) and len(c["label"]) > 0,
                        f"scorecard criterion {c.get('key')} has label",
                    )
                check(
                    len(verdicts) == 3
                    and verdicts[0].get("key") == "USE"
                    and verdicts[1].get("key") == "WAIT"
                    and verdicts[2].get("key") == "SKIP",
                    "scorecard verdicts are USE/WAIT/SKIP",
                )
                check(
                    thresholds.get("use") == 4.0 and thresholds.get("wait") == 3.0,
                    "scorecard thresholds are use=4.0 wait=3.0",
                )
            else:
                check(False, f"GET /api/scorecard - status {status}")

            # 3. seed produced 4 records
            status, _, body = make_request(f"{base_url}/api/verdicts")
            check(status == 200, "GET /api/verdicts - 200")
            seeded = json.loads(body) if status == 200 else []
            check(
                isinstance(seeded, list) and len(seeded) == 4,
                f"seed produced 4 records (got {len(seeded) if isinstance(seeded, list) else 'n/a'})",
            )
            if isinstance(seeded, list) and len(seeded) >= 4:
                expected_verdicts = ["SKIP", "WAIT", "USE", "USE"]
                actual = [r.get("verdict") for r in seeded[:4]]
                check(
                    actual == expected_verdicts,
                    f"seed verdicts in newest-first order: {actual}",
                )

            # 4. POST a USE case
            use_payload = {
                "tool": "Test USE tool",
                "task": "Test task for USE",
                "category": "testing",
                "scores": {
                    "time_saved": 5,
                    "output_quality": 4,
                    "ease_of_use": 5,
                    "cost_value": 4,
                    "work_safety": 4,
                },
                "time_with_min": 5,
                "time_without_min": 30,
                "one_right": "fast",
                "one_wrong": "none",
                "use_it_for": "everything",
                "skip_it_for": "nothing",
                "affiliate": 0,
                "tested": "2026-10-23",
                "notes": "test USE",
            }
            status, _, body = make_request(
                f"{base_url}/api/verdicts", method="POST", data=use_payload
            )
            check(status == 201, f"POST /api/verdicts (USE) - 201 (got {status})")
            created = json.loads(body) if status == 201 else {}
            use_id = created.get("id")
            check(
                created.get("verdict") == "USE",
                f"POST USE case -> verdict==USE (got {created.get('verdict')})",
            )
            check(
                created.get("avg") == 4.4,
                f"POST USE case -> avg==4.4 (got {created.get('avg')})",
            )
            check(
                isinstance(use_id, int) and use_id > 0,
                f"POST USE case -> id is positive int (got {use_id})",
            )
            # server must ignore client-sent avg/verdict
            check(
                "avg" not in use_payload and "verdict" not in use_payload,
                "POST payload did not include client-sent avg/verdict",
            )

            # 5. POST work_safety=1 -> SKIP (safety gate)
            unsafe_payload = {
                "tool": "Risky tool",
                "task": "Test safety gate",
                "category": "testing",
                "scores": {
                    "time_saved": 5,
                    "output_quality": 5,
                    "ease_of_use": 5,
                    "cost_value": 5,
                    "work_safety": 1,
                },
                "time_with_min": 1,
                "time_without_min": 60,
                "one_right": "very accurate",
                "one_wrong": "leaks everything",
                "use_it_for": "nothing",
                "skip_it_for": "everything confidential",
                "affiliate": 0,
                "tested": "2026-10-23",
                "notes": "",
            }
            status, _, body = make_request(
                f"{base_url}/api/verdicts", method="POST", data=unsafe_payload
            )
            unsafe_created = json.loads(body) if status == 201 else {}
            check(status == 201, "POST work_safety=1 - 201")
            check(
                unsafe_created.get("verdict") == "SKIP",
                f"POST work_safety=1 -> verdict==SKIP (got {unsafe_created.get('verdict')})",
            )

            # 6. POST WAIT boundary (avg exactly 3.0)
            wait_payload = {
                "tool": "Wait tool",
                "task": "Test WAIT boundary",
                "category": "testing",
                "scores": {
                    "time_saved": 3,
                    "output_quality": 3,
                    "ease_of_use": 3,
                    "cost_value": 3,
                    "work_safety": 3,
                },
                "time_with_min": 10,
                "time_without_min": 30,
                "one_right": "ok",
                "one_wrong": "slow",
                "use_it_for": "small tasks",
                "skip_it_for": "important tasks",
                "affiliate": 0,
                "tested": "2026-10-23",
                "notes": "",
            }
            status, _, body = make_request(
                f"{base_url}/api/verdicts", method="POST", data=wait_payload
            )
            wait_created = json.loads(body) if status == 201 else {}
            check(status == 201, "POST WAIT boundary - 201")
            check(
                wait_created.get("verdict") == "WAIT",
                f"POST avg=3.0 -> verdict==WAIT (got {wait_created.get('verdict')})",
            )
            check(
                wait_created.get("avg") == 3.0,
                f"POST avg=3.0 -> avg==3.0 (got {wait_created.get('avg')})",
            )

            # 7. list returns array with at least the records we created
            status, _, body = make_request(f"{base_url}/api/verdicts")
            listed = json.loads(body) if status == 200 else []
            check(
                status == 200 and isinstance(listed, list) and len(listed) >= 7,
                f"GET /api/verdicts - list with seeded+posted (got {len(listed) if isinstance(listed, list) else 'n/a'})",
            )
            # newest-first check: ids should descend
            if isinstance(listed, list) and len(listed) >= 2:
                ids = [r.get("id") for r in listed]
                check(
                    ids == sorted(ids, reverse=True),
                    "GET /api/verdicts - newest-first order",
                )

            # 8. GET one (the USE one we just created)
            if use_id:
                status, _, body = make_request(f"{base_url}/api/verdicts/{use_id}")
                check(status == 200, f"GET /api/verdicts/{use_id} - 200")
                got = json.loads(body) if status == 200 else {}
                check(
                    got.get("id") == use_id,
                    f"GET /api/verdicts/{use_id} - id matches",
                )
                check(
                    got.get("tool") == "Test USE tool",
                    "GET /api/verdicts/{id} - tool matches",
                )

            # 9. DELETE then GET -> 404
            if use_id:
                status, _, body = make_request(
                    f"{base_url}/api/verdicts/{use_id}", method="DELETE"
                )
                deleted = json.loads(body) if status == 200 else {}
                check(status == 200, f"DELETE /api/verdicts/{use_id} - 200")
                check(
                    deleted.get("deleted") is True,
                    f"DELETE returns {{deleted:true}} (got {deleted})",
                )
                status, _, body = make_request(f"{base_url}/api/verdicts/{use_id}")
                check(
                    status == 404,
                    f"GET /api/verdicts/{use_id} after DELETE - 404 (got {status})",
                )

            # 10. unknown id -> 404
            status, _, body = make_request(f"{base_url}/api/verdicts/999999")
            check(
                status == 404,
                f"GET /api/verdicts/999999 - 404 (got {status})",
            )
            if status == 404:
                try:
                    err = json.loads(body)
                    check(
                        "error" in err,
                        "GET unknown id returns JSON error object",
                    )
                except Exception:
                    check(False, "GET unknown id returns parseable JSON")

            status, _, body = make_request(
                f"{base_url}/api/verdicts/999999", method="DELETE"
            )
            check(
                status == 404,
                f"DELETE /api/verdicts/999999 - 404 (got {status})",
            )

            # 11. malformed JSON -> 400
            status, _, body = make_request(
                f"{base_url}/api/verdicts",
                method="POST",
                raw_body=b"{not valid json",
                headers={"Content-Type": "application/json"},
            )
            check(
                status == 400,
                f"POST malformed JSON -> 400 (got {status})",
            )
            if status == 400:
                try:
                    err = json.loads(body)
                    check("error" in err, "malformed JSON returns JSON error")
                except Exception:
                    check(False, "malformed JSON returns parseable JSON")

            # 12. CORS header present
            status, headers, _ = make_request(f"{base_url}/api/health")
            check(
                headers.get("Access-Control-Allow-Origin") == "*",
                "CORS header (Access-Control-Allow-Origin: *) present",
            )

            # 13. OPTIONS -> 204 with CORS
            status, headers, _ = make_request(
                f"{base_url}/api/health", method="OPTIONS"
            )
            check(status == 204, f"OPTIONS /api/health - 204 (got {status})")
            check(
                headers.get("Access-Control-Allow-Origin") == "*",
                "OPTIONS sets CORS header",
            )

            # 14. static `/` served (200 with <html) — only if web/index.html exists
            web_root = project_dir / "web"
            index_html = web_root / "index.html"
            if index_html.exists():
                status, _, body = make_request(f"{base_url}/")
                check(
                    status == 200 and "<html" in body,
                    f"GET / -> 200 with <html (got status={status})",
                )
            else:
                print(
                    "OK: GET / -> web/index.html not present (front-end not built yet); skip"
                )

            # 15. /data/ blocked
            status, _, body = make_request(f"{base_url}/data/anything")
            check(
                status == 403,
                f"GET /data/anything -> 403 (got {status})",
            )
            status, _, body = make_request(
                f"{base_url}/../etc/passwd"
            )
            check(
                status in (403, 404),
                f"GET /../etc/passwd -> blocked (got {status})",
            )

        except Exception as exc:
            print(f"FAIL: Unexpected error: {exc}")
            all_pass = False
        finally:
            try:
                proc.terminate()
                proc.wait(timeout=5)
            except Exception:
                try:
                    proc.kill()
                except Exception:
                    pass

    print()
    if all_pass:
        print("ALL TESTS PASSED")
        sys.exit(0)
    else:
        print("TESTS FAILED")
        sys.exit(1)


if __name__ == "__main__":
    main()
