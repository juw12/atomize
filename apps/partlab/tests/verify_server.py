#!/usr/bin/env python3
"""Hermetic API verification tests for the Part Lab server.

Spawns ``server/serve.py`` on a free port with a temp ``PARTLAB_DB`` (via
``tempfile.mkdtemp``), exercises the tiny parts API over ``http.client`` and
prints ``[ok]`` / ``[FAIL]`` per check. Exit code 0 = all passed, 1 = failure.

Standard library only. Usage (from the repo root):

    python apps/partlab/tests/verify_server.py
"""

import http.client
import json
import os
import socket
import subprocess
import sys
import tempfile
import time
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
SERVER_SCRIPT = BASE_DIR / "server" / "serve.py"

# A representative PartDoc (spec §2) used for the round-trip / create checks.
PART_DOC = {
    "schema": "partlab/part/v1",
    "name": "Mounting bracket",
    "units": "mm",
    "material": {"name": "Aluminium 6061", "density": 2.70},
    "params": {"L": 80, "W": 40, "T": 6, "boreR": 4},
    "solids": [
        {"id": "s1", "type": "box", "x": 0, "y": 0, "z": 0,
         "params": {"dx": "L", "dy": "W", "dz": "T"}},
    ],
    "holes": [
        {"id": "h1", "type": "cylinder", "x": 14, "y": 0, "z": 0,
         "params": {"r": "boreR", "h": 20, "segments": 24}},
    ],
}

_PASSED = 0
_FAILED = 0


def check(label, condition, detail=""):
    """Record and print one assertion result."""
    global _PASSED, _FAILED
    if condition:
        _PASSED += 1
        print("[ok] %s" % label)
    else:
        _FAILED += 1
        suffix = " - %s" % detail if detail else ""
        print("[FAIL] %s%s" % (label, suffix))


def find_free_port():
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def wait_for_server(host, port, timeout=10):
    start = time.time()
    while time.time() - start < timeout:
        try:
            conn = http.client.HTTPConnection(host, port, timeout=1)
            conn.request("GET", "/api/health")
            resp = conn.getresponse()
            resp.read()
            conn.close()
            if resp.status == 200:
                return True
        except Exception:
            pass
        time.sleep(0.2)
    return False


def call(host, port, method, path, body=None, raw=None):
    """Issue one HTTP request; return (status, headers_dict, body_bytes)."""
    conn = http.client.HTTPConnection(host, port, timeout=5)
    headers = {}
    data = None
    if raw is not None:
        data = raw
        headers["Content-Type"] = "application/json"
    elif body is not None:
        data = json.dumps(body).encode("utf-8")
        headers["Content-Type"] = "application/json"
    conn.request(method, path, body=data, headers=headers)
    resp = conn.getresponse()
    payload = resp.read()
    hdrs = {k.lower(): v for k, v in resp.getheaders()}
    conn.close()
    return resp.status, hdrs, payload


def run():
    host = "127.0.0.1"
    port = find_free_port()

    temp_dir = tempfile.mkdtemp()
    temp_db = os.path.join(temp_dir, "test_partlab.db")

    env = os.environ.copy()
    env["PARTLAB_DB"] = temp_db

    print("Starting server on %s:%d with temp DB %s" % (host, port, temp_db))

    proc = subprocess.Popen(
        [sys.executable, str(SERVER_SCRIPT),
         "--port", str(port), "--host", host, "--no-browser"],
        env=env,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )

    try:
        if not wait_for_server(host, port):
            print("[FAIL] server did not start in time")
            _FAILED += 1
            return

        # 1. Health
        status, hdrs, raw = call(host, port, "GET", "/api/health")
        try:
            data = json.loads(raw)
        except ValueError:
            data = {}
        check(
            "GET /api/health -> status ok / app partlab / version 1.0",
            status == 200
            and data.get("status") == "ok"
            and data.get("app") == "partlab"
            and data.get("version") == "1.0",
            "status=%s data=%s" % (status, data),
        )

        # 2. PUT then GET round-trip
        status, hdrs, raw = call(host, port, "PUT", "/api/parts/t1", body=PART_DOC)
        try:
            put_data = json.loads(raw)
        except ValueError:
            put_data = {}
        check(
            "PUT /api/parts/t1 -> {ok:true, id:t1}",
            status == 200 and put_data.get("ok") is True and put_data.get("id") == "t1",
            "status=%s body=%r" % (status, raw),
        )

        status, hdrs, raw = call(host, port, "GET", "/api/parts/t1")
        try:
            got = json.loads(raw)
        except ValueError:
            got = None
        check(
            "GET /api/parts/t1 round-trips the same PartDoc JSON",
            status == 200 and got == PART_DOC,
            "status=%s got=%s" % (status, got),
        )

        # 3. POST create -> new id, present in index
        status, hdrs, raw = call(host, port, "POST", "/api/parts", body=PART_DOC)
        try:
            created = json.loads(raw)
        except ValueError:
            created = {}
        new_id = created.get("id")
        check(
            "POST /api/parts -> new server-generated id",
            status == 200
            and created.get("ok") is True
            and isinstance(new_id, str)
            and new_id != ""
            and new_id != "t1",
            "status=%s body=%r" % (status, raw),
        )

        status, hdrs, raw = call(host, port, "GET", "/api/parts")
        try:
            index = json.loads(raw)
        except ValueError:
            index = {}
        ids = [p.get("id") for p in index.get("parts", [])]
        check(
            "GET /api/parts index contains the new id",
            status == 200 and new_id in ids,
            "status=%s ids=%s" % (status, ids),
        )

        # 4. Missing part -> 404
        status, hdrs, raw = call(host, port, "GET", "/api/parts/does-not-exist")
        check(
            "GET /api/parts/does-not-exist -> 404",
            status == 404,
            "status=%s" % status,
        )

        # 5. Reset wipes the store
        status, hdrs, raw = call(host, port, "POST", "/api/reset", body={})
        try:
            reset_data = json.loads(raw)
        except ValueError:
            reset_data = {}
        check(
            "POST /api/reset -> {ok:true}",
            status == 200 and reset_data.get("ok") is True,
            "status=%s body=%r" % (status, raw),
        )

        status, hdrs, raw = call(host, port, "GET", "/api/parts")
        try:
            index = json.loads(raw)
        except ValueError:
            index = {}
        check(
            "GET /api/parts is empty after reset",
            status == 200 and index.get("parts") == [],
            "status=%s body=%r" % (status, raw),
        )

        # 6. Empty / malformed body -> 400
        status, hdrs, raw = call(host, port, "PUT", "/api/parts/t2", raw=b"")
        check(
            "PUT with empty body -> 400",
            status == 400,
            "status=%s body=%r" % (status, raw),
        )

        status, hdrs, raw = call(
            host, port, "PUT", "/api/parts/t2", raw=b"not valid json{"
        )
        check(
            "PUT with malformed JSON body -> 400",
            status == 400,
            "status=%s body=%r" % (status, raw),
        )

        # 7. OPTIONS -> 204 + permissive CORS
        status, hdrs, raw = call(host, port, "OPTIONS", "/api/parts")
        check(
            "OPTIONS -> 204 with Access-Control-Allow-Origin: *",
            status == 204 and hdrs.get("access-control-allow-origin") == "*",
            "status=%s cors=%s" % (status, hdrs.get("access-control-allow-origin")),
        )

    finally:
        proc.terminate()
        try:
            proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            proc.kill()
            proc.wait(timeout=5)

        try:
            out, err = proc.communicate(timeout=5)
        except Exception:
            out, err = b"", b""

        if os.path.exists(temp_db):
            try:
                os.remove(temp_db)
            except OSError:
                pass
        try:
            os.rmdir(temp_dir)
        except OSError:
            pass
        print("\nCleaned up temp DB: %s" % temp_db)


def main():
    run()
    print("\n" + "=" * 50)
    if _FAILED == 0:
        print("SUMMARY: ALL TESTS PASSED (%d checks)" % _PASSED)
        return 0
    print("SUMMARY: %d PASSED, %d FAILED" % (_PASSED, _FAILED))
    return 1


if __name__ == "__main__":
    sys.exit(main())
