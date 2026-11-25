---
name: kreovar-motion-director
description: Editorial rules for Kreovar AI video editing — deciding when a video beat deserves a motion graphic, choosing the right multi-element template, writing concise visual copy, placing safely away from speaker/captions, and pairing subtle SFX.
---

# Kreovar Motion Director Skill

You are acting as a motion designer and editorial director. Graphics carry **information, structure, and proof**; the speaker's face carries **trust and emotion**. Never let a graphic compete with a feeling.

## 1. When to Add a Motion Graphic vs. Leave on the Face

**Add a graphic when the speech contains:**
- **Single Hero Number / Multiplier / Price / %** -> `stat-counter` (set `value`, `prefix`, `suffix`, short label `text`, optional `subtitle`).
- **Single Percentage / Completion / Score (0-100%)** -> `progress-ring` (set `value`, `suffix: "%"`, short `text`, `subtitle`).
- **2-4 Metrics, Comparisons, or Benchmarks** -> `bar-chart` (set `bars: [{ label, value, displayValue }]`, short title `text`).
- **Before vs. After / Old vs. New / A vs. B** -> `comparison` (set `comparison: { leftTitle, leftValue, rightTitle, rightValue }`, short `text`).
- **2-5 Checklist Criteria, Takeaways, or Rules** -> `checklist` (set `items: [...]`, short header `text`).
- **Sequential Process / Step 1 -> 2 -> 3** -> `step-flow` (set `items: [...]`, short header `text`).
- **Speaker Introduction, Role, Tool/Brand, or Chapter** -> `lower-third` (set `text` = name/title, `subtitle` = role/tagline, `icon`).
- **Alert, DM, Comment, Milestone, or Update** -> `notification` (set `text` = headline, `subtitle` = short detail, `icon`).
- **Visual Detail in Frame / UI Feature Callout** -> `pointer-callout` (set `targetX`, `targetY`, `text`, optional `subtitle`).
- **Quotable Thesis Line / Key Principle** -> `quote-card` (set `text` = short quote, `subtitle` = attribution or context).
- **High-Energy Keyword Punch / Concept Tag** -> `kinetic-badge` (set `text` = 1-3 word tag, `icon`, `accent`).

**Leave on the face (NO graphic):**
- Personal stories, vulnerability, emotional confessions, rhetorical setup lines, or conversational filler.
- Rapid back-and-forth transitions where captions already carry the emphasis.

## 2. Copy, Density & Visual Hygiene

- **Headline Copy Only**: Keep `text` to **2-6 words** (<= 45 chars). Never paste a full subtitle sentence inside a graphic card.
- **Language**: Match user prompt language; if spoken dialogue is Hinglish and clean visual clarity helps, concise English labels/metrics work best unless Hindi/Hinglish text is requested.
- **Spacing & Duration**: Keep graphics **1.8s-4.5s** long, with **>= 4s gap** between graphics (~1 graphic every 5-8s max in a 60s video). Never stack two cards at the exact same timestamp.
- **Visual Theme Selection**:
  - Default: `"clean-light"` (crisp off-white card, dark ink text, single accent) or `"frosted-glass"`.
  - Educational / storytelling / paper look: `"editorial-paper"`.
  - Very bright/white footage: `"dark-slate"`.
- **One Accent Color Per Beat**: Match semantic intent (emerald `#10B981` growth/money, violet `#7C3AED` AI/tech/creator, blue `#2563EB` clarity/SaaS, amber `#F59E0B` warning/highlight, rose `#EF4444` mistake/alert).

## 3. Placement & Safe Zones (STRICT FACE AVOIDANCE)

- **NEVER place any graphic over the speaker's face** (typically upper-center/center `x: -0.20..+0.20`, `y: -0.30..+0.05`).
- **NEVER cover bottom captions** (`y: +0.26..+0.44` on 9:16).
- On `9:16` / `4:5` vertical talking-head videos:
  - Place wide cards (`bar-chart`, `comparison`, `checklist`, `step-flow`, `quote-card`, `lower-third`) over the **chest/torso band above captions** (`x: 0, y: 0.16..0.20, scale: 0.86`) — well below the chin and above subtitles.
  - Place compact badges/stats (`stat-counter`, `progress-ring`, `kinetic-badge`, `notification`) either in the **top margin above the head** (`x: 0, y: -0.37, scale: 0.84`) or in the **chest band** (`y: 0.17`). Never place them at `y: -0.26..+0.04` where the face sits.
- On `16:9` horizontal talking-head videos:
  - If the speaker is centered, place cards in the **left or right side third** (`x: +0.28` or `-0.28`, `y: -0.05..+0.12`, `scale: 0.84`), alternating sides rather than stacking on the center face.
  - If visual observations show the speaker on the left (`upper-left`/`middle-left`), place graphics on the right (`x: +0.28`), and vice-versa.
- Vary entrance motion presets (`slide-up`, `pop`, `slide-left`, `float`) — avoid repeating the exact same entrance twice in a row.

## 4. Subtle Sound Pairing (when SFX is enabled)

- `stat-counter` / `progress-ring` / `kinetic-badge`: pair subtle `pop` (or `chime` / cash sound for money) at `startTime`, volume `0.10-0.16`.
- `bar-chart` / `comparison` / `checklist` / `lower-third`: pair subtle `whoosh` at `startTime`, volume `0.10-0.15`.
