/*
 * Vertex engine tests — hermetic, zero-dependency.
 * Run through Node (ESM). Exit 0 = all checks pass, 1 = a check failed.
 *
 * Usage:  node tests/engine.test.mjs
 * Wrapper: tests/verify_engine.py (locates Node; SKIPs + exit 0 if absent).
 *
 * Covers docs/vertex-spec.md §3: constants, validateReport, diagnose (rules +
 * ordering), planRepair (topological), planAssembly (base + steps + checks),
 * dryRun (review gate), and determinism.
 */
import Vertex from "../web/js/vertex.js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

let passed = 0;
let failed = 0;

function check(name, cond) {
  if (cond) {
    passed += 1;
    console.log("ok   " + name);
  } else {
    failed += 1;
    console.log("FAIL " + name);
  }
}

function eq(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

const { brokenBracket, gearbox } = Vertex.samples();

/* ---- 1. constants -------------------------------------------------- */
check("SCHEMA_REPORT", Vertex.SCHEMA_REPORT === "vertex/model-report/v1");
check("SCHEMA_DIAGNOSIS", Vertex.SCHEMA_DIAGNOSIS === "vertex/diagnosis/v1");
check("SCHEMA_REPAIR_PLAN", Vertex.SCHEMA_REPAIR_PLAN === "vertex/repair-plan/v1");
check("SCHEMA_ASSEMBLY_PLAN", Vertex.SCHEMA_ASSEMBLY_PLAN === "vertex/assembly-plan/v1");

/* ---- 2. validateReport --------------------------------------------- */
check("validateReport accepts sample", Vertex.validateReport(brokenBracket).ok === true);
{
  const bad = Vertex.validateReport({ schema: "nope", features: "x" });
  check("validateReport rejects a malformed report",
    bad.ok === false && Array.isArray(bad.errors) && bad.errors.length > 0);
  const empty = Vertex.validateReport(null);
  check("validateReport rejects null", empty.ok === false && empty.errors.length > 0);
}

/* ---- 3. diagnose(brokenBracket) ------------------------------------ */
const diag = Vertex.diagnose(brokenBracket);
check("diagnose schema", diag.schema === Vertex.SCHEMA_DIAGNOSIS);

const kinds = diag.findings.map((f) => f.kind).sort();
check("diagnose finds the expected kinds",
  eq(kinds, ["broken_reference", "dangling_dependency", "dangling_mate", "failed_feature"]));

check("diagnose summary counts",
  eq(diag.summary, { high: 3, med: 1, low: 0, total: 4 }));

/* ordering: ids sequential, severity non-decreasing, exact expected sequence */
{
  let idsOk = true;
  for (let i = 0; i < diag.findings.length; i++) {
    if (diag.findings[i].id !== "d" + (i + 1)) { idsOk = false; }
  }
  check("findings ids are d1..dN in order", idsOk);

  const rank = { high: 0, med: 1, low: 2 };
  let ordered = true;
  for (let i = 1; i < diag.findings.length; i++) {
    if (rank[diag.findings[i - 1].severity] > rank[diag.findings[i].severity]) {
      ordered = false;
    }
  }
  check("findings ordered by severity rank", ordered);
}
check("d1 is the failed fillet (f2)",
  diag.findings[0].kind === "failed_feature" &&
  diag.findings[0].severity === "high" &&
  diag.findings[0].feature === "f2");
check("d2 is the broken-reference warning (f3)",
  diag.findings[1].kind === "broken_reference" &&
  diag.findings[1].severity === "high" &&
  diag.findings[1].feature === "f3");
check("d3 is the dangling dependency (f4)",
  diag.findings[2].kind === "dangling_dependency" &&
  diag.findings[2].severity === "high" &&
  diag.findings[2].feature === "f4");
check("d4 is the dangling mate (m1)",
  diag.findings[3].kind === "dangling_mate" &&
  diag.findings[3].severity === "med" &&
  diag.findings[3].feature === "m1");
check("rootCause of the broken pattern is the failed fillet",
  diag.findings[1].rootCause === "f2");
check("every finding carries a fix suggestion",
  diag.findings.every((f) => typeof f.fix === "string" && f.fix.length > 0));

/* ---- 4. planRepair(brokenBracket) ---------------------------------- */
const repair = Vertex.planRepair(brokenBracket);
check("repair schema", repair.schema === Vertex.SCHEMA_REPAIR_PLAN);
check("repair has a step for every affected feature", repair.steps.length === 3);
{
  const targets = repair.steps.map((s) => s.target);
  check("repair steps are topologically ordered (f2 before f3)",
    targets.indexOf("f2") !== -1 && targets.indexOf("f2") < targets.indexOf("f3"));
  check("repair covers every failed feature",
    brokenBracket.features
      .filter((f) => f.status === "failed")
      .every((f) => targets.indexOf(f.id) !== -1));
  const f2 = repair.steps.find((s) => s.target === "f2");
  check("failed fillet gets action fix_fillet", f2 && f2.action === "fix_fillet");
  check("step order field is 1-based and sequential",
    repair.steps.every((s, i) => s.order === i + 1));
  check("repair unrealized is empty (all failed features planned)",
    Array.isArray(repair.unrealized) && repair.unrealized.length === 0);
}

/* a straight chain must come out strictly upstream-first */
{
  const chain = {
    schema: Vertex.SCHEMA_REPORT,
    host: "simulated",
    model: { name: "Chain" },
    features: [
      { id: "f1", type: "extrude", name: "Base", status: "failed", error: "bad profile" },
      { id: "f2", type: "fillet", name: "F2", status: "failed", error: "bad", dependsOn: ["f1"] },
      { id: "f3", type: "pattern", name: "F3", status: "failed", error: "bad", dependsOn: ["f2"] }
    ]
  };
  const chainPlan = Vertex.planRepair(chain);
  check("repair orders a chain upstream-first",
    eq(chainPlan.steps.map((s) => s.target), ["f1", "f2", "f3"]));
}

/* ---- 5. planAssembly(gearbox) -------------------------------------- */
const asm = Vertex.planAssembly(gearbox);
check("assembly schema", asm.schema === Vertex.SCHEMA_ASSEMBLY_PLAN);
check("assembly picks c1 as base (highest mate-degree)",
  asm.base === "c1");
check("assembly partCount / mateCount",
  asm.partCount === 5 && asm.mateCount === 5);
check("assembly emits base-first insert",
  asm.steps[0].op === "insert" && asm.steps[0].part === "c1");
{
  const inserts = asm.steps.filter((s) => s.op === "insert").map((s) => s.part);
  const firstMate = asm.steps.findIndex((s) => s.op === "mate");
  const lastInsert = asm.steps.map((s) => s.op).lastIndexOf("insert");
  check("all inserts precede mates", lastInsert < firstMate);
  check("qty expands to #1..n",
    inserts.indexOf("c4#1") !== -1 && inserts.indexOf("c4#2") !== -1 &&
    inserts.indexOf("c5#1") !== -1 && inserts.indexOf("c5#2") !== -1);
  check("single-qty part keeps its plain id",
    inserts.indexOf("c1") !== -1 && inserts.indexOf("c2") !== -1);
  check("mate steps carry type + endpoints",
    asm.steps[firstMate].op === "mate" &&
    asm.steps[firstMate].type === "concentric" &&
    asm.steps[firstMate].a === "c1" && asm.steps[firstMate].b === "c2");
  check("assembly step n is 1-based and sequential",
    asm.steps.every((s, i) => s.n === i + 1));
  check("clean gearbox yields no checks",
    Array.isArray(asm.checks) && asm.checks.length === 0);
}

/* ---- 6. planAssembly crafted duplicate + dangling ------------------ */
{
  const crafted = {
    schema: "vertex/assembly-spec/v1",
    name: "Crafted",
    parts: [
      { id: "p1", name: "A", qty: 1 },
      { id: "p1", name: "A duplicate", qty: 1 },
      { id: "p2", name: "B", qty: 1 }
    ],
    mates: [
      { id: "m1", type: "concentric", a: "p1", b: "p2" },
      { id: "m2", type: "concentric", a: "p2", b: "pX" }
    ]
  };
  const cp = Vertex.planAssembly(crafted);
  const checkKinds = cp.checks.map((c) => c.kind);
  check("crafted plan flags duplicate-part",
    checkKinds.indexOf("duplicate-part") !== -1);
  check("crafted plan flags dangling-mate",
    checkKinds.indexOf("dangling-mate") !== -1);
  check("crafted checks carry ids chk1.. and severities",
    cp.checks.every((c, i) => c.id === "chk" + (i + 1) && typeof c.severity === "string"));
  check("dangling mate is never silently dropped",
    cp.steps.some((s) => s.op === "mate" && s.b === "pX"));
}

/* ---- 7. dryRun (review gate) --------------------------------------- */
{
  const drAsmOk = Vertex.dryRun(asm);
  check("dryRun passes a clean assembly plan",
    drAsmOk.ok === true && drAsmOk.wouldApply.length > 0 && drAsmOk.blocked.length === 0);

  const drRepair = Vertex.dryRun(repair);
  check("dryRun passes a fix-only repair plan",
    drRepair.ok === true && drRepair.wouldApply.length === repair.steps.length &&
    drRepair.blocked.length === 0);

  const rebuildPlan = {
    schema: Vertex.SCHEMA_REPAIR_PLAN,
    steps: [{ order: 1, target: "f9", action: "rebuild", reason: "x" }],
    unrealized: []
  };
  const drRebuild = Vertex.dryRun(rebuildPlan);
  check("dryRun blocks a rebuild action (manual CAD input)",
    drRebuild.ok === false && drRebuild.blocked.length === 1);

  const badPlan = {
    schema: Vertex.SCHEMA_ASSEMBLY_PLAN,
    name: "bad",
    base: "c1",
    steps: [
      { n: 1, op: "insert", part: "c1" },
      { n: 2, op: "mate", type: "concentric", a: "c1", b: "cX" }
    ],
    checks: [],
    partCount: 1,
    mateCount: 1
  };
  const drBad = Vertex.dryRun(badPlan);
  check("dryRun blocks a plan whose step references a missing part",
    drBad.ok === false && drBad.blocked.length === 1 &&
    drBad.wouldApply.length === 1);
}

/* ---- 8. determinism ------------------------------------------------ */
{
  check("diagnose is deterministic",
    JSON.stringify(Vertex.diagnose(brokenBracket)) ===
    JSON.stringify(Vertex.diagnose(brokenBracket)));
  check("planRepair is deterministic",
    JSON.stringify(Vertex.planRepair(brokenBracket)) ===
    JSON.stringify(Vertex.planRepair(brokenBracket)));
  check("planAssembly is deterministic",
    JSON.stringify(Vertex.planAssembly(gearbox)) ===
    JSON.stringify(Vertex.planAssembly(gearbox)));
}

/* ---- 9. tolerance of missing components / mates -------------------- */
{
  let threw = false;
  try {
    const bare = {
      schema: Vertex.SCHEMA_REPORT,
      host: "simulated",
      model: { name: "Bare" },
      features: [{ id: "f1", type: "extrude", name: "E1", status: "ok" }]
    };
    const d = Vertex.diagnose(bare);
    const p = Vertex.planRepair(bare);
    if (d.summary.total !== 0 || p.steps.length !== 0) { threw = true; }
  } catch (e) {
    threw = true;
  }
  check("engine tolerates a report with no components/mates", threw === false);
}

/* ---- 10. v2 constants + api ---------------------------------------- */
check("SCHEMA_BUILD", Vertex.SCHEMA_BUILD === "vertex/build-spec/v1");
check("SCHEMA_MESH", Vertex.SCHEMA_MESH === "vertex/mesh/v1");
check("SCHEMA_SIM", Vertex.SCHEMA_SIM === "vertex/sim/v1");
check("SCHEMA_ADAPTER", Vertex.SCHEMA_ADAPTER === "vertex/adapter/v1");
check("api exposes the v2 functions",
  typeof Vertex.buildMesh === "function" &&
  typeof Vertex.exportSTL === "function" &&
  typeof Vertex.exportOBJ === "function" &&
  typeof Vertex.exportGLTF === "function" &&
  typeof Vertex.export3MF === "function" &&
  typeof Vertex.exportDXF === "function" &&
  typeof Vertex.simulate === "function" &&
  typeof Vertex.adapters === "function" &&
  typeof Vertex.resolveParams === "function");

{
  const { flange } = Vertex.samples();
  check("samples().flange is a BuildSpec",
    flange && flange.schema === Vertex.SCHEMA_BUILD &&
    Array.isArray(flange.solids) && Array.isArray(flange.holes));
}

/* ---- 11. buildMesh — closed-form volumes +++ determinism ----------- */
function approx(a, b, eps) {
  return Math.abs(a - b) <= (eps === undefined ? 1e-6 : eps);
}

const build = {
  schema: Vertex.SCHEMA_BUILD,
  name: "Prims",
  units: "mm",
  material: { name: "Aluminium 6061", density: 2.70 },
  params: { L: 10, W: 4, T: 2, r: 3, h: 5 },
  solids: [
    { id: "b", type: "box", x: 0, y: 0, z: 0, params: { dx: "L", dy: "W", dz: "T" } },
    { id: "cy", type: "cylinder", x: 0, y: 0, z: 0, params: { r: "r", h: "h" } },
    { id: "co", type: "cone", x: 0, y: 0, z: 0, params: { r1: 4, r2: 2, h: "h" } },
    { id: "sp", type: "sphere", x: 0, y: 0, z: 0, params: { r: "r" } },
    { id: "pr", type: "prism", x: 0, y: 0, z: 0, params: { sides: 6, r: "r", h: "h" } }
  ],
  holes: []
};
const mesh = Vertex.buildMesh(build);
check("buildMesh schema + part count",
  mesh.schema === Vertex.SCHEMA_MESH && mesh.parts.length === 5);
check("box volume = dx*dy*dz", approx(mesh.parts[0].volume, 10 * 4 * 2));
check("cylinder volume = pi*r^2*h", approx(mesh.parts[1].volume, Math.PI * 9 * 5));
check("cone volume = pi*h/3*(r1^2+r1r2+r2^2)",
  approx(mesh.parts[2].volume, Math.PI * 5 / 3 * (16 + 8 + 4)));
check("sphere volume = 4/3*pi*r^3", approx(mesh.parts[3].volume, 4 / 3 * Math.PI * 27));
check("prism volume = 0.5*n*r^2*sin(2pi/n)*h",
  approx(mesh.parts[4].volume, 0.5 * 6 * 9 * Math.sin(2 * Math.PI / 6) * 5));
check("box part has 8 vertices / 12 triangles",
  mesh.parts[0].vertices.length === 8 && mesh.parts[0].triangles.length === 12);
check("every primitive produced triangles",
  mesh.parts.every((p) => p.triangles.length > 0 && p.vertices.length > 0));
check("volume = sum of solid volumes",
  approx(mesh.volume, mesh.parts.reduce((a, p) => a + p.volume, 0)));
check("netVolume = volume - holeVolume", approx(mesh.netVolume, mesh.volume - mesh.holeVolume));
check("triangles = sum over parts + holes",
  mesh.triangles === mesh.parts.concat(mesh.holes).reduce((a, p) => a + p.triangles.length, 0));
check("buildMesh is deterministic",
  JSON.stringify(Vertex.buildMesh(build)) === JSON.stringify(Vertex.buildMesh(build)));

{
  const m2 = Vertex.buildMesh({
    schema: Vertex.SCHEMA_BUILD, params: { a: 2, b: 4, c: 6 },
    solids: [{ id: "bx", type: "box", x: 10, y: 20, z: 30,
      params: { dx: "a", dy: "b", dz: "c" } }]
  });
  check("primitive is centred then translated by x,y,z",
    approx(m2.bounds.min[0], 9) && approx(m2.bounds.min[1], 18) &&
    approx(m2.bounds.max[0], 11) && approx(m2.bounds.max[2], 33));
}

check("resolveParams resolves names (and nested refs)",
  JSON.stringify(Vertex.resolveParams({ L: 80, W: 40, dx: "L", dy: "W" })) ===
  JSON.stringify({ L: 80, W: 40, dx: 80, dy: 40 }));

const flange = Vertex.samples().flange;
const flangeMesh = Vertex.buildMesh(flange);
check("flange builds 1 solid + 5 holes",
  flangeMesh.parts.length === 1 && flangeMesh.holes.length === 5);
check("flange gross volume = 80*40*6", approx(flangeMesh.volume, 80 * 40 * 6));
check("flange holeVolume = pi*(4^2 + 4*3^2)*6",
  approx(flangeMesh.holeVolume, Math.PI * (16 + 4 * 9) * 6));
check("flange netVolume = volume - holeVolume",
  approx(flangeMesh.netVolume, flangeMesh.volume - flangeMesh.holeVolume));

/* ---- 12. exportSTL (ascii + binary) -------------------------------- */
const boxMesh = Vertex.buildMesh({
  schema: Vertex.SCHEMA_BUILD, params: { dx: 10, dy: 20, dz: 30 },
  solids: [{ id: "b1", type: "box", params: { dx: "dx", dy: "dy", dz: "dz" } }],
  holes: []
});
const stlA = Vertex.exportSTL(boxMesh);
check("STL ascii starts with 'solid '", stlA.indexOf("solid ") === 0);
check("STL ascii has an endsolid", stlA.indexOf("endsolid") !== -1);
check("STL ascii has one facet per triangle",
  (stlA.match(/facet normal/g) || []).length === 12);
check("STL ascii normals are 4-decimal",
  /facet normal -?\d+\.\d{4} -?\d+\.\d{4} -?\d+\.\d{4}/.test(stlA));
check("STL ascii has 12 vertex triples of 3 vertices",
  (stlA.match(/^ {6}vertex /gm) || []).length === 36);

{
  const stlB = Vertex.exportSTL(boxMesh, { binary: true });
  check("STL binary is a Uint8Array", stlB instanceof Uint8Array);
  check("STL binary length = 84 + 50*n", stlB.length === 84 + 12 * 50);
  const dv = new DataView(stlB.buffer, stlB.byteOffset, stlB.byteLength);
  check("STL binary triangle count at offset 80", dv.getUint32(80, true) === 12);
  check("STL binary default name header",
    typeof Vertex.exportSTL(boxMesh, { binary: true }) === "object");
}

/* ---- 13. exportOBJ ------------------------------------------------- */
const obj = Vertex.exportOBJ(boxMesh);
check("OBJ has an 'o b1' stanza", /^o b1$/m.test(obj));
check("OBJ vertex count is 8",
  obj.split("\n").filter((l) => l.indexOf("v ") === 0).length === 8);
{
  const fLines = obj.split("\n").filter((l) => l.indexOf("f ") === 0);
  check("OBJ face count is 12", fLines.length === 12);
  check("OBJ faces are 1-indexed within range",
    fLines.every((l) => l.slice(2).trim().split(/\s+/).every((i) => {
      const n = Number(i);
      return n >= 1 && n <= 8;
    })));
}

/* ---- 14. exportGLTF (valid glTF 2.0 JSON) -------------------------- */
const gltf = JSON.parse(Vertex.exportGLTF(boxMesh));
check("glTF asset.version === 2.0", gltf.asset && gltf.asset.version === "2.0");
check("glTF has one mesh, node and scene",
  gltf.meshes.length === 1 && gltf.nodes.length === 1 && gltf.scenes.length === 1);
check("glTF buffer is an embedded base64 data URI",
  gltf.buffers.length >= 1 && typeof gltf.buffers[0].uri === "string" &&
  gltf.buffers[0].uri.indexOf("data:") === 0);
{
  const b64 = gltf.buffers[0].uri.split(",")[1];
  const buf = Buffer.from(b64, "base64");
  check("glTF embedded buffer byteLength matches",
    buf.length === gltf.buffers[0].byteLength);
  check("glTF accessors: float32 positions + uint32 indices",
    gltf.accessors[0].componentType === 5126 &&
    gltf.accessors[0].count === 8 &&
    gltf.accessors[1].componentType === 5125 &&
    gltf.accessors[1].count === 36);
}

/* ---- 15. export3MF (store-only ZIP) -------------------------------- */
const tmf = Vertex.export3MF(boxMesh);
check("3MF is a Uint8Array", tmf instanceof Uint8Array);
check("3MF ZIP signature is PK\\x03\\x04",
  tmf[0] === 0x50 && tmf[1] === 0x4b && tmf[2] === 0x03 && tmf[3] === 0x04);
check("3MF is deterministic",
  Vertex.export3MF(boxMesh).length === tmf.length &&
  Vertex.export3MF(boxMesh)[100] === tmf[100]);
writeFileSync(join(__dirname, "vertex-3mf.tmp"), tmf);

/* ---- 16. exportDXF ------------------------------------------------- */
const dxf = Vertex.exportDXF(flangeMesh);
check("DXF has an ENTITIES section", dxf.indexOf("ENTITIES") !== -1);
check("DXF has a LWPOLYLINE outline", dxf.indexOf("LWPOLYLINE") !== -1);
check("DXF has one CIRCLE per hole",
  (dxf.match(/CIRCLE/g) || []).length === flangeMesh.holes.length);
check("DXF terminates with EOF", dxf.trim().endsWith("EOF"));

/* ---- 17. simulate(gearbox) ----------------------------------------- */
const sim = Vertex.simulate(gearbox);
check("sim schema", sim.schema === Vertex.SCHEMA_SIM);
check("sim mass fields present",
  typeof sim.mass.volume_mm3 === "number" &&
  typeof sim.mass.mass_g === "number" &&
  Array.isArray(sim.mass.centroid) && sim.mass.centroid.length === 3 &&
  typeof sim.mass.material === "string");
check("sim clearance has C(5,2)=10 pairs with valid verdicts",
  sim.clearance.length === 10 &&
  sim.clearance.every((c) => typeof c.a === "string" && typeof c.b === "string" &&
    typeof c.gap_mm === "number" &&
    (c.verdict === "clear" || c.verdict === "interfere")));
check("sim dof = non-fixed mates (=5)", sim.dof === 5);
check("sim motion = mates * 25 samples", sim.motion.length === 5 * 25);
check("sim motion entries shaped",
  sim.motion.every((m) => typeof m.t === "number" && m.joint !== undefined &&
    Array.isArray(m.transform) && m.transform.length === 16));
check("sim summary",
  sim.summary.parts === 5 && sim.summary.joints === 5 &&
  typeof sim.summary.interferences === "number");
check("sim notes include 'kinematic estimate'",
  Array.isArray(sim.notes) && sim.notes.indexOf("kinematic estimate") !== -1);
check("simulate is deterministic",
  JSON.stringify(Vertex.simulate(gearbox)) === JSON.stringify(Vertex.simulate(gearbox)));

{
  const sim2 = Vertex.simulate(gearbox, flange);
  check("sim mass uses buildSpec netVolume",
    approx(sim2.mass.volume_mm3, flangeMesh.netVolume));
  check("sim mass_g = netVolume/1000 * density",
    approx(sim2.mass.mass_g, flangeMesh.netVolume / 1000 * 2.70));
  check("sim material from buildSpec", sim2.mass.material === "Aluminium 6061");
  check("sim centroid is finite",
    sim2.mass.centroid.every((x) => typeof x === "number" && isFinite(x)));
}

{
  const asm2 = {
    schema: "vertex/assembly-spec/v1",
    name: "Motion",
    parts: [
      { id: "a", pos: [0, 0, 0], size: [10, 10, 10] },
      { id: "b", pos: [20, 0, 0], size: [10, 10, 10] }
    ],
    mates: [
      { id: "m1", type: "slider", a: "a", b: "b" },
      { id: "m2", type: "fixed", a: "a", b: "b" },
      { id: "m3", type: "concentric", a: "a", b: "b" }
    ]
  };
  const s2 = Vertex.simulate(asm2);
  check("clearance reports a clear pair with the smallest axis gap",
    s2.clearance.length === 1 && s2.clearance[0].verdict === "clear" &&
    approx(s2.clearance[0].gap_mm, 10));
  check("dof counts only non-fixed mates (=2)", s2.dof === 2);
  check("fixed mate produces an identity transform",
    s2.motion.filter((m) => m.joint === "m2").every((m) =>
      JSON.stringify(m.transform) ===
      JSON.stringify([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1])));
  const sliderEnd = s2.motion.filter((m) => m.joint === "m1" && m.t === 1)[0];
  check("slider translates 50mm along +Z at t=1",
    sliderEnd && approx(sliderEnd.transform[14], 50));
}

/* ---- 18. adapters() ------------------------------------------------ */
const ads = Vertex.adapters();
check("adapters() returns >= 12 entries", ads.length >= 12);
check("adapter entry shape",
  ads.every((a) => typeof a.id === "string" && typeof a.name === "string" &&
    (a.kind === "cad" || a.kind === "mesh" || a.kind === "format") &&
    typeof a.protocol === "string" && Array.isArray(a.formats) &&
    typeof a.available === "boolean"));
{
  const byId = {};
  ads.forEach((a) => { byId[a.id] = a; });
  check("simulated adapter is available",
    byId.simulated && byId.simulated.available === true);
  check("fusion adapter is unavailable",
    byId.fusion && byId.fusion.available === false);
  check("all host adapters present",
    ["fusion", "solidworks", "freecad", "blender", "onshape", "rhino",
      "sketchup", "inventor", "autocad"].every((id) => byId[id]));
  check("all format adapters present",
    ["step", "stl", "obj", "gltf", "threemf", "dxf"].every((id) => byId[id]));
}
check("adapters() is deterministic",
  JSON.stringify(Vertex.adapters()) === JSON.stringify(Vertex.adapters()));

/* ---- 19. v3 constants + api --------------------------------------- */
check("SCHEMA_ANSWER", Vertex.SCHEMA_ANSWER === "vertex/answer/v1");
check("SCHEMA_SCAN", Vertex.SCHEMA_SCAN === "vertex/scan/v1");
check("SCHEMA_DRAWING", Vertex.SCHEMA_DRAWING === "vertex/drawing/v1");
check("SCHEMA_BATCH", Vertex.SCHEMA_BATCH === "vertex/batch/v1");
check("api exposes the v3 functions",
  typeof Vertex.answer === "function" &&
  typeof Vertex.reverse === "function" &&
  typeof Vertex.fromDrawing === "function" &&
  typeof Vertex.automate === "function");
check("TIPS has the CAD op keys",
  Vertex.TIPS && ["fillet", "extrude", "pattern", "repair", "mate", "assembly", "export"]
    .every((k) => typeof Vertex.TIPS[k] === "string" && Vertex.TIPS[k].length > 0));

/* ---- 20. answer() -------------------------------------------------- */
{
  const aCount = Vertex.answer(brokenBracket, "how many features?");
  check("answer count: schema + kind",
    aCount.schema === Vertex.SCHEMA_ANSWER && aCount.kind === "count");
  check("answer count: counts every feature",
    aCount.answer.indexOf("4 features") !== -1);
  check("answer count: evidence lists statuses",
    aCount.evidence.indexOf("failed: 1") !== -1 &&
    aCount.evidence.indexOf("warning: 1") !== -1);

  const aStatus = Vertex.answer(brokenBracket, "what failed?");
  check("answer status: kind + evidence",
    aStatus.kind === "status" &&
    aStatus.evidence.indexOf("f2 Fillet7 failed") !== -1 &&
    aStatus.evidence.indexOf("f3 Pattern3 warning") !== -1);

  const aDep = Vertex.answer(brokenBracket, "what depends on f1?");
  check("answer dependency: kind + evidence",
    aDep.kind === "dependency" &&
    aDep.evidence.indexOf("f2 Fillet7 dependsOn f1") !== -1 &&
    aDep.evidence.length === 1);

  const aHow = Vertex.answer(brokenBracket, "how do I fix a fillet?");
  check("answer howto: kind + tip",
    aHow.kind === "howto" && aHow.answer === Vertex.TIPS.fillet &&
    aHow.evidence.indexOf("tip: fillet") !== -1);

  const aMate = Vertex.answer(brokenBracket, "list the mates");
  check("answer mate: kind + evidence",
    aMate.kind === "mate" && aMate.evidence.length === 1 &&
    aMate.answer.indexOf("1 mate") !== -1);

  const aSum = Vertex.answer(brokenBracket, "give me a summary");
  check("answer summary: kind", aSum.kind === "summary");

  const aUnknown = Vertex.answer(brokenBracket, "what colour is the sky?");
  check("answer unknown: kind + empty evidence",
    aUnknown.kind === "unknown" && aUnknown.evidence.length === 0);

  check("answer keeps the original question",
    aCount.question === "how many features?");

  let ansThrew = false;
  try { Vertex.answer(undefined, undefined); } catch (e) { ansThrew = true; }
  check("answer tolerates empty/undefined report",
    ansThrew === false && Vertex.answer(undefined, undefined).kind === "unknown");

  check("answer is deterministic",
    eq(Vertex.answer(brokenBracket, "what depends on f1?"),
       Vertex.answer(brokenBracket, "what depends on f1?")));
}

/* ---- 21. reverse() ------------------------------------------------- */
{
  const boxScan = {
    schema: Vertex.SCHEMA_SCAN,
    points: [[0, 0, 0], [20, 0, 0], [0, 10, 0], [20, 10, 0], [10, 0, 0]],
    maxFitError: 0.08
  };
  const boxSpec = Vertex.reverse(boxScan);
  check("reverse box: schema + name + units",
    boxSpec.schema === Vertex.SCHEMA_BUILD &&
    boxSpec.name === "Reversed part" && boxSpec.units === "mm");
  check("reverse box: material default",
    boxSpec.material.name === "Aluminium 6061" &&
    approx(boxSpec.material.density, 2.70));
  check("reverse box: AABB-fit box",
    boxSpec.solids.length === 1 && boxSpec.solids[0].type === "box" &&
    approx(boxSpec.solids[0].params.dx, 20) &&
    approx(boxSpec.solids[0].params.dy, 10) &&
    approx(boxSpec.solids[0].params.dz, 0));
  check("reverse box: centred on the AABB centre",
    approx(boxSpec.solids[0].x, 10) && approx(boxSpec.solids[0].y, 5));
  check("reverse box: builds a valid mesh",
    Vertex.buildMesh(boxSpec).parts.length === 1);

  const cylPoints = [];
  for (let i = 0; i < 8; i++) {
    const a = i * Math.PI / 4;
    cylPoints.push([5 * Math.cos(a), 5 * Math.sin(a), (i % 2) ? 10 : 0]);
  }
  const cylSpec = Vertex.reverse({ schema: Vertex.SCHEMA_SCAN, points: cylPoints });
  check("reverse cylinder: radial fit emits a cylinder",
    cylSpec.solids.length === 1 && cylSpec.solids[0].type === "cylinder" &&
    approx(cylSpec.solids[0].params.r, 5) &&
    approx(cylSpec.solids[0].params.h, 10));

  let revThrew = false;
  try { Vertex.reverse({ schema: Vertex.SCHEMA_SCAN, points: [[0, 0, 0]] }); }
  catch (e) { revThrew = true; }
  check("reverse throws on fewer than 2 points", revThrew === true);

  check("reverse is deterministic",
    eq(Vertex.reverse(boxScan), Vertex.reverse(boxScan)));
}

/* ---- 22. fromDrawing() --------------------------------------------- */
{
  const drawing = {
    schema: Vertex.SCHEMA_DRAWING, units: "mm",
    extents: { L: 80, W: 40, T: 6 }, title: "Plate",
    holes: [{ x: 0, y: 0, r: 4 }, { x: -30, y: 15, r: 3 }]
  };
  const spec = Vertex.fromDrawing(drawing);
  check("fromDrawing: schema + name + units",
    spec.schema === Vertex.SCHEMA_BUILD && spec.name === "Plate" &&
    spec.units === "mm");
  check("fromDrawing: extents become a centred box",
    spec.solids.length === 1 && spec.solids[0].type === "box" &&
    spec.solids[0].x === 0 && spec.solids[0].y === 0 && spec.solids[0].z === 0);
  check("fromDrawing: one cylinder hole per entry",
    spec.holes.length === 2 &&
    spec.holes.every((h) => h.type === "cylinder" && h.params.h === "T"));
  const dm = Vertex.buildMesh(spec);
  check("fromDrawing: box volume = L*W*T", approx(dm.parts[0].volume, 80 * 40 * 6));
  check("fromDrawing: hole volume = pi*(4^2+3^2)*T",
    approx(dm.holeVolume, Math.PI * (16 + 9) * 6));

  const bare = Vertex.fromDrawing({ extents: { L: 10, W: 5, T: 2 } });
  check("fromDrawing: holes default to []",
    Array.isArray(bare.holes) && bare.holes.length === 0);
  check("fromDrawing: name defaults to 'Drawing part'",
    bare.name === "Drawing part");
  check("fromDrawing is deterministic",
    eq(Vertex.fromDrawing(drawing), Vertex.fromDrawing(drawing)));
}

/* ---- 23. automate() ------------------------------------------------ */
{
  const batch = {
    schema: Vertex.SCHEMA_BATCH,
    ops: [
      { op: "export", name: "flange", formats: ["stl", "obj", "gltf", "3mf", "dxf"] },
      { op: "pattern", name: "rib", count: 26, dx: 8, dy: 0, dz: 0 },
      { op: "sheets", name: "drawing", count: 11 }
    ]
  };
  const plan = Vertex.automate(batch);
  check("automate: plan schema", plan.schema === "vertex/batch-plan/v1");
  check("automate: keeps op order",
    eq(plan.steps.map((s) => s.op), ["export", "pattern", "sheets"]));
  check("automate: steps are numbered 1..n",
    plan.steps.every((s, i) => s.n === i + 1));
  check("automate: export keeps formats + count",
    eq(plan.steps[0].formats, ["stl", "obj", "gltf", "3mf", "dxf"]) &&
    plan.steps[0].count === 5);
  check("automate: pattern expands count + delta",
    plan.steps[1].count === 26 && eq(plan.steps[1].delta, [8, 0, 0]));
  check("automate: sheets count",
    plan.steps[2].op === "sheets" && plan.steps[2].count === 11);
  check("automate: summary totals",
    eq(plan.summary, { ops: 3, instances: 26, exports: 5 }));

  const empty = Vertex.automate({ schema: Vertex.SCHEMA_BATCH, ops: [] });
  check("automate: empty ops → empty plan",
    empty.steps.length === 0 &&
    eq(empty.summary, { ops: 0, instances: 0, exports: 0 }));
  check("automate: tolerates undefined batch",
    Vertex.automate(undefined).steps.length === 0);
  check("automate is deterministic",
    eq(Vertex.automate(batch), Vertex.automate(batch)));
}

/* ---- summary ------------------------------------------------------- */
console.log("\n" + passed + " passed, " + failed + " failed");
process.exit(failed === 0 ? 0 : 1);
