#!/usr/bin/env python3
"""Hermetic verification tests for the Vertex CAD bridge (`server/bridge.py`).

Spawns the bridge on a free port (stdlib only) and checks the spec §5 API:

  - GET  /api/health         -> status ok, app vertex, version 1.0, mode simulation
  - GET  /api/connectors     -> 3 connectors; fusion/solidworks unavailable, simulated available
  - GET  /api/report/sample  -> a ModelReport (vertex/model-report/v1)
  - GET  /api/assembly/sample-> an AssemblySpec (vertex/assembly-spec/v1)
  - POST /api/diagnose       -> Diagnosis (vertex/diagnosis/v1) with >=1 high finding
  - POST /api/plan           -> RepairPlan for a report; AssemblyPlan for a spec
  - POST /api/apply          -> confirm:false applies nothing (ok:false);
                                confirm:true returns wroteToCad:false
  - POST /api/answer         -> Answer (vertex/answer/v1) with kind + answer [v3]
  - POST /api/reverse        -> BuildSpec (vertex/build-spec/v1), netVolume>0 [v3]
  - POST /api/drawing        -> BuildSpec with one hole per drawing entry     [v3]
  - POST /api/automate       -> BatchPlan (vertex/batch-plan/v1) steps+summary [v3]
  - empty / malformed body   -> 400
  - unknown API              -> 404
  - static traversal / data  -> 404
  - OPTIONS /api/*           -> 204 with CORS `*`

The server subprocess is always terminated in a `finally` block. Exits 0 on
success, 1 on any failure.
"""

import http.client
import json
import math
import socket
import subprocess
import sys
import time
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent          # .../apps/vertex
SERVER_SCRIPT = BASE_DIR / "server" / "bridge.py"

CAPABILITIES = ["diagnose", "plan", "apply", "build", "simulate", "adapters",
                "answer", "reverse", "drawing", "automate"]


def flange_build():
    """The flange sample BuildSpec (spec §1.1) — used by the /api/build test."""
    params = {"R": 50, "T": 10, "boreR": 16, "boltCircleR": 34, "boltR": 4, "bolts": 6}
    solids = [{"id": "s1", "type": "cylinder", "x": 0, "y": 0, "z": 0,
               "params": {"r": "R", "h": "T", "segments": 48}}]
    holes = [{"id": "h1", "type": "cylinder", "x": 0, "y": 0, "z": 0,
              "params": {"r": "boreR", "h": "T", "segments": 32}}]
    for i in range(params["bolts"]):
        angle = (math.pi / 2.0) + (2.0 * math.pi * i / params["bolts"])
        holes.append({
            "id": "b%d" % i, "type": "cylinder",
            "x": params["boltCircleR"] * math.cos(angle),
            "y": params["boltCircleR"] * math.sin(angle), "z": 0,
            "params": {"r": "boltR", "h": "T", "segments": 16},
        })
    return {
        "schema": "vertex/build-spec/v1", "name": "Pipe flange", "units": "mm",
        "material": {"name": "Steel", "density": 7.85},
        "params": params, "solids": solids, "holes": holes,
    }


def simulate_input():
    """An AssemblySpec (2 parts, 1 mate) with an inline build for /api/simulate."""
    build = {
        "schema": "vertex/build-spec/v1", "name": "two boxes", "units": "mm",
        "material": {"name": "Aluminium 6061", "density": 2.70}, "params": {},
        "solids": [
            {"id": "s1", "type": "box", "x": -20, "y": 0, "z": 0,
             "params": {"dx": 10, "dy": 10, "dz": 10}},
            {"id": "s2", "type": "box", "x": 20, "y": 0, "z": 0,
             "params": {"dx": 10, "dy": 10, "dz": 10}},
        ],
        "holes": [],
    }
    return {
        "schema": "vertex/assembly-spec/v1", "name": "two-part rig",
        "parts": [{"id": "p1", "name": "Base", "qty": 1},
                  {"id": "p2", "name": "Slider", "qty": 1}],
        "mates": [{"id": "m1", "type": "concentric", "a": "p1", "b": "p2"}],
        "build": build,
    }


def sample_scan():
    """A deterministic scan (8 box corners) for /api/reverse."""
    return {
        "schema": "vertex/scan/v1", "maxFitError": 0.08,
        "points": [
            [-5, -5, 0], [5, -5, 0], [5, 5, 0], [-5, 5, 0],
            [-5, -5, 10], [5, -5, 10], [5, 5, 10], [-5, 5, 10],
        ],
    }


def sample_drawing():
    """A DrawingSpec (3 holes) for /api/drawing."""
    return {
        "schema": "vertex/drawing/v1", "units": "mm", "title": "Plate",
        "extents": {"L": 80, "W": 40, "T": 6},
        "holes": [{"x": 0, "y": 0, "r": 4}, {"x": -30, "y": 15, "r": 3},
                  {"x": 30, "y": 15, "r": 3}],
    }


def sample_batch():
    """A Batch (export/pattern/sheets) for /api/automate."""
    return {
        "schema": "vertex/batch/v1",
        "ops": [
            {"op": "export", "name": "flange", "formats": ["stl", "obj", "gltf", "3mf", "dxf"]},
            {"op": "pattern", "name": "rib", "count": 26, "dx": 8, "dy": 0, "dz": 0},
            {"op": "sheets", "name": "drawing", "count": 11},
        ],
    }


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

    print("Starting Vertex bridge on %s:%d" % (host, port))

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
        check("app/version/status", data.get("app") == "vertex"
              and data.get("version") == "1.0" and data.get("status") == "ok", data)
        check("capabilities advertises all ten", data.get("capabilities") == CAPABILITIES,
              data.get("capabilities"))

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
        check("report sample schema", report.get("schema") == "vertex/model-report/v1", report.get("schema"))
        check("report sample has features", isinstance(report.get("features"), list)
              and len(report["features"]) > 0, report.get("features"))

        resp, body = get("/api/assembly/sample")
        spec = json.loads(body) if resp.status == 200 else {}
        check("assembly sample schema", spec.get("schema") == "vertex/assembly-spec/v1", spec.get("schema"))
        check("assembly sample has parts", isinstance(spec.get("parts"), list)
              and len(spec["parts"]) > 0, spec.get("parts"))

        # --- Test 4: diagnose ----------------------------------------------
        print("\nTest 4: POST /api/diagnose (brokenBracket sample)")
        resp, body = post("/api/diagnose", report)
        diag = json.loads(body) if resp.status == 200 else {}
        check("status 200", resp.status == 200, "got %s" % resp.status)
        check("schema vertex/diagnosis/v1", diag.get("schema") == "vertex/diagnosis/v1", diag.get("schema"))
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
        check("repair plan schema", rplan.get("schema") == "vertex/repair-plan/v1", rplan.get("schema"))
        check("repair plan has steps", isinstance(rplan.get("steps"), list)
              and len(rplan["steps"]) >= 1, rplan.get("steps"))
        check("repair steps ordered", all(s.get("order") == i + 1
              for i, s in enumerate(rplan.get("steps") or [])), rplan.get("steps"))

        resp, body = post("/api/plan", spec)
        aplan = json.loads(body) if resp.status == 200 else {}
        check("assembly plan schema", aplan.get("schema") == "vertex/assembly-plan/v1", aplan.get("schema"))
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

        # --- Test 11: adapters ---------------------------------------------
        print("\nTest 11: GET /api/adapters")
        resp, body = get("/api/adapters")
        data = json.loads(body) if resp.status == 200 else {}
        adapters = data.get("adapters") or []
        by_adapter = {a.get("id"): a for a in adapters}
        check("status 200", resp.status == 200, "got %s" % resp.status)
        check(">= 12 adapters", len(adapters) >= 12, len(adapters))
        check("fusion available false",
              by_adapter.get("fusion", {}).get("available") is False,
              by_adapter.get("fusion"))
        check("simulated available true",
              by_adapter.get("simulated", {}).get("available") is True,
              by_adapter.get("simulated"))
        check("every adapter has the spec 1.4 shape",
              all(isinstance(a, dict) and "id" in a and "name" in a and "kind" in a
                  and "protocol" in a and "formats" in a and "available" in a
                  for a in adapters), "shape")

        # --- Test 12: build -------------------------------------------------
        print("\nTest 12: POST /api/build (flange sample)")
        resp, body = post("/api/build", flange_build())
        build_res = json.loads(body) if resp.status == 200 else {}
        mesh = build_res.get("mesh") or {}
        check("status 200", resp.status == 200, "got %s" % resp.status)
        check("ok true", build_res.get("ok") is True, build_res.get("ok"))
        check("mesh schema vertex/mesh/v1", mesh.get("schema") == "vertex/mesh/v1",
              mesh.get("schema"))
        check("netVolume > 0", isinstance(mesh.get("netVolume"), (int, float))
              and mesh["netVolume"] > 0, mesh.get("netVolume"))
        check("exports list", build_res.get("exports") == ["stl", "obj", "gltf", "3mf", "dxf"],
              build_res.get("exports"))
        check("build deterministic", post("/api/build", flange_build())[1] == body)

        # --- Test 13: simulate ---------------------------------------------
        print("\nTest 13: POST /api/simulate")
        resp, body = post("/api/simulate", simulate_input())
        sim = json.loads(body) if resp.status == 200 else {}
        check("status 200", resp.status == 200, "got %s" % resp.status)
        check("schema vertex/sim/v1", sim.get("schema") == "vertex/sim/v1", sim.get("schema"))
        check("mass.mass_g > 0", isinstance((sim.get("mass") or {}).get("mass_g"), (int, float))
              and sim["mass"]["mass_g"] > 0, sim.get("mass"))
        check("clearance is a list", isinstance(sim.get("clearance"), list),
              sim.get("clearance"))
        check("clearance has the part pair", len(sim.get("clearance") or []) == 1,
              sim.get("clearance"))
        check("motion has 25 samples", isinstance(sim.get("motion"), list)
              and len(sim["motion"]) == 25, len(sim.get("motion") or []))
        check("each transform is 16 numbers",
              all(isinstance(m.get("transform"), list) and len(m["transform"]) == 16
                  for m in (sim.get("motion") or [])), "transform size")
        check("notes include kinematic estimate",
              "kinematic estimate" in (sim.get("notes") or []), sim.get("notes"))
        check("simulate deterministic", post("/api/simulate", simulate_input())[1] == body)

        # --- Test 14: build/simulate 400 -----------------------------------
        print("\nTest 14: 400 on empty / malformed build + simulate")
        resp, _ = post_raw("/api/build", b"")
        check("empty build body -> 400", resp.status == 400, "got %s" % resp.status)
        resp, _ = post_raw("/api/build", b"not valid json{")
        check("malformed build -> 400", resp.status == 400, "got %s" % resp.status)
        resp, _ = post_raw("/api/simulate", b"")
        check("empty simulate body -> 400", resp.status == 400, "got %s" % resp.status)
        resp, _ = post_raw("/api/simulate", b"not valid json{")
        check("malformed simulate -> 400", resp.status == 400, "got %s" % resp.status)

        # --- Test 15: answer -----------------------------------------------
        print("\nTest 15: POST /api/answer (brokenBracket 'what failed?')")
        resp, body = post("/api/answer", {"report": report, "question": "what failed?"})
        ans = json.loads(body) if resp.status == 200 else {}
        check("status 200", resp.status == 200, "got %s" % resp.status)
        check("schema vertex/answer/v1", ans.get("schema") == "vertex/answer/v1", ans.get("schema"))
        check("kind status", ans.get("kind") == "status", ans.get("kind"))
        check("answer is a non-empty string", isinstance(ans.get("answer"), str)
              and len(ans["answer"]) > 0, ans.get("answer"))
        check("evidence lists failed feature", any("f2" in e for e in (ans.get("evidence") or [])),
              ans.get("evidence"))
        check("answer deterministic", post("/api/answer",
              {"report": report, "question": "what failed?"})[1] == body)

        # --- Test 16: reverse ----------------------------------------------
        print("\nTest 16: POST /api/reverse (scan -> BuildSpec)")
        resp, body = post("/api/reverse", sample_scan())
        rspec = json.loads(body) if resp.status == 200 else {}
        check("status 200", resp.status == 200, "got %s" % resp.status)
        check("schema vertex/build-spec/v1", rspec.get("schema") == "vertex/build-spec/v1",
              rspec.get("schema"))
        check("reverse names the part", rspec.get("name") == "Reversed part", rspec.get("name"))
        check("reverse has >=1 solid", isinstance(rspec.get("solids"), list)
              and len(rspec["solids"]) >= 1, rspec.get("solids"))
        resp2, body2 = post("/api/build", rspec)
        rmesh = (json.loads(body2) if resp2.status == 200 else {}).get("mesh") or {}
        check("reversed mesh netVolume > 0", isinstance(rmesh.get("netVolume"), (int, float))
              and rmesh["netVolume"] > 0, rmesh.get("netVolume"))
        check("reverse deterministic", post("/api/reverse", sample_scan())[1] == body)

        # --- Test 17: drawing ----------------------------------------------
        print("\nTest 17: POST /api/drawing (DrawingSpec -> BuildSpec)")
        drawing = sample_drawing()
        resp, body = post("/api/drawing", drawing)
        dspec = json.loads(body) if resp.status == 200 else {}
        check("status 200", resp.status == 200, "got %s" % resp.status)
        check("schema vertex/build-spec/v1", dspec.get("schema") == "vertex/build-spec/v1",
              dspec.get("schema"))
        check("hole count matches drawing", isinstance(dspec.get("holes"), list)
              and len(dspec["holes"]) == len(drawing["holes"]), dspec.get("holes"))
        resp2, body2 = post("/api/build", dspec)
        dmesh = (json.loads(body2) if resp2.status == 200 else {}).get("mesh") or {}
        check("drawing mesh netVolume > 0", isinstance(dmesh.get("netVolume"), (int, float))
              and dmesh["netVolume"] > 0, dmesh.get("netVolume"))
        check("drawing deterministic", post("/api/drawing", drawing)[1] == body)

        # --- Test 18: automate ---------------------------------------------
        print("\nTest 18: POST /api/automate (Batch -> BatchPlan)")
        resp, body = post("/api/automate", sample_batch())
        plan = json.loads(body) if resp.status == 200 else {}
        check("status 200", resp.status == 200, "got %s" % resp.status)
        check("schema vertex/batch-plan/v1", plan.get("schema") == "vertex/batch-plan/v1",
              plan.get("schema"))
        steps = plan.get("steps") or []
        check("steps ordered n=1..N", all(s.get("n") == i + 1 for i, s in enumerate(steps))
              and len(steps) == 3, steps)
        pat = next((s for s in steps if s.get("op") == "pattern"), {})
        check("pattern expanded with count + delta",
              pat.get("count") == 26 and pat.get("delta") == [8, 0, 0], pat)
        export = next((s for s in steps if s.get("op") == "export"), {})
        check("export count == formats", export.get("count") == 5, export)
        summ = plan.get("summary") or {}
        check("summary ops/instances/exports",
              summ.get("ops") == 3 and summ.get("instances") == 26 and summ.get("exports") == 5,
              summ)
        check("automate deterministic", post("/api/automate", sample_batch())[1] == body)

        # --- Test 19: v3 400 empty / malformed -----------------------------
        print("\nTest 19: 400 on empty / malformed v3 bodies")
        for path in ("/api/answer", "/api/reverse", "/api/drawing", "/api/automate"):
            resp, _ = post_raw(path, b"")
            check("empty %s -> 400" % path, resp.status == 400, "got %s" % resp.status)
            resp, _ = post_raw(path, b"not valid json{")
            check("malformed %s -> 400" % path, resp.status == 400, "got %s" % resp.status)
        resp, _ = post_raw("/api/reverse",
                           json.dumps({"schema": "vertex/scan/v1", "points": []}).encode())
        check("reverse with <2 points -> 400", resp.status == 400, "got %s" % resp.status)

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
