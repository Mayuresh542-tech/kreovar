import {VALID_CAPTION_PRESETS,type CaptionPresetId} from './model';

export interface CaptionStylingDirective {
 textColor?: string;
 emphasisColor?: string;
 fontSize?: number;
 fontWeight?: number;
 emphasisWeight?: number;
 yPercent?: number;
 xPercent?: number;
 alignment?: 'left' | 'center' | 'right';
}

export interface EditingConstraints {
 disallowedAudio: boolean;
 disallowedSfx: boolean;
 disallowedCuts: boolean;
 disallowedBroll: boolean;
 disallowedZooms: boolean;
 removeZooms: boolean;
 removeSfx: boolean;
 removeBroll: boolean;
 protectedIntervals: Array<{ start: number; end: number }>;
 phraseQuotes: string[];
 requestedFloatingSummaryText?: boolean;
 requestedCaptionPreset?: CaptionPresetId;
 requestedSilenceCut?: boolean;
 requestedCaptionStyling?: CaptionStylingDirective;
 requestedAudioDucking?: boolean;
 requestedAspectRatio?: '16:9' | '9:16' | '1:1';
}

export interface ParsedEditingIntent {
 goal: string;
 preserve: string[];
 questions: string[];
 summary: string;
 constraints: EditingConstraints;
}

/** Matches natural language caption style phrases strictly to a curated preset */
export function matchCaptionPreset(text: string): CaptionPresetId | undefined {
 if (!text || typeof text !== 'string') return undefined;
 const lower = text.toLowerCase();

 // Direct matches in VALID_CAPTION_PRESETS
 for (const preset of VALID_CAPTION_PRESETS) {
  if (lower.includes(preset.toLowerCase())) return preset;
 }

 // Contextual creator & visual style matching
 if (/\b(?:ali\s+abdaal|abdaal|spotlight|podcast)\b/i.test(lower)) return 'study-ali-abdaal';
 if (/\b(?:hormozi|alex\s+hormozi|hormozi\s+pop|hormozi\s+viral)\b/i.test(lower)) return 'study-hormozi-style';
 if (/\b(?:mr\s*beast|beast)\b/i.test(lower)) return 'study-mr-beast-style-2';
 if (/\b(?:thora|cinematic\s+doc|cinematic|film)\b/i.test(lower)) return 'study-thora-cinematic';
 if (/\b(?:liquid\s+glass|glass|translucent)\b/i.test(lower)) return 'study-liquid-glass';
 if (/\b(?:deep\s+glow|glow\s+style)\b/i.test(lower)) return 'study-deep-glow';
 if (/\b(?:mota|mota\s+athletic|bold\s+font)\b/i.test(lower)) return 'study-mota';
 if (/\b(?:hinglish|roman\s+hindi|viral\s+hinglish)\b/i.test(lower)) return 'viral-hinglish-pop';
 if (/\b(?:blueprint|science|technical\s+grid)\b/i.test(lower)) return 'edit-blueprint';
 if (/\b(?:paper|scrapbook)\b/i.test(lower)) return 'edit-paper';
 if (/\b(?:impact|condensed\s+cyan)\b/i.test(lower)) return 'edit-impact';
 if (/\b(?:kinetic(?:\s+captions?)?)\b/i.test(lower)) return 'kinetic-impact';
 if (/\b(?:clean\s+motion|clean\s+subtitles|clean\s+minimal|minimal)\b/i.test(lower)) return 'study-clean-motion';
 if (/\b(?:scribble)\b/i.test(lower)) return 'study-scribble';
 if (/\b(?:luxury|quiet\s+luxury)\b/i.test(lower)) return 'quiet-luxury';
 if (/\b(?:vox|explainer)\b/i.test(lower)) return 'vox-tape';
 if (/\b(?:vinyl|record)\b/i.test(lower)) return 'edit-vinyl';
 if (/\b(?:sketch)\b/i.test(lower)) return 'edit-sketch';
 if (/\b(?:prism)\b/i.test(lower)) return 'edit-prism';
 if (/\b(?:prime)\b/i.test(lower)) return 'edit-prime';
 if (/\b(?:vista)\b/i.test(lower)) return 'edit-vista';
 if (/\b(?:poppins|signature)\b/i.test(lower)) return 'signature-poppins';
 if (/\b(?:dancing)\b/i.test(lower)) return 'dancing-poppins';
 if (/\b(?:cyberpunk|neon)\b/i.test(lower)) return 'cyber-neon';

 return undefined;
}

/** Extracts negative constraints, temporal bounds, and phrase quotes from user prompt & preserve list. */
export function extractEditingConstraints(instruction = '', preserveList: string[] = []): EditingConstraints {
 const text = (instruction + ' ' + preserveList.join(' ')).toLowerCase();

 const noAudio = /\b(?:no\s+(?:music|audio|background\s+audio)|(?:do\s+not|don'?t)\s+(?:add\s+(?:any\s+)?|make\s+(?:any\s+)?|touch\s+(?:any\s+)?|change\s+)?(?:music|audio)|without\s+(?:any\s+)?(?:music|audio)|(?:no|without|(?:do\s+not|don'?t)\s+make)\s+audio\s+changes?|preserve\s+(?:the\s+)?audio|music\s+mat\b|audio\s+mat\b|bina\s+music\b|koi\s+music\s+mat\b)/i.test(text);
 const noSfx = /\b(?:no\s+sfx|no\s+sound\s+effects?|without\s+sfx|without\s+sound\s+effects?|(?:do\s+not|don'?t)\s+(?:add\s+(?:any\s+)?|use\s+(?:any\s+)?)(?:sfx|sound\s+effects?)|sfx\s+mat\b|bina\s+sfx\b)/i.test(text);
 const noCuts = /\b(?:(?:do\s+not|don'?t)\s+cut|no\s+cuts?|without\s+cutting|(?:do\s+not|don'?t)\s+trim\s+(?:any\s+)?speech|(?:do\s+not|don'?t)\s+remove\s+(?:any\s+)?speech|cut\s+mat\b|mat\s+katna\b)/i.test(text);
 const noBroll = /\b(?:no\s+b[ -]?roll|without\s+b[ -]?roll|without\s+stock|no\s+stock|(?:do\s+not|don'?t)\s+(?:add\s+(?:any\s+)?|use\s+(?:any\s+)?)(?:b[ -]?roll|stock)|broll\s+mat\b)/i.test(text);
 const noZooms = /\b(?:no\s+zooms?|without\s+zooms?|(?:do\s+not|don'?t)\s+zoom|zoom\s+mat\b)/i.test(text);
 const removeZooms = /\b(?:remove\s+(?:the\s+)?zooms?|clear\s+(?:all\s+)?zooms?|delete\s+(?:the\s+)?zooms?|zoom\s+hata)\b/i.test(text);
 const removeSfx = /\b(?:remove\s+(?:all\s+)?(?:sound\s+effects?|sfx)|delete\s+(?:all\s+)?(?:sound\s+effects?|sfx)|clear\s+(?:all\s+)?(?:sound\s+effects?|sfx)|sfx\s+hata|sound\s+effects?\s+hata)\b/i.test(text);
 const removeBroll = /\b(?:remove\s+(?:all\s+)?(?:b[ -]?roll|stock\s+footage)|delete\s+(?:all\s+)?(?:b[ -]?roll|stock\s+footage)|clear\s+(?:all\s+)?(?:b[ -]?roll|stock\s+footage)|broll\s+hata)\b/i.test(text);
 const requestedSilenceCut = /\b(?:cut\s+(?:the\s+)?(?:silent\s+|awkward\s+|dead\s+|long\s+)?(?:silences?|pauses?|hesitations?|gaps?|dead\s+air)|remove\s+(?:the\s+)?(?:silent\s+|awkward\s+|dead\s+|long\s+)?(?:silences?|pauses?|hesitations?|gaps?|dead\s+air)|trim\s+(?:the\s+)?(?:silent\s+|awkward\s+|dead\s+|long\s+)?(?:silences?|pauses?|hesitations?|gaps?|dead\s+air)|tighten\s+(?:the\s+)?pacing|silence\s+cut\b|podcast\s+cut\b|pauses?\s+(?:hata|cut)\b)/i.test(text);

 const protectedIntervals: Array<{ start: number; end: number }> = [];
 const firstMatch = text.match(/(?:keep\s+)?(?:the\s+)?first\s+(\d+(?:\.\d+)?)\s*(?:s|sec|seconds?)\s*(?:untouched|clean|as\s+is|without\s+edits)/i);
 if (firstMatch) {
  const sec = parseFloat(firstMatch[1]);
  if (!isNaN(sec) && sec > 0) {
   protectedIntervals.push({ start: 0, end: sec });
  }
 }

 const phraseQuotes: string[] = [];
 const quoteRegex = /(?:when\s+i\s+(?:say|mention|talk\s+about))\s+['"“‘]([^'"”’]+)['"”’]/gi;
 let qMatch: RegExpExecArray | null;
 while ((qMatch = quoteRegex.exec(instruction)) !== null) {
  if (qMatch[1]?.trim()) phraseQuotes.push(qMatch[1].trim());
 }
 // Also support unquoted target words: "when I say secret", "on the word growth", "zoom in on money"
 const unquotedRegex = /(?:when\s+i\s+(?:say|mention)\s+|on\s+the\s+word\s+|punch\s+in\s+on\s+|zoom\s+in\s+on\s+)([a-zA-Z0-9_-]+)/gi;
 while ((qMatch = unquotedRegex.exec(instruction)) !== null) {
  const word = qMatch[1]?.trim();
  if (word && !['the','a','an','this','that','at','in','to','for','with','on'].includes(word.toLowerCase())) {
   if (!phraseQuotes.includes(word)) phraseQuotes.push(word);
  }
 }

 // Caption styling directive extraction
 let requestedCaptionStyling: CaptionStylingDirective | undefined;
 const styling: CaptionStylingDirective = {};
 if (/\b(?:yellow|peela)\b/i.test(text)) {
  styling.textColor = '#facc15';
  styling.emphasisColor = '#facc15';
 } else if (/\b(?:green|hara)\b/i.test(text)) {
  styling.textColor = '#22c55e';
  styling.emphasisColor = '#22c55e';
 } else if (/\b(?:cyan|sky)\b/i.test(text)) {
  styling.textColor = '#06b6d4';
  styling.emphasisColor = '#06b6d4';
 } else if (/\b(?:white|safed)\b/i.test(text)) {
  styling.textColor = '#ffffff';
  styling.emphasisColor = '#ffffff';
 } else if (/\b(?:red|laal)\b/i.test(text)) {
  styling.textColor = '#ef4444';
  styling.emphasisColor = '#ef4444';
 }

 if (/\b(?:bigger|larger|increase\s+(?:font\s+)?size|large\s+captions?|big\s+captions?)\b/i.test(text)) {
  styling.fontSize = 44;
 } else if (/\b(?:smaller|tiny|decrease\s+(?:font\s+)?size|small\s+captions?)\b/i.test(text)) {
  styling.fontSize = 26;
 }

 if (/\b(?:bold|bolder|heavy|bold\s+captions?)\b/i.test(text)) {
  styling.fontWeight = 800;
  styling.emphasisWeight = 900;
 }

 if (/\b(?:top|upper)\b/i.test(text) && /\b(?:captions?|subtitles?|text|position)\b/i.test(text)) {
  styling.yPercent = 18;
 } else if (/\b(?:center|middle)\b/i.test(text) && /\b(?:captions?|subtitles?|text|position)\b/i.test(text)) {
  styling.yPercent = 50;
 } else if (/\b(?:bottom|lower)\b/i.test(text) && /\b(?:captions?|subtitles?|text|position)\b/i.test(text)) {
  styling.yPercent = 82;
 }
 if (Object.keys(styling).length > 0) {
  requestedCaptionStyling = styling;
 }

 // Audio ducking extraction
 let requestedAudioDucking: boolean | undefined;
 if (/\b(?:(?:enable|turn\s+on|add)?\s*(?:audio\s+)?ducking|duck\s+(?:the\s+)?(?:music|audio)|ducking\s+on)\b/i.test(text)) {
  requestedAudioDucking = true;
 } else if (/\b(?:no\s+ducking|disable\s+ducking|ducking\s+off)\b/i.test(text)) {
  requestedAudioDucking = false;
 }

 // Aspect ratio extraction
 let requestedAspectRatio: '16:9' | '9:16' | '1:1' | undefined;
 if (/\b(?:9:16|vertical|reels?|shorts?|tiktok)\b/i.test(text)) {
  requestedAspectRatio = '9:16';
 } else if (/\b(?:16:9|horizontal|widescreen|youtube\s+long)\b/i.test(text)) {
  requestedAspectRatio = '16:9';
 } else if (/\b(?:1:1|square)\b/i.test(text)) {
  requestedAspectRatio = '1:1';
 }

 const requestedFloatingSummaryText = /\b(?:add|create|write|put|insert|display)\s+(?:a\s+)?(?:catchy|summary|floating|custom|random|intro|explaining)?\s*(?:text|title|heading|quote)\s+(?:in\s+(?:the\s+)?(?:middle|center)|explaining|about)/i.test(text);
 const requestedCaptionPreset = matchCaptionPreset(instruction);

 return {
  disallowedAudio: noAudio,
  disallowedSfx: noSfx || noAudio,
  disallowedCuts: noCuts,
  disallowedBroll: noBroll,
  disallowedZooms: noZooms,
  removeZooms,
  removeSfx,
  removeBroll,
  protectedIntervals,
  phraseQuotes,
  requestedFloatingSummaryText,
  requestedCaptionPreset,
  requestedSilenceCut,
  requestedCaptionStyling,
  requestedAudioDucking,
  requestedAspectRatio
 };
}

/** Read model intent as untrusted data. Clarification never executes proposed edits. */
export function readEditingIntent(value: unknown, originalInstruction = ''): ParsedEditingIntent | undefined {
 if (!value || typeof value !== "object") throw new Error("Invalid edit response.");
 const intent = (value as { intent?: unknown }).intent;
 if (intent === undefined) return undefined; // Compatibility with existing provider responses.
 if (!intent || typeof intent !== "object") throw new Error("Invalid editing intent.");
 const data = intent as Record<string, unknown>;
 const text = (v: unknown, max: number) => { if (typeof v !== "string" || !v.trim()) return ""; return v.trim().slice(0, max); };
  const list = (v: unknown) => { if (!Array.isArray(v)) return []; return v.filter((t): t is string => typeof t === "string" && t.trim().length > 0).slice(0, 8).map(t => text(t, 160)); };
  const goal = text(data.goal, 400) || "Perform requested edits", preserve = list(data.preserve), questions = list(data.questions);
 const constraints = extractEditingConstraints(originalInstruction, preserve);
 return {
  goal,
  preserve,
  questions,
  constraints,
  summary: [
   "My understanding: " + goal,
   ...(preserve.length ? ["Keep: " + preserve.join("; ")] : []),
   ...(questions.length ? ["Please clarify: " + questions.join(" ")] : [])
  ].join("\n")
 };
}
