export interface EditingConstraints {
 disallowedAudio: boolean;
 disallowedSfx: boolean;
 disallowedCuts: boolean;
 disallowedBroll: boolean;
 disallowedZooms: boolean;
 removeZooms: boolean;
 protectedIntervals: Array<{ start: number; end: number }>;
 phraseQuotes: string[];
}

export interface ParsedEditingIntent {
 goal: string;
 preserve: string[];
 questions: string[];
 summary: string;
 constraints: EditingConstraints;
}

/** Extracts negative constraints, temporal bounds, and phrase quotes from user prompt & preserve list. */
export function extractEditingConstraints(instruction = '', preserveList: string[] = []): EditingConstraints {
 const text = (instruction + ' ' + preserveList.join(' ')).toLowerCase();

 const noAudio = /\b(?:no\s+(?:music|audio|background\s+audio)|(?:do\s+not|don'?t)\s+(?:add\s+(?:any\s+)?|make\s+(?:any\s+)?|touch\s+(?:any\s+)?|change\s+)?(?:music|audio)|without\s+(?:any\s+)?(?:music|audio)|audio\s+changes?|preserve\s+(?:the\s+)?audio|music\s+mat\b|audio\s+mat\b|bina\s+music\b|koi\s+music\s+mat\b)/i.test(text);
 const noSfx = /\b(?:no\s+sfx|no\s+sound\s+effects?|without\s+sfx|without\s+sound\s+effects?|(?:do\s+not|don'?t)\s+(?:add\s+(?:any\s+)?|use\s+(?:any\s+)?)(?:sfx|sound\s+effects?)|sfx\s+mat\b|bina\s+sfx\b)/i.test(text);
 const noCuts = /\b(?:(?:do\s+not|don'?t)\s+cut|no\s+cuts?|without\s+cutting|(?:do\s+not|don'?t)\s+trim\s+(?:any\s+)?speech|(?:do\s+not|don'?t)\s+remove\s+(?:any\s+)?speech|cut\s+mat\b|mat\s+katna\b)/i.test(text);
 const noBroll = /\b(?:no\s+b[ -]?roll|without\s+b[ -]?roll|without\s+stock|no\s+stock|(?:do\s+not|don'?t)\s+(?:add\s+(?:any\s+)?|use\s+(?:any\s+)?)(?:b[ -]?roll|stock)|broll\s+mat\b)/i.test(text);
 const noZooms = /\b(?:no\s+zooms?|without\s+zooms?|(?:do\s+not|don'?t)\s+zoom|zoom\s+mat\b)/i.test(text);
 const removeZooms = /\b(?:remove\s+(?:the\s+)?zooms?|clear\s+(?:all\s+)?zooms?|delete\s+(?:the\s+)?zooms?)\b/i.test(text);

 const protectedIntervals: Array<{ start: number; end: number }> = [];
 const firstMatch = text.match(/(?:keep\s+)?(?:the\s+)?first\s+(\d+(?:\.\d+)?)\s*(?:s|sec|seconds?)\s*(?:untouched|clean|as\s+is|without\s+edits)/i);
 if (firstMatch) {
  const sec = parseFloat(firstMatch[1]);
  if (!isNaN(sec) && sec > 0) {
   protectedIntervals.push({ start: 0, end: sec });
  }
 }

 const phraseQuotes: string[] = [];
 const quoteRegex = /(?:when\s+i\s+(?:say|mention|talk\s+about))\s+['"]([^'"]+)['"]/gi;
 let qMatch: RegExpExecArray | null;
 while ((qMatch = quoteRegex.exec(instruction)) !== null) {
  if (qMatch[1]?.trim()) phraseQuotes.push(qMatch[1].trim());
 }

 return {
  disallowedAudio: noAudio,
  disallowedSfx: noSfx || noAudio,
  disallowedCuts: noCuts,
  disallowedBroll: noBroll,
  disallowedZooms: noZooms,
  removeZooms,
  protectedIntervals,
  phraseQuotes
 };
}

/** Read model intent as untrusted data. Clarification never executes proposed edits. */
export function readEditingIntent(value: unknown, originalInstruction = ''): ParsedEditingIntent | undefined {
 if (!value || typeof value !== "object") throw new Error("Invalid edit response.");
 const intent = (value as { intent?: unknown }).intent;
 if (intent === undefined) return undefined; // Compatibility with existing provider responses.
 if (!intent || typeof intent !== "object") throw new Error("Invalid editing intent.");
 const data = intent as Record<string, unknown>;
 const text = (v: unknown, max: number) => { if (typeof v !== "string" || !v.trim() || v.length > max) throw new Error("Invalid editing intent text."); return v.trim(); };
 const list = (v: unknown) => { if (!Array.isArray(v) || v.length > 8) throw new Error("Invalid editing intent list."); return v.map(t => text(t, 160)); };
 const goal = text(data.goal, 400), preserve = list(data.preserve), questions = list(data.questions);
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
