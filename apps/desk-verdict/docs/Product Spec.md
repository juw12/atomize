# Desk Verdict: Product Spec

> "Be the filter, not another feed."
> A Verdict Scorecard for AI tools at work. This is the interactive embodiment of the
> signature framework from the source blueprint "Desk Verdict: Master Guide (AI for the 9-to-5)".

- **Status:** Draft
- **Name:** **Desk Verdict** *[name, handle, and trademark checks pending before public launch]*
- **Form factor:** Offline-first single-page web app + optional local Python stdlib server
- **Primary audience:** Non-technical professionals (the 9-to-5)
- **Language:** English (global)
- **Source:** "Desk Verdict: Master Guide (AI for the 9-to-5)", a side-hustle blueprint for an English-language AI channel + newsletter

---

## 1. Vision

Desk Verdict answers one question a working person actually asks: **should I use this AI tool at my job, or not?**

Most AI content is a feed. It tells you what is new, what is hot, and what to download. Desk Verdict is a filter. It takes a specific tool, runs it on a real task, and produces a verdict you can act on in under a minute: **use it, wait, or skip it.**

The app makes the guide's framework interactive. Instead of reading about how to judge an AI tool, you score one, watch the verdict compute live, and capture the one-liner you would say to a coworker.

**One-liner:**
> "Be the filter, not another feed."

---

## 2. The Verdict Framework (the "wedge")

**A verdict, not a review.**

A review can run to 2,000 words. A verdict takes 30 seconds and tells a non-technical person what to do. That is the wedge: the app is built entirely around producing fast, defensible verdicts on AI tools for work.

### 2.1 The Scale (three states)

Every verdict lands in exactly one of three states:

| Verdict | Meaning |
|---|---|
| **USE IT** | Saves real time, works reliably, and is safe for normal work use |
| **WAIT** | Promising but unreliable, expensive, or missing a key feature. Revisit in 1-3 months |
| **SKIP** | Hype, poor results, or not worth the learning curve |

### 2.2 The Scorecard (rate each 1 to 5)

Five dimensions, each scored 1 to 5:

| Key | Question |
|---|---|
| `time_saved` | Time saved on a real task |
| `output_quality` | Quality of output |
| `ease_of_use` | Ease for a non-technical person |
| `cost_value` | Cost vs. value |
| `work_safety` | Work-safety (data privacy & company-policy risk) |

### 2.3 The 30-Second Script

The verdict is meant to be said out loud. The app pre-fills this template from the record's fields:

```
I tried {tool} on {task}. It took {X} minutes instead of {Y}.
It got {one thing} right and {one thing} wrong.
Verdict: use it for {task}, skip it for {task}.
```

`{X}` and `{Y}` come from `time_with_min` and `time_without_min`.

---

## 3. The Scoring Algorithm

The verdict is derived, not typed. The average of the five scores is computed, and the safety check runs first so a risky tool can never become a "use it."

```
avg = mean of the 5 scores (display rounded to 1 decimal)
if work_safety <= 2 -> SKIP
else if avg >= 4.0 -> USE
else if avg >= 3.0 -> WAIT
else -> SKIP
```

Thresholds: `use = 4.0`, `wait = 3.0`.

Two rules fall out of this:

1. **Safety is a hard gate.** Any tool scoring 2 or lower on `work_safety` is a SKIP, no matter how high the other scores are.
2. **The average decides USE vs WAIT vs the low-SKIP.** 4.0 and above is a USE, 3.0 up to 4.0 is a WAIT, and below 3.0 is a SKIP.

The server recomputes `avg` and `verdict` on every `POST /api/verdicts`, so the stored verdict always matches the scores.

---

## 4. Data Model

### 4.1 The Record Schema

A single entity, the **Verdict record**:

```
{
  id, tool, task, category,
  scores: {
    time_saved, output_quality, ease_of_use, cost_value, work_safety
  },
  avg, verdict,
  time_with_min, time_without_min,
  one_right, one_wrong,
  use_it_for, skip_it_for,
  affiliate, tested, notes, created_at
}
```

| Field | Notes |
|---|---|
| `id` | Unique record id |
| `tool` | The AI tool being judged |
| `task` | The real task it was run on |
| `category` | One of the work categories (see 4.2) |
| `scores` | The five 1-to-5 scores (see 2.2) |
| `avg` | Mean of the five scores, displayed to 1 decimal |
| `verdict` | One of the three scale states (see 2.1), from the algorithm (see 3) |
| `time_with_min` | Minutes the task took with the tool |
| `time_without_min` | Minutes the task would take without it |
| `one_right` | The one thing it got right |
| `one_wrong` | The one thing it got wrong |
| `use_it_for` | The task(s) it is good at |
| `skip_it_for` | The task(s) to skip it for |
| `affiliate` | Optional affiliate/purchase link |
| `tested` | Whether the tool was actually run |
| `notes` | Free-form notes |
| `created_at` | When the record was created |

### 4.2 Categories

`category` is one of the seven work areas below:

`admin`, `operations`, `marketing`, `finance`, `hr`, `sales`, `project-management`

---

## 5. Offline-First, Server-Optional Design

The front-end is a single page (`web/index.html`) that works with no backend at all:

- **Offline:** double-click `web/index.html`. Records live in browser `localStorage` under the key `desk_verdict_v1`, seeded with **4 demo verdicts**.
- **Server:** when the same file is served by the local Python server, it upgrades to the API automatically. The front-end makes **relative** `api/...` calls, so the same page works offline and against the server with no build step or code change.

A status chip in the UI shows the current mode: **Local** (localStorage) or **Server** (API).

This is what keeps static hosting viable: the page ships as-is and only uses the server when one is present.

---

## 6. API

A zero-dependency Python stdlib server (nothing to install, no build step). It runs on **port 8790** by default. Set the `DESK_VERDICT_DB` env var to override the database path.

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/health` | Health check |
| `GET` | `/api/scorecard` | The scorecard definition: the five dimensions and the verdict scale |
| `GET` | `/api/verdicts` | List verdicts. Optional filters: `?q=`, `&verdict=`, `&category=` |
| `POST` | `/api/verdicts` | Create a verdict. The server recomputes `avg` and `verdict` |
| `GET` | `/api/verdicts/{id}` | One verdict by id |
| `DELETE` | `/api/verdicts/{id}` | Delete a verdict by id |
| `OPTIONS` | `/api/*` | CORS preflight, returns `204` |

All responses include `Access-Control-Allow-Origin: *`. Errors return `{"error": "..."}` JSON.

---

## 7. Run and Test

### Run the front-end

Open the file directly, no server needed:

```
web/index.html
```

(double-click it in your file manager).

### Run the server

```bash
python apps/desk-verdict/server/server.py
```

The server serves both the API and the `web/` front-end on `http://127.0.0.1:8790/`.

### Tests

```bash
python apps/desk-verdict/tests/verify_api.py
python apps/desk-verdict/tests/test_verdict_logic.py
```

`verify_api.py` exercises the running API end to end. `test_verdict_logic.py` checks the scoring algorithm and the safety gate against known inputs.

---

## 8. Source

The app is derived from the blueprint **"Desk Verdict: Master Guide (AI for the 9-to-5)"**, a side-hustle guide for an English-language AI channel + newsletter. The app is the interactive form of that guide's signature framework: the USE IT / WAIT / SKIP scale, the five-part scorecard, and the 30-second script.

The guide recommends three checks **before any public launch**. None of these block a local build:

1. **Name**: confirm "Desk Verdict" is available as a domain and as a channel/product name.
2. **Handle**: check the matching social/channel handles are free.
3. **Trademark**: run a trademark search in the relevant class before publishing the brand.

---

*Spec is a living document. Every decision here is up for revision.*
