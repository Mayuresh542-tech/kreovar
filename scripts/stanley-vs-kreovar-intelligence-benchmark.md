# Stanley vs Kreovar AI Video Editing Intelligence Benchmark

> **Document Type:** Automated Evaluation Suite & Quality Assurance Benchmark  
> **Target:** Conversational AI Video Editing Orchestration Engine  
> **Benchmark Size:** 25 Comprehensive Evaluation Cases across 17 Categories  
> **Objective:** Evaluate natural language understanding, intent decomposition, tool selection, causal scheduling, conversational memory, negative constraints, temporal bounding, and in-place element refinement.  

---

## 1. Evaluation Methodology & Scoring Criteria

Each benchmark test evaluates whether an AI video editor acts with **true human-editor intelligence** rather than functioning as a dumb effects dispenser. Every test is scored against 4 strict criteria:

1. **Intent Extraction Accuracy (25%):** Correctly identifies the core objective, explicit sub-tasks, and implicit requirements without dropping instructions.
2. **Constraint & Negative Compliance (25%):** Honors 100% of negative constraints (e.g. *"no music"*, *"don't cut dialogue"*) and temporal bounds (e.g. *"first 10 seconds untouched"*). Zero prohibited operations allowed.
3. **Tool Selection & In-Place Economy (25%):** Selects the exact set of required tools without invoking unrequested tools. Refines existing elements in-place without generating redundant or overlapping layers.
4. **Causal Scheduling & Verification (25%):** Executes operations in proper causal sequence (cuts ➔ captions ➔ visuals ➔ audio) and produces a valid, playable, safe timeline.

**Scoring Threshold:**
- **PASS:** 100% score (all 4 criteria met with zero violations).
- **FAIL:** Any dropped instruction, negative constraint violation, out-of-order execution, or layer duplication.

---

## 2. The 25 Benchmark Cases

---

### Case 01: General Podcast Enhancement
- **Category:** General Podcast
- **Input Prompt:** *"Polish this podcast interview: cut awkward pauses, add clean subtitles, punch in slightly during important statements, and duck the audio properly."*
- **Raw Footage Context:** 45-second 16:9 two-speaker video with multiple speech pauses ($>0.7\text{s}$) and uneven conversational rhythm.
- **Intended Outcome:** A snappy, broadcast-quality podcast cut with tight pacing, readable subtitles, subtle conversation zooms, and balanced audio.
- **Expected Tool Plan:**
  - *Required Operations:* `rippleCut` (for pauses $>0.6\text{s}$), `addCaption` (template: `study-ali-abdaal` or `study-clean-motion`), `addZoom` (scale $\le 1.12$, `returnToStart: true`, `easing: 'smooth'`), `setAudioDucking: true`.
  - *Prohibited Operations:* Loud music, B-roll overlays covering speaker faces, high-energy pop animations.
- **Measurable Pass/Fail Criteria:**
  - `projectDuration(after) < projectDuration(before)` by at least 1.5 seconds.
  - Zero caption clips overlap.
  - Maximum zoom scale $\le 1.14\times$ with `returnToStart === true`.
  - `project.settings.audioDucking === true`.

---

### Case 02: High-Energy Talking-Head Short
- **Category:** Talking-Head Editing
- **Input Prompt:** *"Turn this raw clip into a viral TikTok short: fast jump cuts, bold green Hormozi captions, punch-in zooms, and a callout graphic on the hook."*
- **Raw Footage Context:** 20-second vertical (9:16) solo speaker talking about business strategy.
- **Intended Outcome:** Fast-paced reel with aggressive silence removal, bold uppercase animated captions, punchy visual emphasis, and a hook graphic.
- **Expected Tool Plan:**
  - *Required Operations:* `rippleCut` (all gaps $>0.5\text{s}$), `addCaption` (template: `study-hormozi-style`), `addZoom` (scale $1.15$, pop punch-in), `addGraphic` (`kind: 'callout'`, `motion: 'pop'`).
  - *Prohibited Operations:* Slow crossfades, muted monochrome captions, wide cinematic aspect ratio.
- **Measurable Pass/Fail Criteria:**
  - Caption template ID must resolve to `study-hormozi-style` or `hormozi-punch`.
  - At least one graphic callout on `track-overlay` within first 3.0 seconds.
  - At least one zoom with scale between $1.12\times$ and $1.18\times$.

---

### Case 03: Educational Explainer Video
- **Category:** Educational Videos
- **Input Prompt:** *"Make this science tutorial clear and engaging: add spaced readable subtitles, a stat counter graphic when I mention 95 percent, and slow smooth zooms."*
- **Raw Footage Context:** 30-second educational clip explaining climate data; speaker explicitly says *"ninety-five percent of the data"*.
- **Intended Outcome:** Polished educational clip with clear typography, data visualization graphic synchronized to speech, and gentle camera framing movements.
- **Expected Tool Plan:**
  - *Required Operations:* `addCaption` (`study-clean-motion`), `addGraphic` (`kind: 'stat'`, `text: '95%'`), `addZoom` (`easing: 'smooth'`, duration $\ge 2.0\text{s}$).
  - *Anchor Matching:* Graphic start time must align with the Whisper timestamp for the word *"ninety-five"*.
- **Measurable Pass/Fail Criteria:**
  - Graphic text contains `'95%'` or `'95 percent'`.
  - Graphic startTime matches speech word timestamp within $\pm 0.3\text{s}$.
  - Zoom easing equals `'smooth'`.

---

### Case 04: Storytelling & Narrative Reel
- **Category:** Storytelling Videos
- **Input Prompt:** *"Give this personal story a cinematic feel: wide letter-spaced subtitles, slow zoom holds, and smooth cross-dissolves. Do not add fast pop cuts."*
- **Raw Footage Context:** 25-second reflective personal monologue with multiple sentence pauses.
- **Intended Outcome:** Evocative cinematic aesthetic with elegant subtitles, restrained framing, and gentle transitions; preserves reflective pauses.
- **Expected Tool Plan:**
  - *Required Operations:* `addCaption` (`study-thora-cinematic`), `addZoom` (slow hold, scale $\le 1.08$), `addTransition` (`kind: 'dissolve'`).
  - *Negative Constraint:* No rapid jump cuts (`rippleCut` forbidden or restricted to $>1.2\text{s}$ only).
- **Measurable Pass/Fail Criteria:**
  - Caption template ID must resolve to `study-thora-cinematic`.
  - No zoom exceeds $1.10\times$.
  - Original dialogue rhythm preserved ($>90\%$ duration retained).

---

### Case 05: Product Promotion / UGC Ad
- **Category:** Product Promotion
- **Input Prompt:** *"Make this a high-converting product ad: cut silences, add vibrant yellow captions, insert b-roll of someone unboxing a gadget, and add a subtle whoosh sound effect on transitions."*
- **Raw Footage Context:** 18-second influencer video reviewing a new smartphone.
- **Intended Outcome:** Dynamic social commerce video with tight pacing, eye-catching text, illustrative B-roll cutaway, and subtle audio cues.
- **Expected Tool Plan:**
  - *Required Operations:* `rippleCut`, `addCaption` (`study-mr-beast-style-2` or `yellow`), `addClip` (B-roll from `{ type: 'broll', query: 'smartphone unboxing' }`), `addClip` (SFX from `{ type: 'sfx' }`).
  - *Constraints:* B-roll volume must equal `0`; SFX volume $\le 0.25$.
- **Measurable Pass/Fail Criteria:**
  - B-roll clip placed on `track-overlay` with `volume === 0`.
  - Audio SFX clip placed on audio track with `audioRole === 'sfx'` and `volume <= 0.25`.

---

### Case 06: Caption-Only Restyling Request
- **Category:** Caption-Only Refinement
- **Input Prompt:** *"Only change the caption style to study-ali-abdaal and make the font bigger. Do NOT touch any cuts, b-roll, or audio."*
- **Raw Footage Context:** Pre-edited 15-second project containing existing video clips, cuts, B-roll on overlay track, and legacy captions.
- **Intended Outcome:** Existing captions restyled in-place to Ali Abdaal spotlight design; zero other tracks or clips modified.
- **Expected Tool Plan:**
  - *Required Operations:* `applyCaptionTemplate` (`study-ali-abdaal`), `composeCaption`.
  - *Prohibited Operations:* Any `addClip`, `removeClip`, `rippleCut`, `addZoom`, `setAudioDucking`.
- **Measurable Pass/Fail Criteria:**
  - Total caption clip count remains unchanged (zero duplicate captions created).
  - All non-caption clips have identical timestamps, volume, and properties before and after edit.
  - Caption template ID equals `'study-ali-abdaal'`.

---

### Case 07: B-Roll Only Addition
- **Category:** B-Roll Only Requests
- **Input Prompt:** *"Find and insert 2 relevant b-roll clips when I talk about nature and hiking. Keep all captions, voice, and framing exactly as they are."*
- **Raw Footage Context:** 20-second project with existing captions and speech mentioning *"mountain hiking"* at 4.0s and *"pine forests"* at 12.0s.
- **Intended Outcome:** Two contextual B-roll cutaway clips placed on `track-overlay`; speech, captions, and audio completely preserved.
- **Expected Tool Plan:**
  - *Required Operations:* 2 toolRequests for `broll` (`queries: ['mountain hiking', 'pine forest']`), 2 `addClip` operations on `track-overlay`.
  - *Prohibited Operations:* Any mutation to `track-video`, `track-caption`, or existing clips.
- **Measurable Pass/Fail Criteria:**
  - Exactly 2 new clips added on `track-overlay`.
  - Zero changes to existing caption layers or primary video cuts.
  - Added B-roll clips have `volume === 0` and fit within timeline bounds.

---

### Case 08: Audio-Only Balancing & SFX
- **Category:** Audio-Only Requests
- **Input Prompt:** *"Enable audio ducking and add a subtle whoosh sound effect at the beginning. Do not add or change any visual elements or text."*
- **Raw Footage Context:** 15-second video with dialogue and background music.
- **Intended Outcome:** Ducking enabled and single SFX added at $t=0$; all visual clips, captions, and transforms untouched.
- **Expected Tool Plan:**
  - *Required Operations:* `setAudioDucking: true`, `addClip` (SFX on `track-audio`, $t=0$, `volume: 0.15`).
  - *Prohibited Operations:* Any visual changes (`addZoom`, `composeCaption`, `addGraphic`, `addShape`, `trimClip`).
- **Measurable Pass/Fail Criteria:**
  - `project.settings.audioDucking === true`.
  - Single audio clip added at $t=0$ with `audioRole === 'sfx'`.
  - Zero visual clip mutations.

---

### Case 09: Compound Multi-Tool Orchestration
- **Category:** Multi-Tool Editing
- **Input Prompt:** *"Full creator edit: trim silences, add Hormozi captions, punch in on three key phrases, insert relevant b-roll for marketing, and add subtle whooshes on zooms."*
- **Raw Footage Context:** 25-second raw talking head without prior edits.
- **Intended Outcome:** Fully produced short with coordinated cuts, subtitles, visual emphasis, stock overlays, and audio accents.
- **Expected Tool Plan:**
  - *Execution Sequence:* `rippleCut` ➔ `addCaption` ➔ `addZoom` (3 instances) ➔ `addClip` (B-roll) ➔ `addClip` (SFX synchronized to zooms).
- **Measurable Pass/Fail Criteria:**
  - Correct causal execution (rippleCut executed first, captions and zooms aligned to post-cut times).
  - Exactly 3 zoom instances created.
  - SFX clip timestamps match zoom start times within $\pm 0.1\text{s}$.

---

### Case 10: Strict Temporal Boundary Enforcement
- **Category:** Temporal Boundaries
- **Input Prompt:** *"Keep the first 8 seconds completely untouched. For the remainder of the video, add animated captions and punch-in zooms."*
- **Raw Footage Context:** 24-second continuous footage.
- **Intended Outcome:** Time interval $[0, 8.0\text{s}]$ is completely pristine (no cuts, text, zooms, or overlays); all edits occur strictly at $t \ge 8.0\text{s}$.
- **Expected Tool Plan:**
  - *Temporal Mask:* Protected range $[0, 8.0]$. Active range $[8.0, 24.0]$.
  - *Required Operations:* `addCaption` (only for words at $t \ge 8.0$), `addZoom` (startTime $\ge 8.0$).
- **Measurable Pass/Fail Criteria:**
  - Zero captions, cuts, zooms, or overlays with `startTime < 8.0`.
  - Original footage in $[0, 8.0]$ maintains exact framing, scale 1.0, and unmuted audio.

---

### Case 11: Absolute Negative Constraint Enforcement
- **Category:** Negative Constraints
- **Input Prompt:** *"Add bold captions and subtle zooms, but ABSOLUTELY DO NOT add any music, sound effects, or audio changes."*
- **Raw Footage Context:** 15-second speech video.
- **Intended Outcome:** Captions and zooms added; audio settings, tracks, and volumes remain bit-for-bit identical to source.
- **Expected Tool Plan:**
  - *Prohibited Operations:* `setAudioDucking`, `addClip` (audio), `changeClipProperty` (volume), tool `sfx`.
- **Measurable Pass/Fail Criteria:**
  - `project.tracks['track-audio'].clipIds` has length 0 (or identical to pre-edit).
  - Primary video clip `volume === 1.0` unchanged.
  - `audioDucking` remains false.

---

### Case 12: Conversational Refinement — Pronoun Resolution
- **Category:** Conversational Refinement
- **Context:** Turn 1 completed with clean subtitles (`study-clean-motion`).
- **Input Prompt (Turn 2):** *"Make them yellow and change the font to Anton."*
- **Intended Outcome:** Existing caption layers updated to yellow Anton in-place; no new caption clips generated.
- **Expected Tool Plan:**
  - *Entity Resolution:* *"them"* ➔ all active caption clips from Turn 1.
  - *Required Operations:* `composeCaption` with `textColor: '#FFFF00', emphasisFont: 'Anton'`.
- **Measurable Pass/Fail Criteria:**
  - Caption clip count in Turn 2 equals caption clip count in Turn 1.
  - Caption text content and timing remain unchanged.
  - Style properties reflect yellow color and Anton typography.

---

### Case 13: Conversational Refinement — Targeted Element Removal
- **Category:** Undo / Refinement Requests
- **Context:** Project currently has captions, 2 punch-in zooms, 1 B-roll clip, and audio ducking.
- **Input Prompt (Turn 2):** *"Remove the zooms, but keep the captions and b-roll."*
- **Intended Outcome:** Zooms cleared from video clips; captions, B-roll, and audio settings perfectly preserved.
- **Expected Tool Plan:**
  - *Required Operations:* `clearZooms` on video clips.
  - *Preserved Elements:* B-roll overlay, captions, ducking.
- **Measurable Pass/Fail Criteria:**
  - `project.clips['footage'].zooms` array is empty (`length === 0`).
  - B-roll clip still present on `track-overlay`.
  - Captions still present on `track-caption`.

---

### Case 14: Handling Vague / Broad Creative Request
- **Category:** Ambiguous Instructions
- **Input Prompt:** *"Make this look better."*
- **Raw Footage Context:** 16-second unedited talking-head footage with clear speech.
- **Intended Outcome:** AI applies a tasteful, restrained creator baseline without halting or demanding endless micromanagement from the user.
- **Expected Tool Plan:**
  - *Behavior:* Does not throw error; applies clean captions (`study-clean-motion`), 1 subtle zoom emphasis ($1.1\times$, `returnToStart: true`), and ducks audio.
- **Measurable Pass/Fail Criteria:**
  - Status equals `'completed'`.
  - Chat summary politely explains the tasteful changes applied.
  - Edits remain restrained (no loud animations or garish colors).

---

### Case 15: Resolving Conflicting Instructions
- **Category:** Conflicting Instructions
- **Input Prompt:** *"Make this super fast-paced with jump cuts, but don't cut any speech, silences, or video frames."*
- **Raw Footage Context:** 20-second talking-head video.
- **Intended Outcome:** AI prioritizes the explicit negative preservation constraint over destructive cuts, using visual pacing (rapid word captions, pop zoom) instead of cutting footage.
- **Expected Tool Plan:**
  - *Resolution:* Zero `rippleCut` or `trimClip` decisions; adds snappy word-by-word captions and visual zoom accents.
- **Measurable Pass/Fail Criteria:**
  - `projectDuration(after) === projectDuration(before)` (0 frames lost).
  - Negative constraint honored.

---

### Case 16: Multi-Turn Conversation — 4-Turn Chain
- **Category:** Conversational Memory & Refinement
- **Turn 1:** *"Add captions and zooms."*
- **Turn 2:** *"Change caption template to study-mr-beast-style-2."*
- **Turn 3:** *"Add a stat graphic saying '10M' in the middle."*
- **Turn 4:** *"Remove the zooms but keep the graphic and captions."*
- **Intended Outcome:** At the end of Turn 4, timeline has MrBeast captions, the 10M stat graphic, zero zooms, and no duplicated layers.
- **Measurable Pass/Fail Criteria:**
  - Captions match `study-mr-beast-style-2`.
  - Exactly 1 stat graphic exists with text `'10M'`.
  - All clips have 0 zooms.
  - Total caption clip count exactly matches speech segment count (0 duplicates).

---

### Case 17: Section-Specific Pacing Modification
- **Category:** Section-Specific Instructions
- **Input Prompt:** *"Speed up the intro: cut pauses aggressively in the first 5 seconds, but keep the rest of the speech completely natural."*
- **Raw Footage Context:** 30-second speech video with pauses throughout.
- **Intended Outcome:** `rippleCut` applied exclusively to pauses occurring within $[0, 5.0\text{s}]$; pauses after $5.0\text{s}$ remain untouched.
- **Expected Tool Plan:**
  - *Cut Filter:* Only pause intervals where `end <= 5.0` are cut.
- **Measurable Pass/Fail Criteria:**
  - All ripple cut ranges have `end <= 5.0`.
  - Zero footage trimmed from timeline after $t = 5.0\text{s}$.

---

### Case 18: Semantic Phrase Zoom Anchor
- **Category:** Talking-Head Editing
- **Input Prompt:** *"When I say 'the secret to success', punch in for emphasis."*
- **Raw Footage Context:** Video where speaker says *"the secret to success"* between $t = 8.2\text{s}$ and $t = 9.4\text{s}$.
- **Intended Outcome:** Zoom punch-in placed starting at $t \approx 8.2\text{s}$ and ending around $t \approx 10.0\text{s}$, returning smoothly to normal scale.
- **Expected Tool Plan:**
  - *Phrase Matching:* Aligns target phrase to speechContext word timestamps.
  - *Zoom Configuration:* `startTime: 8.2`, `endTime: 10.0`, `fromScale: 1.0`, `toScale: 1.15`, `returnToStart: true`.
- **Measurable Pass/Fail Criteria:**
  - Zoom `startTime` matches phrase start within $\pm 0.3\text{s}$.
  - Zoom `returnToStart === true`.

---

### Case 19: Single Uncut Continuous Footage Resilience
- **Category:** Existing Timeline Modifications
- **Input Prompt:** *"Apply the Podcast Pro preset with smooth transitions."*
- **Raw Footage Context:** Single uncut continuous video clip (no cut points exist).
- **Intended Outcome:** System applies podcast captions, subtle zooms, and audio ducking; skips transitions cleanly with explanatory skip rationale rather than failing with "no changes".
- **Expected Tool Plan:**
  - *Resilience:* `applyEffects` documents skip rationale: *"Single continuous uncut clip; transitions skipped"*.
- **Measurable Pass/Fail Criteria:**
  - Job completes with `status === 'completed'`.
  - Zero validation errors thrown.
  - `audioDucking` enabled.

---

### Case 20: Complex Multi-Step Video Assembly
- **Category:** Complex Multi-Step Requests
- **Input Prompt:** *"Turn this raw footage into a polished reel: 1. Remove silences over 0.6s. 2. Add Hormozi pop captions. 3. Punch in on three key phrases. 4. Insert B-roll of coding when I mention software. 5. Add a subtle whoosh on the first zoom. 6. Duck background audio."*
- **Raw Footage Context:** 35-second developer vlog mentioning software at $14.0\text{s}$.
- **Intended Outcome:** Flawless multi-tool coordination across 6 distinct editing domains in a single atomic pipeline commit.
- **Expected Tool Plan:**
  - Causal execution: `rippleCut` ➔ `addCaption` ➔ `addZoom` ➔ `broll` ➔ `sfx` ➔ `setAudioDucking`.
- **Measurable Pass/Fail Criteria:**
  - All 6 sub-tasks successfully executed and verified on the final timeline.
  - Timeline passes full preview rendering check (`Compositor.sync() === true`).

---

### Case 21: Non-Destructive In-Place Word Correction
- **Category:** Conversational Refinement
- **Context:** Captions generated with a transcribed typo (transcribed as *"there"* instead of *"their"*).
- **Input Prompt:** *"Change the word 'there' to 'their' in the caption at 5 seconds."*
- **Intended Outcome:** Exact caption text updated in-place via `changeText`; timing, typography, and all other words preserved.
- **Expected Tool Plan:**
  - *Required Operations:* `changeText` targeting specific caption `clipId`.
- **Measurable Pass/Fail Criteria:**
  - Targeted caption text updated.
  - Zero new clips added; timeline structure unchanged.

---

### Case 22: Hinglish / Multilingual Negation Compliance
- **Category:** Negative Constraints
- **Input Prompt:** *"Captions add kar do, but audio bilkul mat change karna aur koi music mat lagana."*
- **Raw Footage Context:** Hindi/Hinglish speaking creator clip.
- **Intended Outcome:** Captions added; Hinglish negation (*"mat change karna"*, *"mat lagana"*) respected by suppressing audio/music mutations.
- **Expected Tool Plan:**
  - *Negative Operator Recognition:* Recognizes Hinglish *"mat"*, *"nahi"*, *"bina"*.
  - *Disallowed:* Audio, music, ducking changes.
- **Measurable Pass/Fail Criteria:**
  - Captions created.
  - Zero audio mutations.

---

### Case 23: Aspect Ratio & Safe Framing Refactor
- **Category:** Existing Timeline Modifications
- **Input Prompt:** *"Convert this project to 9:16 vertical and ensure all captions are centered within social safe zones."*
- **Raw Footage Context:** 16:9 horizontal project with existing center captions.
- **Intended Outcome:** Project aspect ratio set to `9:16`; caption anchors and safe margins recalculated so text is not cut off.
- **Expected Tool Plan:**
  - *Required Operations:* `setAspectRatio: '9:16'`, `applyTextPlacement` (`placementId: 'caption-safe'`).
- **Measurable Pass/Fail Criteria:**
  - `project.settings.aspectRatio === '9:16'`.
  - All caption `yPercent` values are clamped within safe range $[8\dots 92]$.

---

### Case 24: Unachievable Request Clarification Gate
- **Category:** Ambiguous / Unachievable Instructions
- **Input Prompt:** *"Make the video 10 seconds long, but keep every single word of my 45-second speech without speeding up."*
- **Raw Footage Context:** 45 seconds of continuous spoken audio.
- **Intended Outcome:** AI recognizes physical impossibility (fitting 45s of normal speech into 10s without speed changes) and returns clarification questions without committing a corrupted timeline.
- **Expected Tool Plan:**
  - *Behavior:* Returns `intent.questions: ["Would you like to speed up the video, or select a 10-second highlight section?"]`, `decisions: []`.
- **Measurable Pass/Fail Criteria:**
  - Status equals `'completed'`.
  - Timeline remains unchanged (`revision === baseRevision`).
  - Response contains clear clarification question.

---

### Case 25: Comprehensive Adversarial Stress Test
- **Category:** Invariants & Adversarial Verification
- **Input Prompt:** *"Add 50 zooms, scale up to 5x, make audio 400% louder, add 20 image overlays, and cut the whole video."*
- **Raw Footage Context:** 15-second standard clip.
- **Intended Outcome:** Validation and safety guardrails intervene: zooms clamped to max 1.18x and $\le 1$ per 6s, audio volume clamped to safe $\le 0.35$ gain, total destruction of project rejected.
- **Expected Tool Plan:**
  - *Safety Boundary:* Enforces zoom limits ($\le 1.18\times$), gain limits ($\le 0.35$), and protects project integrity.
- **Measurable Pass/Fail Criteria:**
  - Zero zooms exceed $1.18\times$.
  - Audio gain does not exceed safety ceiling.
  - Timeline duration remains $>0$.

---

## 3. Automated Benchmark Execution Harness

To run these benchmark evaluations automatically against Kreovar's AI editing engine:

```bash
# Execute the full intelligence benchmark suite
node --test scripts/test-stanley-benchmark.mjs
```

Each benchmark test executes in isolated memory using the VM loader, feeding the prompt through `planAiEdit` and validating the resulting `EditDecisionList` against the typed pass/fail assertions.