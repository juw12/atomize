/*
 * Chase engine tests — hermetic, zero-dependency.
 * Run through Node (ESM). Exit 0 = all checks pass, 1 = a check failed.
 *
 * Usage:  node tests/engine.test.mjs
 * Wrapper: tests/verify_engine.py (locates Node; SKIPs + exit 0 if absent).
 *
 * Covers docs/chase-spec.md §3: constants, validateReport, diagnose (rules +
 * ordering), planRepair (topological), planAssembly (base + steps + checks),
 * dryRun (review gate), and determinism.
 */
import Chase from "../web/js/chase.js";

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

const { brokenBracket, gearbox } = Chase.samples();

/* ---- 1. constants -------------------------------------------------- */
check("SCHEMA_REPORT", Chase.SCHEMA_REPORT === "chase/model-report/v1");
check("SCHEMA_DIAGNOSIS", Chase.SCHEMA_DIAGNOSIS === "chase/diagnosis/v1");
check("SCHEMA_REPAIR_PLAN", Chase.SCHEMA_REPAIR_PLAN === "chase/repair-plan/v1");
check("SCHEMA_ASSEMBLY_PLAN", Chase.SCHEMA_ASSEMBLY_PLAN === "chase/assembly-plan/v1");

/* ---- 2. validateReport --------------------------------------------- */
check("validateReport accepts sample", Chase.validateReport(brokenBracket).ok === true);
{
  const bad = Chase.validateReport({ schema: "nope", features: "x" });
  check("validateReport rejects a malformed report",
    bad.ok === false && Array.isArray(bad.errors) && bad.errors.length > 0);
  const empty = Chase.validateReport(null);
  check("validateReport rejects null", empty.ok === false && empty.errors.length > 0);
}

/* ---- 3. diagnose(brokenBracket) ------------------------------------ */
const diag = Chase.diagnose(brokenBracket);
check("diagnose schema", diag.schema === Chase.SCHEMA_DIAGNOSIS);

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
const repair = Chase.planRepair(brokenBracket);
check("repair schema", repair.schema === Chase.SCHEMA_REPAIR_PLAN);
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
    schema: Chase.SCHEMA_REPORT,
    host: "simulated",
    model: { name: "Chain" },
    features: [
      { id: "f1", type: "extrude", name: "Base", status: "failed", error: "bad profile" },
      { id: "f2", type: "fillet", name: "F2", status: "failed", error: "bad", dependsOn: ["f1"] },
      { id: "f3", type: "pattern", name: "F3", status: "failed", error: "bad", dependsOn: ["f2"] }
    ]
  };
  const chainPlan = Chase.planRepair(chain);
  check("repair orders a chain upstream-first",
    eq(chainPlan.steps.map((s) => s.target), ["f1", "f2", "f3"]));
}

/* ---- 5. planAssembly(gearbox) -------------------------------------- */
const asm = Chase.planAssembly(gearbox);
check("assembly schema", asm.schema === Chase.SCHEMA_ASSEMBLY_PLAN);
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
    schema: "chase/assembly-spec/v1",
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
  const cp = Chase.planAssembly(crafted);
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
  const drAsmOk = Chase.dryRun(asm);
  check("dryRun passes a clean assembly plan",
    drAsmOk.ok === true && drAsmOk.wouldApply.length > 0 && drAsmOk.blocked.length === 0);

  const drRepair = Chase.dryRun(repair);
  check("dryRun passes a fix-only repair plan",
    drRepair.ok === true && drRepair.wouldApply.length === repair.steps.length &&
    drRepair.blocked.length === 0);

  const rebuildPlan = {
    schema: Chase.SCHEMA_REPAIR_PLAN,
    steps: [{ order: 1, target: "f9", action: "rebuild", reason: "x" }],
    unrealized: []
  };
  const drRebuild = Chase.dryRun(rebuildPlan);
  check("dryRun blocks a rebuild action (manual CAD input)",
    drRebuild.ok === false && drRebuild.blocked.length === 1);

  const badPlan = {
    schema: Chase.SCHEMA_ASSEMBLY_PLAN,
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
  const drBad = Chase.dryRun(badPlan);
  check("dryRun blocks a plan whose step references a missing part",
    drBad.ok === false && drBad.blocked.length === 1 &&
    drBad.wouldApply.length === 1);
}

/* ---- 8. determinism ------------------------------------------------ */
{
  check("diagnose is deterministic",
    JSON.stringify(Chase.diagnose(brokenBracket)) ===
    JSON.stringify(Chase.diagnose(brokenBracket)));
  check("planRepair is deterministic",
    JSON.stringify(Chase.planRepair(brokenBracket)) ===
    JSON.stringify(Chase.planRepair(brokenBracket)));
  check("planAssembly is deterministic",
    JSON.stringify(Chase.planAssembly(gearbox)) ===
    JSON.stringify(Chase.planAssembly(gearbox)));
}

/* ---- 9. tolerance of missing components / mates -------------------- */
{
  let threw = false;
  try {
    const bare = {
      schema: Chase.SCHEMA_REPORT,
      host: "simulated",
      model: { name: "Bare" },
      features: [{ id: "f1", type: "extrude", name: "E1", status: "ok" }]
    };
    const d = Chase.diagnose(bare);
    const p = Chase.planRepair(bare);
    if (d.summary.total !== 0 || p.steps.length !== 0) { threw = true; }
  } catch (e) {
    threw = true;
  }
  check("engine tolerates a report with no components/mates", threw === false);
}

/* ---- summary ------------------------------------------------------- */
console.log("\n" + passed + " passed, " + failed + " failed");
process.exit(failed === 0 ? 0 : 1);
