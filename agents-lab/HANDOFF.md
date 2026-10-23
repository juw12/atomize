# HANDOFF.md — shared scratchpad (A ↔ C)

One task at a time. Newest entry on top.

---
## Template (copy this)
```
Task:              <what to build/do>
Acceptance:        <how we know it's done>
A (VS Code) notes: <files changed, how verified>
C (Hermes) notes:  <commands run, research, next action>
Status:            todo | in-progress | done
Next:              <what to do next>
```

---
## Example
```
Task:              Add a /health endpoint to the API
Acceptance:        returns {"ok": true}; covered by a test
A (VS Code) notes: added route + test in server/; diagnostics clean
C (Hermes) notes:  ran `python tests/verify_api.py` -> pass
Status:            done
Next:              deploy to staging
```
