# Decisions

Short records of the load-bearing choices, and what was rejected.

## D1 — One repo, separate apps (`apps/`)
**Decision:** three self-contained apps under `apps/<name>/`, not a shared
framework.
**Why:** the three data models barely overlap. A shared base would couple three
independent products and become a god-object. We share only leaf utilities, if
and when duplication is real.
**Rejected:** `projects/projects/` nesting (confusing); a shared ORM/data layer
(premature).

## D2 — Backends only where state is mutable
**Decision:** Orbis has a backend (exists); Peers gets an *optional* persistence
layer; House of Articles gets **no** backend — just `data/data-spine.json`.
**Why:** a read-only feed does not need a server. A JSON spine makes the data a
contract and can be tested and regenerated, which is what "real" means here.
**Rejected:** a third runtime backend for House of Articles (gold-plating).

## D3 — Storage-boundary adapter, injected at serve time (Peers)
**Decision:** do not edit the ~5.4 MB single-file builds. The local server
injects a small shim that wraps `Storage.prototype` for the app's localStorage
keys.
**Why:** editing the artifact is the biggest risk in the repo; injection keeps
the on-disk file byte-identical for Pages and needs no knowledge of internal
function names.
**Rejected:** patching `loadState`/`saveState` in place; a forked/rewritten build.

## D4 — Static-first sequencing
**Decision:** ship all three to GitHub Pages as static sites *before* backend
work.
**Why:** it de-risks the "live hosting" goal early and keeps deploy bugs
separate from backend bugs.

## D5 — `.nojekyll` + relative paths + case validator
**Decision:** every build emits `.nojekyll`; all references are relative;
`scripts/check_site.py` fails the build on absolute paths or filename-case
mismatches.
**Why:** these are the two failures that pass on Windows and break on Pages.
Rejecting them in CI is cheaper than debugging them in production.

## D6 — Zero third-party dependencies / no Node
**Decision:** Python standard library only; no build step for the front-ends.
**Why:** reproducibility across a Windows authoring box and Linux CI, and no
`pip install` for anyone cloning the repo.

## D7 — Push over HTTPS + PAT (not SSH)
**Decision:** the corporate firewall blocks SSH, so the remote is reached over
HTTPS through the OA proxy with a Personal Access Token.
**Why:** verified — raw SSH (22 and direct 443) times out at the banner; HTTPS
through the proxy works.
