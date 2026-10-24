/*
 * Gantry — deterministic engineering-copilot engine
 * Pure, offline, zero-dependency. No DOM / network / storage / Date / randomness.
 *
 * Frozen contract: docs/gantry-spec.md §3.
 *   Gantry.SCHEMA_REPORT / SCHEMA_DIAGNOSIS / SCHEMA_REPAIR_PLAN / SCHEMA_ASSEMBLY_PLAN
 *   Gantry.validateReport(report)        -> { ok, errors[] }
 *   Gantry.diagnose(report)              -> Diagnosis                        (§3.1)
 *   Gantry.planRepair(report)            -> RepairPlan                       (§3.2)
 *   Gantry.planAssembly(spec)            -> AssemblyPlan                     (§3.3)
 *   Gantry.dryRun(plan)                  -> { ok, wouldApply[], blocked[] }  (§3.4)
 *   Gantry.samples()                     -> { brokenBracket, gearbox }
 *
 * Determinism: identical input => identical output. Ordering is fixed by the
 * rules below; all arrays are stable; nothing reads the clock or randomness.
 *
 * Field tolerances: `components` and `mates` are optional (default []); a
 * well-formed report never throws.
 */
var Gantry = (function () {
  "use strict";

  var SCHEMA_REPORT = "gantry/model-report/v1";
  var SCHEMA_DIAGNOSIS = "gantry/diagnosis/v1";
  var SCHEMA_REPAIR_PLAN = "gantry/repair-plan/v1";
  var SCHEMA_ASSEMBLY_PLAN = "gantry/assembly-plan/v1";
  var SCHEMA_ASSEMBLY_SPEC = "gantry/assembly-spec/v1";

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

  function samples() {
    return { brokenBracket: brokenBracket(), gearbox: gearbox() };
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
    samples: samples
  };
})();

if (typeof window !== "undefined") { window.Gantry = Gantry; }
if (typeof module !== "undefined" && module.exports) { module.exports = Gantry; }
