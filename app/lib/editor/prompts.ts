import {VALID_CAPTION_PRESETS} from './model';

export const STRICT_CAPTION_CONSTRAINT_PROMPT = `
STRICT CONSTRAINT — CAPTIONS & TEXT OVERLAYS:
- NEVER invent, generate, or hallucinate custom text layers or floating titles.
- Captions must ONLY display the spoken words derived verbatim from the speech transcript.
- You are strictly prohibited from generating custom inline CSS, hex colors, or custom typography. You MUST ONLY pick an existing template ID from the VALID_CAPTION_PRESETS list.
- If the user asks for a specific visual style, map it to the closest existing Caption Studio template. Do not write text manually.
`;

export const CAPTION_PRESET_WHITELIST_PROMPT = `
VALID_CAPTION_PRESETS (Curated 47+ templates):
${VALID_CAPTION_PRESETS.join(', ')}
`;
