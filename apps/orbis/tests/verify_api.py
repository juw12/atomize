#!/usr/bin/env python3
"""End-to-end API test for the Orbis prototype server.

Standard library only. The test starts its own server instance on a free port
with an isolated temporary database, then exercises the full API surface:
health, state, collection GET/PUT round-trip, audit append, export headers,
reset, CORS headers and error handling.

Run:
    python tests/verify_api.py
"""

from __future__ import annotations

import json
import os
import shutil
import socket
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SERVER = ROOT / "server" / "server.py"

PASSED = 0
FAILED = 0


def check(condition, label):
    global PASSED, FAILED
    if condition:
        PASSED += 1
        print("  ok  - %s" % label)
    else:
        FAILED += 1
        print("  FAIL - %s" % label)


def free_port():
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    sock.bind(("127.0.0.1", 0))
    port = sock.getsockname()[1]
    sock.close()
    return port


def request(method, url, data=None, headers=None):
    """Return (status, headers_dict, body_text). Never raises for HTTP errors."""
    body = None
    hdrs = dict(headers or {})
    if data is not None:
        body = json.dumps(data).encode("utf-8")
        hdrs["Content-Type"] = "application/json"
    req = urllib.request.Request(url, data=body, headers=hdrs, method=method)
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            return resp.status, dict(resp.headers), resp.read().decode("utf-8")
    except urllib.error.HTTPError as exc:
        return exc.code, dict(exc.headers), exc.read().decode("utf-8")


def wait_for_health(base, timeout=15.0):
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            status, _, body = request("GET", base + "/api/health")
            if status == 200:
                return json.loads(body)
        except (urllib.error.URLError, ConnectionError, OSError):
            pass
        time.sleep(0.25)
    return None


def main():
    tmp_dir = tempfile.mkdtemp(prefix="orbis-test-")
    env = dict(os.environ)
    env["ORBIS_DB"] = str(Path(tmp_dir) / "orbis-test.db")
    env["PYTHONUNBUFFERED"] = "1"

    port = free_port()
    base = "http://127.0.0.1:%d" % port

    proc = subprocess.Popen(
        [sys.executable, str(SERVER), "--port", str(port), "--no-browser"],
        cwd=str(ROOT),
        env=env,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
    )

    try:
        health = wait_for_health(base)
        if health is None:
            print("Server did not become healthy.")
            try:
                out, _ = proc.communicate(timeout=5)
                print(out.decode("utf-8", "replace"))
            except Exception:
                pass
            return 1

        print("Testing %s (pid %s)" % (base, proc.pid))

        # 1. health
        check(health.get("status") == "ok", "health.status == ok")
        check(health.get("app") == "orbis", "health.app == orbis")
        check(health.get("version") == "1.0", "health.version == 1.0")

        # 2. state has every collection
        status, headers, body = request("GET", base + "/api/state")
        state = json.loads(body)
        check(status == 200, "state returns 200")
        expected = ["queue", "commitments", "aura", "culture", "growth",
                    "sources", "audit", "settings", "work"]
        check(all(k in state for k in expected), "state contains all collections")
        check(len(state["queue"]) == 5, "state.queue seeded with 5 items")
        check(len(state["commitments"]) == 5, "state.commitments seeded with 5 items")

        # 3. GET a single collection
        status, _, body = request("GET", base + "/api/queue")
        queue_val = json.loads(body)
        check(status == 200 and isinstance(queue_val, list) and len(queue_val) == 5,
              "GET /api/queue returns seeded list")

        # 4. PUT round-trip
        new_queue = [{"id": 99, "type": "reply", "subject": "Round trip",
                      "reason": "test", "source": "test", "confidence": "Suggested - inferred",
                      "committed": False, "snoozed": False, "dismissed": False,
                      "hasDate": False}]
        status, _, body = request("PUT", base + "/api/queue", data=new_queue)
        put_resp = json.loads(body)
        check(status == 200, "PUT collection returns 200")
        check(put_resp.get("ok") is True, "PUT response ok == true")
        check(put_resp.get("collection") == "queue", "PUT response echoes collection")
        check(put_resp.get("value") == new_queue, "PUT response echoes saved value")

        status, _, body = request("GET", base + "/api/queue")
        check(json.loads(body) == new_queue, "GET reflects PUT (round-trip)")

        # 5. audit: PUT above appended an event, plus an explicit POST
        status, _, body = request("POST", base + "/api/audit",
                                  data={"actor": "you", "action": "reviewed",
                                        "object": "queue"})
        created = json.loads(body)
        check(status == 200, "POST /api/audit returns 200")
        check(created.get("action") == "reviewed", "POST audit returns created event")
        check("time" in created and "T" in created["time"], "audit event has ISO time")

        status, _, body = request("GET", base + "/api/audit")
        events = json.loads(body)
        check(status == 200 and isinstance(events, list), "GET /api/audit returns list")
        check(events and events[0]["action"] == "reviewed",
              "GET /api/audit is newest-first")

        # 6. export headers
        status, headers, body = request("GET", base + "/api/export")
        disposition = headers.get("Content-Disposition", "")
        check(status == 200, "GET /api/export returns 200")
        check('attachment; filename="orbis-export.json"' == disposition,
              "export sets Content-Disposition attachment")
        check(json.loads(body).get("settings") is not None,
              "export body contains full state")

        # 7. CORS headers
        _, headers, _ = request("GET", base + "/api/health")
        check(headers.get("Access-Control-Allow-Origin") == "*",
              "CORS origin header present on API")

        # 8. OPTIONS preflight
        status, headers, _ = request("OPTIONS", base + "/api/queue")
        methods = headers.get("Access-Control-Allow-Methods", "")
        check(status == 204, "OPTIONS returns 204")
        check("PUT" in methods and "DELETE" in methods and "OPTIONS" in methods,
              "OPTIONS advertises allowed methods")
        check(headers.get("Access-Control-Allow-Headers") == "Content-Type",
              "OPTIONS advertises allowed headers")

        # 9. error handling
        status, _, body = request("GET", base + "/api/nope")
        check(status == 404 and "error" in json.loads(body),
              "unknown collection GET -> 404 JSON error")

        status, _, body = request("PUT", base + "/api/nope", data={})
        check(status == 404 and "error" in json.loads(body),
              "unknown collection PUT -> 404 JSON error")

        req = urllib.request.Request(
            base + "/api/queue", data=b"{not valid json",
            headers={"Content-Type": "application/json"}, method="PUT")
        try:
            urllib.request.urlopen(req, timeout=10)
            status = 200
        except urllib.error.HTTPError as exc:
            status = exc.code
        check(status == 400, "malformed JSON body -> 400")

        # 10. reset reseeds
        status, _, body = request("POST", base + "/api/reset")
        check(status == 200 and json.loads(body).get("ok") is True,
              "POST /api/reset returns ok")
        status, _, body = request("GET", base + "/api/state")
        state = json.loads(body)
        check(len(state["queue"]) == 5, "reset restores queue seed")
        check(len(state["audit"]) == 5, "reset restores audit seed")

    finally:
        proc.terminate()
        try:
            proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            proc.kill()
        shutil.rmtree(tmp_dir, ignore_errors=True)

    print("\n%d passed, %d failed" % (PASSED, FAILED))
    return 0 if FAILED == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
