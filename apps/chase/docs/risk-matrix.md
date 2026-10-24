# Risk → Mitigation matrix — Chase

Phase 2 artefact for the **second iteration** on the target **Vector**
(`https://heyvector.co/`), framed per the user's description: *"a new desktop
engineering copilot that helps fix errors and build whole assemblies in Fusion and
SolidWorks."* Chase accepts that framing (repair + whole-assembly work) but is
**local, deterministic, auditable and review-gated** rather than a cloud,
account-gated AI agent.

Honest constraint driving the design: a faithful integration needs a **licensed
CAD host + the Fusion Python API / SOLIDWORKS COM add-in**, which cannot run or be
verified in this offline, zero-dependency monorepo. So the CAD integration ships as
**host connector templates** + a deterministic **simulation core** (the connector
protocol and the repair/assembly logic are real and tested; the host calls are
stubbed and clearly marked).

| #   | Risk / weakness (from analysis)                                                                 | Category    | Severity | Mitigation / complementary feature                                                                                          | Where it lives                          | Status |
| --- | ----------------------------------------------------------------------------------------------- | ----------- | -------- | -------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- | ------ |
| R1  | Cloud AI reads the open CAD doc + design questions; requires sign-in; IP leaves the machine      | privacy     | high     | **Local-first / offline**: cockpit + bridge run on the machine; no account, no network; model dumps stay local.             | `web/js/chase.js`, `server/bridge.py`  | built  |
| R2  | Proprietary, account-gated, no self-host                                                          | ops         | high     | **Open + self-hostable + zero-dependency**: stdlib bridge, portable JSON schemas, open connector templates.                  | whole app, `connectors/`                | built  |
| R3  | Requires a licensed CAD host; SOLIDWORKS Windows-only; nothing runs without a seat               | ops         | med      | **Simulation core**: full repair/assembly workflow usable with **no CAD host**; connectors activate when a host exists.     | `server/bridge.py`, `connectors/`       | built  |
| R4  | Non-deterministic AI edits; same request ⇒ different geometry; not reproducible                   | correctness | med      | **Deterministic engine**: rules-based diagnosis + topological repair/assembly planning; identical input ⇒ identical output. | `web/js/chase.js`, `tests/`            | built  |
| R7  | Agent holds write access to the live CAD model; can mutate production geometry                    | security    | med      | **Dry-run + review gate**: `dryRun()` + `POST /api/apply` requires `confirm:true`; simulation never writes (`wroteToCad:false`). | `web/js/chase.js`, `server/bridge.py`  | built  |
| R8  | Opaque reasoning — user sees only "the conversation", not an auditable plan                        | ux          | low      | **Auditable artifacts**: a typed Diagnosis + ordered RepairPlan / AssemblyPlan + checks the user can read before applying.  | `web/js/chase.js`, cockpit UI          | built  |

## Deliberate non-goals

- **Actually calling Fusion / SOLIDWORKS APIs in this environment** — no host, SDK
  or licence is available and it cannot be verified here. Connectors ship as
  documented templates with a safe simulation path. Reason: honesty over theatre.
- **Cloning Vector's cloud agent / account model** — would reproduce R1/R2. Chase
  is local and account-free by design.
- **A full geometric kernel / interference solver** — the assembly `checks` are
  graph-level (dangling/duplicate/under/over-constrained), not a numeric
  interference simulation. Reason: keep it deterministic and dependency-free.
- **Language-model reasoning** — Chase is rule-based and deterministic, not an
  LLM; that is the point (R4).

## Residual risk

- **Connector code is unverified against a real host.** Rationale accepted: cannot
  be tested without Fusion/SOLIDWORKS; the shared JSON protocol and the engine are
  tested, and the connectors are import-safe templates. Flagged in `docs/connectors.md`.
- **Repair suggestions are heuristic.** Rationale accepted: deterministic rules
  cover the common failure taxonomy (failed fillet, broken reference, dangling /
  circular dependency, failed mate) but not every CAD-specific edge case; the user
  reviews every step before applying (R7 gate).
- **Assembly checks are structural, not physical.** Rationale accepted: no DOF
  solver; documented as a follow-up.
