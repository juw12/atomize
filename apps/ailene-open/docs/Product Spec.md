# Product Spec: Ailene Open

## Vision

**Learn AI concepts, not vendor lock-in.**

Ailene Open is a free, open, bilingual AI learning platform that teaches fundamental concepts applicable across all AI models — Claude, GPT, Gemini, and local models like Llama and Mistral.

## Target Users

### Primary: Indonesian learners (bilingual)
- Students and professionals in Indonesia learning AI
- Comfortable with Indonesian or English (or both)
- Want practical skills, not theory-only content
- May not have budget for paid courses (Rp 1,49jt packages)

### Secondary: Global learners
- Anyone seeking vendor-neutral AI education
- Prefer open, inspectable curricula
- Value cited sources and verifiable claims

## Problems Solved

### 1. Vendor Lock-in
**Problem:** Most AI courses teach one platform (e.g., "KelasClaude"). Skills don't transfer to other models.

**Solution:** Every lesson includes:
- Core concept explanation (model-agnostic)
- Prompt template (works everywhere)
- Per-model adaptations (Claude/GPT/Gemini/Local)

### 2. Gated Advanced Content
**Problem:** Free tiers offer basics; advanced content requires payment.

**Solution:** All levels fully open. No paywalls. No login required.

### 3. Unverifiable Claims
**Problem:** AI courses make claims without sources. Learners can't verify accuracy.

**Solution:** Every lesson includes citable sources (URLs + citations).

### 4. Language Barrier
**Problem:** Indonesian-only limits global reach; English-only excludes Indonesian learners.

**Solution:** Complete bilingual ID/EN from day one.

### 5. Login Friction
**Problem:** Must create account to access content or track progress.

**Solution:** Progress in localStorage. No accounts.

### 6. Offline Inaccessibility
**Problem:** Requires network connection.

**Solution:** Works from `file://` protocol. Zero network calls.

## Core Features

### 1. Curriculum Viewer
**What:** Hierarchical view of levels → modules → lessons

**Details:**
- Each level has title, description (bilingual)
- Each module groups related lessons
- Each lesson shows completion status (checkmark)
- Click lesson → modal with:
  - Core concept
  - Prompt template + adaptations
  - Sources

**Offline:** Yes — all data inline in HTML

### 2. AI Type Quiz
**What:** 12-question assessment to discover interaction style

**Questions:** 12 multiple-choice (4 options each)

**Result Types:**
- **Professor** — Depth, accuracy, citations
- **Builder** — Examples, templates, iteration
- **Detective** — Transparency, verification
- **Guardian** — Safety, ethics, bias checks
- **All-Rounder** — Flexibility, adaptation

**Output:** Result type + description + 3 personalized tips

**Offline:** Yes — all questions/answers inline

### 3. Prompt Library
**What:** Collection of all prompt templates from curriculum

**Features:**
- Search by task
- Copy to clipboard
- Shows which lesson it's from
- Model adaptations visible

**Offline:** Yes — rendered from inline data

### 4. Safety Checklist
**What:** 8-point verification checklist

**Items:**
1. Factual accuracy
2. No hallucinated citations
3. Bias check
4. Privacy (no PII)
5. Security (no secrets)
6. Copyright compliance
7. Context appropriateness
8. Human review

**Interaction:** Click checkboxes (visual only, not persisted)

### 5. Progress Tracking
**What:** localStorage-based completion tracking

**Key:** `ailene_open_v1`

**Data:** `{ "les-01-what-are-tokens": true, ... }`

**Display:** "X of Y lessons completed (Z%)"

**Reset:** Button to clear all progress

**Offline:** Yes — localStorage is client-side

## Content Structure

### Level 01: AI Fundamentals
- **Module 01:** Understanding Tokens
  - Lesson 01: What Are Tokens?
  - Lesson 02: Context Windows Explained
- **Module 02:** Temperature & Randomness
  - Lesson 03: What Is Temperature?

### Level 02: Prompt Engineering
- **Module 03:** System Prompts & Personas
  - Lesson 04: Writing Effective System Prompts
- **Module 04:** Few-Shot Learning
  - Lesson 05: Learning from Examples

### Level 03: AI Safety & Ethics
- **Module 05:** Understanding Bias
  - Lesson 06: AI Bias and Fairness
- **Module 06:** Privacy & Data Protection
  - Lesson 07: Protecting Sensitive Information

### Level 04: Advanced Techniques
- **Module 07:** Chain of Thought
  - Lesson 08: Step-by-Step Reasoning
- **Module 08:** Self-Correction
  - Lesson 09: Asking AI to Critique Itself

### Lesson Schema
```json
{
  "id": "les-01-what-are-tokens",
  "title": { "en": "...", "id": "..." },
  "concept": { "en": "...", "id": "..." },
  "prompts": [
    {
      "task": { "en": "...", "id": "..." },
      "core_prompt": { "en": "...", "id": "..." },
      "adaptations": {
        "claude": { "en": "...", "id": "..." },
        "gpt": { "en": "...", "id": "..." },
        "gemini": { "en": "...", "id": "..." },
        "local": { "en": "...", "id": "..." }
      }
    }
  ],
  "sources": [
    {
      "title": { "en": "...", "id": "..." },
      "url": "https://...",
      "citation": { "en": "...", "id": "..." }
    }
  ]
}
```

## Technical Requirements

### Must Have
- [x] Zero third-party dependencies (Python stdlib only)
- [x] No Node/build step
- [x] No CDNs or external fonts
- [x] Works from `file://` (offline-first)
- [x] Curriculum data inline in HTML (no runtime fetch)
- [x] Bilingual ID/EN toggle
- [x] Vendor-neutral prompts with per-model adaptations
- [x] All levels/modules present (no paywall)
- [x] Sources for every lesson
- [x] Safety/eval checklist
- [x] No-login progress (localStorage `ailene_open_v1`)
- [x] Tests exit 0/1
- [x] No absolute-root paths (`href="/"`)
- [x] No `<base>` tag

### Should Have
- [x] Optional stdlib API server
- [x] Hermetic tests (temp port, temp DB)
- [x] Data generator tool

### Nice to Have
- [ ] PWA with service worker (future)
- [ ] Export progress as JSON (future)
- [ ] Import progress (future)
- [ ] Dark/light theme toggle (future)

## Success Metrics

### Quantitative
- All tests pass (exit 0)
- HTML files > 5000 bytes (substantial content)
- 4+ levels, 8+ modules, 9+ lessons in spine
- 12 quiz questions, 5 result types
- 8 safety checklist items
- Bilingual strings for all user-facing text

### Qualitative
- Distinctive design (not generic AI aesthetics)
- Clear vendor-neutral positioning
- Verifiable sources for all claims
- Smooth offline experience
- Accessible (WCAG-minded contrast, focus states)

## Out of Scope

- User accounts / authentication
- Payment integration
- Community features (Discord, forums)
- Live cohorts or instructor-led courses
- Certificates or credentials
- Mobile apps (native iOS/Android)
- Backend persistence (localStorage only)

## Future Enhancements

### Phase 2: Community
- User-submitted prompt templates
- Peer review system
- Discussion threads per lesson

### Phase 3: Advanced Content
- Level 05: Tool Use & Function Calling
- Level 06: Multi-Turn Strategies
- Level 07: Domain-Specific Applications (legal, medical, education)

### Phase 4: Localization
- Additional languages (Spanish, Hindi, Arabic)
- Cultural adaptations per region

### Phase 5: PWA
- Service worker for caching
- Installable on mobile
- Background sync for progress

## Competitive Positioning

| Feature | Ailene Open | ailene.id | Coursera | Udemy |
|---------|-------------|-----------|----------|-------|
| **Price** | Free | Rp 1,49jt | $39-79/mo | $12-200 |
| **Vendor-neutral** | Yes | No (Claude) | Mixed | Mixed |
| **Bilingual ID/EN** | Yes | No (ID only) | No | No |
| **Offline** | Yes | No | No | No |
| **Login required** | No | Yes | Yes | Yes |
| **Sources cited** | Yes | No | Sometimes | Rarely |
| **All content open** | Yes | No | No | No |

## Risks & Mitigations

See [`Risk Mitigation.md`](Risk%20Mitigation.md) for detailed analysis.

## Timeline

- **Day 1:** MVP with Level 01-02, quiz, safety checklist
- **Week 1:** Full 4-level curriculum, mobile build, tests
- **Week 2:** Polish, accessibility, performance
- **Week 3:** Community features (stretch)
- **Month 2:** Additional languages (stretch)

## Appendix: User Flows

### First-Time User (Desktop)
1. Opens `web/index.html` (double-click or drag to browser)
2. Sees hero: "Learn AI Concepts, Not Vendor Lock-in"
3. Clicks "Start Learning" → Curriculum view
4. Sees Level 01, Module 01, Lesson 01
5. Clicks "Preview" → Modal opens with concept + prompt
6. Clicks checkmark → Progress saved
7. Returns later → Progress persists (localStorage)

### First-Time User (Mobile)
1. Opens `web/mobile.html`
2. Sees mobile-optimized hero
3. Taps bottom nav: Learn / Quiz / Prompts / Safety / Progress
4. Same content, vertical layout
5. Progress syncs across devices? No — localStorage is per-device

### Quiz Taker
1. Navigates to "AI Type Quiz"
2. Reads intro: "Answer 12 questions..."
3. Clicks "Take Quiz"
4. Answers 12 questions (one at a time)
5. Sees result: "The Professor" + description + tips
6. Can retake quiz (resets answers)

### Prompt Library User
1. Navigates to "Prompt Library"
2. Sees grid of all prompts from curriculum
3. Finds relevant prompt
4. Clicks "Copy Prompt"
5. Pastes into AI chat interface
6. Adds model-specific adaptation if needed
