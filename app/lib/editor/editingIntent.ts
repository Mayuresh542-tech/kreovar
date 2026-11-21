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

export interface SpeedDirective { multiplier: number; preservePitch?: boolean }
export interface VolumeDirective { level?: number; fadeIn?: number; fadeOut?: number; mute?: boolean }
export interface TransformDirective { x?: number; y?: number; scale?: number; rotation?: number; reset?: boolean }
export interface TrimDirective { edge: 'left' | 'right'; seconds: number }
export interface SplitDirective { time: number }

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
 requestedCaptionStudio?: boolean;
 requestedSilenceCut?: boolean;
 requestedCaptionStyling?: CaptionStylingDirective;
 requestedAudioDucking?: boolean;
 requestedAspectRatio?: '16:9' | '9:16' | '1:1';
 requestedKenBurns?: boolean | 'push' | 'pull' | 'pan-left' | 'pan-right';
 requestedKineticStickers?: boolean;
 requestedSpeed?: SpeedDirective;
 requestedVolume?: VolumeDirective;
 requestedTransform?: TransformDirective;
 requestedTrim?: TrimDirective;
 requestedSplit?: SplitDirective;
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
 if (/\b(?:caption\s+studio|better\s+styles?|studio\s+templates?|cool\s+captions?|stylish\s+subtitles?)\b/i.test(lower)) return 'study-hormozi-style';

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
 const requestedSilenceCut = /\b(?:(?:cut|remove|trim|delete|clear|drop)\s+(?:the\s+)?(?:all\s+)?(?:silent\s+|awkward\s+|dead\s+|long\s+|inter-word\s+|empty\s+)?(?:silences?|pauses?|hesitations?|gaps?|dead\s*(?:air|space)|quiet\s+parts?)|tighten\s+(?:the\s+)?pacing|silence\s+cut\b|podcast\s+cut\b|beech\s+ke\s+pauses?\s+hata\s*(?:do|dena)?|silence\s+cut\s+kar\s*(?:do|dena)?|jahan\s+main\s+chup\s+(?:hoon|tha|hu)\s+woh\s+part\s+trim\s*(?:karo|do)?|dead\s*(?:space|air)\s+remove\s*(?:karo|do)?|pauses?\s*(?:ko)?\s*(?:hata|cut|trim)\s*(?:do|karo|dena)?|chup\s+(?:rehne\s+wale\s+)?parts?\s*(?:ko)?\s*(?:hata\s*(?:do|karo|dena)?|trim\s*karo)|khali\s+(?:jagah|parts?)\s+hata\s*(?:do|karo)?)/i.test(text);

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
 if (/\b(?:(?:enable|turn\s+on|add|apply)?\s*(?:audio\s+)?ducking|duck\s+(?:the\s+)?(?:music|audio|background(?:\s+music)?)(?:\s+under\s+speech)?|ducking\s+on)\b/i.test(text)) {
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

 let requestedKenBurns: boolean | 'push' | 'pull' | 'pan-left' | 'pan-right' | undefined;
 if (/\b(?:(?:add|apply|put|insert|with)\s+)?ken\s*burns\b/i.test(text) || /\b(?:dynamic|pan\s+and\s+zoom)\s+(?:motion|animation)\b/i.test(text)) {
  if (/\bpush\b/i.test(text)) requestedKenBurns = 'push';
  else if (/\bpull\b/i.test(text)) requestedKenBurns = 'pull';
  else if (/\bpan\s+left\b/i.test(text)) requestedKenBurns = 'pan-left';
  else if (/\bpan\s+right\b/i.test(text)) requestedKenBurns = 'pan-right';
  else requestedKenBurns = true;
 }

 const requestedKineticStickers =
  /\b(?:(?:add|insert|generate|create|put)\s+)?(?:kinetic|animated|keyword)\s*(?:stickers?|emojis?|callouts?)\b/i.test(text) ||
  /\b(?:add|insert|put)\s+stickers?\s+(?:for|to|on)\s+keywords?\b/i.test(text) ||
  /\bkeyword\s+stickers?\b/i.test(text);

 const requestedFloatingSummaryText = /\b(?:add|create|write|put|insert|display)\s+(?:a\s+)?(?:catchy|summary|floating|custom|random|intro|explaining)?\s*(?:text|title|heading|quote)\s+(?:in\s+(?:the\s+)?(?:middle|center)|explaining|about)/i.test(text);
 const requestedCaptionStudio = /\b(?:caption\s+studio|better\s+styles?|studio\s+templates?|stylish\s+captions?|stylish\s+subtitles?)\b/i.test(text) ||
  /\b(?:ad|add|insert|generate|create|put)\s*(?:animated\s+|timed\s+|speech\s+)?(?:captions?|subtitles?)\b/i.test(text) ||
  /^(?:captions?|subtitles?)$/i.test(text.trim());
 const requestedCaptionPreset = matchCaptionPreset(instruction) || (requestedCaptionStudio ? 'study-hormozi-style' : undefined);

 // Speed directive extraction (0.1x to 10x with pitch preservation)
 let requestedSpeed: SpeedDirective | undefined;
 const speedMatch = text.match(/(?:(?:speed\s*(?:up|increase)?|faster|fast\s*forward|tez\s*karo)\s*(?:by\s*|to\s*)?(\d+(?:\.\d+)?)\s*x?|(\d+(?:\.\d+)?)\s*x?\s*(?:faster|speed|tez\s*karo))/i);
 const slowMatch = text.match(/(?:(?:slow\s*(?:down|motion)?|dheere\s*karo)\s*(?:by\s*|to\s*)?(\d+(?:\.\d+)?)\s*x?|(\d+(?:\.\d+)?)\s*x?\s*(?:slower|slow\s*motion|dheere))/i);
 if (speedMatch) {
  const mult = parseFloat(speedMatch[1] || speedMatch[2]);
  if (!isNaN(mult) && mult >= 0.1 && mult <= 10) requestedSpeed = { multiplier: mult, preservePitch: !/\bno\s+pitch|chipmunk\b/i.test(text) };
 } else if (slowMatch) {
  const mult = parseFloat(slowMatch[1] || slowMatch[2]);
  if (!isNaN(mult) && mult >= 0.1 && mult <= 10) requestedSpeed = { multiplier: mult, preservePitch: true };
  else requestedSpeed = { multiplier: 0.5, preservePitch: true };
 } else if (/\bslow\s*motion\b/i.test(text)) {
  requestedSpeed = { multiplier: 0.5, preservePitch: true };
 }

 // Volume & audio level directive extraction (0 to 200%)
 let requestedVolume: VolumeDirective | undefined;
 const volPctMatch = text.match(/(?:volume|sound|awaz)\s*(?:set\s*to\s*|to\s*)?(\d+)\s*%/i);
 const fadeInMatch = text.match(/fade\s*in\s*(?:by\s*|for\s*)?(\d+(?:\.\d+)?)\s*(?:s|sec|seconds?)?/i);
 const fadeOutMatch = text.match(/fade\s*out\s*(?:by\s*|for\s*)?(\d+(?:\.\d+)?)\s*(?:s|sec|seconds?)?/i);
 const isMute = /\b(?:mute\s+(?:music|audio|track|background)|turn\s+off\s+sound|awaz\s+band)\b/i.test(text);
 const isLouder = /\b(?:make\s+it\s+louder|increase\s+volume|louder|awaz\s+badhao)\b/i.test(text);
 const isQuieter = /\b(?:make\s+it\s+quieter|turn\s+down\s+volume|softer|awaz\s+kam\s+karo)\b/i.test(text);
 if (volPctMatch || isMute || isLouder || isQuieter || fadeInMatch || fadeOutMatch) {
  const level = isMute ? 0 : volPctMatch ? Math.min(2, Math.max(0, parseInt(volPctMatch[1], 10) / 100)) : isLouder ? 1.5 : isQuieter ? 0.5 : undefined;
  const fadeIn = fadeInMatch ? Math.min(10, Math.max(0, parseFloat(fadeInMatch[1]))) : undefined;
  const fadeOut = fadeOutMatch ? Math.min(10, Math.max(0, parseFloat(fadeOutMatch[1]))) : undefined;
  requestedVolume = { ...(level !== undefined ? { level } : {}), ...(fadeIn !== undefined ? { fadeIn } : {}), ...(fadeOut !== undefined ? { fadeOut } : {}), ...(isMute ? { mute: true } : {}) };
 }

 // Transform, scale & positioning directive extraction
 let requestedTransform: TransformDirective | undefined;
 const isResetTransform = /\b(?:reset\s+(?:transform|position|scale)|default\s+(?:position|framing))\b/i.test(text);
 const scaleMatch = text.match(/(?:scale\s*(?:up)?|enlarge)\s*(?:to\s*)?(\d+)\s*%/i);
 const rotateMatch = text.match(/rotate\s*(?:by\s*)?(-?\d+)\s*(?:deg|degrees?)/i);
 if (isResetTransform) {
  requestedTransform = { reset: true, x: 0, y: 0, scale: 1, rotation: 0 };
 } else if (scaleMatch || rotateMatch || /\b(?:move|position)\s+(?:to\s+)?(?:top|bottom|center|left|right)\b/i.test(text)) {
  const scale = scaleMatch ? Math.min(5, Math.max(0.1, parseInt(scaleMatch[1], 10) / 100)) : undefined;
  const rotation = rotateMatch ? parseInt(rotateMatch[1], 10) : undefined;
  let x: number | undefined, y: number | undefined;
  if (/\btop\s*right\b/i.test(text)) { x = 0.35; y = -0.32; }
  else if (/\btop\s*left\b/i.test(text)) { x = -0.35; y = -0.32; }
  else if (/\bbottom\s*right\b/i.test(text)) { x = 0.35; y = 0.32; }
  else if (/\bbottom\s*left\b/i.test(text)) { x = -0.35; y = 0.32; }
  else if (/\bcenter\b/i.test(text)) { x = 0; y = 0; }
  requestedTransform = { ...(scale !== undefined ? { scale } : {}), ...(rotation !== undefined ? { rotation } : {}), ...(x !== undefined ? { x, y } : {}) };
 }

 // Trim & split directive extraction
 let requestedTrim: TrimDirective | undefined;
 const trimStartMatch = text.match(/(?:trim|cut\s*off)\s*(?:the\s*)?(?:first|start\s*of)\s*(\d+(?:\.\d+)?)\s*(?:s|sec|seconds?)/i);
 const trimEndMatch = text.match(/(?:trim|cut\s*off)\s*(?:the\s*)?(?:end|last)\s*(\d+(?:\.\d+)?)\s*(?:s|sec|seconds?)/i);
 if (trimStartMatch) requestedTrim = { edge: 'left', seconds: parseFloat(trimStartMatch[1]) };
 else if (trimEndMatch) requestedTrim = { edge: 'right', seconds: parseFloat(trimEndMatch[1]) };

 let requestedSplit: SplitDirective | undefined;
 const splitMatch = text.match(/(?:split|cut)\s*(?:clip\s*)?at\s*(\d+(?:\.\d+)?)\s*(?:s|sec|seconds?)/i);
 if (splitMatch) requestedSplit = { time: parseFloat(splitMatch[1]) };

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
  requestedCaptionStudio,
  requestedSilenceCut,
  requestedCaptionStyling,
  requestedAudioDucking,
  requestedAspectRatio,
  requestedKenBurns,
  requestedKineticStickers,
  requestedSpeed,
  requestedVolume,
  requestedTransform,
  requestedTrim,
  requestedSplit
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
