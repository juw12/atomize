#!/usr/bin/env python3
"""Chase CAD bridge (zero-dependency, Python standard library only).

An optional local HTTP bridge that sits between the offline Chase cockpit and
a CAD host (Autodesk Fusion / SOLIDWORKS). It serves the static `web/` cockpit
and exposes a small JSON API that mirrors the deterministic, rules-based engine
(`web/js/chase.js`, spec `docs/chase-spec.md` §3):

  GET  /api/health            -> {"status":"ok","app":"chase","version":"1.0","mode":"simulation"}
  GET  /api/connectors        -> the three connectors (fusion / solidworks / simulated)
  GET  /api/report/sample     -> a sample ModelReport (brokenBracket)
  GET  /api/assembly/sample   -> a sample AssemblySpec (gearbox)
  POST /api/diagnose          -> body ModelReport -> Diagnosis        (spec §3.1)
  POST /api/plan              -> body ModelReport|AssemblySpec -> RepairPlan|AssemblyPlan (spec §3.2/§3.3)
  POST /api/apply             -> body {"plan":..., "confirm":bool} -> ApplyResult (spec §5)

The diagnosis / repair-plan / assembly-plan logic is re-implemented here
server-side, deterministically and identically to the engine (the engine is
authoritative for the cockpit; this bridge is the optional upgrade path).
Nothing here shells out to Node.

Safety (see `docs/risk-matrix.md` R7): `/api/apply` requires `confirm:true`.
Without it the request applies nothing. In simulation mode the bridge **never**
writes to CAD — `wroteToCad` is always `false`.

Every response carries permissive CORS (`Access-Control-Allow-Origin: *`) so a
cockpit opened via `file://` can still call the bridge.

Usage:
    python server/bridge.py                 # http://127.0.0.1:8792/ (opens browser)
    python server/bridge.py --port 9000     # custom port
    python server/bridge.py --no-browser    # do not open a browser
    python server/bridge.py --host 0.0.0.0  # bind a different interface
"""

from __future__ import annotations

import argparse
import json
import re
import webbrowser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlparse

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

BASE_DIR = Path(__file__).resolve().parent          # .../apps/chase/server
APP_DIR = BASE_DIR.parent                            # .../apps/chase
WEB_DIR = APP_DIR / "web"

APP_NAME = "chase"
APP_VERSION = "1.0"
MODE = "simulation"

SCHEMA_REPORT = "chase/model-report/v1"
SCHEMA_DIAGNOSIS = "chase/diagnosis/v1"
SCHEMA_REPAIR_PLAN = "chase/repair-plan/v1"
SCHEMA_ASSEMBLY_SPEC = "chase/assembly-spec/v1"
SCHEMA_ASSEMBLY_PLAN = "chase/assembly-plan/v1"

HIGH, MED, LOW = "high", "med", "low"
SEVERITY_RANK = {HIGH: 0, MED: 1, LOW: 2}

# Deterministic tie-break for findings sharing severity + feature index (matches
# the engine's KIND_RANK).
KIND_RANK = {
    "failed_feature": 0,
    "broken_reference": 1,
    "dangling_dependency": 2,
    "circular_dependency": 3,
    "warning_feature": 4,
    "suppressed_feature": 5,
    "failed_mate": 6,
    "dangling_mate": 7,
}

# Finding kinds that reference a *feature* (drive repair steps).
FEATURE_KINDS = {
    "failed_feature", "broken_reference", "dangling_dependency",
    "circular_dependency", "warning_feature", "suppressed_feature",
}

# Short deterministic suggestion per finding kind (matches the engine).
FIX = {
    "failed_feature": "Correct the feature parameters and rebuild it",
    "broken_reference": "Re-select the missing reference, then rebuild",
    "dangling_dependency": "Repoint the dependency at an existing feature",
    "circular_dependency": "Break the dependency cycle",
    "warning_feature": "Review the warning and reselect its references",
    "suppressed_feature": "Unsuppress the feature if it is still needed",
    "failed_mate": "Re-create the mate or reselect its faces",
    "dangling_mate": "Replace the missing component or remove the mate",
}

# error text that marks a *broken reference* (spec §3.1).
REFERENCE_RE = re.compile(r"reference|missing|broken", re.IGNORECASE)

CONTENT_TYPES = {
    ".html": "text/html; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".mjs": "application/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".webmanifest": "application/manifest+json; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".ico": "image/x-icon",
    ".txt": "text/plain; charset=utf-8",
    ".md": "text/markdown; charset=utf-8",
    ".woff": "font/woff",
    ".woff2": "font/woff2",
}

CONNECTORS = {
    "connectors": [
        {"id": "fusion", "available": False, "host": "Autodesk Fusion",
         "protocol": "python-api"},
        {"id": "solidworks", "available": False, "host": "SOLIDWORKS",
         "protocol": "com"},
        {"id": "simulated", "available": True, "host": "Simulation",
         "protocol": "in-process"},
    ]
}


# ---------------------------------------------------------------------------
# Small helpers (mirror the engine's helpers)
# ---------------------------------------------------------------------------


def _as_dict(value):
    return value if isinstance(value, dict) else {}


def _label_of(obj, fallback):
    if isinstance(obj, dict):
        name = obj.get("name")
        if isinstance(name, str) and name:
            return name
    return fallback


def _text(value):
    return value if isinstance(value, str) else ""


# ---------------------------------------------------------------------------
# Samples (identical to engine Chase.samples())
# ---------------------------------------------------------------------------


def sample_report() -> dict:
    """The `brokenBracket` sample ModelReport (deterministic; spec §2.1)."""
    return {
        "schema": SCHEMA_REPORT,
        "host": "simulated",
        "model": {"name": "Bracket v15", "units": "mm"},
        "features": [
            {"id": "f1", "type": "extrude", "name": "Extrude1", "status": "ok"},
            {"id": "f2", "type": "fillet", "name": "Fillet7", "status": "failed",
             "error": "radius exceeds adjacent face", "dependsOn": ["f1"]},
            {"id": "f3", "type": "pattern", "name": "Pattern3", "status": "warning",
             "error": "reference missing", "dependsOn": ["f2"]},
            {"id": "f4", "type": "mirror", "name": "Mirror2", "status": "ok",
             "dependsOn": ["f2", "f99"]},
        ],
        "components": [
            {"id": "c1", "name": "Bracket Body", "qty": 1},
        ],
        "mates": [
            {"id": "m1", "type": "concentric", "a": "c1", "b": "c2", "status": "ok"},
        ],
    }


def sample_assembly() -> dict:
    """The `gearbox` sample AssemblySpec (deterministic; spec §2.3)."""
    return {
        "schema": SCHEMA_ASSEMBLY_SPEC,
        "name": "Four-speed gearbox",
        "parts": [
            {"id": "c1", "name": "Housing", "qty": 1},
            {"id": "c2", "name": "Input Shaft", "qty": 1},
            {"id": "c3", "name": "Output Shaft", "qty": 1},
            {"id": "c4", "name": "Gear A", "qty": 2},
            {"id": "c5", "name": "Bearing", "qty": 2},
        ],
        "mates": [
            {"id": "m1", "type": "concentric", "a": "c1", "b": "c2"},
            {"id": "m2", "type": "concentric", "a": "c1", "b": "c3"},
            {"id": "m3", "type": "concentric", "a": "c2", "b": "c4"},
            {"id": "m4", "type": "concentric", "a": "c3", "b": "c4"},
            {"id": "m5", "type": "concentric", "a": "c1", "b": "c5"},
        ],
    }


# ---------------------------------------------------------------------------
# Engine: deterministic diagnosis (spec §3.1)
# ---------------------------------------------------------------------------


def _cycle_feature_indices(features, idx_by_id):
    """Feature indices that participate in a dependsOn cycle (features order)."""
    state = {}
    on_cycle = {}
    path = []

    def visit(fid):
        if state.get(fid) == 2:
            return
        if state.get(fid) == 1:
            start = path.index(fid)
            for k in range(start, len(path)):
                on_cycle[path[k]] = True
            return
        state[fid] = 1
        path.append(fid)
        feat = _as_dict(features[idx_by_id[fid]])
        for dep in (feat.get("dependsOn") or []):
            if dep in idx_by_id:
                visit(dep)
        path.pop()
        state[fid] = 2

    for feat in features:
        fid = _as_dict(feat).get("id")
        if fid is not None and fid not in state:
            visit(fid)

    out = []
    for j, feat in enumerate(features):
        fid = _as_dict(feat).get("id")
        if fid is not None and on_cycle.get(fid):
            out.append(j)
    return out


def _root_cause(features, idx_by_id, known, feature_index):
    """Deepest upstream dependsOn id that is itself failed/dangling, else self.

    Mirrors the engine: an upstream id is "bad" when it is missing (dangling) or
    its status is `failed` (warnings do not count). Ties at the same depth break
    toward the smaller feature index (unknown ids last).
    """
    start_id = _as_dict(features[feature_index]).get("id")
    seen = set()
    best = None  # (id, depth, index)

    def walk(fid, depth):
        nonlocal best
        feat = _as_dict(features[idx_by_id[fid]])
        for dep in (feat.get("dependsOn") or []):
            if dep in seen:
                continue
            seen.add(dep)
            dep_known = dep in known
            dep_feat = _as_dict(features[idx_by_id[dep]]) if dep_known else {}
            is_bad = (not dep_known) or (dep_feat.get("status") == "failed")
            dep_idx = idx_by_id[dep] if dep_known else float("inf")
            if is_bad and (best is None or depth > best[1]
                           or (depth == best[1] and dep_idx < best[2])):
                best = (dep, depth, dep_idx)
            if dep_known:
                walk(dep, depth + 1)

    walk(start_id, 1)
    return best[0] if best else start_id


def diagnose(report) -> dict:
    """Diagnose a ModelReport -> Diagnosis (spec §3.1). Deterministic.

    Findings are ordered by severity rank, then the feature's index in
    `features` (mate findings sort after all features), then kind rank. Finding
    ids are assigned `d1..dN` in that final order.
    """
    rep = _as_dict(report)
    features = rep.get("features") or []
    components = rep.get("components") or []
    mates = rep.get("mates") or []

    idx_by_id = {}
    known = set()
    for i, feat in enumerate(features):
        fid = _as_dict(feat).get("id")
        if fid is not None:
            idx_by_id[fid] = i
            known.add(fid)

    comp_known = set()
    for comp in components:
        cid = _as_dict(comp).get("id")
        if cid is not None:
            comp_known.add(cid)

    raw = []

    def push(severity, feature_index, kind, feature, message, root_cause, depends_on):
        raw.append({
            "severity": severity,
            "feature_index": feature_index,
            "kind_rank": KIND_RANK.get(kind, 99),
            "finding": {
                "id": "",
                "kind": kind,
                "severity": severity,
                "feature": feature,
                "message": message,
                "rootCause": root_cause,
                "fix": FIX.get(kind, ""),
                "dependsOn": depends_on or [],
            },
        })

    for fi, feat in enumerate(features):
        feat = _as_dict(feat)
        deps = list(feat.get("dependsOn") or [])
        err = _text(feat.get("error"))
        name = _label_of(feat, feat.get("id"))
        broken_ref = feat.get("status") != "ok" and bool(REFERENCE_RE.search(err))
        root = None

        if feat.get("status") == "failed":
            root = _root_cause(features, idx_by_id, known, fi)
            push(HIGH, fi, "failed_feature", feat.get("id"),
                 name + " failed" + (": " + err if err else ""), root, deps)

        if broken_ref:
            if root is None:
                root = _root_cause(features, idx_by_id, known, fi)
            push(HIGH, fi, "broken_reference", feat.get("id"),
                 name + " has a broken reference: " + err, root, deps)

        missing = [d for d in deps if d not in known]
        if missing:
            if root is None:
                root = _root_cause(features, idx_by_id, known, fi)
            push(HIGH, fi, "dangling_dependency", feat.get("id"),
                 name + " depends on missing feature " + ", ".join(str(d) for d in missing),
                 root, deps)

        if feat.get("status") == "warning" and not broken_ref:
            if root is None:
                root = _root_cause(features, idx_by_id, known, fi)
            push(MED, fi, "warning_feature", feat.get("id"),
                 name + " warning" + (": " + err if err else ""), root, deps)

        if feat.get("status") == "suppressed":
            if root is None:
                root = _root_cause(features, idx_by_id, known, fi)
            push(LOW, fi, "suppressed_feature", feat.get("id"),
                 name + " is suppressed", root, deps)

    for ci in _cycle_feature_indices(features, idx_by_id):
        cf = _as_dict(features[ci])
        push(HIGH, ci, "circular_dependency", cf.get("id"),
             _label_of(cf, cf.get("id")) + " is part of a dependency cycle",
             cf.get("id"), list(cf.get("dependsOn") or []))

    for mi, mate in enumerate(mates):
        mate = _as_dict(mate)
        mate_index = len(features) + mi
        mname = _label_of(mate, mate.get("id"))

        if mate.get("status") == "failed":
            push(MED, mate_index, "failed_mate", mate.get("id"),
                 "Mate " + str(mname) + " failed", mate.get("id"), [])

        miss_part = []
        if mate.get("a") is not None and mate.get("a") not in comp_known:
            miss_part.append(mate.get("a"))
        if mate.get("b") is not None and mate.get("b") not in comp_known:
            miss_part.append(mate.get("b"))
        if miss_part:
            push(MED, mate_index, "dangling_mate", mate.get("id"),
                 "Mate " + str(mname) + " references missing component "
                 + ", ".join(str(x) for x in miss_part), mate.get("id"), [])

    raw.sort(key=lambda r: (SEVERITY_RANK[r["severity"]], r["feature_index"], r["kind_rank"]))

    findings = []
    summary = {"high": 0, "med": 0, "low": 0, "total": 0}
    for i, entry in enumerate(raw):
        finding = entry["finding"]
        finding["id"] = "d%d" % (i + 1)
        findings.append(finding)
        summary[finding["severity"]] += 1
        summary["total"] += 1

    return {"schema": SCHEMA_DIAGNOSIS, "findings": findings, "summary": summary}


# ---------------------------------------------------------------------------
# Engine: repair plan (spec §3.2)
# ---------------------------------------------------------------------------


def _topo_order(ids, by_id):
    """DFS post-order: dependencies (upstream) emitted before dependents."""
    in_set = set(ids)
    visited = set()
    out = []

    def walk(fid):
        if fid in visited:
            return
        visited.add(fid)
        deps = _as_dict(by_id.get(fid)).get("dependsOn") or []
        for dep in deps:
            if dep not in visited and dep in in_set:
                walk(dep)
        out.append(fid)

    for fid in ids:
        walk(fid)
    return out


def plan_repair(report) -> dict:
    """Plan a repair -> RepairPlan (spec §3.2). Deterministic, topological."""
    rep = _as_dict(report)
    features = rep.get("features") or []
    by_id = {}
    idx_of = {}
    for i, feat in enumerate(features):
        fid = _as_dict(feat).get("id")
        if fid is not None:
            by_id[fid] = feat
            idx_of[fid] = i

    diag = diagnose(rep)

    seen = set()
    affected = []
    reason_by_id = {}
    for finding in diag["findings"]:
        if finding["kind"] not in FEATURE_KINDS:
            continue
        target = finding.get("feature")
        if target is None or target in seen:
            continue
        seen.add(target)
        affected.append(target)
        reason_by_id[target] = finding["message"]

    affected.sort(key=lambda x: idx_of.get(x, float("inf")))
    ordered = _topo_order(affected, by_id)

    steps = []
    for s, target in enumerate(ordered):
        ftype = _as_dict(by_id.get(target)).get("type")
        action = ("fix_" + ftype) if isinstance(ftype, str) and ftype else "rebuild"
        steps.append({
            "order": s + 1,
            "target": target,
            "action": action,
            "reason": reason_by_id.get(target, ""),
        })

    unrealized = []
    for feat in features:
        feat = _as_dict(feat)
        uid = feat.get("id")
        if feat.get("status") in ("failed", "warning") and uid is not None and uid not in seen:
            unrealized.append(uid)

    return {"schema": SCHEMA_REPAIR_PLAN, "steps": steps, "unrealized": unrealized}


# ---------------------------------------------------------------------------
# Engine: assembly plan (spec §3.3)
# ---------------------------------------------------------------------------


def _expand_qty(pid, qty):
    """A part with qty:n inserts n times (ids `<id>#1..n`); qty<=1 stays plain."""
    q = int(qty) if (isinstance(qty, (int, float)) and not isinstance(qty, bool)
                     and qty > 1) else 1
    if q <= 1:
        return [pid]
    return ["%s#%d" % (pid, k) for k in range(1, q + 1)]


def plan_assembly(spec) -> dict:
    """Plan an assembly -> AssemblyPlan (spec §3.3). Deterministic."""
    rep = _as_dict(spec)
    name = rep.get("name") if isinstance(rep.get("name"), str) else ""
    parts = rep.get("parts") or []
    mates = rep.get("mates") or []

    part_index = {}
    for i, part in enumerate(parts):
        pid = _as_dict(part).get("id")
        if pid is not None and pid not in part_index:
            part_index[pid] = i

    degree = {}
    for part in parts:
        pid = _as_dict(part).get("id")
        if pid is not None and pid not in degree:
            degree[pid] = 0
    for mate in mates:
        mate = _as_dict(mate)
        ends = []
        if mate.get("a") is not None:
            ends.append(mate.get("a"))
        if mate.get("b") is not None and mate.get("b") != mate.get("a"):
            ends.append(mate.get("b"))
        for end in ends:
            if end in part_index:
                degree[end] += 1

    base = None
    for bi, part in enumerate(parts):
        part = _as_dict(part)
        bid = part.get("id")
        if bid is None:
            continue
        deg = degree.get(bid, 0)
        if base is None or deg > base["deg"] or (
                deg == base["deg"]
                and (bi < base["idx"] or (bi == base["idx"] and str(bid) < str(base["id"])))):
            base = {"id": bid, "idx": bi, "deg": deg}

    steps = []
    counter = {"n": 0}

    def insert_part(pid, qty):
        for copy in _expand_qty(pid, qty):
            counter["n"] += 1
            steps.append({"n": counter["n"], "op": "insert", "part": copy})

    if base is not None:
        insert_part(base["id"], _as_dict(parts[base["idx"]]).get("qty"))
    for vi, part in enumerate(parts):
        if base is not None and vi == base["idx"]:
            continue
        pid = _as_dict(part).get("id")
        if pid is None:
            continue
        insert_part(pid, _as_dict(part).get("qty"))
    for mate in mates:
        mate = _as_dict(mate)
        counter["n"] += 1
        mtype = mate.get("type")
        steps.append({
            "n": counter["n"],
            "op": "mate",
            "type": "" if mtype is None else mtype,
            "a": mate.get("a"),
            "b": mate.get("b"),
        })

    checks = []

    for mate in mates:
        mate = _as_dict(mate)
        cmiss = []
        if mate.get("a") is not None and mate.get("a") not in part_index:
            cmiss.append(mate.get("a"))
        if mate.get("b") is not None and mate.get("b") not in part_index:
            cmiss.append(mate.get("b"))
        if cmiss:
            checks.append({
                "kind": "dangling-mate", "severity": HIGH,
                "message": "Mate " + str(_label_of(mate, mate.get("id")))
                           + " references missing part " + ", ".join(str(x) for x in cmiss),
            })

    counts = {}
    order = []
    for part in parts:
        qid = _as_dict(part).get("id")
        if qid is None:
            continue
        if qid not in counts:
            counts[qid] = 0
            order.append(qid)
        counts[qid] += 1
    for qid in order:
        if counts[qid] > 1:
            checks.append({
                "kind": "duplicate-part", "severity": MED,
                "message": "Part " + str(qid) + " is defined more than once",
            })

    uniq = []
    seen_ids = set()
    for part in parts:
        pid = _as_dict(part).get("id")
        if pid is None or pid in seen_ids:
            continue
        seen_ids.add(pid)
        uniq.append(pid)

    for pid in uniq:
        if base is not None and pid == base["id"]:
            continue
        if degree.get(pid, 0) == 0:
            checks.append({
                "kind": "under-constrained", "severity": MED,
                "message": str(pid) + " has no mate",
            })
    for pid in uniq:
        if degree.get(pid, 0) > 6:
            checks.append({
                "kind": "over-constrained", "severity": MED,
                "message": str(pid) + " has " + str(degree.get(pid, 0))
                           + " mates (over-constrained)",
            })
    if parts and not mates:
        checks.append({
            "kind": "no-mates", "severity": LOW,
            "message": "Assembly has no mates",
        })

    check_out = []
    for i, chk in enumerate(checks):
        check_out.append({
            "id": "chk%d" % (i + 1),
            "kind": chk["kind"],
            "severity": chk["severity"],
            "message": chk["message"],
        })

    return {
        "schema": SCHEMA_ASSEMBLY_PLAN,
        "name": name,
        "base": None if base is None else base["id"],
        "steps": steps,
        "checks": check_out,
        "partCount": len(parts),
        "mateCount": len(mates),
    }


# ---------------------------------------------------------------------------
# Engine: dry-run + apply (spec §3.4 / §5)
# ---------------------------------------------------------------------------


def _base_id_of(part):
    return re.sub(r"#\d+$", "", part) if isinstance(part, str) else part


def dry_run(plan) -> dict:
    """Pure review gate -> {ok, wouldApply, blocked}. Applies nothing."""
    would_apply = []
    blocked = []

    if not isinstance(plan, dict) or not isinstance(plan.get("steps"), list):
        return {"ok": False, "wouldApply": would_apply, "blocked": ["invalid plan"]}

    schema = plan.get("schema")

    if schema == SCHEMA_REPAIR_PLAN:
        for step in plan["steps"]:
            step = _as_dict(step)
            label = "fix %s (%s)" % (step.get("target"), step.get("action"))
            if step.get("action") == "rebuild":
                blocked.append(label + " (needs manual CAD input)")
            else:
                would_apply.append(label)

    elif schema == SCHEMA_ASSEMBLY_PLAN:
        inserted = set()
        for step in plan["steps"]:
            if _as_dict(step).get("op") == "insert":
                inserted.add(_base_id_of(_as_dict(step).get("part")))
        for step in plan["steps"]:
            step = _as_dict(step)
            if step.get("op") == "insert":
                would_apply.append("insert %s" % step.get("part"))
            elif step.get("op") == "mate":
                mlabel = "mate %s %s-%s" % (step.get("type"), step.get("a"), step.get("b"))
                if step.get("a") in inserted and step.get("b") in inserted:
                    would_apply.append(mlabel)
                else:
                    blocked.append(mlabel + " (references a missing part)")

    else:
        blocked.append("unknown plan schema")

    return {"ok": len(blocked) == 0, "wouldApply": would_apply, "blocked": blocked}


def apply_plan(plan, confirm) -> dict:
    """Apply a plan behind the review gate (spec §5). Never writes to CAD here."""
    if confirm is not True:
        return {
            "ok": False,
            "confirmed": False,
            "mode": MODE,
            "applied": [],
            "blocked": [],
            "wroteToCad": False,
            "message": "Confirmation required: nothing was applied.",
        }
    result = dry_run(plan)
    return {
        "ok": result["ok"],
        "confirmed": True,
        "mode": MODE,
        "applied": result["wouldApply"],
        "blocked": result["blocked"],
        "wroteToCad": False,
        "message": "Simulation only: nothing was written to CAD.",
    }


# ---------------------------------------------------------------------------
# HTTP handler
# ---------------------------------------------------------------------------


class ChaseHandler(BaseHTTPRequestHandler):
    server_version = "Chase/" + APP_VERSION
    protocol_version = "HTTP/1.1"

    def _send_bytes(self, status, body, content_type, extra=None):
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        if extra:
            for key, value in extra.items():
                self.send_header(key, value)
        self.end_headers()
        if self.command != "HEAD":
            try:
                self.wfile.write(body)
            except (BrokenPipeError, ConnectionResetError):
                pass

    def send_json(self, status, obj, extra=None):
        body = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        headers = {"Cache-Control": "no-store"}
        if extra:
            headers.update(extra)
        self._send_bytes(status, body, "application/json; charset=utf-8", headers)

    def send_error_json(self, status, message):
        self.send_json(status, {"error": message})

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

    def _parse_body_json(self):
        raw = self._read_body()
        if not raw:
            return False, "request body is empty"
        try:
            return True, json.loads(raw.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError):
            return False, "malformed JSON body"

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Access-Control-Max-Age", "86400")
        self.send_header("Content-Length", "0")
        self.end_headers()

    def do_HEAD(self):
        self._route("GET")

    def do_GET(self):
        self._route("GET")

    def do_POST(self):
        self._route("POST")

    def do_PUT(self):
        self.send_error_json(404, "not found")

    def do_DELETE(self):
        self.send_error_json(404, "not found")

    def _route(self, method):
        path = urlparse(self.path).path
        if path == "/api" or path.startswith("/api/"):
            rest = path[len("/api/"):] if path.startswith("/api/") else ""
            self._handle_api(method, rest)
        else:
            self._serve_static(path)

    def _handle_api(self, method, rest):
        segments = [seg for seg in rest.split("/") if seg]
        if not segments:
            self.send_error_json(404, "not found")
            return
        name = segments[0]

        if method == "GET":
            self._api_get(name, segments[1:])
        elif method == "POST":
            self._api_post(name)
        else:
            self.send_error_json(404, "not found")

    def _api_get(self, name, subpath):
        if name == "health" and not subpath:
            self.send_json(200, {"status": "ok", "app": APP_NAME,
                                 "version": APP_VERSION, "mode": MODE})
            return
        if name == "connectors" and not subpath:
            self.send_json(200, CONNECTORS)
            return
        if name == "report" and subpath == ["sample"]:
            self.send_json(200, sample_report())
            return
        if name == "assembly" and subpath == ["sample"]:
            self.send_json(200, sample_assembly())
            return
        self.send_error_json(404, "unknown endpoint")

    def _api_post(self, name):
        if name == "diagnose":
            ok, body = self._parse_body_json()
            if not ok:
                self.send_error_json(400, body)
                return
            if not isinstance(body, dict):
                self.send_error_json(400, "body must be a JSON object")
                return
            self.send_json(200, diagnose(body))
            return

        if name == "plan":
            ok, body = self._parse_body_json()
            if not ok:
                self.send_error_json(400, body)
                return
            if not isinstance(body, dict):
                self.send_error_json(400, "body must be a JSON object")
                return
            schema = body.get("schema")
            if schema == SCHEMA_ASSEMBLY_SPEC:
                self.send_json(200, plan_assembly(body))
            elif schema == SCHEMA_REPORT:
                self.send_json(200, plan_repair(body))
            elif "parts" in body and "features" not in body:
                self.send_json(200, plan_assembly(body))
            elif "features" in body:
                self.send_json(200, plan_repair(body))
            else:
                self.send_error_json(400, "unrecognised plan input (no schema/features/parts)")
            return

        if name == "apply":
            ok, body = self._parse_body_json()
            if not ok:
                self.send_error_json(400, body)
                return
            if not isinstance(body, dict):
                self.send_error_json(400, "body must be a JSON object")
                return
            plan = body.get("plan")
            if not isinstance(plan, dict):
                self.send_error_json(400, "body must include a plan object")
                return
            self.send_json(200, apply_plan(plan, body.get("confirm")))
            return

        self.send_error_json(404, "unknown endpoint")

    def _serve_static(self, path):
        if path in ("", "/"):
            rel = "index.html"
        else:
            rel = unquote(path).lstrip("/")

        first = rel.replace("\\", "/").split("/", 1)[0]
        if first == "data":
            self.send_error_json(404, "not found")
            return

        try:
            target = (WEB_DIR / rel).resolve()
            target.relative_to(WEB_DIR.resolve())
        except (ValueError, OSError):
            self.send_error_json(404, "not found")
            return

        if not target.is_file():
            self.send_error_json(404, "not found")
            return

        content_type = CONTENT_TYPES.get(target.suffix.lower(), "application/octet-stream")
        self._send_bytes(200, target.read_bytes(), content_type, {"Cache-Control": "no-cache"})

    def log_message(self, fmt, *args):
        print("[chase] %s - %s" % (self.address_string(), fmt % args))


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------


def main():
    parser = argparse.ArgumentParser(description="Chase CAD bridge (simulation backend)")
    parser.add_argument("--port", type=int, default=8792,
                        help="port to listen on (default 8792)")
    parser.add_argument("--host", default="127.0.0.1",
                        help="host to bind (default 127.0.0.1)")
    parser.add_argument("--no-browser", action="store_true",
                        help="do not open a browser window on start")
    args = parser.parse_args()

    httpd = ThreadingHTTPServer((args.host, args.port), ChaseHandler)
    httpd.daemon_threads = True
    url = "http://%s:%d/" % (args.host, args.port)

    print("Chase CAD bridge")
    print("  serving: %s" % WEB_DIR)
    print("  mode: %s" % MODE)
    print("  url: %s" % url)
    print("  press Ctrl+C to stop")

    if not args.no_browser:
        try:
            webbrowser.open(url)
        except Exception:
            pass

    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n[chase] shutting down")
    finally:
        httpd.server_close()


if __name__ == "__main__":
    main()
