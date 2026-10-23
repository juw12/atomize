# Desk Verdict

> "Be the filter, not another feed."

**Desk Verdict is a Verdict Scorecard for AI tools at work.** It runs one tool on one real task, scores it on five dimensions, and hands you a verdict you can say out loud in 30 seconds: use it, wait, or skip it. It's the interactive form of the framework from the "Desk Verdict: Master Guide (AI for the 9-to-5)".

## The Framework

Most AI content is a feed: what's new, what's hot, what to download. Desk Verdict does the opposite. It filters.

**The scale.** Every verdict is one of three states:

| Verdict | Meaning |
|---|---|
| **USE IT** | Saves real time, works reliably, and is safe for normal work use |
| **WAIT** | Promising but unreliable, expensive, or missing a key feature. Revisit in 1-3 months |
| **SKIP** | Hype, poor results, or not worth the learning curve |

**The scorecard.** Score each dimension 1 to 5:

| Key | Question |
|---|---|
| `time_saved` | Time saved on a real task |
| `output_quality` | Quality of output |
| `ease_of_use` | Ease for a non-technical person |
| `cost_value` | Cost vs. value |
| `work_safety` | Work-safety (data privacy & company-policy risk) |

**The 30-second script.** The verdict is built to be said, not just read:

```
I tried {tool} on {task}. It took {X} minutes instead of {Y}.
It got {one thing} right and {one thing} wrong.
Verdict: use it for {task}, skip it for {task}.
```

## How It Runs

One file, two modes. The front-end is a single page that works offline and upgrades to the API when a server is present.

| Mode | How to run | Data |
|---|---|---|
| **Offline** | Double-click `web/index.html` | Browser `localStorage` (`desk_verdict_v1`), 4 seeded demo verdicts |
| **Server** | `python apps/desk-verdict/server/server.py` | SQLite via the local API on port 8790 |

No build step, no dependencies. The same page makes relative `api/...` calls, so it talks to the server when one is running and falls back to localStorage otherwise. A **Local** / **Server** chip shows the current mode.

## Scoring

The verdict is computed, not typed. The average of the five scores is shown to one decimal, and a safety gate runs first so a risky tool can never be a "use it."

```
avg = mean of the 5 scores (display rounded to 1 decimal)
if work_safety <= 2 -> SKIP
else if avg >= 4.0 -> USE
else if avg >= 3.0 -> WAIT
else -> SKIP
```

Thresholds: `use = 4.0`, `wait = 3.0`. A `work_safety` score of 2 or lower forces a SKIP regardless of the other scores.

## Data Model

Each record captures one tool run on one task:

```
id, tool, task, category,
scores { time_saved, output_quality, ease_of_use, cost_value, work_safety },
avg, verdict,
time_with_min, time_without_min, one_right, one_wrong,
use_it_for, skip_it_for, affiliate, tested, notes, created_at
```

`category` is one of: `admin`, `operations`, `marketing`, `finance`, `hr`, `sales`, `project-management`.

Full spec: [`docs/Product Spec.md`](docs/Product%20Spec.md).

## Local Server (API)

A zero-dependency Python stdlib server (nothing to install, no build step) on **port 8790**. Set `DESK_VERDICT_DB` to override the database path.

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/health` | Health check |
| `GET` | `/api/scorecard` | The five scorecard dimensions + the verdict scale |
| `GET` | `/api/verdicts` | List verdicts. Filters: `?q=`, `&verdict=`, `&category=` |
| `POST` | `/api/verdicts` | Create a verdict (server recomputes `avg` and `verdict`) |
| `GET` | `/api/verdicts/{id}` | One verdict by id |
| `DELETE` | `/api/verdicts/{id}` | Delete a verdict by id |
| `OPTIONS` | `/api/*` | CORS preflight, `204` |

All responses include `Access-Control-Allow-Origin: *`. Errors return `{"error": "..."}`.

## Tests

```bash
python apps/desk-verdict/tests/verify_api.py
python apps/desk-verdict/tests/test_verdict_logic.py
```

`verify_api.py` checks the running API end to end. `test_verdict_logic.py` checks the scoring algorithm and the safety gate against known inputs.

## Source

Desk Verdict is the interactive form of **"Desk Verdict: Master Guide (AI for the 9-to-5)"**, a side-hustle blueprint for an English-language AI channel + newsletter. The app embodies that guide's signature framework: the USE IT / WAIT / SKIP scale, the five-part scorecard, and the 30-second script.

Before any public launch, the guide recommends three checks (none block a local build): confirm the **name** ("Desk Verdict") as a domain and product name, check the **handle** on the target channel, and run a **trademark** search in the relevant class.

## License

See repository root [`LICENSE`](../../LICENSE).
