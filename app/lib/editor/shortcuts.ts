import type { EditorProject, Clip, Track } from "./model";
import { splitClip, removeClip, moveClip, changeTrack } from "./operations";

export type ShortcutAction =
  | "toggle-play"
  | "shuttle-forward"
  | "shuttle-backward"
  | "shuttle-pause"
  | "split-clip"
  | "delete-clip"
  | "ripple-delete-clip"
  | "trim-start-to-playhead"
  | "trim-end-to-playhead"
  | "undo"
  | "redo"
  | "toggle-mute"
  | "escape"
  | "select-all"
  | "nudge-left"
  | "nudge-right"
  | "step-backward"
  | "step-forward"
  | "toggle-shortcuts-modal"
  | "toggle-snapping"
  | "fit-timeline"
  | "zoom-in"
  | "zoom-out"
  | "duplicate-clip"
  | "copy-clips"
  | "paste-clips"
  | "save";

export interface KeyboardShortcutEvent {
  key: string;
  code?: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  shiftKey?: boolean;
  altKey?: boolean;
  target?: EventTarget | null;
}

export interface ShortcutDefinition {
  id: string;
  category: "Playback & Shuttle" | "Editing & Split" | "Tracks & Audio" | "Navigation & View" | "History & Clipboard";
  label: string;
  keys: string;
  description: string;
}

export const SHORTCUT_DEFINITIONS: ShortcutDefinition[] = [
  {
    id: "toggle-play",
    category: "Playback & Shuttle",
    label: "Toggle Play / Pause",
    keys: "Space",
    description: "Start or stop timeline playback at normal 1x speed.",
  },
  {
    id: "shuttle-forward",
    category: "Playback & Shuttle",
    label: "Shuttle Forward (1x, 2x)",
    keys: "L",
    description: "Play forward at 1x; press again to accelerate to 2x fast-forward shuttle.",
  },
  {
    id: "shuttle-pause",
    category: "Playback & Shuttle",
    label: "Pause Shuttle",
    keys: "K",
    description: "Halt shuttle playback and freeze playhead at current frame.",
  },
  {
    id: "shuttle-backward",
    category: "Playback & Shuttle",
    label: "Shuttle Backward (-1x, -2x)",
    keys: "J",
    description: "Play backward at -1x; press again to accelerate to -2x reverse shuttle.",
  },
  {
    id: "step-frame",
    category: "Playback & Shuttle",
    label: "Step 1 Frame (or 10 with Shift)",
    keys: "← / →",
    description: "Jog playhead one frame backward or forward; hold Shift to jog 10 frames.",
  },
  {
    id: "split-clip",
    category: "Editing & Split",
    label: "Split Clip at Playhead",
    keys: "S",
    description: "Slice selected clip at current playhead, or topmost unmuted clip if none selected.",
  },
  {
    id: "delete-clip",
    category: "Editing & Split",
    label: "Delete Selected Clip",
    keys: "Delete / Backspace",
    description: "Remove selected clip leaving gap (lift edit).",
  },
  {
    id: "ripple-delete-clip",
    category: "Editing & Split",
    label: "Ripple Delete Selected Clip",
    keys: "Shift + Delete / Backspace",
    description: "Remove selected clip and ripple pull downstream clips to close gap cleanly.",
  },
  {
    id: "nudge-clip",
    category: "Editing & Split",
    label: "Nudge Clip 1 Frame (or 10 with Shift)",
    keys: "Alt + ← / →",
    description: "Move selected clips left or right on the timeline.",
  },
  {
    id: "duplicate-clip",
    category: "Editing & Split",
    label: "Duplicate Clip",
    keys: "Ctrl / Cmd + D",
    description: "Clone selected clip immediately downstream on the same track.",
  },
  {
    id: "trim-start-to-playhead",
    category: "Editing & Split",
    label: "Trim Start to Playhead",
    keys: "[ / Q",
    description: "Left-trim selected clip in-point to the current playhead position.",
  },
  {
    id: "trim-end-to-playhead",
    category: "Editing & Split",
    label: "Trim End to Playhead",
    keys: "] / W",
    description: "Right-trim selected clip out-point to the current playhead position.",
  },
  {
    id: "toggle-mute",
    category: "Tracks & Audio",
    label: "Toggle Track Mute",
    keys: "M",
    description: "Mute or unmute track of selected clip, or primary audio track.",
  },
  {
    id: "undo-redo",
    category: "History & Clipboard",
    label: "Undo / Redo",
    keys: "Ctrl+Z / Ctrl+Y (Cmd+Shift+Z)",
    description: "Step backward or forward through editing history snapshots.",
  },
  {
    id: "copy-paste",
    category: "History & Clipboard",
    label: "Copy / Paste Clips",
    keys: "Ctrl / Cmd + C / V",
    description: "Copy selected clips to clipboard and paste at current playhead.",
  },
  {
    id: "select-all",
    category: "History & Clipboard",
    label: "Select All Clips",
    keys: "Ctrl / Cmd + A",
    description: "Select all clips across unlocked timeline tracks.",
  },
  {
    id: "escape",
    category: "Navigation & View",
    label: "Deselect All / Close Dialogs",
    keys: "Escape",
    description: "Clear active selection, cancel drag preview, or close active modals.",
  },
  {
    id: "toggle-shortcuts-modal",
    category: "Navigation & View",
    label: "Keyboard Shortcuts Help",
    keys: "?",
    description: "Display this interactive keyboard shortcuts reference sheet.",
  },
  {
    id: "toggle-snapping",
    category: "Navigation & View",
    label: "Toggle Magnet Snapping",
    keys: "N",
    description: "Turn magnetic edge snapping on or off for clip dragging.",
  },
  {
    id: "fit-timeline",
    category: "Navigation & View",
    label: "Fit Timeline to Window",
    keys: "F",
    description: "Zoom and scroll timeline so entire project duration is visible.",
  },
  {
    id: "timeline-zoom",
    category: "Navigation & View",
    label: "Zoom Timeline In / Out",
    keys: "+ / -",
    description: "Adjust timeline horizontal scale centered on current playhead.",
  },
];

/**
 * Returns true if the event target is inside an input, textarea, select,
 * contenteditable element, dialog, or AI chat prompt.
 */
export function isTypingOrEditingTarget(target: EventTarget | null): boolean {
  if (!target || !(target instanceof HTMLElement)) return false;
  return !!target.closest(
    'input, textarea, select, [contenteditable="true"], [role="textbox"], dialog, .ai-chat-prompt, [data-editor-input="true"]'
  );
}

/**
 * Pure calculator for NLE shuttle speeds:
 * Space: toggles play/pause at 1x
 * K: pauses shuttle (0x)
 * L: forward shuttle (1x -> 2x)
 * J: reverse shuttle (-1x -> -2x)
 */
export function getShuttleNextState(
  currentSpeed: number,
  isPlaying: boolean,
  action: "forward" | "backward" | "pause"
): { playing: boolean; speed: number } {
  if (action === "pause") {
    return { playing: false, speed: 1 };
  }
  if (action === "forward") {
    if (!isPlaying || currentSpeed <= 0) {
      return { playing: true, speed: 1 };
    }
    if (currentSpeed >= 1) {
      return { playing: true, speed: 2 };
    }
    return { playing: true, speed: 1 };
  }
  if (action === "backward") {
    if (!isPlaying || currentSpeed >= 0) {
      return { playing: true, speed: -1 };
    }
    if (currentSpeed <= -1) {
      return { playing: true, speed: -2 };
    }
    return { playing: true, speed: -1 };
  }
  return { playing: isPlaying, speed: currentSpeed };
}

/**
 * Resolves a keyboard event into an abstract NLE shortcut action,
 * respecting input focus guards and modal states.
 */
export function resolveShortcutAction(
  event: KeyboardShortcutEvent,
  context: { shortcutsOpen?: boolean; exportOpen?: boolean } = {}
): ShortcutAction | null {
  const isTyping = isTypingOrEditingTarget(event.target ?? null);

  // Escape always works to dismiss modals, even when focus is in a dialog
  if (event.key === "Escape") {
    return "escape";
  }

  // Never trigger editing/playback shortcuts when typing in inputs or AI chat
  if (isTyping) {
    return null;
  }

  // If a modal dialog is open, only allow Escape
  if (context.shortcutsOpen || context.exportOpen) {
    return null;
  }

  const modifier = !!(event.ctrlKey || event.metaKey);
  const key = event.key.toLowerCase();

  // Undo / Redo
  if (modifier && key === "z") {
    return event.shiftKey ? "redo" : "undo";
  }
  if (modifier && key === "y") {
    return "redo";
  }

  // Save
  if (modifier && key === "s") {
    return "save";
  }

  // Select All
  if (modifier && key === "a") {
    return "select-all";
  }

  // Copy / Paste / Duplicate
  if (modifier && key === "c") {
    return "copy-clips";
  }
  if (modifier && key === "v") {
    return "paste-clips";
  }
  if (modifier && key === "d") {
    return "duplicate-clip";
  }

  // Non-modifier single-key shortcuts
  if (!modifier) {
    // Play/Pause toggle (Space)
    if (event.code === "Space" || event.key === " ") {
      return "toggle-play";
    }

    // NLE Shuttle controls: J / K / L
    if (key === "j" && !event.altKey) {
      return "shuttle-backward";
    }
    if (key === "k" && !event.altKey) {
      return "shuttle-pause";
    }
    if (key === "l" && !event.altKey) {
      return "shuttle-forward";
    }

    // Split clip at playhead
    if (key === "s" && !event.altKey) {
      return "split-clip";
    }

    // Trim Start to Playhead ([ or Q)
    if ((event.key === "[" || (key === "q" && !event.altKey)) && !event.ctrlKey && !event.metaKey) {
      return "trim-start-to-playhead";
    }

    // Trim End to Playhead (] or W)
    if ((event.key === "]" || (key === "w" && !event.altKey)) && !event.ctrlKey && !event.metaKey) {
      return "trim-end-to-playhead";
    }

    // Delete / Ripple Delete
    if (event.key === "Delete" || event.key === "Backspace") {
      return event.shiftKey ? "ripple-delete-clip" : "delete-clip";
    }

    // Toggle Track Mute (M)
    if (key === "m" && !event.altKey) {
      return "toggle-mute";
    }

    // Shortcuts modal trigger (?)
    if (event.key === "?" || (event.key === "/" && event.shiftKey)) {
      return "toggle-shortcuts-modal";
    }

    // Nudge clips (Alt + Arrow)
    if (event.altKey && (event.key === "ArrowLeft" || event.key === "ArrowRight")) {
      return event.key === "ArrowRight" ? "nudge-right" : "nudge-left";
    }

    // Frame step (Arrows without Alt)
    if (event.key === "ArrowLeft") {
      return "step-backward";
    }
    if (event.key === "ArrowRight") {
      return "step-forward";
    }

    // Snapping toggle (N)
    if (key === "n" && !event.altKey) {
      return "toggle-snapping";
    }

    // Fit timeline (F)
    if (key === "f" && !event.altKey) {
      return "fit-timeline";
    }

    // Zoom timeline (+ / -)
    if (event.key === "+" || event.key === "=") {
      return "zoom-in";
    }
    if (event.key === "-" || event.key === "_") {
      return "zoom-out";
    }
  }

  return null;
}

/**
 * Track visual priority for topmost unmuted clip resolution:
 * 1. overlay (B-roll & PiP)
 * 2. video (Main A-roll footage)
 * 3. image (Visual graphics)
 * 4. caption (Kinetic text)
 * 5. text (Titles)
 * 6. audio (SFX / Music)
 */
const TRACK_PRIORITY: Record<string, number> = {
  overlay: 1,
  video: 2,
  image: 3,
  caption: 4,
  text: 5,
  audio: 6,
};

/**
 * Slices the selected clip at the current playhead, or if no clip is selected,
 * finds the topmost unmuted clip under the playhead and splits it.
 */
export function splitTopmostUnmutedClipAtPlayhead(
  project: EditorProject,
  time: number,
  selectedClipIds: string[] = []
): { nextProject: EditorProject; splitClipId: string | null; wasTopmostFallback: boolean } {
  const fps = project.settings.fps || 30;
  const minMargin = 1 / fps;

  // 1. If clips are selected, check if any of them intersect the playhead
  if (selectedClipIds.length > 0) {
    const qualifyingSelected = selectedClipIds
      .map((id) => project.clips[id])
      .filter((c): c is Clip => {
        if (!c) return false;
        const track = project.tracks[c.trackId];
        return (
          !!track &&
          !track.locked &&
          time > c.startTime + minMargin &&
          time < c.startTime + c.duration - minMargin
        );
      });

    if (qualifyingSelected.length > 0) {
      let nextProject = project;
      for (const c of qualifyingSelected) {
        nextProject = splitClip(nextProject, c.id, time);
      }
      return {
        nextProject,
        splitClipId: qualifyingSelected[0].id,
        wasTopmostFallback: false,
      };
    }
  }

  // 2. Fallback: Find the topmost unmuted & unlocked clip under the playhead
  const sortedTrackIds = [...project.trackOrder].sort((a, b) => {
    const kindA = project.tracks[a]?.kind || "";
    const kindB = project.tracks[b]?.kind || "";
    return (TRACK_PRIORITY[kindA] ?? 10) - (TRACK_PRIORITY[kindB] ?? 10);
  });

  for (const trackId of sortedTrackIds) {
    const track = project.tracks[trackId];
    if (!track || track.muted || track.locked) continue;

    for (const clipId of track.clipIds) {
      const c = project.clips[clipId];
      if (
        c &&
        time > c.startTime + minMargin &&
        time < c.startTime + c.duration - minMargin
      ) {
        const nextProject = splitClip(project, c.id, time);
        return {
          nextProject,
          splitClipId: c.id,
          wasTopmostFallback: true,
        };
      }
    }
  }

  return { nextProject: project, splitClipId: null, wasTopmostFallback: false };
}

/**
 * Removes selected clips. If `ripple: true` is specified, pulls downstream clips
 * on the same track to close the gap cleanly without leaving holes.
 */
export function deleteOrRippleDeleteClips(
  project: EditorProject,
  clipIds: string[],
  options: { ripple?: boolean } = {}
): EditorProject {
  if (!clipIds.length) return project;

  if (!options.ripple) {
    return clipIds.reduce((next, id) => {
      if (!next.clips[id]) return next;
      return removeClip(next, id);
    }, project);
  }

  // Ripple Delete: group clips by track, sort descending by startTime so earlier offsets stay accurate
  const validClips = clipIds
    .map((id) => project.clips[id])
    .filter((c): c is Clip => !!c && !project.tracks[c.trackId]?.locked)
    .sort((a, b) => b.startTime - a.startTime);

  let nextProject = project;

  for (const c of validClips) {
    if (!nextProject.clips[c.id]) continue;
    const removedDuration = c.duration;
    const removedStart = c.startTime;
    const trackId = c.trackId;

    // Remove the target clip
    nextProject = removeClip(nextProject, c.id);

    // Find subsequent clips on that track and shift them left by removedDuration
    const downstreamClips = (nextProject.tracks[trackId]?.clipIds || [])
      .map((id) => nextProject.clips[id])
      .filter((other): other is Clip => !!other && other.startTime >= removedStart - 1e-5)
      .sort((a, b) => a.startTime - b.startTime);

    for (const downstream of downstreamClips) {
      const targetStart = Math.max(0, downstream.startTime - removedDuration);
      nextProject = moveClip(nextProject, downstream.id, targetStart);
    }
  }

  return nextProject;
}

/**
 * Toggles mute on the track of the selected clip, or falls back to the primary
 * audio or video track when nothing is selected.
 */
export function toggleSelectedTrackMute(
  project: EditorProject,
  selectedClipIds: string[] = []
): { project: EditorProject; trackId: string | null; muted: boolean } {
  let targetTrack: Track | undefined;

  // 1. If clip(s) selected, find track of the first selected clip
  if (selectedClipIds.length > 0) {
    const clip = project.clips[selectedClipIds[0]];
    if (clip && project.tracks[clip.trackId] && !project.tracks[clip.trackId].locked) {
      targetTrack = project.tracks[clip.trackId];
    }
  }

  // 2. Fallback: find first audio track, then first video track, then first track in order
  if (!targetTrack) {
    targetTrack =
      project.trackOrder.map((id) => project.tracks[id]).find((t) => t && t.kind === "audio" && !t.locked) ||
      project.trackOrder.map((id) => project.tracks[id]).find((t) => t && t.kind === "video" && !t.locked) ||
      project.trackOrder.map((id) => project.tracks[id]).find((t) => t && !t.locked);
  }

  if (!targetTrack) {
    return { project, trackId: null, muted: false };
  }

  const nextMuted = !targetTrack.muted;
  const nextProject = changeTrack(project, targetTrack.id, { muted: nextMuted });
  return { project: nextProject, trackId: targetTrack.id, muted: nextMuted };
}
