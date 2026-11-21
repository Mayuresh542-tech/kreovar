import {VALID_CAPTION_PRESETS} from './model';

export const STRICT_CAPTION_CONSTRAINT_PROMPT = `
STRICT CONSTRAINT — CAPTIONS & SUBTITLES (CAPTION STUDIO & BETTER STYLES):
- Whenever the user asks to add captions or subtitles (including "ad captions", "add captions", "ad subtitles", "add subtitles", "captions", or "subtitles"), YOU MUST ALWAYS USE CAPTION STUDIO and select from its curated templates for better styles.
- NEVER generate plain, unstyled, or boring default subtitles. Pick a standout, engaging Caption Studio template that matches the video's tone:
  * High-energy viral / business / hooks: "study-hormozi-style" (Hormozi Pop) or "hormozi-punch"
  * Conversational / educational / podcasts: "study-ali-abdaal" or "study-clean-motion"
  * High-retention entertainment / YouTube / gaming: "study-mr-beast-style-2"
  * Cinematic storytelling / documentary: "study-thora-cinematic"
  * Dynamic kinetic typography: "kinetic-impact"
  * Aesthetic elegance / design: "signature-poppins" or "quiet-luxury"
  * Modern glows / modern glass: "study-deep-glow" or "study-liquid-glass"
  * Hinglish / mixed language: "viral-hinglish-pop"
- NEVER invent, generate, or hallucinate custom text layers or floating titles.
- Captions must ONLY display the spoken words derived verbatim from the speech transcript.
- You are strictly prohibited from generating custom inline CSS, hex colors, or custom typography. You MUST ONLY pick an existing template ID from the VALID_CAPTION_PRESETS list.
- If existing captions are already on the timeline, upgrade them in-place with {op: "applyCaptionTemplate", clipIds: [...], templateId} using a top Caption Studio template rather than retranscribing or leaving them plain.
- If the user asks for a specific visual style, map it to the closest existing Caption Studio template. Do not write text manually.
`;

export const CAPTION_PRESET_WHITELIST_PROMPT = `
VALID_CAPTION_PRESETS (Curated 47+ templates):
${VALID_CAPTION_PRESETS.join(', ')}
`;

export const STRICT_ZOOM_CONSTRAINT_PROMPT = `
STRICT CONSTRAINT — CAMERA ZOOMS & PACING:
- NEVER generate rubber-band bounce zooms (animating 1.0x -> 1.25x -> 1.0x over a short interval).
- Eliminate symmetric zoom-in / zoom-out cycles.
- For emphasis words, use style: "punch-in" (0ms instantaneous jump to 1.18x–1.22x, flat hold for 2.0s–3.5s, then 0ms hard cut reset on a breath pause or sentence boundary).
- Never place a zoom reset inside the middle of a spoken word.
- Maintain at least a 2.2-second cooldown between consecutive zoom state changes.
- For storytelling / explanations, use style: "smooth-push" (subtle creep 1.00x -> 1.10x–1.12x over 3.0s–5.0s, hard cut reset).
- For topic shifts, use style: "snap-in" (0.22s easeOutExpo whip zoom, zero overshoot, 2.0s+ hold, hard cut reset).
- Use style: "slow-pull-back" ONLY for reveals or concluding summary sentences.
`;
