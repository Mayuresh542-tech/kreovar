import type { EditDecision } from "./ai";
import type { AiToolRequest } from "./aiTools";
import {
  extractEditingConstraints,
  type EditingConstraints,
} from "./editingIntent";
import {
  type CaptionPresetId,
  type EditorProject,
  formatTime,
  projectDuration,
} from "./model";
import type { EditingJob, EditStage } from "./sequentialEdit";

export const STARTER_PROMPTS = [
  "🔥 Hormozi Viral Style",
  "🎙️ Clean Podcast Cut",
  "⚡ Auto Zooms + B-Roll",
  "🎬 Cinematic Subtitles",
] as const;

export type IntentOperation =
  | "captions"
  | "zooms"
  | "cuts"
  | "broll"
  | "sfx"
  | "transitions"
  | "graphics"
  | "audio"
  | "framing";

export interface ConversationalIntent {
  instruction: string;
  constraints: EditingConstraints;
  captionPreset?: CaptionPresetId;
  operations: IntentOperation[];
  sfxCues: string[];
}

export type ProgressiveStepStatus =
  | "pending"
  | "active"
  | "completed"
  | "skipped"
  | "failed";

export interface ProgressiveStep {
  id: string;
  label: string;
  status: ProgressiveStepStatus;
}

export interface TimelineChangeItem {
  id: string;
  label: string;
  detail?: string;
  time?: number;
  clipId?: string;
}

const CAPTION_PRESET_LABELS: Partial<Record<CaptionPresetId, string>> = {
  "study-hormozi-style": "Hormozi Pop",
  "hormozi-punch": "Hormozi Punch",
  "study-ali-abdaal": "Ali Abdaal Spotlight",
  "study-mr-beast-style-2": "MrBeast Energy",
  "study-thora-cinematic": "Cinematic Subtitles",
  "study-clean-motion": "Clean Motion",
  "kinetic-impact": "Kinetic Impact",
  "viral-hinglish-pop": "Viral Hinglish",
  "signature-poppins": "Signature Poppins",
  "study-deep-glow": "Deep Glow",
  "study-liquid-glass": "Liquid Glass",
  "study-scribble": "Scribble",
  "edit-blueprint": "Blueprint",
  "edit-paper": "Paper Cut",
  "edit-impact": "Impact",
  "quiet-luxury": "Quiet Luxury",
  "vox-tape": "Vox Explainer",
};

export function formatCaptionPresetName(id?: string): string {
  if (!id) return "Synced Captions";
  return (
    CAPTION_PRESET_LABELS[id as CaptionPresetId] ||
    id
      .replace(/^study-/, "")
      .replace(/^edit-/, "")
      .replace(/-/g, " ")
      .replace(/\b\w/g, (ch) => ch.toUpperCase())
  );
}

/**
 * Extracts structured editing intent from natural language (English, Hindi, Hinglish)
 * without forcing manual checkboxes or preset switches.
 */
export function extractConversationalIntent(
  instruction: string
): ConversationalIntent {
  const clean = instruction.trim();
  const lower = clean.toLowerCase();
  const constraints = extractEditingConstraints(clean);
  const ops = new Set<IntentOperation>();

  // Preset-style shorthand phrases map to natural multi-operation intent
  const isHormoziStyle = /\bhormozi\b|\bviral\s+style\b/i.test(lower);
  const isPodcastStyle = /\bpodcast\b|\babdaal\b/i.test(lower);
  const isCinematicStyle = /\bcinematic\b|\bdocumentary\b|\bfilm\b/i.test(lower);
  const isMrBeastStyle = /\bmr\s*beast\b/i.test(lower);

  if (
    constraints.requestedCaptionPreset ||
    constraints.requestedCaptionStyling ||
    /\b(?:captions?|subtitles?|subtitle|kinetic|transcribe|text\s+overlay)\b/i.test(lower) ||
    isHormoziStyle ||
    isPodcastStyle ||
    isCinematicStyle ||
    isMrBeastStyle
  ) {
    ops.add("captions");
  }

  if (
    !constraints.disallowedZooms &&
    !constraints.removeZooms &&
    (/\b(?:zooms?|punch[-\s]?in|punchlines?|camera\s+cut|dynamic|emphasis)\b/i.test(lower) ||
      isHormoziStyle ||
      isPodcastStyle ||
      isMrBeastStyle)
  ) {
    ops.add("zooms");
  }

  if (
    !constraints.disallowedCuts &&
    (constraints.requestedSilenceCut ||
      /\b(?:cut|trim|split|remove\s+pauses?|silent\s+pauses?|pacing|jump\s*cut|podcast\s+cut)\b/i.test(
        lower
      ))
  ) {
    ops.add("cuts");
  }

  if (
    !constraints.disallowedBroll &&
    !constraints.removeBroll &&
    (/\b(?:b[ -]?roll|broll|stock\s+footage|cutaway|overlay\s+clips?|visuals?)\b/i.test(lower) ||
      isMrBeastStyle)
  ) {
    ops.add("broll");
  }

  const sfxCues: string[] = [];
  if (/\bwhoosh(?:es)?\b/i.test(lower)) sfxCues.push("whoosh");
  if (/\bpops?\b/i.test(lower)) sfxCues.push("pop");
  if (/\brisers?\b/i.test(lower)) sfxCues.push("riser");
  if (/\bding|chime|boom|impact|glitch\b/i.test(lower)) sfxCues.push("impact");

  if (
    !constraints.disallowedSfx &&
    !constraints.disallowedAudio &&
    !constraints.removeSfx &&
    (/\b(?:sfx|sound\s*fx|sound\s*effects?)\b/i.test(lower) ||
      sfxCues.length > 0 ||
      isHormoziStyle)
  ) {
    ops.add("sfx");
  }

  if (/\b(?:transitions?|crossfade|dissolve|fade|slide)\b/i.test(lower) || isCinematicStyle) {
    ops.add("transitions");
  }

  if (/\b(?:graphics?|callout|lower[-\s]?third|badge|stat|shape)\b/i.test(lower)) {
    ops.add("graphics");
  }

  if (
    !constraints.disallowedAudio &&
    (constraints.requestedAudioDucking !== undefined ||
      /\b(?:duck|ducking|audio\s+balance|volume|louder|quieter|music|voiceover)\b/i.test(lower) ||
      isPodcastStyle)
  ) {
    ops.add("audio");
  }

  if (constraints.requestedAspectRatio || /\b(?:aspect\s+ratio|crop|reframe)\b/i.test(lower)) {
    ops.add("framing");
  }

  return {
    instruction: clean,
    constraints,
    captionPreset: constraints.requestedCaptionPreset,
    operations: Array.from(ops),
    sfxCues,
  };
}

/**
 * Builds crisp progressive checklist steps displayed inside each AI response bubble.
 */
export function buildProgressiveSteps(
  instruction: string,
  job: EditingJob | undefined,
  isExecuting: boolean,
  hasExistingCaptions = false
): ProgressiveStep[] {
  const intent = extractConversationalIntent(instruction);
  const ops = new Set<IntentOperation>(intent.operations);

  // Merge real decisions / tool requests produced by the backend job
  const decisions: EditDecision[] = [];
  const requests: AiToolRequest[] = [];
  let hasQuestions = false;

  if (job?.stages) {
    for (const s of job.stages) {
      if (s.output?.decisions?.length) decisions.push(...s.output.decisions);
      if (s.output?.requests?.length) requests.push(...s.output.requests);
      if (s.output?.questions?.length) hasQuestions = true;
    }
  }

  for (const d of decisions) {
    if (["addCaption", "applyCaptionTemplate", "composeCaption"].includes(d.op)) {
      ops.add("captions");
    } else if (d.op === "addZoom" || d.op === "clearZooms") {
      ops.add("zooms");
    } else if (["rippleCut", "trimClip", "splitClip"].includes(d.op)) {
      ops.add("cuts");
    } else if (d.op === "addTransition") {
      ops.add("transitions");
    } else if (["addGraphic", "addShape", "addOverlay"].includes(d.op)) {
      ops.add("graphics");
    } else if (d.op === "setAudioDucking") {
      ops.add("audio");
    } else if (d.op === "setAspectRatio") {
      ops.add("framing");
    }
  }

  for (const r of requests) {
    if (r.type === "captions") ops.add("captions");
    else if (r.type === "broll" || r.type === "motion") ops.add("broll");
    else if (r.type === "sfx") ops.add("sfx");
    else if (r.type === "voiceover") ops.add("audio");
  }

  const analyzeStage = job?.stages?.find((s) => s.id === "analyzeFootage");
  const editStages = (job?.stages || []).filter(
    (s) => s.id !== "analyzeFootage" && s.id !== "validateEdit"
  );
  const validateStage = job?.stages?.find((s) => s.id === "validateEdit");

  const analyzeDone =
    analyzeStage?.status === "completed" ||
    editStages.some((s) => s.status !== "pending") ||
    job?.status === "completed";

  const jobFailed = job?.status === "failed" || job?.status === "cancelled";
  const jobCompleted = job?.status === "completed" && !hasQuestions;

  const isPreparingMedia = editStages.some(
    (s) =>
      s.status === "executing" &&
      (s.output?.requests?.length || (s.output?.prepared?.length ?? 0) > 0)
  );
  const isValidating =
    validateStage?.status === "planning" ||
    validateStage?.status === "executing" ||
    validateStage?.status === "validating" ||
    validateStage?.status === "committing" ||
    editStages.some((s) => s.status === "validating" || s.status === "committing");

  const middleSpecs: { id: string; label: string }[] = [];

  if (ops.has("cuts")) {
    middleSpecs.push({
      id: "cuts",
      label: intent.constraints.requestedSilenceCut
        ? "Trimming silent pauses"
        : "Tightening timeline cuts",
    });
  }

  if (ops.has("captions")) {
    const captionAction =
      hasExistingCaptions && !requests.some((r) => r.type === "captions")
        ? "Styling synced captions"
        : "Generating synced captions";
    middleSpecs.push({ id: "captions", label: captionAction });
  }

  if (ops.has("zooms") && ops.has("sfx")) {
    middleSpecs.push({
      id: "zooms-sfx",
      label: "Adding punch zooms & sound FX",
    });
  } else {
    if (ops.has("zooms")) {
      middleSpecs.push({ id: "zooms", label: "Adding punch zooms" });
    }
    if (ops.has("sfx")) {
      middleSpecs.push({ id: "sfx", label: "Adding subtle sound FX" });
    }
  }

  if (ops.has("broll")) {
    middleSpecs.push({ id: "broll", label: "Adding contextual B-roll" });
  }

  if (ops.has("transitions") || ops.has("graphics")) {
    middleSpecs.push({
      id: "transitions-graphics",
      label:
        ops.has("graphics") && ops.has("transitions")
          ? "Adding transitions & graphics"
          : ops.has("graphics")
          ? "Adding motion graphics"
          : "Adding smooth transitions",
    });
  }

  if (ops.has("audio") || ops.has("framing")) {
    middleSpecs.push({
      id: "audio-framing",
      label:
        ops.has("framing") && !ops.has("audio")
          ? "Updating canvas framing"
          : "Balancing audio & pacing",
    });
  }

  if (middleSpecs.length === 0 && !hasQuestions) {
    middleSpecs.push({ id: "edits", label: "Applying requested timeline edits" });
  }

  const skippedText = (job?.skippedNotes || []).join(" ").toLowerCase();
  const isSpecSkipped = (id: string): boolean => {
    if (!jobCompleted) return false;
    if (id === "broll" && skippedText.includes("b-roll")) return true;
    if ((id === "sfx" || id === "zooms-sfx") && skippedText.includes("sfx") && !decisions.some((d) => d.op === "addZoom"))
      return true;
    return false;
  };

  const steps: ProgressiveStep[] = [
    {
      id: "analyze",
      label: "Analyzing speech & transcript",
      status: analyzeDone
        ? "completed"
        : jobFailed
        ? "failed"
        : isExecuting || job?.status === "running"
        ? "active"
        : "pending",
    },
  ];

  if (hasQuestions && job?.status === "completed") {
    return [
      steps[0],
      {
        id: "clarify",
        label: "Checking details with you",
        status: "completed",
      },
    ];
  }

  middleSpecs.forEach((spec, idx) => {
    let status: ProgressiveStepStatus = "pending";
    if (jobCompleted) {
      status = isSpecSkipped(spec.id) ? "skipped" : "completed";
    } else if (jobFailed) {
      status = analyzeDone && idx === 0 ? "failed" : "pending";
    } else if (isValidating) {
      status = "completed";
    } else if (analyzeDone) {
      if (isPreparingMedia) {
        status = idx === 0 ? "completed" : idx === 1 ? "active" : "pending";
      } else {
        status = idx === 0 ? "active" : "pending";
      }
    }
    steps.push({ id: spec.id, label: spec.label, status });
  });

  steps.push({
    id: "done",
    label: jobFailed ? "Edit paused" : "Timeline updated!",
    status: jobCompleted
      ? "completed"
      : jobFailed
      ? "failed"
      : isValidating
      ? "active"
      : "pending",
  });

  return steps;
}

export function collectDegradationNotes(job?: EditingJob): string[] {
  if (!job) return [];
  const list: string[] = [];
  if (job.skippedNotes?.length) {
    list.push(...job.skippedNotes);
  } else if (job.degradationNotices?.length) {
    for (const notice of job.degradationNotices) {
      const prefix =
        notice.stage === "applyBroll" || notice.stage === "findBroll"
          ? "B-Roll"
          : notice.stage === "applySoundEffects"
          ? "Sound FX"
          : notice.stage === "applyZooms"
          ? "Zooms"
          : "Adjustment";
      list.push(`${prefix}: ${notice.reason}`);
    }
  }
  return list;
}

/**
 * Diffs before/after EditorProject snapshots into concise, seekable timeline changes
 * shown when clicking "View Changes" inside an AI response bubble.
 */
export function summarizeTimelineDiff(
  before: EditorProject | undefined,
  after: EditorProject,
  job?: EditingJob
): TimelineChangeItem[] {
  if (!before) return [];
  const items: TimelineChangeItem[] = [];
  const fps = after.settings.fps || 30;

  // 1. Aspect ratio or audio ducking
  if (before.settings.aspectRatio !== after.settings.aspectRatio) {
    items.push({
      id: "aspect-ratio",
      label: `Canvas aspect ratio set to ${after.settings.aspectRatio}`,
    });
  }
  if (before.settings.audioDucking !== after.settings.audioDucking) {
    items.push({
      id: "audio-ducking",
      label: after.settings.audioDucking
        ? "Enabled automatic audio ducking under speech"
        : "Disabled audio ducking",
    });
  }

  // 2. Captions added or restyled
  const afterCaptionClips = Object.values(after.clips).filter(
    (c) => c.contentId && after.captions[c.contentId]
  );
  const newCaptions = afterCaptionClips.filter((c) => !before.clips[c.id]);
  const restyledCaptions = afterCaptionClips.filter((c) => {
    const prev = before.clips[c.id];
    if (!prev?.contentId || !c.contentId) return false;
    return (
      JSON.stringify(before.captions[prev.contentId]) !==
      JSON.stringify(after.captions[c.contentId])
    );
  });

  if (newCaptions.length > 0) {
    const first = [...newCaptions].sort((a, b) => a.startTime - b.startTime)[0];
    const tpl = first.contentId ? after.captions[first.contentId]?.templateId : undefined;
    items.push({
      id: "captions-added",
      label: `Added ${newCaptions.length} synced caption${newCaptions.length === 1 ? "" : "s"}`,
      detail: tpl ? `${formatCaptionPresetName(tpl)} preset` : undefined,
      time: first.startTime,
      clipId: first.id,
    });
  } else if (restyledCaptions.length > 0) {
    const first = [...restyledCaptions].sort((a, b) => a.startTime - b.startTime)[0];
    const tpl = first.contentId ? after.captions[first.contentId]?.templateId : undefined;
    items.push({
      id: "captions-styled",
      label: `Updated ${restyledCaptions.length} caption${restyledCaptions.length === 1 ? "" : "s"}`,
      detail: tpl ? `${formatCaptionPresetName(tpl)} style` : "In-place typography update",
      time: first.startTime,
      clipId: first.id,
    });
  }

  // 3. Punch zooms added or cleared
  let addedZooms = 0;
  let firstZoomTime: number | undefined;
  let firstZoomClipId: string | undefined;
  let clearedZooms = 0;

  for (const clip of Object.values(after.clips)) {
    const prevClip = before.clips[clip.id];
    const prevCount = prevClip?.zooms?.length || 0;
    const nextCount = clip.zooms?.length || 0;
    if (nextCount > prevCount) {
      addedZooms += nextCount - prevCount;
      if (firstZoomTime === undefined && clip.zooms?.length) {
        const lastNew = clip.zooms[prevCount] || clip.zooms[0];
        const zoomOffset =
          lastNew && clip.speed > 0
            ? Math.max(0, (lastNew.sourceStart - clip.sourceStart) / clip.speed)
            : 0;
        firstZoomTime = clip.startTime + zoomOffset;
        firstZoomClipId = clip.id;
      }
    } else if (prevCount > 0 && nextCount === 0) {
      clearedZooms += prevCount;
    }
  }

  if (addedZooms > 0) {
    items.push({
      id: "zooms-added",
      label: `Added ${addedZooms} punch zoom${addedZooms === 1 ? "" : "s"}`,
      detail:
        firstZoomTime !== undefined ? `Starts at ${formatTime(firstZoomTime, fps)}` : undefined,
      time: firstZoomTime,
      clipId: firstZoomClipId,
    });
  } else if (clearedZooms > 0) {
    items.push({
      id: "zooms-cleared",
      label: `Cleared ${clearedZooms} existing zoom${clearedZooms === 1 ? "" : "s"}`,
    });
  }

  // 4. Duration / ripple cut pacing changes
  const beforeDur = projectDuration(before);
  const afterDur = projectDuration(after);
  if (beforeDur - afterDur > 0.2) {
    items.push({
      id: "pacing-cut",
      label: `Tightened timeline by ${(beforeDur - afterDur).toFixed(1)}s`,
      detail: "Silent pauses trimmed cleanly across tracks",
    });
  }

  // 5. Added overlays / B-roll, SFX, and motion graphics
  const newNonCaptionClips = Object.values(after.clips).filter(
    (c) => !before.clips[c.id] && !(c.contentId && after.captions[c.contentId])
  );

  const brollClips = newNonCaptionClips.filter((c) => {
    const kind = after.tracks[c.trackId]?.kind;
    return (kind === "overlay" || kind === "image") && !c.graphic && !c.shape;
  });
  if (brollClips.length > 0) {
    const first = [...brollClips].sort((a, b) => a.startTime - b.startTime)[0];
    items.push({
      id: "broll-added",
      label: `Inserted ${brollClips.length} B-roll overlay${brollClips.length === 1 ? "" : "s"}`,
      detail: `${first.name} @ ${formatTime(first.startTime, fps)}`,
      time: first.startTime,
      clipId: first.id,
    });
  }

  const sfxClips = newNonCaptionClips.filter(
    (c) => after.tracks[c.trackId]?.kind === "audio" && c.audioRole === "sfx"
  );
  if (sfxClips.length > 0) {
    const first = [...sfxClips].sort((a, b) => a.startTime - b.startTime)[0];
    items.push({
      id: "sfx-added",
      label: `Placed ${sfxClips.length} sound effect${sfxClips.length === 1 ? "" : "s"}`,
      detail: `${first.name} @ ${formatTime(first.startTime, fps)}`,
      time: first.startTime,
      clipId: first.id,
    });
  }

  const graphicClips = newNonCaptionClips.filter((c) => !!(c.graphic || c.shape));
  if (graphicClips.length > 0) {
    const first = [...graphicClips].sort((a, b) => a.startTime - b.startTime)[0];
    items.push({
      id: "graphics-added",
      label: `Added ${graphicClips.length} motion graphic${graphicClips.length === 1 ? "" : "s"}`,
      detail: `At ${formatTime(first.startTime, fps)}`,
      time: first.startTime,
      clipId: first.id,
    });
  }

  // 6. Transitions added
  const newTransitions = Object.values(after.transitions).filter(
    (t) => !before.transitions[t.id]
  );
  if (newTransitions.length > 0) {
    items.push({
      id: "transitions-added",
      label: `Added ${newTransitions.length} transition${newTransitions.length === 1 ? "" : "s"}`,
      detail: newTransitions[0].kind,
    });
  }

  // Fallback if minor property edit wasn't enumerated above
  if (items.length === 0 && after.revision !== before.revision) {
    const fallbackSummary =
      job?.stages
        .map((s) => s.output?.summary)
        .filter(Boolean)
        .at(-1) || "Updated timeline properties";
    items.push({
      id: "timeline-updated",
      label: fallbackSummary,
    });
  }

  return items;
}
