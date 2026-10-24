/*
 * Part Lab — parametric geometry engine (pure, deterministic, no DOM / network).
 *
 * Implements the frozen contract in docs/partlab-spec.md: §2 (PartDoc — portable
 * JSON part definition) and §3 (ENGINE + Mesh format + STL format). Exposes
 * `window.PartLab` in the browser and a guarded CommonJS export for Node tests.
 *
 * Units: millimetres (mm). Mass uses a g/cm^3 density -> grams.
 * Determinism: identical `doc` => byte-identical Mesh JSON and STL string.
 *
 * API:
 *   PartLab.SCHEMA                  -> "partlab/mesh/v1"
 *   PartLab.PRIMITIVES              -> ["box","cylinder","cone","sphere","prism"]
 *   PartLab.resolveParams(doc)      -> doc'  (param refs -> numbers; throws)
 *   PartLab.validate(doc)           -> { ok:boolean, errors:string[] }
 *   PartLab.buildMesh(doc)          -> Mesh
 *   PartLab.mass(doc, mesh?)        -> grams
 *   PartLab.toSTL(mesh, opts?)      -> string (ASCII STL)
 *   PartLab.toSTLBinary(mesh)       -> Uint8Array (binary STL)
 *   PartLab.presets()               -> { bracket, flange, spacer }
 */
(function () {
  "use strict";

  var SCHEMA = "partlab/mesh/v1";
  var PART_SCHEMA = "partlab/part/v1";
  var PRIMITIVES = ["box", "cylinder", "cone", "sphere", "prism"];

  // Required (dimensioning) params per primitive — see spec §2.
  var REQUIRED_PARAMS = {
    box: ["dx", "dy", "dz"],
    cylinder: ["r", "h"],
    cone: ["r1", "r2", "h"],
    sphere: ["r"],
    prism: ["sides", "r", "h"]
  };

  var EPS = 1e-9;

  /* ------------------------------------------------------------------ */
  /* small helpers                                                       */
  /* ------------------------------------------------------------------ */

  function isNum(v) {
    return typeof v === "number" && isFinite(v);
  }

  function has(obj, key) {
    return Object.prototype.hasOwnProperty.call(obj, key);
  }

  function clone(obj) {
    var out = {};
    Object.keys(obj).forEach(function (k) { out[k] = obj[k]; });
    return out;
  }

  function num(v, label) {
    if (!isNum(v)) throw new Error("buildMesh: missing or non-numeric " + label);
    return v;
  }

  function numOrZero(v, label) {
    if (v === undefined || v === null) return 0;
    return num(v, label);
  }

  function segmentsOf(p, fallback) {
    if (p.segments === undefined || p.segments === null) return fallback;
    var n = Math.round(num(p.segments, "segments"));
    return n >= 3 ? n : fallback;
  }

  function translate(vertices, x, y, z) {
    if (x === 0 && y === 0 && z === 0) return vertices;
    return vertices.map(function (v) { return [v[0] + x, v[1] + y, v[2] + z]; });
  }

  /* ------------------------------------------------------------------ */
  /* resolveParams — param refs -> numbers                               */
  /* ------------------------------------------------------------------ */

  function resolveParams(doc) {
    if (!doc || typeof doc !== "object") {
      throw new Error("resolveParams: doc must be an object");
    }
    var table = resolveTable(doc.params || {});
    var out = clone(doc);
    out.params = table;
    out.solids = (doc.solids || []).map(function (f) { return resolveFeature(f, table); });
    out.holes = (doc.holes || []).map(function (f) { return resolveFeature(f, table); });
    return out;
  }

  // Resolve the params table itself (allows refs between params; detects cycles).
  function resolveTable(raw) {
    var out = {};
    var visiting = {};
    function walk(key) {
      if (has(out, key)) return out[key];
      if (visiting[key]) throw new Error('resolveParams: cycle at param "' + key + '"');
      if (!has(raw, key)) throw new Error('resolveParams: unknown param "' + key + '"');
      visiting[key] = true;
      var v = raw[key];
      var n;
      if (isNum(v)) n = v;
      else if (typeof v === "string") n = walk(v);
      else throw new Error('resolveParams: non-numeric param "' + key + '"');
      delete visiting[key];
      out[key] = n;
      return n;
    }
    Object.keys(raw).forEach(walk);
    return out;
  }

  function resolveFeature(feature, table) {
    if (!feature || typeof feature !== "object") return feature;
    var fp = feature.params || {};
    var params = {};
    Object.keys(fp).forEach(function (k) {
      params[k] = resolveRef(fp[k], table, 'param "' + k + '"');
    });
    var out = clone(feature);
    out.params = params;
    out.x = resolveRef(feature.x === undefined ? 0 : feature.x, table, "x");
    out.y = resolveRef(feature.y === undefined ? 0 : feature.y, table, "y");
    out.z = resolveRef(feature.z === undefined ? 0 : feature.z, table, "z");
    return out;
  }

  function resolveRef(v, table, label) {
    if (isNum(v)) return v;
    if (typeof v === "string") {
      if (!has(table, v)) throw new Error('resolveParams: unknown param "' + v + '" (' + label + ')');
      return table[v];
    }
    throw new Error("resolveParams: non-numeric value for " + label);
  }

  /* ------------------------------------------------------------------ */
  /* validate — non-throwing { ok, errors }                              */
  /* ------------------------------------------------------------------ */

  function validate(doc) {
    if (!doc || typeof doc !== "object") {
      return { ok: false, errors: ["doc must be an object"] };
    }
    var errors = [];
    if (has(doc, "schema") && doc.schema !== PART_SCHEMA) {
      errors.push("unknown schema: " + doc.schema);
    }
    var table = null;
    try { table = resolveTable(doc.params || {}); }
    catch (e) { errors.push(e.message); }

    var solids = Array.isArray(doc.solids) ? doc.solids : [];
    var holes = Array.isArray(doc.holes) ? doc.holes : [];
    if (doc.solids !== undefined && !Array.isArray(doc.solids)) errors.push("solids must be an array");
    if (doc.holes !== undefined && !Array.isArray(doc.holes)) errors.push("holes must be an array");
    if (solids.length + holes.length === 0) errors.push("part has no solids or holes");

    checkFeatures(solids, "solid", errors, table);
    checkFeatures(holes, "hole", errors, table);
    return { ok: errors.length === 0, errors: errors };
  }

  function numericValue(v, table) {
    if (isNum(v)) return v;
    if (typeof v === "string" && table && has(table, v)) return table[v];
    return null;
  }

  function checkFeatures(list, role, errors, table) {
    list.forEach(function (f, i) {
      var path = role + "[" + i + "]";
      if (!f || typeof f !== "object") { errors.push(path + ": not an object"); return; }
      if (PRIMITIVES.indexOf(f.type) === -1) {
        errors.push(path + ': unknown type "' + f.type + '"');
        return;
      }
      var req = REQUIRED_PARAMS[f.type];
      var fp = f.params || {};
      var vals = {};
      req.forEach(function (key) {
        var n = numericValue(fp[key], table);
        if (n === null) errors.push(path + ': missing or non-numeric param "' + key + '"');
        else vals[key] = n;
      });
      if (f.type === "prism" && vals.sides !== undefined && vals.sides < 3) {
        errors.push(path + ": prism sides must be >= 3");
      }
      ["x", "y", "z"].forEach(function (axis) {
        if (f[axis] !== undefined && numericValue(f[axis], table) === null) {
          errors.push(path + ": non-numeric " + axis);
        }
      });
    });
  }

  /* ------------------------------------------------------------------ */
  /* geometry builders — all centered on the local origin                */
  /* ------------------------------------------------------------------ */

  // A general surface of revolution about Z: bottom ring radius rBot at z=-h/2,
  // top ring radius rTop at z=+h/2. Covers cylinder / cone / prism.
  function buildRevolve(rBot, rTop, h, segments, capBot, capTop) {
    var n = segments;
    var verts = [];
    var bottom = [];
    var top = [];
    var ang, i, j;
    for (i = 0; i < n; i++) {
      ang = 2 * Math.PI * i / n;
      bottom.push(verts.length);
      verts.push([rBot * Math.cos(ang), rBot * Math.sin(ang), -h / 2]);
    }
    for (i = 0; i < n; i++) {
      ang = 2 * Math.PI * i / n;
      top.push(verts.length);
      verts.push([rTop * Math.cos(ang), rTop * Math.sin(ang), h / 2]);
    }
    var tris = [];
    for (i = 0; i < n; i++) {
      j = (i + 1) % n;
      tris.push([bottom[i], bottom[j], top[j]]);
      tris.push([bottom[i], top[j], top[i]]);
    }
    if (capBot) {
      var bc = verts.length;
      verts.push([0, 0, -h / 2]);
      for (i = 0; i < n; i++) {
        j = (i + 1) % n;
        tris.push([bc, bottom[j], bottom[i]]);
      }
    }
    if (capTop) {
      var tc = verts.length;
      verts.push([0, 0, h / 2]);
      for (i = 0; i < n; i++) {
        j = (i + 1) % n;
        tris.push([tc, top[i], top[j]]);
      }
    }
    return { vertices: verts, triangles: tris };
  }

  function buildBox(p) {
    var hx = p.dx / 2, hy = p.dy / 2, hz = p.dz / 2;
    var v = [
      [-hx, -hy, -hz], [hx, -hy, -hz], [hx, hy, -hz], [-hx, hy, -hz],
      [-hx, -hy, hz], [hx, -hy, hz], [hx, hy, hz], [-hx, hy, hz]
    ];
    var t = [
      [4, 5, 6], [4, 6, 7],   // +Z
      [1, 0, 3], [1, 3, 2],   // -Z
      [3, 7, 6], [3, 6, 2],   // +Y
      [0, 1, 5], [0, 5, 4],   // -Y
      [1, 2, 6], [1, 6, 5],   // +X
      [0, 4, 7], [0, 7, 3]    // -X
    ];
    return { vertices: v, triangles: t, volume: p.dx * p.dy * p.dz };
  }

  function buildSphere(r, bands) {
    var rings = Math.max(2, Math.round(bands));
    var seg = Math.max(3, rings * 2);
    var verts = [];
    var rows = [];
    var i, j, phi, theta;

    verts.push([0, 0, r]); // top pole
    var top = 0;
    for (i = 1; i < rings; i++) {
      phi = Math.PI * i / rings;
      var row = [];
      for (j = 0; j < seg; j++) {
        theta = 2 * Math.PI * j / seg;
        row.push(verts.length);
        verts.push([
          r * Math.sin(phi) * Math.cos(theta),
          r * Math.sin(phi) * Math.sin(theta),
          r * Math.cos(phi)
        ]);
      }
      rows.push(row);
    }
    verts.push([0, 0, -r]); // bottom pole
    var bot = verts.length - 1;

    var tris = [];
    for (j = 0; j < seg; j++) {
      tris.push([top, rows[0][j], rows[0][(j + 1) % seg]]);
    }
    for (i = 0; i < rows.length - 1; i++) {
      for (j = 0; j < seg; j++) {
        var jn = (j + 1) % seg;
        var u0 = rows[i][j], u1 = rows[i][jn];
        var l0 = rows[i + 1][j], l1 = rows[i + 1][jn];
        tris.push([l0, l1, u1]);
        tris.push([l0, u1, u0]);
      }
    }
    var last = rows[rows.length - 1];
    for (j = 0; j < seg; j++) {
      tris.push([bot, last[(j + 1) % seg], last[j]]);
    }
    return { vertices: verts, triangles: tris, volume: (4 / 3) * Math.PI * r * r * r };
  }

  // Build one Mesh feature (solid or hole): centered geometry -> translated.
  function meshFeature(feature) {
    var p = feature.params || {};
    var built;
    switch (feature.type) {
      case "box": {
        built = buildBox({
          dx: num(p.dx, "box.dx"),
          dy: num(p.dy, "box.dy"),
          dz: num(p.dz, "box.dz")
        });
        break;
      }
      case "cylinder": {
        var rc = num(p.r, "cylinder.r");
        var hc = num(p.h, "cylinder.h");
        var gc = buildRevolve(rc, rc, hc, segmentsOf(p, 32), true, true);
        built = { vertices: gc.vertices, triangles: gc.triangles, volume: Math.PI * rc * rc * hc };
        break;
      }
      case "cone": {
        var r1 = num(p.r1, "cone.r1");
        var r2 = num(p.r2, "cone.r2");
        var hk = num(p.h, "cone.h");
        var gk = buildRevolve(r1, r2, hk, segmentsOf(p, 32), true, true);
        built = {
          vertices: gk.vertices, triangles: gk.triangles,
          volume: (Math.PI * hk / 3) * (r1 * r1 + r1 * r2 + r2 * r2)
        };
        break;
      }
      case "sphere": {
        var rs = num(p.r, "sphere.r");
        built = buildSphere(rs, segmentsOf(p, 24));
        break;
      }
      case "prism": {
        var sides = Math.round(num(p.sides, "prism.sides"));
        var rp = num(p.r, "prism.r");
        var hp = num(p.h, "prism.h");
        if (sides < 3) throw new Error("buildMesh: prism sides must be >= 3");
        var gp = buildRevolve(rp, rp, hp, sides, true, true);
        built = {
          vertices: gp.vertices, triangles: gp.triangles,
          volume: 0.5 * sides * rp * rp * Math.sin(2 * Math.PI / sides) * hp
        };
        break;
      }
      default:
        throw new Error('buildMesh: unknown primitive type "' + feature.type + '"');
    }

    var x = numOrZero(feature.x, "x");
    var y = numOrZero(feature.y, "y");
    var z = numOrZero(feature.z, "z");
    return {
      id: feature.id,
      type: feature.type,
      vertices: translate(built.vertices, x, y, z),
      triangles: built.triangles,
      volume: built.volume
    };
  }

  /* ------------------------------------------------------------------ */
  /* buildMesh                                                           */
  /* ------------------------------------------------------------------ */

  function computeBounds(features) {
    var min = [Infinity, Infinity, Infinity];
    var max = [-Infinity, -Infinity, -Infinity];
    var any = false;
    features.forEach(function (f) {
      f.vertices.forEach(function (v) {
        any = true;
        for (var a = 0; a < 3; a++) {
          if (v[a] < min[a]) min[a] = v[a];
          if (v[a] > max[a]) max[a] = v[a];
        }
      });
    });
    if (!any) return { min: [0, 0, 0], max: [0, 0, 0] };
    return { min: min, max: max };
  }

  function buildMesh(doc) {
    var d = resolveParams(doc);
    var solids = (d.solids || []).map(meshFeature);
    var holes = (d.holes || []).map(meshFeature);
    var all = solids.concat(holes);

    var volume = 0;
    solids.forEach(function (f) { volume += f.volume; });
    var holeVolume = 0;
    holes.forEach(function (f) { holeVolume += f.volume; });
    var netVolume = Math.max(0, volume - holeVolume);

    var triangles = 0;
    all.forEach(function (f) { triangles += f.triangles.length; });

    return {
      schema: SCHEMA,
      solids: solids,
      holes: holes,
      bounds: computeBounds(all),
      volume: volume,
      holeVolume: holeVolume,
      netVolume: netVolume,
      triangles: triangles
    };
  }

  /* ------------------------------------------------------------------ */
  /* mass                                                                */
  /* ------------------------------------------------------------------ */

  function mass(doc, mesh) {
    var m = mesh || buildMesh(doc);
    var density = 1;
    if (doc && doc.material && isNum(doc.material.density)) density = doc.material.density;
    return m.netVolume * density / 1000; // mm^3 -> cm^3 -> g
  }

  /* ------------------------------------------------------------------ */
  /* STL export                                                          */
  /* ------------------------------------------------------------------ */

  function fmt(x) {
    var s = x.toFixed(4);
    return s === "-0.0000" ? "0.0000" : s;
  }

  // Right-hand-rule normal from CCW winding; degenerate -> [0,0,0].
  function normalOf(a, b, c) {
    var ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
    var wx = c[0] - a[0], wy = c[1] - a[1], wz = c[2] - a[2];
    var nx = uy * wz - uz * wy;
    var ny = uz * wx - ux * wz;
    var nz = ux * wy - uy * wx;
    var len = Math.sqrt(nx * nx + ny * ny + nz * nz);
    if (len < EPS) return [0, 0, 0];
    return [nx / len, ny / len, nz / len];
  }

  function toSTL(mesh, opts) {
    var name = (opts && opts.name) || "partlab";
    var lines = ["solid " + name];
    var features = (mesh.solids || []).concat(mesh.holes || []);
    features.forEach(function (f) {
      var verts = f.vertices;
      (f.triangles || []).forEach(function (tri) {
        var a = verts[tri[0]], b = verts[tri[1]], c = verts[tri[2]];
        var n = normalOf(a, b, c);
        lines.push("  facet normal " + fmt(n[0]) + " " + fmt(n[1]) + " " + fmt(n[2]));
        lines.push("    outer loop");
        lines.push("      vertex " + fmt(a[0]) + " " + fmt(a[1]) + " " + fmt(a[2]));
        lines.push("      vertex " + fmt(b[0]) + " " + fmt(b[1]) + " " + fmt(b[2]));
        lines.push("      vertex " + fmt(c[0]) + " " + fmt(c[1]) + " " + fmt(c[2]));
        lines.push("    endloop");
        lines.push("  endfacet");
      });
    });
    lines.push("endsolid " + name);
    return lines.join("\n");
  }

  function collectFacets(mesh) {
    var facets = [];
    var features = (mesh.solids || []).concat(mesh.holes || []);
    features.forEach(function (f) {
      var verts = f.vertices;
      (f.triangles || []).forEach(function (tri) {
        var a = verts[tri[0]], b = verts[tri[1]], c = verts[tri[2]];
        facets.push([normalOf(a, b, c), a, b, c]);
      });
    });
    return facets;
  }

  function toSTLBinary(mesh) {
    var facets = collectFacets(mesh);
    var bytes = new Uint8Array(84 + facets.length * 50);
    var view = new DataView(bytes.buffer);
    var header = "PartLab binary STL, facets: " + facets.length;
    for (var i = 0; i < header.length && i < 80; i++) bytes[i] = header.charCodeAt(i) & 0xff;
    view.setUint32(80, facets.length, true);
    var offset = 84;
    facets.forEach(function (fa) {
      var n = fa[0];
      var vals = [
        n[0], n[1], n[2],
        fa[1][0], fa[1][1], fa[1][2],
        fa[2][0], fa[2][1], fa[2][2],
        fa[3][0], fa[3][1], fa[3][2]
      ];
      vals.forEach(function (val) { view.setFloat32(offset, val, true); offset += 4; });
      view.setUint16(offset, 0, true);
      offset += 2;
    });
    return bytes;
  }

  /* ------------------------------------------------------------------ */
  /* presets                                                             */
  /* ------------------------------------------------------------------ */

  function presets() {
    var bracket = {
      schema: PART_SCHEMA,
      name: "Mounting bracket",
      units: "mm",
      material: { name: "Aluminium 6061", density: 2.70 },
      params: { L: 80, W: 40, T: 6, boreR: 4, boreX: 26, boreXL: -26 },
      solids: [
        { id: "s1", type: "box", x: 0, y: 0, z: 0, params: { dx: "L", dy: "W", dz: "T" } }
      ],
      holes: [
        { id: "h1", type: "cylinder", x: "boreX", y: 0, z: 0, params: { r: "boreR", h: "T", segments: 24 } },
        { id: "h2", type: "cylinder", x: "boreXL", y: 0, z: 0, params: { r: "boreR", h: "T", segments: 24 } }
      ]
    };

    var flange = {
      schema: PART_SCHEMA,
      name: "Pipe flange",
      units: "mm",
      material: { name: "Steel", density: 7.85 },
      params: { R: 50, T: 10, boreR: 16, boltCircleR: 34, boltR: 4, bolts: 6 },
      solids: [
        { id: "s1", type: "cylinder", x: 0, y: 0, z: 0, params: { r: "R", h: "T", segments: 48 } }
      ],
      holes: [
        { id: "h1", type: "cylinder", x: 0, y: 0, z: 0, params: { r: "boreR", h: "T", segments: 32 } }
      ]
    };
    var boltCount = flange.params.bolts;
    for (var i = 0; i < boltCount; i++) {
      var a = (Math.PI / 2) + (2 * Math.PI * i / boltCount);
      flange.holes.push({
        id: "b" + i, type: "cylinder",
        x: flange.params.boltCircleR * Math.cos(a),
        y: flange.params.boltCircleR * Math.sin(a),
        z: 0,
        params: { r: "boltR", h: "T", segments: 16 }
      });
    }

    var spacer = {
      schema: PART_SCHEMA,
      name: "Standoff spacer",
      units: "mm",
      material: { name: "Nylon", density: 1.15 },
      params: { R: 8, T: 12, boreR: 3.2 },
      solids: [
        { id: "s1", type: "cylinder", x: 0, y: 0, z: 0, params: { r: "R", h: "T", segments: 32 } }
      ],
      holes: [
        { id: "h1", type: "cylinder", x: 0, y: 0, z: 0, params: { r: "boreR", h: "T", segments: 32 } }
      ]
    };

    return { bracket: bracket, flange: flange, spacer: spacer };
  }

  /* ------------------------------------------------------------------ */
  /* public surface                                                      */
  /* ------------------------------------------------------------------ */

  var PartLab = {
    SCHEMA: SCHEMA,
    PRIMITIVES: PRIMITIVES,
    resolveParams: resolveParams,
    validate: validate,
    buildMesh: buildMesh,
    mass: mass,
    toSTL: toSTL,
    toSTLBinary: toSTLBinary,
    presets: presets
  };

  if (typeof window !== "undefined") { window.PartLab = PartLab; }
  if (typeof module !== "undefined" && module.exports) { module.exports = PartLab; }
})();
