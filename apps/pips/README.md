# Pips

An always-on-top desktop widget that turns your day into a score. It combines a
**Pomodoro timer**, looping **rain / thunder / brown-noise / café soundscapes**,
**live app-usage tracking**, a **daily productivity score with a 1–5 star rating**,
**goals / streaks / XP**, an **hour-of-day focus heatmap**, a **browsable history log**,
and a **daily AI-style coach + weekly report** — all running locally on Windows.

It lives as a small floating card you can drag anywhere. Click to expand a full
dashboard or open your history; right-click for everything else.

---

## What you get

- **Compact floating card** (frameless, always-on-top, translucent, draggable) showing:
  a **status pill** (`● Focus` / `● Break` / `● Paused` / `○ Idle`), a **circular progress
  ring** around the Pomodoro timer with a live `%`, **cycle dots** (`●●○○ 2/4`) toward the
  long break, a **live session panel** ("This pomodoro: 12m · code.exe"), the current
  foreground app, today's productive time, a **1–5 ★ rating**, Start/Pause + Reset, a sound
  toggle, and expand/close controls.
- **Pomodoro timer** — work → short break → long break (long break every 4th),
  auto-starts the next session (configurable). Completed sessions are logged.
- **Break & health reminders** — when a work Pomodoro ends, an always-on-top popup grabs your
  attention with a rotating **stand up / stretch / drink water** tip and a soft chime; plus
  **20-20-20 eye-rest** and **hydration** nudges during work.
- **Soundscapes** — four procedurally generated, seamlessly looping ambience tracks
  (**rain, thunder, brown noise, café**). No audio files to download; adjustable volume.
- **Live app tracking** — samples the foreground window ~once per second and tallies
  minutes per app for the day, updating live. Time away from the keyboard (idle/AFK)
  is excluded from app time.
- **Daily score + stars** — a 0–100 score and 1–5 ★ rating computed from your
  productive vs. distracting vs. neutral time, idle ratio, and Pomodoros completed.
- **Goals, streaks & XP** — daily deep-work-hour and Pomodoro goals, a consecutive
  goal-day streak, and XP.
- **Hour-of-day focus heatmap** — see when you're most productive.
- **History log** — browse any past day: score, stars, Pomodoros and per-app breakdown.
- **Daily coach** — natural-language insights built from your real numbers
  (goal progress, biggest distraction, best focus hour, streak, comparison to yesterday).
  Optionally powered by an LLM (see *Customising*), and works fully offline by default.
- **Weekly report** — a self-contained HTML report for the last 7 days, opened in your
  browser from the right-click menu.

## Files

| File | Purpose |
|------|---------|
| `app.py` | The widget: tkinter UI (card + dashboard + history), Pomodoro, orchestration. |
| `tracker.py` | Foreground-app sampling, idle/AFK detection, SQLite writes. |
| `scoring.py` | Categorisation, daily score/stars, streaks/XP, heatmap aggregation. |
| `coach.py` | Coach insights, weekly report, optional LLM hook. |
| `audio.py` | Soundscape synthesis + `winsound` looping playback. |
| `maas_tokens.py` | Live MAAS (Model-as-a-Service) account token usage from the AICC gateway. |
| `config.json` | **Edit this**: app categories, title rules, Pomodoro lengths, goals, scoring, coach. |
| `CONTRACT.md` | Internal data contract shared by all modules. |
| `Launch Widget.bat` | Double-click to start the widget with no console window. |
| `install_autostart.ps1` | Adds/removes a Start-at-login shortcut (`-Remove` to undo). |
| `make_shortcuts.ps1` | Creates Desktop + Start Menu launcher shortcuts (`-Remove` to undo). |
| `daily_email.py` | Builds and emails the daily progress report. |
| `run_daily_email.ps1` | Wrapper the 22:00 email task calls. |
| `setup_email_task.ps1` | Registers the Sun–Thu 22:00 email task. |
| `run_monthly_email.ps1` | Wrapper the monthly email task calls. |
| `setup_monthly_email_task.ps1` | Registers the monthly roll-up email (1st of month, 08:00). |
| `assets/make_icon.py` | Regenerates `assets/widget.ico` + `assets/widget.png`. |
| `assets/widget.ico` / `widget.png` | Widget icon. |
| `data/productivity.db` | Your usage database (SQLite). |
| `data/sounds/*.wav` | Generated soundscape cache. |
| `output/weekly-report-YYYY-MM-DD.html` | Weekly reports you open from the menu. |
| `logs/widget.log` | Runtime log. |

## Requirements

Already satisfied on this machine:
- **Python 3.13** (stdlib only) plus **`pywin32`** and **`Pillow`** — both installed.
- Windows 10/11.

**No third-party packages need to be installed.** No `psutil`, no `pygame`, no Node.js.

## Run it now

Double-click **`Launch Widget.bat`** — or from a terminal:

```powershell
cd pips
pythonw app.py                 # normal run, no console window
python  app.py                 # run with a console (for debugging)
python  app.py --selftest      # init everything, render offscreen, exit 0
python  app.py --no-track      # run without starting the tracker
python  app.py --reset-pos     # ignore the saved window position
```

> **Configuration:** copy `config.example.json` to `config.json` and edit as needed
> (Pomodoro lengths, soundscapes, app categories, email, etc.). `config.json` is git-ignored.

## Start it automatically at login

```powershell
powershell -ExecutionPolicy Bypass -File install_autostart.ps1
```

Undo:

```powershell
powershell -ExecutionPolicy Bypass -File install_autostart.ps1 -Remove
```

You can also toggle this from the widget's right-click menu (**Autostart**).

## Manual launchers (Desktop & Start Menu)

If autostart ever doesn't fire — or you simply closed the widget — launch it from a shortcut:

```powershell
powershell -ExecutionPolicy Bypass -File make_shortcuts.ps1
```

This places **"Pips"** on your **Desktop** and in the **Start Menu**
(searchable), each running `pythonw app.py` (no console) with the widget's own icon.
Double-click to launch; right-click → *Pin to taskbar* to keep it one click away.
Remove the shortcuts with `-Remove`.

## Using the widget

- **Drag** the card to move it; its position is remembered.
- **▶ Start / ⏸ Pause** begins or pauses a Pomodoro; **↻ Reset** clears it.
- The **sound button** (shows `Sound` / `Muted`) toggles the current soundscape.
- The **★☆☆☆☆** row is today's star rating; the slim bar under the timer is session progress.
- **Right-click** the card for: **Dashboard**, **History**, **Weekly Report**, **Sound**
  (pick rain / thunder / brown / café), **Settings**, **Autostart**, **Quit**.
- **⌄** expands the dashboard; **✕** quits.

### Dashboard
Six Canvas-drawn, interactive charts:
- **Donut** — today's productive / neutral / distracting split, with a legend.
- **Top apps** — ranked horizontal bars, colour-coded by category.
- **7-day score trend** — daily score bars with star markers.
- **Hour-of-day heatmap** — a 7-day × 24-hour grid with a `less ▢▢▢▢▢ more` legend.
- **Focus timeline** — today's hours as one colour-coded strip (productive / neutral / distracting).
- **Pomodoros** — completed Pomodoros per day across the last 7 days.

Plus goals progress, streak/XP, and the daily coach text. **Hover** any chart element for a
tooltip; **click** a segment/bar/cell to inspect it. The dashboard scrolls (mouse wheel).

### History
Step through previous days (Prev / Next / Today) and see each day's score, stars,
Pomodoros and app breakdown.

### MAAS token usage

The **MAAS Token Usage (account)** dashboard panel shows live token usage for your
Pegatron **AICC MAAS** account, read from the gateway REST API:

- today's **total** tokens (big number) with the prompt/completion split,
- a **7-day bar chart** of daily account totals,
- today's **per-model** breakdown (top models by tokens).

The compact card also gains a `MAAS · <total> tok today` line, and the right-click
menu has **Refresh MAAS Tokens** to force an immediate refresh.

Add your MAAS credentials to `config.json`:

```jsonc
"maas": {
  "enabled": true,
  "base_url": "https://aicc-gateway.pegatroncorp.com/maas/api/v1",
  "username": "your.aicc.username",
  "password": "your-password",
  "verify_ssl": true,
  "cache_minutes": 10
}
```

Usage is fetched **at most once every ~5 minutes** (and cached for `cache_minutes`),
never during `--selftest`. With no credentials (or the module/config missing) the
widget **degrades gracefully**: the panel shows *No MAAS data*, the card line stays
empty, and nothing is fetched.

## Break & health reminders

When a work Pomodoro **finishes**, an always-on-top popup grabs your attention with a rotating
tip to **stand up, stretch, walk, or drink water** (plus a soft chime), a `Done` / `Snooze 5 min`
pair, and a live countdown of the break. During a work session it also nudges you:

- **20-20-20 eye rest** every 20 minutes (look 20 feet away for 20 seconds).
- **Hydration** every ~40 minutes.

The chime temporarily ducks any playing soundscape, then resumes it. Control it all in
`config.json` → `reminders`.

## Email a daily progress report

A scheduled task emails you a **chart-based daily progress report** (newspaper-styled,
self-contained HTML) at **22:00 Sunday–Thursday**, so it is waiting in your inbox on **weekday
mornings**. It sends through your Outlook desktop via the `outlook-agent` skill, exactly like
The Morning Paper.

The report is built from **chart visuals** — a score bar, KPI tiles, a **time-split** stacked
bar, a **focus-timeline** (today by hour), a **7-day score** chart, a **Top apps** bar chart,
**Pomodoros (7 days)**, and a **separate 7-day daily chart for each factor** (deep work,
distraction, neutral, idle, app switches, focus). All charts are drawn with email-safe HTML
tables so they render in Outlook's Word engine, Gmail, and a browser alike.

```powershell
powershell -ExecutionPolicy Bypass -File setup_email_task.ps1                     # register
Start-ScheduledTask -TaskName "ProductivityWidgetEmail"                            # send one now
Unregister-ScheduledTask -TaskName "ProductivityWidgetEmail" -Confirm:$false       # remove
```

Manual / preview:

```powershell
python daily_email.py             # today's report; sends it
python daily_email.py --no-email  # write output\daily-report-YYYY-MM-DD.html only
python daily_email.py --preview   # write + open it in the browser
python daily_email.py --date 2026-10-20
python daily_email.py --monthly   # month roll-up; emails the previous month
```

**Monthly roll-up:** a second task emails the **monthly report** on the **1st of each month at
08:00** (reporting the previous month). Register it once:

```powershell
powershell -ExecutionPolicy Bypass -File setup_monthly_email_task.ps1
```

Outlook must be installed, signed in and running for the send to work; if it isn't, the HTML is
still written and a warning goes to `logs\email.log`. Configure recipients and schedule days in
`config.json` → `email`.

## Customising

Open `config.json`:

- **`category.productive` / `category.distracting` / `category.neutral`** — add app
  executables (lowercased, e.g. `"code.exe"`) to the right bucket. Anything unlisted
  counts as *neutral*.
- **`title_rules`** — categorise by window **title** substring (e.g. a browser tab
  showing `github` → productive, `youtube` → distracting). These take priority over
  the app lists.
- **`pomodoro`** — `work_minutes`, `short_break_minutes`, `long_break_minutes`,
  `long_break_every`, `auto_start_next`.
- **`audio`** — `default` sound, `autoplay_on_focus` (start a soundscape when a focus
  session begins), `stop_on_break`, `volume`.
- **`tracking`** — `poll_seconds`, `idle_seconds` (how long before you count as AFK).
- **`goals`** — `deep_work_hours`, `pomodoros`, `max_distraction_hours`.
- **`scoring`** — `weights` and `star_thresholds`.
- **`email`** — `enabled`, `to`, `cli` (outlook-agent CLI path), `subject_prefix`, and the
  schedule (`send_hour`, `send_days`).
- **`reminders`** — `enabled`, `chime`, `break_popup`, `eye_enabled` / `eye_every_minutes`,
  `hydration_enabled` / `hydration_every_minutes` (add `break_tips` / `eye_tips` /
  `hydration_tips` arrays to override the default rotation).
- **`coach`** — `enabled`, and an optional `llm` block (`enabled`, `endpoint`,
  `api_key`, `model`) pointing at an OpenAI-compatible chat endpoint. When disabled
  (default), the coach is fully offline and rule-based.
- **`maas`** — `enabled`, `base_url`, `username`, `password` (your AICC MAAS
  account; blank disables the panel), `verify_ssl`, `cache_minutes`.
- **`ui`** — `alpha` (card opacity), `pos` (saved window position), `compact_width`,
  `card_height`.

After editing, restart the widget (`python app.py`).

## How the score works

```
base  = 100 * (productive + 0.3 * neutral) / max(1, productive + neutral + 1.5 * distracting)
score = clamp(0..100, base * (1 - 0.25 * idle_ratio) + pomodoro_bonus)
```

- `pomodoro_bonus` = up to +5 for completing your daily Pomodoro goal.
- **Stars**: 1★ < 20, 2★ < 40, 3★ < 60, 4★ < 80, else 5★ (thresholds in `config.json`).
- **XP** = `productive_minutes // 25 * 10 + pomodoros_done * 20 + (50 if goal_met else 0)`.
- **Goal met** = you reached `deep_work_hours` *and* stayed under `max_distraction_hours`.

The score is monotonic: more productive time never lowers it unless distraction grows too.

## Data & privacy

- **Everything stays local** in `data/productivity.db` (SQLite). Nothing is uploaded.
- The **only** network calls are the optional coach LLM and the optional MAAS
  gateway — and only if you enable each in `config.json`. Leave both off for a
  fully offline tool.
- The tracker never counts the widget itself as usage, and never counts idle/AFK time
  toward an app.

## Notes & troubleshooting

- **No sound?** The widget does not auto-play audio at launch. Start a soundscape via
  the sound button or the right-click **Sound** menu. Sound is played with `winsound`
  (one track at a time); volume is baked into cached WAVs under `data/sounds/`.
- **An app is scored wrongly?** Add it to `category.*` or a `title_rules` entry in
  `config.json`.
- **Score looks low at the start of the day?** The score reflects time so far; with
  little productive time it stays low until you do focused work.
- **Want a clean slate?** Stop the widget and delete `data/productivity.db`.
- **Widget vanished behind windows?** It is `-topmost`; if another always-on-top app
  overlaps, use the taskbar/Alt-Tab or restart it.
- Logs are in `logs/widget.log` if something misbehaves.
