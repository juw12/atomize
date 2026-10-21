# Contributing

This is a personal monorepo, but the conventions below keep it maintainable.

## Layout

- One directory per product under `projects/<name>/`.
- `web/` holds the static front-end (this is what gets deployed to Pages).
- `server/` (or `server.py` at the project root) holds the optional backend.
- `tests/` holds a hermetic, stdlib-only end-to-end test.
- `docs/` holds specs and guides.
- Shared build/deploy logic lives in `scripts/` and `.github/workflows/`.

## Standards

- **Python 3.11+**, standard library only. No third-party runtime dependencies.
- Every backend is reachable via `python <server>.py` and exposes `GET /api/health`.
- Every project must be runnable and testable with a single command.
- Front-ends must keep working with **no backend** (offline mode). The backends
  are an upgrade, not a requirement.
- Tests exit `0` on success and `1` on failure, and must not touch real data
  (use a temp database and a free port).

## Commit messages

Concise, imperative, one logical change per commit, e.g.:

```
peers: add stdlib state backend and opt-in wiring
```

## Before committing

Run the relevant project's test:

```bash
python projects/<name>/tests/verify_api.py
```
