/*
 * Part Lab — engine unit tests (Node ESM, zero dependencies).
 *
 * Loads the pure geometry core (../web/js/engine.js, a CommonJS file) and
 * asserts the frozen contract in docs/partlab-spec.md §3: closed-form volumes,
 * determinism (identical doc => identical mesh JSON + STL), STL structure,
 * param resolution and the bundled presets.
 *
 * Exit 0 = all checks pass, 1 = any check failed. Prints a per-check summary.
 */
import PartLab from '../web/js/engine.js';

const TOL = 1e-9; // absolute floor for float comparisons (never exact equality)

const results = [];
let failed = 0;

function check(name, fn) {
  try {
    fn();
    results.push({ name, ok: true });
  } catch (err) {
    failed++;
    results.push({ name, ok: false, error: err && err.message ? err.message : String(err) });
  }
}

function ok(cond, msg) {
  if (!cond) throw new Error(msg || 'assertion failed');
}

// Relative tolerance with a tiny absolute floor.
function approx(actual, expected, relTol, label) {
  const tol = Math.abs(expected) * relTol + TOL;
  if (!(typeof actual === 'number' && isFinite(actual))) {
    throw new Error((label || 'value') + ' is not a finite number: ' + actual);
  }
  if (Math.abs(actual - expected) > tol) {
    throw new Error((label || 'value') + ' expected ' + expected + ' (±' + (relTol * 100) + '%) but got ' + actual);
  }
}

// Wrap one solid feature in a minimal PartDoc.
function doc(feature) {
  return {
    schema: 'partlab/part/v1',
    name: 'test',
    units: 'mm',
    material: { name: 'test', density: 1 },
    params: {},
    solids: [feature],
    holes: []
  };
}

/* ------------------------------------------------------------------ */
/* constants                                                           */
/* ------------------------------------------------------------------ */

check('constants: SCHEMA and PRIMITIVES match the spec', () => {
  ok(PartLab.SCHEMA === 'partlab/mesh/v1', 'SCHEMA mismatch: ' + PartLab.SCHEMA);
  ok(Array.isArray(PartLab.PRIMITIVES), 'PRIMITIVES must be an array');
  ok(JSON.stringify(PartLab.PRIMITIVES) === JSON.stringify(['box', 'cylinder', 'cone', 'sphere', 'prism']),
    'PRIMITIVES mismatch: ' + JSON.stringify(PartLab.PRIMITIVES));
});

/* ------------------------------------------------------------------ */
/* closed-form volumes                                                 */
/* ------------------------------------------------------------------ */

check('unit cube volume == 1 (closed form)', () => {
  const m = PartLab.buildMesh(doc({ id: 's1', type: 'box', x: 0, y: 0, z: 0, params: { dx: 1, dy: 1, dz: 1 } }));
  approx(m.volume, 1, 1e-12, 'cube volume');
  approx(m.netVolume, 1, 1e-12, 'cube netVolume');
  ok(m.schema === 'partlab/mesh/v1', 'mesh schema mismatch');
  ok(m.triangles === 12, 'cube should have 12 triangles, got ' + m.triangles);
});

check('cylinder volume ≈ πr²h (±0.5%)', () => {
  const r = 10, h = 20;
  const m = PartLab.buildMesh(doc({ id: 's1', type: 'cylinder', x: 0, y: 0, z: 0, params: { r, h } }));
  approx(m.volume, Math.PI * r * r * h, 0.005, 'cylinder volume');
});

check('cone volume ≈ ⅓πr²h (±0.5%)', () => {
  const r = 10, h = 20;
  const m = PartLab.buildMesh(doc({ id: 's1', type: 'cone', x: 0, y: 0, z: 0, params: { r1: r, r2: 0, h } }));
  approx(m.volume, Math.PI * r * r * h / 3, 0.005, 'cone volume');
});

check('sphere volume ≈ (4/3)πr³ (±1%)', () => {
  const r = 10;
  const m = PartLab.buildMesh(doc({ id: 's1', type: 'sphere', x: 0, y: 0, z: 0, params: { r } }));
  approx(m.volume, (4 / 3) * Math.PI * r * r * r, 0.01, 'sphere volume');
});

check('prism volume = 0.5·n·r²·sin(2π/n)·h (closed form)', () => {
  const n = 6, r = 10, h = 5;
  const m = PartLab.buildMesh(doc({ id: 's1', type: 'prism', x: 0, y: 0, z: 0, params: { sides: n, r, h } }));
  approx(m.volume, 0.5 * n * r * r * Math.sin(2 * Math.PI / n) * h, 1e-12, 'prism volume');
});

check('placement: box translated by x,y,z centers bbox correctly', () => {
  const m = PartLab.buildMesh(doc({ id: 's1', type: 'box', x: 10, y: 0, z: 0, params: { dx: 2, dy: 2, dz: 2 } }));
  approx(m.bounds.min[0], 9, 1e-12, 'bbox min x');
  approx(m.bounds.max[0], 11, 1e-12, 'bbox max x');
});

/* ------------------------------------------------------------------ */
/* determinism                                                         */
/* ------------------------------------------------------------------ */

check('determinism: identical doc ⇒ identical Mesh JSON and STL', () => {
  const d = PartLab.presets().bracket;
  const m1 = PartLab.buildMesh(d);
  const m2 = PartLab.buildMesh(d);
  ok(JSON.stringify(m1) === JSON.stringify(m2), 'mesh JSON not byte-identical');
  const s1 = PartLab.toSTL(m1, { name: 'bracket' });
  const s2 = PartLab.toSTL(m2, { name: 'bracket' });
  ok(s1 === s2, 'STL string not byte-identical');
  // A fresh presets() call must reproduce the exact same geometry too.
  const m3 = PartLab.buildMesh(PartLab.presets().bracket);
  ok(JSON.stringify(m1) === JSON.stringify(m3), 'mesh differs across presets() calls');
});

/* ------------------------------------------------------------------ */
/* STL structure                                                       */
/* ------------------------------------------------------------------ */

check('STL structure: solid/endsolid, facet count, 3 vertices per facet, 4-decimals', () => {
  const m = PartLab.buildMesh(doc({ id: 's1', type: 'box', x: 0, y: 0, z: 0, params: { dx: 2, dy: 3, dz: 4 } }));
  const stl = PartLab.toSTL(m, { name: 'cube2' });
  ok(stl.startsWith('solid '), 'must start with "solid "');
  ok(stl.endsWith('endsolid cube2'), 'must end with "endsolid cube2"');

  const facetCount = (stl.match(/facet normal/g) || []).length;
  ok(facetCount === m.triangles, 'facet count ' + facetCount + ' != mesh.triangles ' + m.triangles);

  const vertexLines = (stl.match(/\n\s+vertex /g) || []).length;
  ok(vertexLines === m.triangles * 3, 'vertex lines ' + vertexLines + ' != ' + (m.triangles * 3));

  const blocks = stl.split('endfacet');
  blocks.pop(); // drop the trailing text after the last endfacet
  ok(blocks.length === m.triangles, 'facet blocks ' + blocks.length + ' != ' + m.triangles);
  for (const b of blocks) {
    const n = (b.match(/vertex /g) || []).length;
    ok(n === 3, 'each facet must have exactly 3 vertex lines, got ' + n);
  }

  ok(/facet normal -?\d+\.\d{4} -?\d+\.\d{4} -?\d+\.\d{4}/.test(stl),
    'normal must be 4-decimal fixed point');
});

check('STL degenerate triangle emits a 0 0 0 normal', () => {
  const degenerate = {
    schema: 'partlab/mesh/v1',
    solids: [{ id: 's', type: 'box', vertices: [[0, 0, 0], [1, 0, 0], [2, 0, 0]], triangles: [[0, 1, 2]], volume: 0 }],
    holes: []
  };
  const stl = PartLab.toSTL(degenerate, { name: 'deg' });
  ok(/facet normal 0\.0000 0\.0000 0\.0000/.test(stl), 'degenerate facet must have a 0 0 0 normal');
});

/* ------------------------------------------------------------------ */
/* resolveParams                                                       */
/* ------------------------------------------------------------------ */

check('resolveParams replaces refs (params, features, x/y/z)', () => {
  const d = PartLab.resolveParams({
    params: { L: 80, T: 6 },
    solids: [{ id: 's1', type: 'box', x: 'T', y: 0, z: 0, params: { dx: 'L', dy: 40, dz: 'T' } }],
    holes: []
  });
  ok(d.params.L === 80 && d.params.T === 6, 'param table not resolved');
  ok(d.solids[0].params.dx === 80, 'dx should resolve to 80, got ' + d.solids[0].params.dx);
  ok(d.solids[0].params.dz === 6, 'dz should resolve to 6');
  ok(d.solids[0].params.dy === 40, 'literal dy should be preserved');
  ok(d.solids[0].x === 6, 'x ref should resolve to 6');
});

check('resolveParams throws on unknown param', () => {
  let threw = false;
  try {
    PartLab.resolveParams({
      params: {},
      solids: [{ id: 's1', type: 'box', x: 0, y: 0, z: 0, params: { dx: 'NOPE', dy: 1, dz: 1 } }],
      holes: []
    });
  } catch (e) { threw = true; }
  ok(threw, 'resolveParams must throw on an unknown param reference');
});

check('resolveParams throws on a param cycle', () => {
  let threw = false;
  try {
    PartLab.resolveParams({ params: { a: 'b', b: 'a' }, solids: [], holes: [] });
  } catch (e) { threw = true; }
  ok(threw, 'resolveParams must throw on a cycle');
});

/* ------------------------------------------------------------------ */
/* validate                                                            */
/* ------------------------------------------------------------------ */

check('validate accepts good docs and rejects bad ones', () => {
  ok(PartLab.validate(null).ok === false, 'null doc should be invalid');
  const bad = PartLab.validate({
    schema: 'partlab/part/v1', params: {},
    solids: [{ id: 's', type: 'hexagon', params: {} }], holes: []
  });
  ok(bad.ok === false && bad.errors.length > 0, 'unknown primitive type should be invalid');
  const missing = PartLab.validate({
    schema: 'partlab/part/v1', params: {},
    solids: [{ id: 's', type: 'cylinder', params: { r: 5 } }], holes: []
  });
  ok(missing.ok === false, 'missing required param should be invalid');
  ok(PartLab.validate(PartLab.presets().spacer).ok === true, 'spacer preset should validate');
});

/* ------------------------------------------------------------------ */
/* presets + mass + binary STL                                         */
/* ------------------------------------------------------------------ */

check('presets: bracket, flange, spacer all build with volume > 0', () => {
  const p = PartLab.presets();
  ['bracket', 'flange', 'spacer'].forEach((key) => {
    ok(p[key], 'missing preset: ' + key);
    const v = PartLab.validate(p[key]);
    ok(v.ok, key + ' should validate: ' + JSON.stringify(v.errors));
    const m = PartLab.buildMesh(p[key]);
    ok(m.volume > 0, key + ' volume must be > 0');
    ok(m.netVolume > 0, key + ' netVolume must be > 0');
    ok(m.triangles > 0, key + ' triangles must be > 0');
  });
});

check('mass = netVolume(mm³) × density / 1000', () => {
  const d = {
    schema: 'partlab/part/v1', units: 'mm',
    material: { name: 'Aluminium', density: 2.70 },
    params: {},
    solids: [{ id: 's1', type: 'box', x: 0, y: 0, z: 0, params: { dx: 10, dy: 10, dz: 10 } }],
    holes: []
  };
  approx(PartLab.mass(d), 2.70, 1e-9, 'mass of 1 cm³ @ 2.70 g/cm³');
});

check('toSTLBinary: Uint8Array, size 84 + 50·facets, count header matches', () => {
  const m = PartLab.buildMesh(doc({ id: 's1', type: 'box', x: 0, y: 0, z: 0, params: { dx: 1, dy: 1, dz: 1 } }));
  const bin = PartLab.toSTLBinary(m);
  ok(bin instanceof Uint8Array, 'toSTLBinary must return a Uint8Array');
  ok(bin.length === 84 + 50 * m.triangles, 'binary size mismatch: ' + bin.length + ' vs ' + (84 + 50 * m.triangles));
  const dv = new DataView(bin.buffer, bin.byteOffset, bin.byteLength);
  ok(dv.getUint32(80, true) === m.triangles, 'binary facet-count header mismatch');
});

/* ------------------------------------------------------------------ */
/* summary                                                             */
/* ------------------------------------------------------------------ */

console.log('Part Lab — engine tests');
console.log('=======================');
for (const r of results) {
  console.log((r.ok ? 'PASS' : 'FAIL') + '  ' + r.name + (r.ok ? '' : '\n      -> ' + r.error));
}
console.log('-----------------------');
console.log((results.length - failed) + '/' + results.length + ' checks passed');
process.exit(failed === 0 ? 0 : 1);
