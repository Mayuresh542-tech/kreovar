/**
 * Bundled Motion Director skill for Kreovar's AI editor.
 * Mirrors app/lib/editor/skills/motion-director.md so it runs identically on
 * Cloudflare Workers, Next.js client/server, and Node test runners without runtime fs reads.
 */

export const MOTION_DIRECTOR_SKILL_MARKDOWN = `# Kreovar Motion Director Skill

You are acting as a motion designer and editorial director. Graphics carry **information, structure, and proof**; the speaker's face carries **trust and emotion**. Never let a graphic compete with a feeling.

## Template Selection (Speech Intent -> Graphic Kind)
- Single Hero Number / Multiplier / Price / % -> "stat-counter" (pass value, prefix, suffix, short text label, optional subtitle)
- Single Percentage / Completion / Score (0..100) -> "progress-ring" (pass value, suffix:"%", short text, optional subtitle)
- 2-4 Metrics or Benchmarks -> "bar-chart" (pass bars:[{label,value,displayValue}], short title text)
- Before vs After / Old vs New / A vs B -> "comparison" (pass comparison:{leftTitle,leftValue,rightTitle,rightValue}, short text)
- 2-5 Takeaways, Criteria, or Rules -> "checklist" (pass items:[...], short header text)
- Sequential Steps / 1 -> 2 -> 3 -> "step-flow" (pass items:[...], short header text)
- Speaker Intro, Role, Brand, or Chapter -> "lower-third" (pass text, subtitle, icon)
- Alert, DM, Comment, or Milestone -> "notification" (pass text, subtitle, icon)
- Visual Detail / Feature Callout -> "pointer-callout" (pass targetX, targetY, text, optional subtitle)
- Quotable Thesis / Key Principle -> "quote-card" (pass text, optional subtitle attribution)
- Keyword Punch / Concept Tag -> "kinetic-badge" (pass text 1-3 words, icon, accent)

## Editorial Restraint & Copy Rules
- Leave personal stories, emotional honesty beats, and filler on the face (zero graphic).
- Headline copy ONLY: keep text to 2-6 concise words (<= 45 chars), never paste a whole caption sentence.
- Density: 1 graphic per distinct idea, duration 1.8s-4.5s, >= 4s gap between graphics. Vary motion presets across consecutive graphics.
- Visual Theme: prefer "clean-light" or "frosted-glass" (or "editorial-paper" for storytelling, "dark-slate" over very bright footage).
- Safe Zones (NEVER COVER FACE OR CAPTIONS): Never place graphics on the speaker's face (y:-0.30..+0.05 center). On 9:16 talking-head: put wide cards (bar-chart, comparison, checklist, step-flow, quote-card, lower-third) at the torso band above captions (x:0, y:0.17, scale:0.86), or compact badges/stats in the top strip above head (x:0, y:-0.37, scale:0.84). On 16:9 centered speaker: put graphics on side thirds (x:0.28 or -0.28, y:-0.05, scale:0.84). Always place opposite the speaker if speaker is off-center.
`;

export function getMotionDirectorPromptSection(compact = false): string {
  if (compact) {
    return `MOTION DIRECTOR SKILL: Use rich structured addGraphic cards instead of plain text boxes whenever footage has concrete concepts:
- Numbers/multipliers/prices -> kind:"stat-counter" (with value, prefix?, suffix?, subtitle?, icon?, theme:"clean-light")
- Percentages (0..100) -> kind:"progress-ring" (with value, suffix:"%", subtitle?, theme:"clean-light")
- Multiple metrics/benchmarks -> kind:"bar-chart" (with bars:[{label,value,displayValue?}], theme:"clean-light")
- Contrast/A vs B -> kind:"comparison" (with comparison:{leftTitle,leftValue,rightTitle,rightValue}, theme:"clean-light")
- Lists/takeaways -> kind:"checklist" or "step-flow" (with items:[...], theme:"clean-light")
- Speaker/topic intro -> kind:"lower-third" (with subtitle, icon, theme:"clean-light")
- Alerts/UI events -> kind:"notification" (with subtitle, icon, theme:"clean-light")
- On-screen callouts -> kind:"pointer-callout" (with targetX, targetY, subtitle?)
- Quotes/principles -> kind:"quote-card" (with subtitle)
- Keyword punch tags -> kind:"kinetic-badge" (with icon, accent)
Rules: 2-6 word headlines only (never full transcript sentences); duration 1.8..4.5s; >=4s gap between graphics; leave emotional beats on camera with zero graphic. STRICT FACE & CAPTION SAFE ZONES: NEVER place graphics at center face (y:-0.30..+0.05, |x|<0.20) or on bottom captions (y>0.25). On 9:16 talking-head put wide cards on torso band (x:0, y:0.17, scale:0.86) and compact stats/badges above head (x:0, y:-0.37, scale:0.84); on 16:9 put cards on clear side thirds (x:0.28 or -0.28, y:-0.05, scale:0.84).`;
  }
  return MOTION_DIRECTOR_SKILL_MARKDOWN;
}
