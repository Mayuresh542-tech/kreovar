import { CaptionSegment, TTSWordTimestamp } from "./presets";

/**
 * Parses timestamp string (00:00:01,234 or 00:00:01.234) into seconds.
 */
export function parseTimestampToSeconds(timeStr: string): number {
  if (!timeStr) return 0;
  const clean = timeStr.trim().replace(",", ".");
  const parts = clean.split(":");

  if (parts.length === 3) {
    const hours = parseFloat(parts[0]) || 0;
    const minutes = parseFloat(parts[1]) || 0;
    const seconds = parseFloat(parts[2]) || 0;
    return hours * 3600 + minutes * 60 + seconds;
  } else if (parts.length === 2) {
    const minutes = parseFloat(parts[0]) || 0;
    const seconds = parseFloat(parts[1]) || 0;
    return minutes * 60 + seconds;
  }
  return parseFloat(clean) || 0;
}

/**
 * Formats seconds into SRT timestamp format: HH:MM:SS,mmm
 */
export function formatSecondsToSRT(seconds: number): string {
  const s = Math.max(0, seconds);
  const hours = Math.floor(s / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  const secs = Math.floor(s % 60);
  const ms = Math.floor((s % 1) * 1000);

  const hh = String(hours).padStart(2, "0");
  const mm = String(minutes).padStart(2, "0");
  const ss = String(secs).padStart(2, "0");
  const mmm = String(ms).padStart(3, "0");

  return `${hh}:${mm}:${ss},${mmm}`;
}

/**
 * Formats seconds into WebVTT timestamp format: HH:MM:SS.mmm
 */
export function formatSecondsToVTT(seconds: number): string {
  return formatSecondsToSRT(seconds).replace(",", ".");
}

/**
 * Formats seconds into ASS timestamp format: H:MM:SS.cs (centiseconds)
 */
export function formatSecondsToASS(seconds: number): string {
  const s = Math.max(0, seconds);
  const hours = Math.floor(s / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  const secs = Math.floor(s % 60);
  const cs = Math.floor((s % 1) * 100);

  const mm = String(minutes).padStart(2, "0");
  const ss = String(secs).padStart(2, "0");
  const ccs = String(cs).padStart(2, "0");

  return `${hours}:${mm}:${ss}.${ccs}`;
}

/**
 * Parses raw SRT subtitle file content into timed CaptionSegment array.
 */
export function parseSRT(content: string): CaptionSegment[] {
  if (!content || !content.trim()) return [];

  const normalized = content.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const blocks = normalized.trim().split(/\n\s*\n/);
  const segments: CaptionSegment[] = [];

  for (let i = 0; i < blocks.length; i++) {
    const lines = blocks[i].trim().split("\n");
    if (lines.length < 2) continue;

    // Line 0 is usually index (e.g. "1"), Line 1 is timestamps, or Line 0 is timestamps
    let timeLine = lines[0];
    let textLines = lines.slice(1);

    if (/-->/.test(lines[1])) {
      timeLine = lines[1];
      textLines = lines.slice(2);
    }

    if (!timeLine.includes("-->")) continue;

    const [startRaw, endRaw] = timeLine.split("-->").map((s) => s.trim());
    const start = parseTimestampToSeconds(startRaw);
    const end = parseTimestampToSeconds(endRaw);

    // Clean formatting tags (e.g. <b>, <i>, <font color="...">)
    const text = textLines
      .join(" ")
      .replace(/<[^>]+>/g, "")
      .replace(/\s+/g, " ")
      .trim();

    if (!text) continue;

    // Create approximate word-level timestamps within segment
    const wordsRaw = text.split(/\s+/).filter(Boolean);
    const totalDur = Math.max(0.2, end - start);
    const perWord = totalDur / Math.max(1, wordsRaw.length);

    const words: TTSWordTimestamp[] = wordsRaw.map((w, idx) => ({
      word: w,
      start: Math.round((start + idx * perWord) * 100) / 100,
      end: Math.round((start + (idx + 1) * perWord) * 100) / 100,
    }));

    segments.push({
      id: `srt_${i + 1}_${Math.random().toString(36).slice(2, 6)}`,
      text,
      start: Math.round(start * 100) / 100,
      end: Math.round(end * 100) / 100,
      words,
    });
  }

  return segments;
}

/**
 * Parses WebVTT subtitle file content.
 */
export function parseVTT(content: string): CaptionSegment[] {
  if (!content) return [];
  // Strip WEBVTT header and metadata
  const withoutHeader = content.replace(/^WEBVTT[^\n]*\n+/i, "");
  return parseSRT(withoutHeader);
}

/**
 * Parses ASS/SSA subtitle file content.
 */
export function parseASS(content: string): CaptionSegment[] {
  if (!content) return [];
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  const segments: CaptionSegment[] = [];

  for (const line of lines) {
    if (line.startsWith("Dialogue:")) {
      const parts = line.replace(/^Dialogue:\s*/, "").split(",");
      if (parts.length >= 10) {
        const start = parseTimestampToSeconds(parts[1]);
        const end = parseTimestampToSeconds(parts[2]);
        const rawText = parts.slice(9).join(",");
        // Strip ASS override tags like {\c&H...} or \N
        const text = rawText
          .replace(/\{[^}]+\}/g, "")
          .replace(/\\N/g, " ")
          .trim();

        if (text) {
          const wordsRaw = text.split(/\s+/).filter(Boolean);
          const dur = Math.max(0.2, end - start);
          const perWord = dur / Math.max(1, wordsRaw.length);
          const words = wordsRaw.map((w, i) => ({
            word: w,
            start: Math.round((start + i * perWord) * 100) / 100,
            end: Math.round((start + (i + 1) * perWord) * 100) / 100,
          }));

          segments.push({
            id: `ass_${segments.length + 1}_${Math.random().toString(36).slice(2, 6)}`,
            text,
            start: Math.round(start * 100) / 100,
            end: Math.round(end * 100) / 100,
            words,
          });
        }
      }
    }
  }

  return segments;
}

export interface ExportableCaption {
  text: string;
  startTime: number;
  endTime: number;
}

/**
 * Exports captions to standard SRT string format.
 */
export function exportToSRT(captions: ExportableCaption[]): string {
  let output = "";
  captions.forEach((cap, idx) => {
    output += `${idx + 1}\n`;
    output += `${formatSecondsToSRT(cap.startTime)} --> ${formatSecondsToSRT(cap.endTime)}\n`;
    output += `${cap.text.trim()}\n\n`;
  });
  return output.trim();
}

/**
 * Exports captions to WebVTT string format.
 */
export function exportToVTT(captions: ExportableCaption[]): string {
  let output = "WEBVTT\n\n";
  captions.forEach((cap, idx) => {
    output += `${idx + 1}\n`;
    output += `${formatSecondsToVTT(cap.startTime)} --> ${formatSecondsToVTT(cap.endTime)}\n`;
    output += `${cap.text.trim()}\n\n`;
  });
  return output.trim();
}

/**
 * Exports captions to ASS string format.
 */
export function exportToASS(
  captions: ExportableCaption[],
  width = 1080,
  height = 1920,
  fontFamily = "Arial"
): string {
  let output = `[Script Info]
ScriptType: v4.00+
PlayResX: ${width}
PlayResY: ${height}
WrapStyle: 0
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,${fontFamily},48,&H00FFFFFF,&H0015CCFA,&H00000000,&H80000000,-1,0,0,0,100,100,1,0,1,3,2,2,40,40,240,1

[Events]
Format: Marked, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

  captions.forEach((cap) => {
    const s = formatSecondsToASS(cap.startTime);
    const e = formatSecondsToASS(cap.endTime);
    output += `Dialogue: 0,${s},${e},Default,,0,0,0,,${cap.text.trim().toUpperCase()}\n`;
  });

  return output;
}
