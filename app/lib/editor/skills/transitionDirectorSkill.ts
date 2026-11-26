/**
 * Reverse-Engineered CapCut Transitions & Clip Animations Editorial Playbook for Kreovar AI Editor.
 * Guides WHEN, WHERE, WHICH preset, HOW LONG, and HOW to pair SFX + clip animations like an experienced human editor.
 */

export const TRANSITION_DIRECTOR_SKILL_MARKDOWN = `# CapCut Transitions & Clip Animations Editorial Playbook

You are equipped with 47 reverse-engineered CapCut transitions and 43 CapCut clip In/Out + 12 Combo/Loop animations.
Treat transitions and animations as **narrative punctuation and kinetic energy**, NEVER visual clutter.

## 1. WHEN to Use Transitions vs. Hard Cuts
- **Keep a clean HARD CUT (no addTransition)**:
  - Mid-sentence jump cuts trimming pauses on the same talking-head camera angle (use zoom punch-in or cut clean instead of fake dissolves).
  - Rapid-fire <0.8s rhythmic shots unless explicitly applying micro flashes/whips across a beat montage.
- **DO use \`addTransition\`**:
  - Adjacent clips on the same visual track representing a **topic pivot, scene/location shift, chapter opener, hook-to-story bridge, product comparison, or music beat drop**.
  - Unless the user asks to "apply transitions to all cuts", place transitions intentionally on **~20–40% of real topic/scene seams** in talking-head/explainer videos, or **50–100% of cuts** in sizzle reels, photo montages, and travel/product edits.

## 2. WHERE & WHICH Transition (\`addTransition\` — 47 Presets)
Always verify both clips share one track, \`fromClip.startTime + fromClip.duration ≈ toClip.startTime\`, and pick duration \`<= Math.min(fromClip.duration * 0.45, toClip.duration * 0.45)\`:
- **Clean Modern / Tutorial / SaaS / Talking-Head Bridges (0.30–0.50s)**:
  - \`"gaussian-blur"\` (0.40s): Optical defocus bridge between workspace/B-roll shots.
  - \`"dissolve"\` (0.40–0.50s): Gentle mood/location crossfade.
  - \`"slide"\` / \`"slide-right"\` / \`"slide-up"\` / \`"slide-down"\` (0.32–0.40s): Sequential list steps, carousel UI switches, slide chapters.
  - \`"wipe-right"\` / \`"wipe-left"\` / \`"wipe-diagonal"\` (0.32–0.40s): Before/after reveals, clean UI/product step-throughs.
  - \`"fade"\` (0.55–0.80s): Major act breaks, passage of time, closing wrap-up.
- **High-Retention TikTok / Reels / Shorts / Vlogs (0.20–0.32s)**:
  - \`"whip-left"\` / \`"whip-right"\` / \`"whip-up"\` / \`"whip-down"\` (0.22–0.28s): Fast directional camera whip with motion streak. Alternate or match camera pan direction!
  - \`"zoom-blur"\` (0.26–0.32s): Hook-to-body or wide-to-detail energy surge.
  - \`"pull-in"\` / \`"pull-out"\` (0.24–0.30s): Signature CapCut optical tunnel rush.
  - \`"push-left"\` / \`"directional-blur"\` (0.24–0.34s): Snappy lateral pace shifts.
- **Beat Drops / Hype / Tech / AI / Gaming (0.18–0.32s)**:
  - \`"camera-shake"\` (0.26–0.32s) or \`"impact-punch"\` (0.20–0.26s): Exact downbeat hits, bold reveals.
  - \`"glitch-rgb"\` / \`"glitch-slice"\` (0.22–0.30s): Tech/AI twists, plot turns, cyberpunk energy.
  - \`"pixelate-dissolve"\` (0.35s): Gaming/retro/mystery cut.
  - \`"flash-white"\` / \`"flash-black"\` (0.20–0.28s): Camera photo dump snaps or dramatic blinks.
  - \`"spin-left"\` / \`"spin-right"\` / \`"tilt-whip"\` (0.26–0.34s): Use sparingly (1–2x per video) on dynamic motion clips.
- **Cinematic / Travel / Fashion / Aesthetic (0.40–0.65s)**:
  - \`"light-leak"\` (0.50s), \`"exposure-flash"\` (0.34s), \`"film-burn"\` (0.45s), \`"luma-dissolve"\` (0.55s), \`"dream-glow"\` (0.50s), \`"radial-blur"\` (0.35s), \`"ghost-echo"\` (0.42s).
- **Stylized Shapes & Reveals (0.38–0.50s)**:
  - \`"flip-x"\` / \`"flip-y"\`, \`"circle-iris"\`, \`"diamond-iris"\`, \`"barn-door"\`, \`"split-horizontal"\`, \`"blinds"\`, \`"clock-wipe"\`.

Optional fields on \`addTransition\`: \`intensity\` (0.25..2, default 1; use 0.7 for subtle corporate, 1.3 for hype), \`easing\` ("linear"|"easeIn"|"easeOut"|"easeInOut"|"expoOut"|"snap"), \`direction\` ("auto"|"left"|"right"|"up"|"down").

## 3. Clip Animations (\`changeClipProperty\` with \`mediaAnimation\`) — 43 Motions & 12 Loops
Use \`mediaAnimation\` for **B-roll, photos, screenshots, cutouts, and hook openers** (leave long talking-head camera steady!):
- **Entrance/Exit Motions (\`entranceDuration: 0.25..0.6\`, \`exitDuration: 0.2..0.4\`)**:
  - Subtle Creator/SaaS: \`"blur-rise"\`, \`"fade"\`, \`"mini-zoom"\`, \`"wipe-right"\`, \`"unfold-h"\`.
  - CapCut Popular Montages/Overlays: \`"rock-vertical"\`, \`"rock-horizontal"\`, \`"swing-top"\`, \`"swing-bottom"\`, \`"swing-left"\`, \`"swing-right"\`, \`"whip-in-left"\`, \`"whip-in-right"\`, \`"elastic-pop"\`, \`"pop"\`, \`"bounce"\`, \`"drop-in"\`, \`"spin-zoom"\`, \`"skew-slide"\`.
  - Visual FX Entries: \`"flash-in"\`, \`"glitch-in"\`, \`"shake-hit"\`, \`"pixel-in"\`, \`"blur"\`, \`"flip-x"\`, \`"flip-y"\`.
  - Still Photos & Static B-Roll: \`kenBurns\`: \`"ken-burns-push"\` | \`"ken-burns-pull"\` | \`"ken-burns-pan-left"\` | \`"ken-burns-pan-right"\`.
- **Combo / Mid-Clip Loops (\`loop\`, \`loopDuration: 1.4..3.5s\`)**:
  - Subtle breathing/float: \`"none"\`, \`"float"\`, \`"breathe"\`, \`"zoom-drift"\`, \`"jitter"\`, \`"sway"\`, \`"orbit"\`.
  - Hype/Beat Combo: \`"pendulum"\`, \`"heartbeat"\`, \`"pulse"\`, \`"glitch-pulse"\`, \`"tilt-swing"\`, \`"wobble"\`.

## 4. Audio & SFX Synergy
Pair high-motion transitions (\`whip-*\`, \`zoom-blur\`, \`pull-in\`, \`spin-*\`, \`directional-blur\`) with a subtle \`"fast-swish"\` SFX centered at \`cutTime - 0.09s\`; smooth blurs/slides/dissolves with \`"soft-whoosh"\` at \`cutTime - 0.12s\`; \`"light-leak"\` / \`"dream-glow"\` with \`"sparkle"\` or \`"soft-whoosh"\`; shakes/punches with \`"low-impact"\` at \`cutTime - 0.03s\`; glitch/slice/pixelate with \`"glitch"\` at \`cutTime - 0.04s\`; white flash with \`"soft-click"\` at \`cutTime - 0.04s\`; iris/diamond reveals with \`"digital-pop"\`.
`;

export function getTransitionDirectorPromptSection(compact = false): string {
  if (compact) {
    return `CAPCUT TRANSITIONS & ANIMATIONS DIRECTOR PLAYBOOK:
- WHEN: Do NOT put transitions between mid-sentence talking-head jump cuts! Use addTransition on scene/topic pivots, B-roll bridges, hook drops, or all cuts when requested. Keep duration <= min(fromClip.duration*0.45, toClip.duration*0.45).
- 47 TRANSITION KINDS (addTransition {op:"addTransition", fromClipId, toClipId, kind, duration, intensity?, easing?, direction?}):
  - Clean/Dissolve/Light: "fade" (0.6s act break), "dissolve" (0.45s), "flash-white" (0.25s strobe), "flash-black" (0.26s blink), "exposure-flash" (0.35s gamma bloom), "luma-dissolve" (0.55s), "light-leak" (0.55s warm amber), "film-burn" (0.45s retro edge burn).
  - Blur/Glow: "gaussian-blur" (0.45s clean B-roll bridge), "directional-blur" (0.28s streak), "zoom-blur" (0.3s hype hook), "radial-blur" (0.35s vortex), "dream-glow" (0.55s soft beauty halo).
  - Slide/Whip (0.22-0.38s): "slide", "slide-right", "slide-up", "slide-down", "whip-left", "whip-right", "whip-up", "whip-down", "push-left".
  - Zoom/Spin (0.24-0.42s): "zoom", "zoom-out", "pull-in", "pull-out", "lens-zoom", "spin-left", "spin-right", "flip-x", "flip-y", "tilt-whip".
  - Shake/Glitch (0.22-0.4s): "camera-shake" (S-shake), "impact-punch" (bass hit), "glitch-rgb", "glitch-slice", "pixelate-dissolve", "ghost-echo".
  - Wipes/Shapes (0.36-0.48s): "wipe-left", "wipe-right", "wipe-diagonal", "circle-iris", "clock-wipe", "barn-door", "blinds", "diamond-iris", "split-horizontal".
- CLIP ANIMATIONS (changeClipProperty {clipId, changes:{mediaAnimation:{entrance,exit,loop,entranceDuration,exitDuration,loopDuration,easing,kenBurns?}}}): Animate B-roll/photos/overlays (NEVER jitter main talking head). Entrances/Exits: "none","fade","flash-in","slide-left","slide-right","slide-up","slide-down","whip-in-left","whip-in-right","skew-slide","zoom-in","zoom-out","mini-zoom","pop","elastic-pop","bounce","drop-in","rock-vertical","rock-horizontal","swing-top","swing-bottom","swing-left","swing-right","rotate-left","rotate-right","spin-zoom","flip-x","flip-y","blur","blur-rise","glitch-in","shake-hit","pixel-in","unfold-h","unfold-v","wipe-left","wipe-right","wipe-up","wipe-down" + "ken-burns-push"|"ken-burns-pull"|"ken-burns-pan-left"|"ken-burns-pan-right". Loops: "none","float","pulse","sway","orbit","pendulum","heartbeat","jitter","breathe","glitch-pulse","zoom-drift","tilt-swing","wobble".`;
  }
  return TRANSITION_DIRECTOR_SKILL_MARKDOWN;
}
