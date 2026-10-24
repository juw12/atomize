/*
 * Vertex — deterministic engineering-copilot engine
 * Pure, offline, zero-dependency. No DOM / network / storage / Date / randomness.
 *
 * Frozen contract: docs/vertex-spec.md §3.
 *   Vertex.SCHEMA_REPORT / SCHEMA_DIAGNOSIS / SCHEMA_REPAIR_PLAN / SCHEMA_ASSEMBLY_PLAN
 *   Vertex.validateReport(report)        -> { ok, errors[] }
 *   Vertex.diagnose(report)              -> Diagnosis                        (§3.1)
 *   Vertex.planRepair(report)            -> RepairPlan                       (§3.2)
 *   Vertex.planAssembly(spec)            -> AssemblyPlan                     (§3.3)
 *   Vertex.dryRun(plan)                  -> { ok, wouldApply[], blocked[] }  (§3.4)
 *   Vertex.samples()                     -> { brokenBracket, gearbox, flange }
 *
 * Vertex v2 (docs/vertex-v2-spec.md §1-§2): geometry builder + 3D exporters +
 * deterministic simulation + universal adapter registry. Still pure/offline.
 *   Vertex.SCHEMA_BUILD / SCHEMA_MESH / SCHEMA_SIM / SCHEMA_ADAPTER
 *   Vertex.buildMesh(buildSpec) -> Mesh
 *   Vertex.exportSTL(mesh, {binary,name}) / exportOBJ / exportGLTF / export3MF / exportDXF
 *   Vertex.simulate(assemblySpec, buildSpec?) -> SimResult
 *   Vertex.adapters() -> Adapter[]
 *
 * Determinism: identical input => identical output. Ordering is fixed by the
 * rules below; all arrays are stable; nothing reads the clock or randomness.
 *
 * Field tolerances: `components` and `mates` are optional (default []); a
 * well-formed report never throws.
 */
var Vertex = (function () {
  "use strict";

  var SCHEMA_REPORT = "vertex/model-report/v1";
  var SCHEMA_DIAGNOSIS = "vertex/diagnosis/v1";
  var SCHEMA_REPAIR_PLAN = "vertex/repair-plan/v1";
  var SCHEMA_ASSEMBLY_PLAN = "vertex/assembly-plan/v1";
  var SCHEMA_ASSEMBLY_SPEC = "vertex/assembly-spec/v1";

  /* severity rank: high > med > low */
  var SEV_RANK = { high: 0, med: 1, low: 2 };

  /* deterministic tie-break for findings that share severity + feature index */
  var KIND_RANK = {
    failed_feature: 0,
    broken_reference: 1,
    dangling_dependency: 2,
    circular_dependency: 3,
    warning_feature: 4,
    suppressed_feature: 5,
    failed_mate: 6,
    dangling_mate: 7
  };

  /* short deterministic suggestion per kind */
  var FIX = {
    failed_feature: "Correct the feature parameters and rebuild it",
    broken_reference: "Re-select the missing reference, then rebuild",
    dangling_dependency: "Repoint the dependency at an existing feature",
    circular_dependency: "Break the dependency cycle",
    warning_feature: "Review the warning and reselect its references",
    suppressed_feature: "Unsuppress the feature if it is still needed",
    failed_mate: "Re-create the mate or reselect its faces",
    dangling_mate: "Replace the missing component or remove the mate"
  };

  var FEATURE_KINDS = {
    failed_feature: true,
    broken_reference: true,
    dangling_dependency: true,
    circular_dependency: true,
    warning_feature: true,
    suppressed_feature: true
  };

  /* ------------------------------------------------------------------ */
  /* small helpers (no prototypes, no clever tricks)                     */
  /* ------------------------------------------------------------------ */

  function isObj(x) {
    return x !== null && typeof x === "object" && !Array.isArray(x);
  }

  function asArray(x) {
    return Array.isArray(x) ? x : [];
  }

  function has(map, key) {
    return Object.prototype.hasOwnProperty.call(map, key);
  }

  function labelOf(obj, fallback) {
    if (obj && typeof obj.name === "string" && obj.name) {
      return obj.name;
    }
    return fallback;
  }

  function uniqueIds(items) {
    var seen = Object.create(null);
    var out = [];
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      var id = it && it.id;
      if (id === null || id === undefined || has(seen, id)) {
        continue;
      }
      seen[id] = true;
      out.push(id);
    }
    return out;
  }

  /* ------------------------------------------------------------------ */
  /* validateReport                                                      */
  /* ------------------------------------------------------------------ */

  function validateReport(report) {
    var errors = [];
    if (!isObj(report)) {
      errors.push("report must be an object");
      return { ok: false, errors: errors };
    }
    if (report.schema !== SCHEMA_REPORT) {
      errors.push('schema must be "' + SCHEMA_REPORT + '"');
    }
    if (typeof report.host !== "string" || !report.host) {
      errors.push("host is required");
    }
    if (!isObj(report.model) || typeof report.model.name !== "string" ||
        !report.model.name) {
      errors.push("model.name is required");
    }
    if (!Array.isArray(report.features)) {
      errors.push("features must be an array");
    }
    return { ok: errors.length === 0, errors: errors };
  }

  /* ------------------------------------------------------------------ */
  /* diagnose (§3.1)                                                     */
  /* ------------------------------------------------------------------ */

  function makeFinding(kind, severity, feature, message, rootCause, dependsOn) {
    return {
      id: "",
      kind: kind,
      severity: severity,
      feature: feature,
      message: message,
      rootCause: rootCause,
      fix: FIX[kind] || "",
      dependsOn: dependsOn || []
    };
  }

  /*
   * Feature indices that participate in a dependsOn cycle (ordered by index).
   * Iterative-safe recursion over a small graph; deterministic.
   */
  function cycleFeatureIndices(features, idxById) {
    var state = Object.create(null);   /* undefined | 1 (on stack) | 2 (done) */
    var onCycle = Object.create(null);
    var path = [];

    function visit(id) {
      if (state[id] === 2) {
        return;
      }
      if (state[id] === 1) {
        var start = path.indexOf(id);
        for (var k = start; k < path.length; k++) {
          onCycle[path[k]] = true;
        }
        return;
      }
      state[id] = 1;
      path.push(id);
      var f = features[idxById[id]];
      var deps = asArray(f && f.dependsOn);
      for (var i = 0; i < deps.length; i++) {
        if (has(idxById, deps[i])) {
          visit(deps[i]);
        }
      }
      path.pop();
      state[id] = 2;
    }

    for (var n = 0; n < features.length; n++) {
      var fid = features[n] && features[n].id;
      if (fid !== null && fid !== undefined && state[fid] === undefined) {
        visit(fid);
      }
    }

    var out = [];
    for (var j = 0; j < features.length; j++) {
      var jid = features[j] && features[j].id;
      if (jid !== null && jid !== undefined && onCycle[jid]) {
        out.push(j);
      }
    }
    return out;
  }

  /*
   * rootCause = deepest upstream dependsOn id that is itself failed/dangling,
   * else the feature itself. Ties (same depth) resolved by feature index, with
   * unknown ids last.
   */
  function rootCauseOf(features, idxById, known, featureIndex) {
    var startId = features[featureIndex].id;
    var seen = Object.create(null);
    var best = null;

    function walk(id, depth) {
      var f = features[idxById[id]];
      var deps = asArray(f && f.dependsOn);
      for (var i = 0; i < deps.length; i++) {
        var d = deps[i];
        if (has(seen, d)) {
          continue;
        }
        seen[d] = true;
        var depKnown = has(known, d);
        var isBad = !depKnown ||
          (depKnown && features[idxById[d]] && features[idxById[d]].status === "failed");
        var depIdx = depKnown ? idxById[d] : Infinity;
        if (isBad) {
          if (best === null || depth > best.depth ||
              (depth === best.depth && depIdx < best.idx)) {
            best = { id: d, depth: depth, idx: depIdx };
          }
        }
        if (depKnown) {
          walk(d, depth + 1);
        }
      }
    }

    walk(startId, 1);
    return best ? best.id : startId;
  }

  function diagnose(report) {
    var rep = isObj(report) ? report : {};
    var features = asArray(rep.features);
    var components = asArray(rep.components);
    var mates = asArray(rep.mates);

    var idxById = Object.create(null);
    var known = Object.create(null);
    for (var i = 0; i < features.length; i++) {
      var fid = features[i] && features[i].id;
      if (fid !== null && fid !== undefined) {
        idxById[fid] = i;
        known[fid] = true;
      }
    }

    var compKnown = Object.create(null);
    for (var c = 0; c < components.length; c++) {
      var cid = components[c] && components[c].id;
      if (cid !== null && cid !== undefined) {
        compKnown[cid] = true;
      }
    }

    var raw = [];
    function push(severity, featureIndex, finding) {
      raw.push({
        severity: severity,
        featureIndex: featureIndex,
        kindRank: KIND_RANK[finding.kind],
        finding: finding
      });
    }

    /* ---- per-feature rules ---- */
    for (var fi = 0; fi < features.length; fi++) {
      var f = features[fi] || {};
      var deps = asArray(f.dependsOn).slice();
      var err = typeof f.error === "string" ? f.error : "";
      var name = labelOf(f, f.id);
      var brokenRef = f.status !== "ok" && /reference|missing|broken/i.test(err);
      var root = null;  /* computed lazily per feature */

      if (f.status === "failed") {
        root = rootCauseOf(features, idxById, known, fi);
        push("high", fi, makeFinding(
          "failed_feature", "high", f.id,
          name + " failed" + (err ? ": " + err : ""),
          root, deps));
      }

      if (brokenRef) {
        root = root || rootCauseOf(features, idxById, known, fi);
        push("high", fi, makeFinding(
          "broken_reference", "high", f.id,
          name + " has a broken reference: " + err,
          root, deps));
      }

      var missing = [];
      for (var di = 0; di < deps.length; di++) {
        if (!has(known, deps[di])) {
          missing.push(deps[di]);
        }
      }
      if (missing.length) {
        root = root || rootCauseOf(features, idxById, known, fi);
        push("high", fi, makeFinding(
          "dangling_dependency", "high", f.id,
          name + " depends on missing feature " + missing.join(", "),
          root, deps));
      }

      if (f.status === "warning" && !brokenRef) {
        root = root || rootCauseOf(features, idxById, known, fi);
        push("med", fi, makeFinding(
          "warning_feature", "med", f.id,
          name + " warning" + (err ? ": " + err : ""),
          root, deps));
      }

      if (f.status === "suppressed") {
        root = root || rootCauseOf(features, idxById, known, fi);
        push("low", fi, makeFinding(
          "suppressed_feature", "low", f.id,
          name + " is suppressed",
          root, deps));
      }
    }

    /* ---- circular dependency (per feature in a cycle) ---- */
    var cyc = cycleFeatureIndices(features, idxById);
    for (var ci = 0; ci < cyc.length; ci++) {
      var cf = features[cyc[ci]] || {};
      push("high", cyc[ci], makeFinding(
        "circular_dependency", "high", cf.id,
        labelOf(cf, cf.id) + " is part of a dependency cycle",
        cf.id, asArray(cf.dependsOn).slice()));
    }

    /* ---- mate rules (indexed after features for stable ordering) ---- */
    for (var mi = 0; mi < mates.length; mi++) {
      var m = mates[mi] || {};
      var mateIndex = features.length + mi;
      var mname = labelOf(m, m.id);

      if (m.status === "failed") {
        push("med", mateIndex, makeFinding(
          "failed_mate", "med", m.id,
          "Mate " + mname + " failed",
          m.id, []));
      }

      var missPart = [];
      if (m.a !== null && m.a !== undefined && !has(compKnown, m.a)) {
        missPart.push(m.a);
      }
      if (m.b !== null && m.b !== undefined && !has(compKnown, m.b)) {
        missPart.push(m.b);
      }
      if (missPart.length) {
        push("med", mateIndex, makeFinding(
          "dangling_mate", "med", m.id,
          "Mate " + mname + " references missing component " + missPart.join(", "),
          m.id, []));
      }
    }

    /* ---- order: severity rank, feature index, kind rank ---- */
    raw.sort(function (a, b) {
      if (SEV_RANK[a.severity] !== SEV_RANK[b.severity]) {
        return SEV_RANK[a.severity] - SEV_RANK[b.severity];
      }
      if (a.featureIndex !== b.featureIndex) {
        return a.featureIndex - b.featureIndex;
      }
      return a.kindRank - b.kindRank;
    });

    var findings = [];
    var summary = { high: 0, med: 0, low: 0, total: 0 };
    for (var oi = 0; oi < raw.length; oi++) {
      var fd = raw[oi].finding;
      fd.id = "d" + (oi + 1);
      findings.push(fd);
      summary[fd.severity] += 1;
      summary.total += 1;
    }

    return { schema: SCHEMA_DIAGNOSIS, findings: findings, summary: summary };
  }

  /* ------------------------------------------------------------------ */
  /* planRepair (§3.2)                                                   */
  /* ------------------------------------------------------------------ */

  function topoOrder(ids, byId) {
    var inSet = Object.create(null);
    var i;
    for (i = 0; i < ids.length; i++) {
      inSet[ids[i]] = true;
    }
    var visited = Object.create(null);
    var out = [];

    function walk(id) {
      if (visited[id]) {
        return;
      }
      visited[id] = true;
      var deps = asArray(byId[id] && byId[id].dependsOn);
      for (var k = 0; k < deps.length; k++) {
        if (!visited[deps[k]] && inSet[deps[k]]) {
          walk(deps[k]);
        }
      }
      out.push(id);
    }

    for (i = 0; i < ids.length; i++) {
      walk(ids[i]);
    }
    return out;
  }

  function planRepair(report) {
    var rep = isObj(report) ? report : {};
    var features = asArray(rep.features);
    var byId = Object.create(null);
    var idxOf = Object.create(null);
    for (var i = 0; i < features.length; i++) {
      var fid = features[i] && features[i].id;
      if (fid !== null && fid !== undefined) {
        byId[fid] = features[i];
        idxOf[fid] = i;
      }
    }

    var diag = diagnose(rep);
    var seen = Object.create(null);
    var affected = [];
    var reasonById = Object.create(null);

    /* affected features in feature-index order; reason = highest-severity finding */
    for (var k = 0; k < diag.findings.length; k++) {
      var fd = diag.findings[k];
      if (!FEATURE_KINDS[fd.kind]) {
        continue;
      }
      var t = fd.feature;
      if (t === null || t === undefined || has(seen, t)) {
        continue;
      }
      seen[t] = true;
      affected.push(t);
      reasonById[t] = fd.message;
    }
    affected.sort(function (a, b) {
      return (idxOf[a] === undefined ? Infinity : idxOf[a]) -
             (idxOf[b] === undefined ? Infinity : idxOf[b]);
    });

    var ordered = topoOrder(affected, byId);
    var steps = [];
    for (var s = 0; s < ordered.length; s++) {
      var tf = ordered[s];
      var type = byId[tf] && byId[tf].type;
      var action = (typeof type === "string" && type) ? ("fix_" + type) : "rebuild";
      steps.push({
        order: s + 1,
        target: tf,
        action: action,
        reason: reasonById[tf] || ""
      });
    }

    /* honesty field: failed/warning features with no step (normally empty) */
    var unrealized = [];
    for (var u = 0; u < features.length; u++) {
      var f = features[u] || {};
      var uid = f.id;
      if ((f.status === "failed" || f.status === "warning") &&
          uid !== null && uid !== undefined && !has(seen, uid)) {
        unrealized.push(uid);
      }
    }

    return { schema: SCHEMA_REPAIR_PLAN, steps: steps, unrealized: unrealized };
  }

  /* ------------------------------------------------------------------ */
  /* planAssembly (§3.3)                                                 */
  /* ------------------------------------------------------------------ */

  function expandQty(id, qty) {
    var q = (typeof qty === "number" && qty > 1) ? Math.floor(qty) : 1;
    var out = [];
    if (q <= 1) {
      out.push(id);
    } else {
      for (var k = 1; k <= q; k++) {
        out.push(id + "#" + k);
      }
    }
    return out;
  }

  function planAssembly(spec) {
    var s = isObj(spec) ? spec : {};
    var name = typeof s.name === "string" ? s.name : "";
    var parts = asArray(s.parts);
    var mates = asArray(s.mates);

    var partIndex = Object.create(null);   /* id -> first index in parts */
    for (var pi = 0; pi < parts.length; pi++) {
      var pid = parts[pi] && parts[pi].id;
      if (pid !== null && pid !== undefined && !has(partIndex, pid)) {
        partIndex[pid] = pi;
      }
    }

    /* mate-degree per known part (endpoint counted once per mate) */
    var degree = Object.create(null);
    for (var di = 0; di < parts.length; di++) {
      var did = parts[di] && parts[di].id;
      if (did !== null && did !== undefined && !has(degree, did)) {
        degree[did] = 0;
      }
    }
    for (var mm = 0; mm < mates.length; mm++) {
      var mate = mates[mm] || {};
      var ends = [];
      if (mate.a !== null && mate.a !== undefined) {
        ends.push(mate.a);
      }
      if (mate.b !== null && mate.b !== undefined && mate.b !== mate.a) {
        ends.push(mate.b);
      }
      for (var e = 0; e < ends.length; e++) {
        if (has(partIndex, ends[e])) {
          degree[ends[e]] += 1;
        }
      }
    }

    /* base = highest degree; ties by parts order then id */
    var base = null;   /* { id, idx } */
    for (var bi = 0; bi < parts.length; bi++) {
      var bid = parts[bi] && parts[bi].id;
      if (bid === null || bid === undefined) {
        continue;
      }
      var deg = degree[bid] || 0;
      if (base === null || deg > base.deg ||
          (deg === base.deg &&
           (bi < base.idx || (bi === base.idx && bid < base.id)))) {
        base = { id: bid, idx: bi, deg: deg };
      }
    }

    /* steps: base first, then other parts in order, then mates in order */
    var steps = [];
    var n = 0;
    function insertPart(id, qty) {
      var copies = expandQty(id, qty);
      for (var k = 0; k < copies.length; k++) {
        n += 1;
        steps.push({ n: n, op: "insert", part: copies[k] });
      }
    }

    if (base !== null) {
      insertPart(base.id, parts[base.idx] && parts[base.idx].qty);
    }
    for (var vi = 0; vi < parts.length; vi++) {
      if (base !== null && vi === base.idx) {
        continue;
      }
      var vp = parts[vi] || {};
      if (vp.id === null || vp.id === undefined) {
        continue;
      }
      insertPart(vp.id, vp.qty);
    }
    for (var mi2 = 0; mi2 < mates.length; mi2++) {
      var m2 = mates[mi2] || {};
      n += 1;
      steps.push({
        n: n,
        op: "mate",
        type: (m2.type === null || m2.type === undefined) ? "" : m2.type,
        a: m2.a,
        b: m2.b
      });
    }

    /* checks (deterministic; high -> med -> low) */
    var checks = [];

    for (var ci = 0; ci < mates.length; ci++) {
      var cm = mates[ci] || {};
      var cmiss = [];
      if (cm.a !== null && cm.a !== undefined && !has(partIndex, cm.a)) {
        cmiss.push(cm.a);
      }
      if (cm.b !== null && cm.b !== undefined && !has(partIndex, cm.b)) {
        cmiss.push(cm.b);
      }
      if (cmiss.length) {
        checks.push({
          kind: "dangling-mate",
          severity: "high",
          message: "Mate " + labelOf(cm, cm.id) + " references missing part " +
                   cmiss.join(", ")
        });
      }
    }

    var counts = Object.create(null);
    var order = [];
    for (var qi = 0; qi < parts.length; qi++) {
      var qid = parts[qi] && parts[qi].id;
      if (qid === null || qid === undefined) {
        continue;
      }
      if (!has(counts, qid)) {
        counts[qid] = 0;
        order.push(qid);
      }
      counts[qid] += 1;
    }
    for (var oi2 = 0; oi2 < order.length; oi2++) {
      if (counts[order[oi2]] > 1) {
        checks.push({
          kind: "duplicate-part",
          severity: "med",
          message: "Part " + order[oi2] + " is defined more than once"
        });
      }
    }

    var uniq = uniqueIds(parts);
    for (var ui = 0; ui < uniq.length; ui++) {
      if (base !== null && uniq[ui] === base.id) {
        continue;
      }
      if ((degree[uniq[ui]] || 0) === 0) {
        checks.push({
          kind: "under-constrained",
          severity: "med",
          message: uniq[ui] + " has no mate"
        });
      }
    }
    for (var oi3 = 0; oi3 < uniq.length; oi3++) {
      if ((degree[uniq[oi3]] || 0) > 6) {
        checks.push({
          kind: "over-constrained",
          severity: "med",
          message: uniq[oi3] + " has " + degree[uniq[oi3]] +
                   " mates (over-constrained)"
        });
      }
    }
    if (parts.length > 0 && mates.length === 0) {
      checks.push({
        kind: "no-mates",
        severity: "low",
        message: "Assembly has no mates"
      });
    }

    for (var chi = 0; chi < checks.length; chi++) {
      checks[chi].id = "chk" + (chi + 1);
    }
    /* normalise key order: id, kind, severity, message */
    var checkOut = [];
    for (var ck = 0; ck < checks.length; ck++) {
      checkOut.push({
        id: checks[ck].id,
        kind: checks[ck].kind,
        severity: checks[ck].severity,
        message: checks[ck].message
      });
    }

    return {
      schema: SCHEMA_ASSEMBLY_PLAN,
      name: name,
      base: base === null ? null : base.id,
      steps: steps,
      checks: checkOut,
      partCount: parts.length,
      mateCount: mates.length
    };
  }

  /* ------------------------------------------------------------------ */
  /* dryRun (§3.4) — the review gate (pure)                              */
  /* ------------------------------------------------------------------ */

  function baseIdOf(part) {
    return typeof part === "string" ? part.replace(/#\d+$/, "") : part;
  }

  function dryRun(plan) {
    var wouldApply = [];
    var blocked = [];

    if (!isObj(plan) || !Array.isArray(plan.steps)) {
      blocked.push("invalid plan");
      return { ok: false, wouldApply: wouldApply, blocked: blocked };
    }

    var i;
    if (plan.schema === SCHEMA_REPAIR_PLAN) {
      for (i = 0; i < plan.steps.length; i++) {
        var st = plan.steps[i] || {};
        var label = "fix " + st.target + " (" + st.action + ")";
        if (st.action === "rebuild") {
          blocked.push(label + " (needs manual CAD input)");
        } else {
          wouldApply.push(label);
        }
      }
    } else if (plan.schema === SCHEMA_ASSEMBLY_PLAN) {
      var inserted = Object.create(null);
      for (i = 0; i < plan.steps.length; i++) {
        if (plan.steps[i] && plan.steps[i].op === "insert") {
          inserted[baseIdOf(plan.steps[i].part)] = true;
        }
      }
      for (i = 0; i < plan.steps.length; i++) {
        var ast = plan.steps[i] || {};
        if (ast.op === "insert") {
          wouldApply.push("insert " + ast.part);
        } else if (ast.op === "mate") {
          var mlabel = "mate " + ast.type + " " + ast.a + "-" + ast.b;
          if (has(inserted, ast.a) && has(inserted, ast.b)) {
            wouldApply.push(mlabel);
          } else {
            blocked.push(mlabel + " (references a missing part)");
          }
        }
      }
    } else {
      blocked.push("unknown plan schema");
    }

    return {
      ok: blocked.length === 0,
      wouldApply: wouldApply,
      blocked: blocked
    };
  }

  /* ------------------------------------------------------------------ */
  /* samples()                                                           */
  /* ------------------------------------------------------------------ */

  function brokenBracket() {
    return {
      schema: SCHEMA_REPORT,
      host: "simulated",
      model: { name: "Bracket v15", units: "mm" },
      features: [
        { id: "f1", type: "extrude", name: "Extrude1", status: "ok" },
        { id: "f2", type: "fillet", name: "Fillet7", status: "failed",
          error: "radius exceeds adjacent face", dependsOn: ["f1"] },
        { id: "f3", type: "pattern", name: "Pattern3", status: "warning",
          error: "reference missing", dependsOn: ["f2"] },
        { id: "f4", type: "mirror", name: "Mirror2", status: "ok",
          dependsOn: ["f2", "f99"] }
      ],
      components: [
        { id: "c1", name: "Bracket Body", qty: 1 }
      ],
      mates: [
        { id: "m1", type: "concentric", a: "c1", b: "c2", status: "ok" }
      ]
    };
  }

  function gearbox() {
    return {
      schema: SCHEMA_ASSEMBLY_SPEC,
      name: "Four-speed gearbox",
      parts: [
        { id: "c1", name: "Housing", qty: 1 },
        { id: "c2", name: "Input Shaft", qty: 1 },
        { id: "c3", name: "Output Shaft", qty: 1 },
        { id: "c4", name: "Gear A", qty: 2 },
        { id: "c5", name: "Bearing", qty: 2 }
      ],
      mates: [
        { id: "m1", type: "concentric", a: "c1", b: "c2" },
        { id: "m2", type: "concentric", a: "c1", b: "c3" },
        { id: "m3", type: "concentric", a: "c2", b: "c4" },
        { id: "m4", type: "concentric", a: "c3", b: "c4" },
        { id: "m5", type: "concentric", a: "c1", b: "c5" }
      ]
    };
  }

  function flange() {
    return {
      schema: SCHEMA_BUILD,
      name: "Mount flange",
      units: "mm",
      material: { name: "Aluminium 6061", density: 2.70 },
      params: { L: 80, W: 40, T: 6, boreR: 4, boltR: 3 },
      solids: [
        { id: "s1", type: "box", x: 0, y: 0, z: 0,
          params: { dx: "L", dy: "W", dz: "T" } }
      ],
      holes: [
        { id: "h1", type: "cylinder", x: 0, y: 0, z: 0,
          params: { r: "boreR", h: "T" } },
        { id: "h2", type: "cylinder", x: -30, y: 15, z: 0,
          params: { r: "boltR", h: "T" } },
        { id: "h3", type: "cylinder", x: 30, y: 15, z: 0,
          params: { r: "boltR", h: "T" } },
        { id: "h4", type: "cylinder", x: -30, y: -15, z: 0,
          params: { r: "boltR", h: "T" } },
        { id: "h5", type: "cylinder", x: 30, y: -15, z: 0,
          params: { r: "boltR", h: "T" } }
      ]
    };
  }

  function buildBracket() {
    return {
      schema: SCHEMA_BUILD,
      name: "Mounting bracket",
      units: "mm",
      material: { name: "Aluminium 6061", density: 2.70 },
      params: { L: 80, W: 40, T: 6, boreR: 4 },
      solids: [
        { id: "s1", type: "box", x: 0, y: 0, z: 0,
          params: { dx: "L", dy: "W", dz: "T" } }
      ],
      holes: [
        { id: "h1", type: "cylinder", x: 26, y: 0, z: 0,
          params: { r: "boreR", h: "T" } },
        { id: "h2", type: "cylinder", x: -26, y: 0, z: 0,
          params: { r: "boreR", h: "T" } }
      ]
    };
  }

  function buildSpacer() {
    return {
      schema: SCHEMA_BUILD,
      name: "Spacer",
      units: "mm",
      material: { name: "Steel", density: 7.85 },
      params: { R: 12, boreR: 6, T: 10 },
      solids: [
        { id: "s1", type: "cylinder", x: 0, y: 0, z: 0,
          params: { r: "R", h: "T" } }
      ],
      holes: [
        { id: "h1", type: "cylinder", x: 0, y: 0, z: 0,
          params: { r: "boreR", h: "T" } }
      ]
    };
  }

  function samples() {
    return {
      brokenBracket: brokenBracket(),
      gearbox: gearbox(),
      flange: flange(),
      bracket: buildBracket(),
      spacer: buildSpacer()
    };
  }

  /* ================================================================== */
  /* v2 — geometry builder, exporters, simulation, adapter registry      */
  /* (docs/vertex-v2-spec.md §1-§2). Deterministic, dependency-free.      */
  /* ================================================================== */

  var SCHEMA_BUILD = "vertex/build-spec/v1";
  var SCHEMA_MESH = "vertex/mesh/v1";
  var SCHEMA_SIM = "vertex/sim/v1";
  var SCHEMA_ADAPTER = "vertex/adapter/v1";

  var CYL_SEG = 24;          /* cylinder / cone radial segments          */
  var PRISM_MIN = 3;         /* minimum polygon sides                    */
  var SPHERE_STACKS = 16;    /* sphere latitude divisions               */
  var SPHERE_SLICES = 24;    /* sphere longitude divisions              */
  var PI = Math.PI;

  /* ---- numeric / formatting helpers ---- */

  function num(v, d) {
    return (typeof v === "number" && isFinite(v)) ? v :
      (d === undefined ? 0 : d);
  }

  function fmt4(n) {
    if (typeof n !== "number" || !isFinite(n)) { n = 0; }
    var s = n.toFixed(4);
    if (s === "-0.0000") { s = "0.0000"; }
    return s;
  }

  function fmtNum(n) {
    if (typeof n !== "number" || !isFinite(n)) { return "0"; }
    var r = Math.round(n * 1e6) / 1e6;
    if (r === 0) { r = 0; }               /* normalise -0 */
    return String(r);
  }

  /* resolve a params value: a number, or the name of a key in `defs`. */
  function resolveValue(defs, val, seen) {
    if (typeof val === "number") {
      return isFinite(val) ? val : 0;
    }
    if (typeof val === "string") {
      if (!has(defs, val)) { return 0; }
      var s = seen || Object.create(null);
      if (has(s, val)) { return 0; }     /* cycle guard */
      s[val] = true;
      return resolveValue(defs, defs[val], s);
    }
    return 0;
  }

  /* resolve every key of a params map to a finite number. */
  function resolveParams(defs) {
    var src = isObj(defs) ? defs : {};
    var out = {};
    var keys = Object.keys(src);
    for (var i = 0; i < keys.length; i++) {
      out[keys[i]] = resolveValue(src, src[keys[i]], Object.create(null));
    }
    return out;
  }

  /* ---- primitives: local-origin geometry (plain arrays) ---- */

  function ring(n, radius, z) {
    var out = [];
    for (var k = 0; k < n; k++) {
      var a = 2 * PI * k / n;
      out.push([radius * Math.cos(a), radius * Math.sin(a), z]);
    }
    return out;
  }

  function boxGeo(dx, dy, dz) {
    var hx = dx / 2, hy = dy / 2, hz = dz / 2;
    var v = [
      [-hx, -hy, -hz], [hx, -hy, -hz], [hx, hy, -hz], [-hx, hy, -hz],
      [-hx, -hy, hz], [hx, -hy, hz], [hx, hy, hz], [-hx, hy, hz]
    ];
    var t = [
      [0, 3, 2], [0, 2, 1],      /* -Z */
      [4, 5, 6], [4, 6, 7],      /* +Z */
      [0, 1, 5], [0, 5, 4],      /* -Y */
      [3, 7, 6], [3, 6, 2],      /* +Y */
      [0, 4, 7], [0, 7, 3],      /* -X */
      [1, 2, 6], [1, 6, 5]       /* +X */
    ];
    return { vertices: v, triangles: t };
  }

  /* cylinder / prism: n-gon extruded along Z, flat fan caps. */
  function extrudedPolygon(n, radius, h) {
    if (n < PRISM_MIN) { n = PRISM_MIN; }
    var verts = [];
    var tris = [];
    var ringB = ring(n, radius, -h / 2);
    var ringT = ring(n, radius, h / 2);
    var cb = verts.length; verts.push([0, 0, -h / 2]);
    var ct = verts.length; verts.push([0, 0, h / 2]);
    var bot = [], top = [], i;
    for (i = 0; i < n; i++) { bot.push(verts.length); verts.push(ringB[i]); }
    for (i = 0; i < n; i++) { top.push(verts.length); verts.push(ringT[i]); }
    for (i = 0; i < n; i++) {
      var j = (i + 1) % n;
      tris.push([cb, bot[j], bot[i]]);
      tris.push([ct, top[i], top[j]]);
      tris.push([bot[i], bot[j], top[j]]);
      tris.push([bot[i], top[j], top[i]]);
    }
    return { vertices: verts, triangles: tris };
  }

  /* cone: two rings (or apex points when a radius is 0). */
  function coneGeo(r1, r2, h) {
    var n = CYL_SEG;
    var verts = [];
    var tris = [];
    var cb = verts.length; verts.push([0, 0, -h / 2]);   /* bottom apex/centre */
    var ct = verts.length; verts.push([0, 0, h / 2]);    /* top apex/centre    */
    var hasBot = r1 > 0, hasTop = r2 > 0;
    var bot = [], top = [], i;
    if (hasBot) {
      var rb = ring(n, r1, -h / 2);
      for (i = 0; i < n; i++) { bot.push(verts.length); verts.push(rb[i]); }
      for (i = 0; i < n; i++) {
        var jb = (i + 1) % n;
        tris.push([cb, bot[jb], bot[i]]);
      }
    }
    if (hasTop) {
      var rt = ring(n, r2, h / 2);
      for (i = 0; i < n; i++) { top.push(verts.length); verts.push(rt[i]); }
      for (i = 0; i < n; i++) {
        var jt = (i + 1) % n;
        tris.push([ct, top[i], top[jt]]);
      }
    }
    for (i = 0; i < n; i++) {
      var j = (i + 1) % n;
      if (hasBot && hasTop) {
        tris.push([bot[i], bot[j], top[j]]);
        tris.push([bot[i], top[j], top[i]]);
      } else if (hasBot) {
        tris.push([bot[i], bot[j], ct]);
      } else if (hasTop) {
        tris.push([cb, top[j], top[i]]);
      }
    }
    return { vertices: verts, triangles: tris };
  }

  /* sphere: UV tessellation with single pole vertices (no degenerates). */
  function sphereGeo(r) {
    var stacks = SPHERE_STACKS, slices = SPHERE_SLICES;
    var verts = [];
    var tris = [];
    var i, j;
    var top = verts.length; verts.push([0, 0, r]);
    var bottom = verts.length; verts.push([0, 0, -r]);
    var rings = [];
    for (i = 1; i < stacks; i++) {
      var phi = PI * i / stacks;
      var z = r * Math.cos(phi);
      var rr = r * Math.sin(phi);
      var row = [];
      for (j = 0; j < slices; j++) {
        var a = 2 * PI * j / slices;
        row.push(verts.length);
        verts.push([rr * Math.cos(a), rr * Math.sin(a), z]);
      }
      rings.push(row);
    }
    for (j = 0; j < slices; j++) {
      var jt = (j + 1) % slices;
      tris.push([top, rings[0][jt], rings[0][j]]);
    }
    for (i = 0; i < rings.length - 1; i++) {
      var a1 = rings[i], b1 = rings[i + 1];
      for (j = 0; j < slices; j++) {
        var k = (j + 1) % slices;
        tris.push([a1[j], a1[k], b1[k]]);
        tris.push([a1[j], b1[k], b1[j]]);
      }
    }
    var last = rings[rings.length - 1];
    for (j = 0; j < slices; j++) {
      var jb = (j + 1) % slices;
      tris.push([bottom, last[j], last[jb]]);
    }
    return { vertices: verts, triangles: tris };
  }

  function primNums(type, params, defs) {
    var g = function (k) { return resolveValue(defs, params[k]); };
    if (type === "box") { return { dx: g("dx"), dy: g("dy"), dz: g("dz") }; }
    if (type === "cylinder") { return { r: g("r"), h: g("h") }; }
    if (type === "cone") { return { r1: g("r1"), r2: g("r2"), h: g("h") }; }
    if (type === "sphere") { return { r: g("r") }; }
    if (type === "prism") { return { sides: g("sides"), r: g("r"), h: g("h") }; }
    return {};
  }

  function primVertsTris(type, p) {
    if (type === "box") { return boxGeo(p.dx, p.dy, p.dz); }
    if (type === "cylinder") { return extrudedPolygon(CYL_SEG, p.r, p.h); }
    if (type === "cone") { return coneGeo(p.r1, p.r2, p.h); }
    if (type === "sphere") { return sphereGeo(p.r); }
    if (type === "prism") { return extrudedPolygon(Math.floor(p.sides), p.r, p.h); }
    return { vertices: [], triangles: [] };
  }

  function primVolume(type, p) {
    if (type === "box") { return p.dx * p.dy * p.dz; }
    if (type === "cylinder") { return PI * p.r * p.r * p.h; }
    if (type === "cone") {
      return PI * p.h / 3 * (p.r1 * p.r1 + p.r1 * p.r2 + p.r2 * p.r2);
    }
    if (type === "sphere") { return 4 / 3 * PI * p.r * p.r * p.r; }
    if (type === "prism") {
      var n = Math.floor(p.sides);
      if (n < PRISM_MIN) { return 0; }
      return 0.5 * n * p.r * p.r * Math.sin(2 * PI / n) * p.h;
    }
    return 0;
  }

  function geomPart(spec, defs) {
    var sp = isObj(spec) ? spec : {};
    var type = typeof sp.type === "string" ? sp.type : "";
    var params = isObj(sp.params) ? sp.params : {};
    var nums = primNums(type, params, defs);
    var geo = primVertsTris(type, nums);
    var tx = num(sp.x, 0), ty = num(sp.y, 0), tz = num(sp.z, 0);
    var verts = [];
    for (var i = 0; i < geo.vertices.length; i++) {
      var v = geo.vertices[i];
      verts.push([v[0] + tx, v[1] + ty, v[2] + tz]);
    }
    return {
      id: sp.id,
      type: type,
      vertices: verts,
      triangles: geo.triangles,
      volume: primVolume(type, nums)
    };
  }

  function buildMesh(buildSpec) {
    var bs = isObj(buildSpec) ? buildSpec : {};
    var defs = isObj(bs.params) ? bs.params : {};
    var parts = [];
    var holes = [];
    var min = [Infinity, Infinity, Infinity];
    var max = [-Infinity, -Infinity, -Infinity];
    var volume = 0, holeVolume = 0, triangles = 0;

    function add(list, spec, isHole) {
      var part = geomPart(spec, defs);
      list.push(part);
      if (isHole) { holeVolume += part.volume; } else { volume += part.volume; }
      triangles += part.triangles.length;
      for (var i = 0; i < part.vertices.length; i++) {
        var v = part.vertices[i];
        if (v[0] < min[0]) { min[0] = v[0]; }
        if (v[1] < min[1]) { min[1] = v[1]; }
        if (v[2] < min[2]) { min[2] = v[2]; }
        if (v[0] > max[0]) { max[0] = v[0]; }
        if (v[1] > max[1]) { max[1] = v[1]; }
        if (v[2] > max[2]) { max[2] = v[2]; }
      }
    }

    var solids = asArray(bs.solids);
    for (var s = 0; s < solids.length; s++) { add(parts, solids[s], false); }
    var hs = asArray(bs.holes);
    for (var h = 0; h < hs.length; h++) { add(holes, hs[h], true); }

    if (min[0] === Infinity) { min = [0, 0, 0]; max = [0, 0, 0]; }

    return {
      schema: SCHEMA_MESH,
      parts: parts,
      holes: holes,
      bounds: { min: min, max: max },
      volume: volume,
      holeVolume: holeVolume,
      netVolume: volume - holeVolume,
      triangles: triangles
    };
  }

  /* ---- shared export helpers ---- */

  function triNormal(a, b, c) {
    var ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
    var vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    var nx = uy * vz - uz * vy;
    var ny = uz * vx - ux * vz;
    var nz = ux * vy - uy * vx;
    var len = Math.sqrt(nx * nx + ny * ny + nz * nz);
    if (len > 0) { nx /= len; ny /= len; nz /= len; }
    else { nx = 0; ny = 0; nz = 0; }
    return [nx, ny, nz];
  }

  function collectTris(mesh) {
    var out = [];
    var parts = asArray(mesh && mesh.parts);
    for (var p = 0; p < parts.length; p++) {
      var part = parts[p] || {};
      var verts = asArray(part.vertices);
      var tris = asArray(part.triangles);
      for (var t = 0; t < tris.length; t++) {
        var tr = tris[t];
        out.push([verts[tr[0]], verts[tr[1]], verts[tr[2]]]);
      }
    }
    return out;
  }

  function utf8Bytes(str) {
    str = String(str);
    var out = [];
    for (var i = 0; i < str.length; i++) {
      var c = str.charCodeAt(i);
      if (c < 0x80) {
        out.push(c);
      } else if (c < 0x800) {
        out.push(0xc0 | (c >> 6), 0x80 | (c & 63));
      } else if (c >= 0xd800 && c < 0xdc00 && i + 1 < str.length) {
        var c2 = str.charCodeAt(i + 1); i++;
        var cp = 0x10000 + ((c - 0xd800) << 10) + (c2 - 0xdc00);
        out.push(0xf0 | (cp >> 18), 0x80 | ((cp >> 12) & 63),
                 0x80 | ((cp >> 6) & 63), 0x80 | (cp & 63));
      } else {
        out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
      }
    }
    return new Uint8Array(out);
  }

  function concatBytes(arrays) {
    var len = 0, i;
    for (i = 0; i < arrays.length; i++) { len += arrays[i].length; }
    var out = new Uint8Array(len);
    var off = 0;
    for (i = 0; i < arrays.length; i++) {
      out.set(arrays[i], off);
      off += arrays[i].length;
    }
    return out;
  }

  var B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

  function base64(bytes) {
    var out = "";
    for (var i = 0; i < bytes.length; i += 3) {
      var b0 = bytes[i];
      var b1 = i + 1 < bytes.length ? bytes[i + 1] : 0;
      var b2 = i + 2 < bytes.length ? bytes[i + 2] : 0;
      var n = (b0 << 16) | (b1 << 8) | b2;
      out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63] +
        (i + 1 < bytes.length ? B64[(n >> 6) & 63] : "=") +
        (i + 2 < bytes.length ? B64[n & 63] : "=");
    }
    return out;
  }

  /* ---- STL ---- */

  function stlAscii(mesh, name) {
    var tris = collectTris(mesh);
    var out = ["solid " + name];
    for (var t = 0; t < tris.length; t++) {
      var a = tris[t][0], b = tris[t][1], c = tris[t][2];
      var nr = triNormal(a, b, c);
      out.push("  facet normal " + fmt4(nr[0]) + " " + fmt4(nr[1]) + " " + fmt4(nr[2]));
      out.push("    outer loop");
      out.push("      vertex " + fmt4(a[0]) + " " + fmt4(a[1]) + " " + fmt4(a[2]));
      out.push("      vertex " + fmt4(b[0]) + " " + fmt4(b[1]) + " " + fmt4(b[2]));
      out.push("      vertex " + fmt4(c[0]) + " " + fmt4(c[1]) + " " + fmt4(c[2]));
      out.push("    endloop");
      out.push("  endfacet");
    }
    out.push("endsolid " + name);
    return out.join("\n") + "\n";
  }

  function stlBinary(mesh, name) {
    var tris = collectTris(mesh);
    var n = tris.length;
    var buf = new Uint8Array(84 + n * 50);
    var dv = new DataView(buf.buffer);
    var header = "Vertex binary STL - " + name;
    for (var i = 0; i < 80; i++) {
      buf[i] = i < header.length ? (header.charCodeAt(i) & 0x7f) : 0x20;
    }
    dv.setUint32(80, n, true);
    var off = 84;
    for (var t = 0; t < n; t++) {
      var a = tris[t][0], b = tris[t][1], c = tris[t][2];
      var nr = triNormal(a, b, c);
      dv.setFloat32(off, nr[0], true); off += 4;
      dv.setFloat32(off, nr[1], true); off += 4;
      dv.setFloat32(off, nr[2], true); off += 4;
      dv.setFloat32(off, a[0], true); off += 4;
      dv.setFloat32(off, a[1], true); off += 4;
      dv.setFloat32(off, a[2], true); off += 4;
      dv.setFloat32(off, b[0], true); off += 4;
      dv.setFloat32(off, b[1], true); off += 4;
      dv.setFloat32(off, b[2], true); off += 4;
      dv.setFloat32(off, c[0], true); off += 4;
      dv.setFloat32(off, c[1], true); off += 4;
      dv.setFloat32(off, c[2], true); off += 4;
      dv.setUint16(off, 0, true); off += 2;
    }
    return buf;
  }

  function exportSTL(mesh, opts) {
    var o = isObj(opts) ? opts : {};
    var name = (typeof o.name === "string" && o.name) ? o.name : "vertex";
    if (o.binary) { return stlBinary(mesh, name); }
    return stlAscii(mesh, name);
  }

  /* ---- OBJ ---- */

  function exportOBJ(mesh) {
    var lines = ["# Vertex OBJ export"];
    var parts = asArray(mesh && mesh.parts);
    var offset = 0, p, v, t;
    for (p = 0; p < parts.length; p++) {
      var part = parts[p] || {};
      lines.push("o " + (part.id !== undefined ? part.id : "part"));
      var verts = asArray(part.vertices);
      for (v = 0; v < verts.length; v++) {
        lines.push("v " + fmtNum(verts[v][0]) + " " + fmtNum(verts[v][1]) +
                   " " + fmtNum(verts[v][2]));
      }
      var tris = asArray(part.triangles);
      for (t = 0; t < tris.length; t++) {
        var tr = tris[t];
        lines.push("f " + (tr[0] + 1 + offset) + " " + (tr[1] + 1 + offset) +
                   " " + (tr[2] + 1 + offset));
      }
      offset += verts.length;
    }
    return lines.join("\n") + "\n";
  }

  /* ---- glTF 2.0 ---- */

  function exportGLTF(mesh) {
    var parts = asArray(mesh && mesh.parts);
    var positions = [];
    var indices = [];
    var vcount = 0, p, v, t;
    for (p = 0; p < parts.length; p++) {
      var part = parts[p] || {};
      var verts = asArray(part.vertices);
      for (v = 0; v < verts.length; v++) {
        positions.push(verts[v][0], verts[v][1], verts[v][2]);
      }
      var tris = asArray(part.triangles);
      for (t = 0; t < tris.length; t++) {
        var tr = tris[t];
        indices.push(tr[0] + vcount, tr[1] + vcount, tr[2] + vcount);
      }
      vcount += verts.length;
    }

    var posBytes = positions.length * 4;
    var idxBytes = indices.length * 4;
    var buffer = new ArrayBuffer(posBytes + idxBytes);
    var dv = new DataView(buffer);
    var off = 0, i;
    for (i = 0; i < positions.length; i++) { dv.setFloat32(off, positions[i], true); off += 4; }
    for (i = 0; i < indices.length; i++) { dv.setUint32(off, indices[i], true); off += 4; }
    var b64 = base64(new Uint8Array(buffer));

    var pmin = [0, 0, 0], pmax = [0, 0, 0];
    if (vcount > 0) {
      pmin = [Infinity, Infinity, Infinity];
      pmax = [-Infinity, -Infinity, -Infinity];
      for (i = 0; i < positions.length; i += 3) {
        for (var k = 0; k < 3; k++) {
          if (positions[i + k] < pmin[k]) { pmin[k] = positions[i + k]; }
          if (positions[i + k] > pmax[k]) { pmax[k] = positions[i + k]; }
        }
      }
    }

    var gltf = {
      asset: { version: "2.0", generator: "Vertex" },
      scene: 0,
      scenes: [{ nodes: [0] }],
      nodes: [{ mesh: 0 }],
      meshes: [{
        primitives: [{ attributes: { POSITION: 0 }, indices: 1, mode: 4 }]
      }],
      accessors: [
        { bufferView: 0, byteOffset: 0, componentType: 5126, count: vcount,
          type: "VEC3", min: pmin, max: pmax },
        { bufferView: 1, byteOffset: 0, componentType: 5125,
          count: indices.length, type: "SCALAR" }
      ],
      bufferViews: [
        { buffer: 0, byteOffset: 0, byteLength: posBytes, target: 34962 },
        { buffer: 0, byteOffset: posBytes, byteLength: idxBytes, target: 34963 }
      ],
      buffers: [{
        byteLength: posBytes + idxBytes,
        uri: "data:application/octet-stream;base64," + b64
      }]
    };
    return JSON.stringify(gltf);
  }

  /* ---- 3MF (store-only ZIP) ---- */

  var CRC_TABLE = null;

  function crc32(bytes) {
    if (CRC_TABLE === null) {
      CRC_TABLE = [];
      for (var n = 0; n < 256; n++) {
        var c = n;
        for (var k = 0; k < 8; k++) {
          c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
        }
        CRC_TABLE[n] = c >>> 0;
      }
    }
    var crc = 0xFFFFFFFF;
    for (var i = 0; i < bytes.length; i++) {
      crc = CRC_TABLE[(crc ^ bytes[i]) & 0xFF] ^ (crc >>> 8);
    }
    return (crc ^ 0xFFFFFFFF) >>> 0;
  }

  function zipStore(entries) {
    var DOS_TIME = 0x0000;
    var DOS_DATE = 0x0021;   /* 1980-01-01, fixed for determinism */
    var locals = [];
    var central = [];
    var offset = 0, e;
    for (e = 0; e < entries.length; e++) {
      var nameBytes = utf8Bytes(entries[e].name);
      var data = entries[e].data;
      var crc = crc32(data);

      var lh = new Uint8Array(30 + nameBytes.length);
      var ldv = new DataView(lh.buffer);
      ldv.setUint32(0, 0x04034b50, true);
      ldv.setUint16(4, 20, true);
      ldv.setUint16(6, 0, true);
      ldv.setUint16(8, 0, true);
      ldv.setUint16(10, DOS_TIME, true);
      ldv.setUint16(12, DOS_DATE, true);
      ldv.setUint32(14, crc, true);
      ldv.setUint32(18, data.length, true);
      ldv.setUint32(22, data.length, true);
      ldv.setUint16(26, nameBytes.length, true);
      ldv.setUint16(28, 0, true);
      lh.set(nameBytes, 30);
      locals.push(lh, data);

      var cd = new Uint8Array(46 + nameBytes.length);
      var cdv = new DataView(cd.buffer);
      cdv.setUint32(0, 0x02014b50, true);
      cdv.setUint16(4, 20, true);
      cdv.setUint16(6, 20, true);
      cdv.setUint16(8, 0, true);
      cdv.setUint16(10, 0, true);
      cdv.setUint16(12, DOS_TIME, true);
      cdv.setUint16(14, DOS_DATE, true);
      cdv.setUint32(16, crc, true);
      cdv.setUint32(20, data.length, true);
      cdv.setUint32(24, data.length, true);
      cdv.setUint16(28, nameBytes.length, true);
      cdv.setUint16(30, 0, true);
      cdv.setUint16(32, 0, true);
      cdv.setUint16(34, 0, true);
      cdv.setUint16(36, 0, true);
      cdv.setUint32(38, 0, true);
      cdv.setUint32(42, offset, true);
      cd.set(nameBytes, 46);
      central.push(cd);

      offset += lh.length + data.length;
    }

    var cdOffset = offset;
    var cdSize = 0;
    for (e = 0; e < central.length; e++) { cdSize += central[e].length; }

    var body = concatBytes(locals.concat(central));

    var eocd = new Uint8Array(22);
    var ev = new DataView(eocd.buffer);
    ev.setUint32(0, 0x06054b50, true);
    ev.setUint16(4, 0, true);
    ev.setUint16(6, 0, true);
    ev.setUint16(8, entries.length, true);
    ev.setUint16(10, entries.length, true);
    ev.setUint32(12, cdSize, true);
    ev.setUint32(16, cdOffset, true);
    ev.setUint16(20, 0, true);

    return concatBytes([body, eocd]);
  }

  function build3mfModel(mesh) {
    var parts = asArray(mesh && mesh.parts);
    var verts = [];
    var tris = [];
    var vcount = 0, p, v, t;
    for (p = 0; p < parts.length; p++) {
      var part = parts[p] || {};
      var vs = asArray(part.vertices);
      for (v = 0; v < vs.length; v++) { verts.push(vs[v]); }
      var ts = asArray(part.triangles);
      for (t = 0; t < ts.length; t++) {
        var tr = ts[t];
        tris.push([tr[0] + vcount, tr[1] + vcount, tr[2] + vcount]);
      }
      vcount += vs.length;
    }
    var out = [];
    out.push('<?xml version="1.0" encoding="UTF-8"?>');
    out.push('<model unit="millimeter" xml:lang="en-US" ' +
      'xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">');
    out.push("<resources>");
    out.push('<object id="1" type="model">');
    out.push("<mesh>");
    out.push("<vertices>");
    for (v = 0; v < verts.length; v++) {
      out.push('<vertex x="' + fmtNum(verts[v][0]) + '" y="' + fmtNum(verts[v][1]) +
               '" z="' + fmtNum(verts[v][2]) + '"/>');
    }
    out.push("</vertices>");
    out.push("<triangles>");
    for (t = 0; t < tris.length; t++) {
      out.push('<triangle v1="' + tris[t][0] + '" v2="' + tris[t][1] +
               '" v3="' + tris[t][2] + '"/>');
    }
    out.push("</triangles>");
    out.push("</mesh>");
    out.push("</object>");
    out.push("</resources>");
    out.push('<build><item objectid="1"/></build>');
    out.push("</model>");
    return out.join("\n");
  }

  function export3MF(mesh) {
    var contentTypes =
      '<?xml version="1.0" encoding="UTF-8"?>\n' +
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/>' +
      "</Types>";
    var rels =
      '<?xml version="1.0" encoding="UTF-8"?>\n' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Target="/3D/3dmodel.model" Id="rel0" ' +
      'Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/>' +
      "</Relationships>";
    var model = build3mfModel(mesh);
    return zipStore([
      { name: "[Content_Types].xml", data: utf8Bytes(contentTypes) },
      { name: "_rels/.rels", data: utf8Bytes(rels) },
      { name: "3D/3dmodel.model", data: utf8Bytes(model) }
    ]);
  }

  /* ---- DXF ---- */

  function convexHull(points) {
    var pts = points.slice().sort(function (a, b) {
      return (a[0] - b[0]) || (a[1] - b[1]);
    });
    var uniq = [];
    for (var i = 0; i < pts.length; i++) {
      var last = uniq[uniq.length - 1];
      if (!last || last[0] !== pts[i][0] || last[1] !== pts[i][1]) {
        uniq.push(pts[i]);
      }
    }
    if (uniq.length <= 2) { return uniq; }
    function cross(o, a, b) {
      return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
    }
    var lower = [];
    for (var l = 0; l < uniq.length; l++) {
      while (lower.length >= 2 &&
             cross(lower[lower.length - 2], lower[lower.length - 1], uniq[l]) <= 0) {
        lower.pop();
      }
      lower.push(uniq[l]);
    }
    var upper = [];
    for (var u = uniq.length - 1; u >= 0; u--) {
      while (upper.length >= 2 &&
             cross(upper[upper.length - 2], upper[upper.length - 1], uniq[u]) <= 0) {
        upper.pop();
      }
      upper.push(uniq[u]);
    }
    lower.pop();
    upper.pop();
    return lower.concat(upper);
  }

  function holeCircle(hole) {
    var verts = asArray(hole && hole.vertices);
    if (!verts.length) { return { cx: 0, cy: 0, r: 0 }; }
    var minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
    var i;
    for (i = 0; i < verts.length; i++) {
      if (verts[i][0] < minx) { minx = verts[i][0]; }
      if (verts[i][1] < miny) { miny = verts[i][1]; }
      if (verts[i][0] > maxx) { maxx = verts[i][0]; }
      if (verts[i][1] > maxy) { maxy = verts[i][1]; }
    }
    var cx = (minx + maxx) / 2, cy = (miny + maxy) / 2;
    var r = 0;
    for (i = 0; i < verts.length; i++) {
      var dx = verts[i][0] - cx, dy = verts[i][1] - cy;
      var dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > r) { r = dist; }
    }
    return { cx: cx, cy: cy, r: r };
  }

  function exportDXF(mesh) {
    var parts = asArray(mesh && mesh.parts);
    var pts = [];
    var p, v;
    for (p = 0; p < parts.length; p++) {
      var verts = asArray(parts[p] && parts[p].vertices);
      for (v = 0; v < verts.length; v++) { pts.push([verts[v][0], verts[v][1]]); }
    }
    var hull = convexHull(pts);
    var lines = [];
    lines.push("0", "SECTION", "2", "ENTITIES");
    lines.push("0", "LWPOLYLINE", "8", "0");
    lines.push("90", String(hull.length));
    lines.push("70", hull.length > 2 ? "1" : "0");
    for (v = 0; v < hull.length; v++) {
      lines.push("10", fmtNum(hull[v][0]), "20", fmtNum(hull[v][1]));
    }
    var holes = asArray(mesh && mesh.holes);
    for (v = 0; v < holes.length; v++) {
      var c = holeCircle(holes[v]);
      lines.push("0", "CIRCLE", "8", "0");
      lines.push("10", fmtNum(c.cx), "20", fmtNum(c.cy), "40", fmtNum(c.r));
    }
    lines.push("0", "ENDSEC", "0", "EOF");
    return lines.join("\n") + "\n";
  }

  /* ---- simulation ---- */

  function centroidOfSolids(mesh) {
    var parts = asArray(mesh && mesh.parts);
    var sx = 0, sy = 0, sz = 0, n = 0;
    for (var p = 0; p < parts.length; p++) {
      var verts = asArray(parts[p] && parts[p].vertices);
      var tris = asArray(parts[p] && parts[p].triangles);
      for (var t = 0; t < tris.length; t++) {
        var tr = tris[t];
        var a = verts[tr[0]], b = verts[tr[1]], c = verts[tr[2]];
        if (!a || !b || !c) { continue; }
        sx += (a[0] + b[0] + c[0]) / 3;
        sy += (a[1] + b[1] + c[1]) / 3;
        sz += (a[2] + b[2] + c[2]) / 3;
        n += 1;
      }
    }
    if (n === 0) { return [0, 0, 0]; }
    return [sx / n, sy / n, sz / n];
  }

  function partAABB(part) {
    var p = isObj(part) ? part : {};
    var pos = Array.isArray(p.pos)
      ? [num(p.pos[0]), num(p.pos[1]), num(p.pos[2])]
      : [num(p.x, 0), num(p.y, 0), num(p.z, 0)];
    var size;
    if (Array.isArray(p.size)) {
      size = [num(p.size[0]), num(p.size[1]), num(p.size[2])];
    } else {
      size = [num(p.dx, 0), num(p.dy, 0), num(p.dz, 0)];
    }
    return {
      min: [pos[0] - size[0] / 2, pos[1] - size[1] / 2, pos[2] - size[2] / 2],
      max: [pos[0] + size[0] / 2, pos[1] + size[1] / 2, pos[2] + size[2] / 2]
    };
  }

  function aabbGap(A, B) {
    var seps = [];
    for (var k = 0; k < 3; k++) {
      var s = Math.max(A.min[k] - B.max[k], B.min[k] - A.max[k]);
      seps.push(s);
    }
    var anyPositive = seps[0] > 0 || seps[1] > 0 || seps[2] > 0;
    if (!anyPositive) { return { verdict: "interfere", gap: 0 }; }
    var gap = Infinity;
    for (k = 0; k < 3; k++) {
      if (seps[k] > 0 && seps[k] < gap) { gap = seps[k]; }
    }
    return { verdict: "clear", gap: gap };
  }

  function norm3(v) {
    if (!Array.isArray(v) || v.length < 3) { return [0, 0, 1]; }
    var x = num(v[0]), y = num(v[1]), z = num(v[2]);
    var len = Math.sqrt(x * x + y * y + z * z);
    if (len === 0) { return [0, 0, 1]; }
    return [x / len, y / len, z / len];
  }

  function identityTransform() {
    return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  }

  function axisOrigin(mate) {
    var axis = norm3(mate && mate.axis);
    var origin = Array.isArray(mate && mate.origin)
      ? [num(mate.origin[0]), num(mate.origin[1]), num(mate.origin[2])]
      : [0, 0, 0];
    return { axis: axis, origin: origin };
  }

  function rotTransform(axis, origin, angle) {
    var ux = axis[0], uy = axis[1], uz = axis[2];
    var c = Math.cos(angle), s = Math.sin(angle), C = 1 - c;
    var r00 = c + ux * ux * C, r01 = ux * uy * C - uz * s, r02 = ux * uz * C + uy * s;
    var r10 = uy * ux * C + uz * s, r11 = c + uy * uy * C, r12 = uy * uz * C - ux * s;
    var r20 = uz * ux * C - uy * s, r21 = uz * uy * C + ux * s, r22 = c + uz * uz * C;
    var ox = origin[0], oy = origin[1], oz = origin[2];
    var tx = ox - (r00 * ox + r01 * oy + r02 * oz);
    var ty = oy - (r10 * ox + r11 * oy + r12 * oz);
    var tz = oz - (r20 * ox + r21 * oy + r22 * oz);
    return [r00, r10, r20, 0, r01, r11, r21, 0,
            r02, r12, r22, 0, tx, ty, tz, 1];
  }

  function translateTransform(axis, d) {
    return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0,
            axis[0] * d, axis[1] * d, axis[2] * d, 1];
  }

  function simulate(assemblySpec, buildSpec) {
    var asm = isObj(assemblySpec) ? assemblySpec : {};
    var parts = asArray(asm.parts);
    var mates = asArray(asm.mates);
    var bs = isObj(buildSpec) ? buildSpec : null;

    var mesh = bs ? buildMesh(bs) : null;
    var netVolume = mesh ? mesh.netVolume : 0;
    var density = (bs && isObj(bs.material) &&
      typeof bs.material.density === "number") ? bs.material.density : 0;
    var material = (bs && isObj(bs.material) &&
      typeof bs.material.name === "string") ? bs.material.name : "";
    var centroid = mesh ? centroidOfSolids(mesh) : [0, 0, 0];

    var aabbs = [];
    for (var ai = 0; ai < parts.length; ai++) { aabbs.push(partAABB(parts[ai])); }

    var clearance = [];
    var interferences = 0;
    for (var i = 0; i < parts.length; i++) {
      for (var j = i + 1; j < parts.length; j++) {
        var g = aabbGap(aabbs[i], aabbs[j]);
        if (g.verdict === "interfere") { interferences += 1; }
        clearance.push({
          a: parts[i] && parts[i].id,
          b: parts[j] && parts[j].id,
          gap_mm: g.gap,
          verdict: g.verdict
        });
      }
    }

    var motion = [];
    var dof = 0;
    for (var mi = 0; mi < mates.length; mi++) {
      var m = mates[mi] || {};
      var type = m.type;
      if (type !== "fixed") { dof += 1; }
      var ao = axisOrigin(m);
      var child = (m.b !== undefined) ? m.b : m.a;
      for (var s = 0; s <= 24; s++) {
        var t = s / 24;
        var T;
        if (type === "concentric" || type === "gear") {
          T = rotTransform(ao.axis, ao.origin, t * 2 * PI);
        } else if (type === "slider") {
          T = translateTransform(ao.axis, t * 50);
        } else {
          T = identityTransform();
        }
        motion.push({ t: t, joint: m.id, part: child, transform: T });
      }
    }

    return {
      schema: SCHEMA_SIM,
      mass: {
        volume_mm3: netVolume,
        mass_g: netVolume / 1000 * density,
        centroid: centroid,
        material: material
      },
      clearance: clearance,
      motion: motion,
      dof: dof,
      summary: {
        parts: parts.length,
        joints: mates.length,
        interferences: interferences
      },
      notes: ["kinematic estimate"]
    };
  }

  /* ---- universal adapter registry ---- */

  function adapter(id, name, kind, protocol, formats, available, notes) {
    return {
      schema: SCHEMA_ADAPTER,
      id: id,
      name: name,
      kind: kind,
      protocol: protocol,
      formats: formats,
      available: available,
      notes: notes
    };
  }

  function adapters() {
    return [
      adapter("fusion", "Autodesk Fusion", "cad", "python-api",
        ["F3D", "STEP", "STL", "OBJ"], false,
        "Fusion Python API add-in (no host in this environment)"),
      adapter("solidworks", "SOLIDWORKS", "cad", "com",
        ["SLDPRT", "SLDASM", "STEP", "STL"], false,
        "SOLIDWORKS COM connector (no host in this environment)"),
      adapter("freecad", "FreeCAD", "cad", "python-api",
        ["FCStd", "STEP", "STL"], false,
        "FreeCAD Python API (no host in this environment)"),
      adapter("blender", "Blender", "mesh", "python-api",
        ["BLEND", "STL", "OBJ", "GLTF"], false,
        "Blender bpy module (no host in this environment)"),
      adapter("onshape", "Onshape", "cad", "rest",
        ["STEP", "STL", "GLTF"], false,
        "Onshape REST API (no credentials in this environment)"),
      adapter("rhino", "Rhino 3D", "cad", "python-api",
        ["3DM", "STEP", "STL"], false,
        "Rhino.Python / rhino3dm (no host in this environment)"),
      adapter("sketchup", "SketchUp", "cad", "cli",
        ["SKP", "STL", "OBJ"], false,
        "SketchUp Ruby API extension (no host in this environment)"),
      adapter("inventor", "Autodesk Inventor", "cad", "com",
        ["IPT", "IAM", "STEP", "STL"], false,
        "Inventor COM API (no host in this environment)"),
      adapter("autocad", "AutoCAD", "cad", "com",
        ["DWG", "DXF"], false,
        "AutoCAD COM/.NET API (no host in this environment)"),
      adapter("catia", "CATIA", "cad", "com",
        ["CATPart", "CATProduct", "STEP", "STL"], false,
        "CATIA COM/automation (no host in this environment)"),
      adapter("solid-edge", "Solid Edge", "cad", "com",
        ["PAR", "ASM", "STEP", "STL"], false,
        "Solid Edge COM API (no host in this environment)"),
      adapter("creo", "PTC Creo", "cad", "cli",
        ["PRT", "ASM", "STEP", "STL"], false,
        "Creo Toolkit / batch (no host in this environment)"),
      adapter("maya", "Autodesk Maya", "mesh", "python-api",
        ["MA", "MB", "OBJ", "GLTF"], false,
        "Maya Python API (no host in this environment)"),
      adapter("step", "STEP / IGES (generic)", "format", "file",
        ["STEP", "STP", "IGES", "IGS"], true,
        "Neutral CAD interchange files"),
      adapter("stl", "STL (generic)", "format", "file",
        ["STL"], true, "Mesh format (ascii + binary)"),
      adapter("obj", "OBJ (generic)", "format", "file",
        ["OBJ"], true, "Wavefront mesh format"),
      adapter("gltf", "glTF 2.0 (generic)", "format", "file",
        ["GLTF", "GLB"], true, "glTF 2.0 scene with embedded buffer"),
      adapter("threemf", "3MF (generic)", "format", "file",
        ["3MF"], true, "3D Manufacturing Format (store-only ZIP)"),
      adapter("dxf", "DXF (generic)", "format", "file",
        ["DXF"], true, "2D outline + hole circles"),
      adapter("simulated", "Vertex Simulation", "mesh", "file",
        ["STL", "OBJ", "GLTF", "3MF", "DXF"], true,
        "In-engine deterministic build + kinematic simulation")
    ];
  }

  /* ================================================================== */
  /* v3 — answers, reverse engineering, drawing→CAD, automation          */
  /* (docs/vertex-v3-spec.md §2). Deterministic, dependency-free.        */
  /* ================================================================== */

  var SCHEMA_ANSWER = "vertex/answer/v1";
  var SCHEMA_SCAN = "vertex/scan/v1";
  var SCHEMA_DRAWING = "vertex/drawing/v1";
  var SCHEMA_BATCH = "vertex/batch/v1";
  var SCHEMA_BATCH_PLAN = "vertex/batch-plan/v1";

  /* short local how-to per CAD op; key order is fixed by TIP_KEYS below */
  var TIPS = {
    fillet: "Select the fillet, lower the radius so it fits the adjacent faces, then rebuild.",
    extrude: "Check the sketch is closed and set a positive depth, then rebuild the extrude.",
    pattern: "Give the pattern a valid direction and count, and fix the source feature first.",
    repair: "Run diagnose to list failures, fix the first upstream one, then rebuild downstream.",
    mate: "Reselect both faces of the mate (or replace a missing component) and re-create it.",
    assembly: "Insert the base part first, then add parts and mates so none is over-constrained.",
    export: "Build the mesh first, then export STL/OBJ/glTF/3MF/DXF behind the review gate."
  };
  var TIP_KEYS = ["fillet", "extrude", "pattern", "repair", "mate", "assembly", "export"];

  /* ---- §2.1 answer (deterministic keyword rules, first match wins) ---- */

  function featureLabel(f) {
    return labelOf(f, (f && f.id !== undefined && f.id !== null) ? f.id : "feature");
  }

  function answer(report, question) {
    var rep = isObj(report) ? report : {};
    var q = (typeof question === "string") ? question : "";
    var lq = q.toLowerCase();
    var features = asArray(rep.features);
    var mates = asArray(rep.mates);
    var i;

    function out(kind, text, evidence) {
      return {
        schema: SCHEMA_ANSWER,
        question: q,
        kind: kind,
        answer: text,
        evidence: evidence || []
      };
    }

    /* count: /how many|count/ */
    if (/how many|count/.test(lq)) {
      if (features.length === 0) {
        return out("count", "This model has no features.", []);
      }
      var order = [];
      var counts = Object.create(null);
      for (i = 0; i < features.length; i++) {
        var cf = features[i] || {};
        var st = (typeof cf.status === "string" && cf.status) ? cf.status : "unknown";
        if (!has(counts, st)) { counts[st] = 0; order.push(st); }
        counts[st] += 1;
      }
      var parts = [];
      var cev = [];
      for (i = 0; i < order.length; i++) {
        parts.push(counts[order[i]] + " " + order[i]);
        cev.push(order[i] + ": " + counts[order[i]]);
      }
      return out("count",
        features.length + " features: " + parts.join(", ") + ".", cev);
    }

    /* status: /what failed|which failed|broken/ */
    if (/what failed|which failed|broken/.test(lq)) {
      var bad = [];
      var bev = [];
      for (i = 0; i < features.length; i++) {
        var bf = features[i] || {};
        if (bf.status === "failed" || bf.status === "warning") {
          bad.push(featureLabel(bf) + " (" + bf.status + ")");
          bev.push(bf.id + " " + featureLabel(bf) + " " + bf.status);
        }
      }
      if (bad.length === 0) {
        return out("status", "No failed or warning features.", []);
      }
      return out("status",
        bad.length + " feature(s) need attention: " + bad.join(", ") + ".", bev);
    }

    /* dependency: /depends on (\w+)/ */
    var dm = lq.match(/depends on (\w+)/);
    if (dm) {
      var depId = dm[1];
      var hits = [];
      var hev = [];
      for (i = 0; i < features.length; i++) {
        var df = features[i] || {};
        if (asArray(df.dependsOn).indexOf(depId) !== -1) {
          hits.push(featureLabel(df) + " (" + df.id + ")");
          hev.push(df.id + " " + featureLabel(df) + " dependsOn " + depId);
        }
      }
      if (hits.length === 0) {
        return out("dependency", "No feature depends on " + depId + ".", []);
      }
      return out("dependency",
        hits.length + " feature(s) depend on " + depId + ": " + hits.join(", ") + ".",
        hev);
    }

    /* howto: how (do|to) i? (fix|make|create|repair|pattern|fillet|extrude|mate|assembly) */
    var hm = lq.match(
      /how (do|to) i? ?(fix|make|create|repair|pattern|fillet|extrude|mate|assembly)/);
    if (hm) {
      var verb = hm[2];
      var key = has(TIPS, verb) ? verb : null;
      if (key === null) {
        for (i = 0; i < TIP_KEYS.length; i++) {
          if (lq.indexOf(TIP_KEYS[i]) !== -1) { key = TIP_KEYS[i]; break; }
        }
      }
      if (key === null) {
        return out("howto",
          "Ask about a CAD operation (fillet, extrude, pattern, repair, mate, " +
          "assembly, export) and I will give a short how-to.", []);
      }
      return out("howto", TIPS[key], ["tip: " + key]);
    }

    /* mate: /mates?/ */
    if (/mates?/.test(lq)) {
      if (mates.length === 0) {
        return out("mate", "This model has no mates.", []);
      }
      var ml = [];
      var mev = [];
      for (i = 0; i < mates.length; i++) {
        var m = mates[i] || {};
        var type = (typeof m.type === "string" && m.type) ? m.type : "mate";
        ml.push(type + " " + m.a + "-" + m.b + " (" + m.id + ")");
        mev.push(m.id + " " + type + " " + m.a + "-" + m.b);
      }
      return out("mate", mates.length + " mate(s): " + ml.join(", ") + ".", mev);
    }

    /* summary: /summary|what is this|overview/ */
    if (/summary|what is this|overview/.test(lq)) {
      var name = (isObj(rep.model) && typeof rep.model.name === "string" &&
        rep.model.name) ? rep.model.name : "This model";
      return out("summary",
        name + " has " + features.length + " features and " + mates.length + " mates.",
        ["features: " + features.length, "mates: " + mates.length]);
    }

    /* unknown: helpful fallback */
    return out("unknown",
      "I can answer counts, failures, dependencies, mates, summaries, and " +
      "how-to questions (for example, \"how do I fix a fillet?\").", []);
  }

  /* ---- §2.2 reverse (scan → parametric CAD) ---- */

  function reverse(scan) {
    var sc = isObj(scan) ? scan : {};
    var pts = asArray(sc.points);
    if (pts.length < 2) {
      throw new Error("reverse: a scan needs at least 2 points");
    }

    var min = [Infinity, Infinity, Infinity];
    var max = [-Infinity, -Infinity, -Infinity];
    var sx = 0, sy = 0, sz = 0, n = 0, i;
    for (i = 0; i < pts.length; i++) {
      var p = Array.isArray(pts[i]) ? pts[i] : [];
      var x = num(p[0], 0), y = num(p[1], 0), z = num(p[2], 0);
      sx += x; sy += y; sz += z; n += 1;
      if (x < min[0]) { min[0] = x; }
      if (y < min[1]) { min[1] = y; }
      if (z < min[2]) { min[2] = z; }
      if (x > max[0]) { max[0] = x; }
      if (y > max[1]) { max[1] = y; }
      if (z > max[2]) { max[2] = z; }
    }
    var cx = sx / n, cy = sy / n;

    /* XY radial spread about the mean — a near-constant radius means a cylinder */
    var rMin = Infinity, rMax = -Infinity, rSum = 0;
    for (i = 0; i < pts.length; i++) {
      var pp = Array.isArray(pts[i]) ? pts[i] : [];
      var dx = num(pp[0], 0) - cx, dy = num(pp[1], 0) - cy;
      var rr = Math.sqrt(dx * dx + dy * dy);
      rSum += rr;
      if (rr < rMin) { rMin = rr; }
      if (rr > rMax) { rMax = rr; }
    }
    var meanR = rSum / pts.length;
    var fit = (typeof sc.maxFitError === "number" && isFinite(sc.maxFitError))
      ? sc.maxFitError : 0.08;

    var dxe = max[0] - min[0], dye = max[1] - min[1], dze = max[2] - min[2];
    var ax = (min[0] + max[0]) / 2;
    var ay = (min[1] + max[1]) / 2;
    var az = (min[2] + max[2]) / 2;

    var solid;
    if (rMax > 0 && ((rMax - rMin) / rMax) < fit) {
      solid = {
        id: "s1", type: "cylinder", x: ax, y: ay, z: az,
        params: { r: meanR, h: dze }
      };
    } else {
      solid = {
        id: "s1", type: "box", x: ax, y: ay, z: az,
        params: { dx: dxe, dy: dye, dz: dze }
      };
    }

    return {
      schema: SCHEMA_BUILD,
      name: "Reversed part",
      units: "mm",
      material: { name: "Aluminium 6061", density: 2.70 },
      params: {},
      solids: [solid],
      holes: []
    };
  }

  /* ---- §2.3 fromDrawing (drawing → CAD) ---- */

  function fromDrawing(drawing) {
    var d = isObj(drawing) ? drawing : {};
    var ext = isObj(d.extents) ? d.extents : {};
    var L = num(ext.L, 0), W = num(ext.W, 0), T = num(ext.T, 0);

    var holesIn = asArray(d.holes);
    var holes = [];
    for (var i = 0; i < holesIn.length; i++) {
      var h = isObj(holesIn[i]) ? holesIn[i] : {};
      holes.push({
        id: "h" + (i + 1),
        type: "cylinder",
        x: num(h.x, 0),
        y: num(h.y, 0),
        z: 0,
        params: { r: num(h.r, 0), h: "T" }
      });
    }

    return {
      schema: SCHEMA_BUILD,
      name: (typeof d.title === "string" && d.title) ? d.title : "Drawing part",
      units: (typeof d.units === "string" && d.units) ? d.units : "mm",
      material: { name: "Aluminium 6061", density: 2.70 },
      params: { L: L, W: W, T: T },
      solids: [
        { id: "s1", type: "box", x: 0, y: 0, z: 0,
          params: { dx: "L", dy: "W", dz: "T" } }
      ],
      holes: holes
    };
  }

  /* ---- §2.4 automate (automation / repetition) ---- */

  function automate(batch) {
    var b = isObj(batch) ? batch : {};
    var ops = asArray(b.ops);
    var steps = [];
    var instances = 0;   /* pattern instances (Vector's "26 blocks → 1 pattern") */
    var exports = 0;     /* total exported files                              */

    for (var i = 0; i < ops.length; i++) {
      var o = isObj(ops[i]) ? ops[i] : {};
      var op = (typeof o.op === "string") ? o.op : "";
      var step = {
        n: i + 1,
        op: op,
        name: (typeof o.name === "string") ? o.name : ""
      };
      if (op === "export") {
        var src = asArray(o.formats);
        var fmts = [];
        for (var f = 0; f < src.length; f++) { fmts.push(src[f]); }
        step.formats = fmts;
        step.count = fmts.length;
        exports += fmts.length;
      } else if (op === "pattern") {
        var pc = Math.floor(num(o.count, 0));
        step.count = pc;
        step.delta = [num(o.dx, 0), num(o.dy, 0), num(o.dz, 0)];
        instances += pc;
      } else if (op === "sheets") {
        step.count = Math.floor(num(o.count, 0));
      } else if (typeof o.count === "number") {
        step.count = o.count;
      }
      steps.push(step);
    }

    return {
      schema: SCHEMA_BATCH_PLAN,
      steps: steps,
      summary: { ops: ops.length, instances: instances, exports: exports }
    };
  }

  return {
    SCHEMA_REPORT: SCHEMA_REPORT,
    SCHEMA_DIAGNOSIS: SCHEMA_DIAGNOSIS,
    SCHEMA_REPAIR_PLAN: SCHEMA_REPAIR_PLAN,
    SCHEMA_ASSEMBLY_PLAN: SCHEMA_ASSEMBLY_PLAN,
    validateReport: validateReport,
    diagnose: diagnose,
    planRepair: planRepair,
    planAssembly: planAssembly,
    dryRun: dryRun,
    samples: samples,
    SCHEMA_BUILD: SCHEMA_BUILD,
    SCHEMA_MESH: SCHEMA_MESH,
    SCHEMA_SIM: SCHEMA_SIM,
    SCHEMA_ADAPTER: SCHEMA_ADAPTER,
    resolveParams: resolveParams,
    buildMesh: buildMesh,
    exportSTL: exportSTL,
    exportOBJ: exportOBJ,
    exportGLTF: exportGLTF,
    export3MF: export3MF,
    exportDXF: exportDXF,
    simulate: simulate,
    adapters: adapters,
    SCHEMA_ANSWER: SCHEMA_ANSWER,
    SCHEMA_SCAN: SCHEMA_SCAN,
    SCHEMA_DRAWING: SCHEMA_DRAWING,
    SCHEMA_BATCH: SCHEMA_BATCH,
    TIPS: TIPS,
    answer: answer,
    reverse: reverse,
    fromDrawing: fromDrawing,
    automate: automate
  };
})();

if (typeof window !== "undefined") { window.Vertex = Vertex; }
if (typeof module !== "undefined" && module.exports) { module.exports = Vertex; }
