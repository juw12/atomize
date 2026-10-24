#!/usr/bin/env python3
"""Hermetic verification tests for the Gantry CAD bridge (`server/bridge.py`).

Spawns the bridge on a free port (stdlib only) and checks the spec §5 API:

  - GET  /api/health         -> status ok, app gantry, version 1.0, mode simulation
  - GET  /api/connectors     -> 3 connectors; fusion/solidworks unavailable, simulated available
  - GET  /api/report/sample  -> a ModelReport (gantry/model-report/v1)
  - GET  /api/assembly/sample-> an AssemblySpec (gantry/assembly-spec/v1)
  - POST /api/diagnose       -> Diagnosis (gantry/diagnosis/v1) with >=1 high finding
  - POST /api/plan           -> RepairPlan for a report; AssemblyPlan for a spec
  - POST /api/apply          -> confirm:false applies nothing (ok:false);
                                confirm:true returns wroteToCad:false
  - empty / malformed body   -> 400
  - unknown API              -> 404
  - static traversal / data  -> 404
  - OPTIONS /api/*           -> 204 with CORS `*`

The server subprocess is always terminated in a `finally` block. Exits 0 on
success, 1 on any failure.
"""

import http.client
import json
import socket
import subprocess
import sys
import time
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent          # .../apps/gantry
SERVER_SCRIPT = BASE_DIR / "server" / "bridge.py"


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


def run_tests():
    all_passed = True
    port = find_free_port()
    host = "127.0.0.1"

    print("Starting Gantry bridge on %s:%d" % (host, port))

    proc = subprocess.Popen(
        [sys.executable, str(SERVER_SCRIPT), "--port", str(port), "--host", host,
         "--no-browser"],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )

    try:
        if not wait_for_server(host, port):
            print("FAIL - bridge did not start in time")
            return 1
        print("Bridge started successfully\n")

        def get(path):
            conn = http.client.HTTPConnection(host, port, timeout=5)
            conn.request("GET", path)
            resp = conn.getresponse()
            body = resp.read()
            conn.close()
            return resp, body

        def post_raw(path, raw, content_type="application/json"):
            conn = http.client.HTTPConnection(host, port, timeout=5)
            headers = {"Content-Type": content_type} if content_type else {}
            conn.request("POST", path, body=raw, headers=headers)
            resp = conn.getresponse()
            body = resp.read()
            conn.close()
            return resp, body

        def post(path, obj, content_type="application/json"):
            return post_raw(path, json.dumps(obj).encode("utf-8"), content_type)

        def options(path):
            conn = http.client.HTTPConnection(host, port, timeout=5)
            conn.request("OPTIONS", path)
            resp = conn.getresponse()
            resp.read()
            conn.close()
            return resp

        def check(label, condition, detail=""):
            nonlocal all_passed
            if condition:
                print("  [ok] %s" % label)
            else:
                print("  [FAIL] %s %s" % (label, detail))
                all_passed = False

        # --- Test 1: health -------------------------------------------------
        print("Test 1: GET /api/health")
        resp, body = get("/api/health")
        data = json.loads(body) if resp.status == 200 else {}
        check("status 200", resp.status == 200, "got %s" % resp.status)
        check("mode == simulation", data.get("mode") == "simulation", data)
        check("app/version/status", data.get("app") == "gantry"
              and data.get("version") == "1.0" and data.get("status") == "ok", data)

        # --- Test 2: connectors --------------------------------------------
        print("\nTest 2: GET /api/connectors")
        resp, body = get("/api/connectors")
        data = json.loads(body) if resp.status == 200 else {}
        conns = data.get("connectors") or []
        by_id = {c.get("id"): c for c in conns}
        check("status 200", resp.status == 200, "got %s" % resp.status)
        check("exactly 3 connectors", len(conns) == 3, conns)
        check("fusion unavailable (python-api)",
              by_id.get("fusion", {}).get("available") is False
              and by_id.get("fusion", {}).get("protocol") == "python-api", by_id.get("fusion"))
        check("solidworks unavailable (com)",
              by_id.get("solidworks", {}).get("available") is False
              and by_id.get("solidworks", {}).get("protocol") == "com", by_id.get("solidworks"))
        check("simulated available (in-process)",
              by_id.get("simulated", {}).get("available") is True
              and by_id.get("simulated", {}).get("protocol") == "in-process",
              by_id.get("simulated"))

        # --- Test 3: samples ------------------------------------------------
        print("\nTest 3: GET /api/report/sample + /api/assembly/sample")
        resp, body = get("/api/report/sample")
        report = json.loads(body) if resp.status == 200 else {}
        check("report sample schema", report.get("schema") == "gantry/model-report/v1", report.get("schema"))
        check("report sample has features", isinstance(report.get("features"), list)
              and len(report["features"]) > 0, report.get("features"))

        resp, body = get("/api/assembly/sample")
        spec = json.loads(body) if resp.status == 200 else {}
        check("assembly sample schema", spec.get("schema") == "gantry/assembly-spec/v1", spec.get("schema"))
        check("assembly sample has parts", isinstance(spec.get("parts"), list)
              and len(spec["parts"]) > 0, spec.get("parts"))

        # --- Test 4: diagnose ----------------------------------------------
        print("\nTest 4: POST /api/diagnose (brokenBracket sample)")
        resp, body = post("/api/diagnose", report)
        diag = json.loads(body) if resp.status == 200 else {}
        check("status 200", resp.status == 200, "got %s" % resp.status)
        check("schema gantry/diagnosis/v1", diag.get("schema") == "gantry/diagnosis/v1", diag.get("schema"))
        high = [f for f in (diag.get("findings") or []) if f.get("severity") == "high"]
        check(">=1 high finding", len(high) >= 1, diag.get("findings"))
        check("summary present", isinstance(diag.get("summary"), dict)
              and diag["summary"].get("total") == len(diag.get("findings") or []), diag.get("summary"))
        check("findings have fix + rootCause",
              all("fix" in f and "rootCause" in f for f in (diag.get("findings") or [])),
              diag.get("findings"))

        # Determinism: identical input -> identical output.
        resp2, body2 = post("/api/diagnose", report)
        check("diagnose deterministic", body == body2)

        # --- Test 5: plan ---------------------------------------------------
        print("\nTest 5: POST /api/plan (report -> repair, spec -> assembly)")
        resp, body = post("/api/plan", report)
        rplan = json.loads(body) if resp.status == 200 else {}
        check("repair plan schema", rplan.get("schema") == "gantry/repair-plan/v1", rplan.get("schema"))
        check("repair plan has steps", isinstance(rplan.get("steps"), list)
              and len(rplan["steps"]) >= 1, rplan.get("steps"))
        check("repair steps ordered", all(s.get("order") == i + 1
              for i, s in enumerate(rplan.get("steps") or [])), rplan.get("steps"))

        resp, body = post("/api/plan", spec)
        aplan = json.loads(body) if resp.status == 200 else {}
        check("assembly plan schema", aplan.get("schema") == "gantry/assembly-plan/v1", aplan.get("schema"))
        check("assembly plan base set", aplan.get("base") in [p.get("id") for p in spec["parts"]],
              aplan.get("base"))
        ops = {s.get("op") for s in (aplan.get("steps") or [])}
        check("assembly plan has insert + mate steps",
              "insert" in ops and "mate" in ops, ops)

        # --- Test 6: apply --------------------------------------------------
        print("\nTest 6: POST /api/apply (confirm gate)")
        resp, body = post("/api/apply", {"plan": rplan, "confirm": False})
        res = json.loads(body) if resp.status == 200 else {}
        check("confirm:false -> ok false", res.get("ok") is False, res)
        check("confirm:false -> confirmed false", res.get("confirmed") is False, res)
        check("confirm:false applies nothing", res.get("applied") == [], res.get("applied"))
        check("confirm:false wroteToCad false", res.get("wroteToCad") is False, res.get("wroteToCad"))

        resp, body = post("/api/apply", {"plan": rplan, "confirm": True})
        res = json.loads(body) if resp.status == 200 else {}
        check("confirm:true wroteToCad false", res.get("wroteToCad") is False, res.get("wroteToCad"))
        check("confirm:true confirmed true", res.get("confirmed") is True, res)
        check("confirm:true lists applied ops", len(res.get("applied") or []) >= 1, res.get("applied"))

        resp, body = post("/api/apply", {"plan": aplan, "confirm": True})
        res = json.loads(body) if resp.status == 200 else {}
        check("assembly apply wroteToCad false", res.get("wroteToCad") is False, res.get("wroteToCad"))

        # --- Test 7: 400 empty / malformed ---------------------------------
        print("\nTest 7: 400 on empty / malformed body")
        resp, _ = post_raw("/api/diagnose", b"")
        check("empty body -> 400", resp.status == 400, "got %s" % resp.status)
        resp, _ = post_raw("/api/plan", b"not valid json{")
        check("malformed JSON -> 400", resp.status == 400, "got %s" % resp.status)
        resp, _ = post_raw("/api/apply", b"{}")
        check("apply without plan -> 400", resp.status == 400, "got %s" % resp.status)

        # --- Test 8: 404 ----------------------------------------------------
        print("\nTest 8: 404 unknown API + static traversal")
        resp, _ = get("/api/unknown")
        check("unknown API -> 404", resp.status == 404, "got %s" % resp.status)
        resp, _ = get("/../server/bridge.py")
        check("traversal outside web/ -> 404", resp.status == 404, "got %s" % resp.status)
        resp, _ = get("/data/secret.txt")
        check("never serve data/ -> 404", resp.status == 404, "got %s" % resp.status)

        # --- Test 9: OPTIONS CORS ------------------------------------------
        print("\nTest 9: OPTIONS /api/diagnose")
        resp = options("/api/diagnose")
        check("OPTIONS -> 204", resp.status == 204, "got %s" % resp.status)
        check("OPTIONS CORS *", resp.getheader("Access-Control-Allow-Origin") == "*",
              resp.getheader("Access-Control-Allow-Origin"))

        # --- CORS on JSON ---------------------------------------------------
        print("\nTest 10: CORS on JSON responses")
        resp, _ = get("/api/health")
        check("GET CORS *", resp.getheader("Access-Control-Allow-Origin") == "*",
              resp.getheader("Access-Control-Allow-Origin"))

        print("\n" + "=" * 50)
        if all_passed:
            print("SUMMARY: ALL TESTS PASSED")
            return 0
        print("SUMMARY: SOME TESTS FAILED")
        return 1

    finally:
        proc.terminate()
        try:
            proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            proc.kill()
        print("\nStopped bridge on %s:%d" % (host, port))


if __name__ == "__main__":
    sys.exit(run_tests())
