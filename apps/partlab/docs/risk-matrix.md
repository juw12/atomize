# Risk → Mitigation matrix — Part Lab

Phase 2 artefact. One row per risk found in Phase 1 when analysing the target
**Vector** (`https://heyvector.co/`, an account-gated cloud AI copilot that drives
Autodesk Fusion / SOLIDWORKS). Every risk maps to a **mitigating** feature (we
remove/reduce it) or a **complementary** feature (we add capability the target
lacks). Improve, do not clone.

Part Lab is a **local, offline-first, zero-dependency parametric part builder**:
describe a mechanical part as parameters + solids + holes, get an instant 3D
preview, deterministic volume/mass/bounding-box stats, and STL export. No
account, no cloud, no CAD licence.

| #   | Risk / weakness (from analysis)                                                                                  | Category     | Severity | Mitigation / complementary feature                                                                                               | Where it lives                       | Status   |
| --- | ---------------------------------------------------------------------------------------------------------------- | ------------ | -------- | ------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ | -------- |
| R1  | Cloud AI reads your open CAD document + design questions; requires sign-in; IP leaves the machine (privacy)        | privacy      | high     | **Local-first / offline**: no account, no network call; all geometry computed in the browser (or a local stdlib server).         | `web/js/engine.js`, `web/js/app.js`  | built    |
| R2  | Vendor lock-in: proprietary, account-gated, no self-host; capability vanishes if the vendor does                    | ops          | high     | **Open + self-hostable + zero-dependency**: plain static files + a Python-stdlib server; part definitions are portable JSON.    | whole app                            | built    |
| R3  | Hard dependency on expensive licensed CAD; SOLIDWORKS is Windows-only; no browser/offline path                     | ops          | med      | **Runs anywhere**: any browser, any OS, offline PWA; parametric preview needs no CAD seat.                                        | `web/` (PWA: `sw.js`, `manifest`)    | built    |
| R4  | Non-deterministic AI edits — same request, different geometry; not reproducible as pure math                       | correctness  | med      | **Deterministic parametric core**: `params → exact mesh`; identical input yields identical output (verified by a test).           | `web/js/engine.js`, `tests/`         | built    |
| R5  | Data portability / terms unclear — where generated geometry lives and whether it exports to open formats is opaque | legal        | med      | **Open export**: ASCII STL export + portable part JSON; nothing locked to a vendor; fully inspectable.                            | `web/js/engine.js` (`toSTL`)         | built    |
| R6  | No transparent pricing; sign-in + download gate before evaluation                                                 | ux           | low      | **Free & instant**: open the app and build a part; no pricing, no sign-in, no download.                                          | `web/index.html`                     | built    |
| R7  | Model output applied to a live CAD model; can mutate production geometry without a hard gate                       | security     | med      | **Human-in-the-loop review gate**: every change is previewed; export is a deliberate, confirmed step (nothing applied silently). | `web/js/app.js` (review → export)    | built    |

## Deliberate non-goals

- **A full CSG boolean kernel / watertight single-manifold STL from overlapping
  bodies** — a real B-rep boolean is a research-grade effort and is out of scope.
  Part Lab treats **holes as analytic subtractive features** (correct mass/volume
  subtraction + a dimensioned feature list in the export) and exports the
  **additive bodies as triangle shells**. Reason: keep the core deterministic,
  dependency-free and testable. Documented as residual risk below.
- **Driving a real CAD application's API (Fusion / SOLIDWORKS)** — that is the
  target's own integration and needs a licensed host + vendor SDK. Part Lab is a
  standalone, local complement, not a plugin.
- **Cloud sync / accounts / collaboration** — deliberately excluded; it would
  re-introduce R1/R2.
- **Non-parametric freeform sculpting / NURBS surfaces** — out of scope; Part Lab
  is parameter-first by design.

## Residual risk

- **Overlapping bodies are exported as separate STL shells (no union).** Rationale
  accepted: most slicers/fab pipelines handle multi-shell STL, and the mass/bbox
  math stays exact; a future CSG kernel is noted as a follow-up. A user needing a
  single manifold should place bodies non-intersecting.
- **Holes reduce computed volume/mass analytically and are drawn in the preview,
  but are not cut out of the exported additive shells.** Rationale accepted for
  v1; the facet list lives in the export alongside a `holes` manifest so the
  downstream tool can cut them.
- **No verification against a licensed CAD kernel.** Rationale accepted: Part Lab
  verifies its own math against closed-form solutions (cube/cylinder/cone volumes)
  in `tests/`, not against Fusion.
