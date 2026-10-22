# Dashboard Design

## Inspiration

The Dashboard view draws inspiration from in-app dashboards commonly found in
learning platforms — the type that greet returning users with progress, streaks,
and quick access to core actions. One reference is the guest-accessible dashboard
of ailene.id, which demonstrates how a learning app can feel welcoming even
without requiring sign-in.

**We do not copy their text, branding, logos, or specific design choices.** This
document describes our own implementation decisions.

## Our Take

The reference dashboards often gate advanced levels behind payment tiers, showing
locked "Premium" passports. We deliberately flip that model:

| Reference Pattern | Ailene Open Choice |
|-------------------|-------------------|
| Locked Premium tiers | All levels FREE and visible |
| Login-gated progress | Guest-first; celebrate no-login |
| Streak pressure ("you'll lose it!") | Streak as celebration, not guilt |
| Tip tied to upsell | Tips teach actual prompting skills |

## Components

### 1. Greeting Card
- **Copy:** "Halo, Learner!" (bilingual — same greeting in both languages for
  warmth)
- **Shows:** overall progress bar + percentage + lessons remaining
- **Guest banner:** above greeting, celebrates local-first progress ("🎉 Learning
  as guest — progress saved locally. No login required!")

### 2. 7-Day Streak Widget
- **Layout:** 7 circular chips labeled with day-of-week initial (S M T W T F S)
- **Active state:** chip is filled if activity was logged on that date
- **Today state:** today's chip has an accent border
- **Stats row:** current streak + all-time record
- **Data key:** `ailene_open_streak_v1`
- **Activity trigger:** logging any lesson completion today registers activity

### 3. Tip of the Day
- **Source:** `tips[]` array in curriculum.json
- **Selection:** deterministic — day-of-week modulo tips length (so it rotates
  daily but consistently)
- **Bilingual:** renders the current language

### 4. Learning Passport
- **Layout:** horizontal scrollable strip of level cards
- **Each card shows:** icon, level name (Foundation/Practitioner/Guardian/Master),
  status (Complete/In Progress)
- **Visual states:**
  - Complete → green border + soft green background
  - In progress → primary border
  - Not started → neutral
- **No "Locked" state** — this is our core differentiator
- **Subtitle:** "All levels are FREE and open — no paywalls, no lock-in."

### 5. Module Progress List
- Per-module progress bars with percentage
- Sorted by curriculum order
- Clickable to navigate to curriculum

### 6. Quick Actions Grid
- 4 cards: Quiz / Prompt Library / Glossary / Safety
- Each card has a large emoji icon + bilingual label
- Hover lifts card with translateY(-2px)

## localStorage Keys

| Key | Purpose | Shape |
|-----|---------|-------|
| `ailene_open_v1` | Lesson completion progress | `{ "les-...": true }` |
| `ailene_open_streak_v1` | Daily activity + record | `{ "dates": ["YYYY-MM-DD"], "record": N }` |
| `ailene_open_notes_v1` | Per-lesson notes | `{ "les-...": "text" }` |

## Design Language

- Matches existing dark theme (slate-900 background, indigo/cyan gradient)
- Reuses existing CSS variables (--primary, --gradient-1, --radius-*, etc.)
- Dashboard cards use the same `--bg-card` surface as other view components
- No external fonts, no images, no CDNs

## Responsive

- Desktop: 3-column grid (greeting/streak/tip), then full-width sections
- Mobile: vertical stack, each card full-width
