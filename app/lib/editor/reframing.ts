import {
  EditorProject,
  Clip,
  Track,
  Transform,
  MediaAsset,
  defaultTransform,
  dimensions,
  projectDuration,
  uid,
} from "./model";
import {
  CURATED_BROLL_CATALOG,
  getCuratedBrollByCategory,
  type BrollNiche,
} from "../assets/curatedBrollCatalog";

export type ReframeMode = "fit-with-blur" | "center-crop" | "split-screen";

export interface ReframeOptions {
  focusX?: number;
  /** Eye-line vertical focus offset (defaults to -0.14 for upper-third face lock) */
  focusY?: number;
  /** Scale multiplier for center-crop punch in (defaults to 1.77x) */
  cropScale?: number;
  /** Blur radius for background wings in fit-with-blur mode (defaults to 25px) */
  blurAmount?: number;
  /** Brightness adjustment for background wings (defaults to -10) */
  blurBrightness?: number;
  /** Background scale factor (defaults to 3.16) */
  backgroundScale?: number;
  /** Top split ratio for split-screen (defaults to 0.5) */
  topRatio?: number;
  /** Scale multiplier for split-screen halves (defaults to 1.0) */
  splitScale?: number;
  /** Asset ID to use for bottom half in split-screen mode */
  brollAssetId?: string;
  /** Curated B-roll category if generating contextual footage (defaults to 'gaming') */
  brollNiche?: BrollNiche;
}

export const REFRAME_BACKGROUND_TRACK_ID = "track-reframe-bg";
export const OVERLAY_TRACK_ID = "track-overlay";

/**
 * Calculates center-crop transform centered on the upper-third eye-line (focusY: -0.14)
 * to fill 9:16 completely without distortion.
 */
export function calculateCenterCropTransform(
  cropScale = 1.77,
  focusY = -0.14,
  focusX = 0
): Transform & { focusY: number; focusX?: number } {
  return {
    x: focusX,
    y: focusY,
    scale: cropScale,
    rotation: 0,
    opacity: 1,
    focusY,
    focusX,
  };
}

/**
 * Cleans up any prior reframe-generated background track and blurred clips.
 */
function cleanupReframeBackground(project: EditorProject): EditorProject {
  const bgTrack = project.tracks[REFRAME_BACKGROUND_TRACK_ID];
  if (!bgTrack) return project;

  const remainingClips = { ...project.clips };
  for (const clipId of bgTrack.clipIds) {
    delete remainingClips[clipId];
  }

  const remainingTracks = { ...project.tracks };
  delete remainingTracks[REFRAME_BACKGROUND_TRACK_ID];

  const nextTrackOrder = project.trackOrder.filter(
    (id) => id !== REFRAME_BACKGROUND_TRACK_ID
  );

  return {
    ...project,
    trackOrder: nextTrackOrder,
    tracks: remainingTracks,
    clips: remainingClips,
  };
}

/**
 * Fit-with-blur: Scales 16:9 footage to fit 9:16 width, with blurred duplicated
 * background wings filling top and bottom.
 */
export function calculateFitWithBlur(
  project: EditorProject,
  options: ReframeOptions = {}
): EditorProject {
  let p = cleanupReframeBackground(project);
  const blurAmount = options.blurAmount ?? 25;
  const blurBrightness = options.blurBrightness ?? -10;

  // Background scale factor needed to completely cover 1080x1920:
  // 16:9 clip in 9:16 has height 607.5 at scale 1.
  // 1920 / 607.5 = 3.1605x punch-in to fill canvas height.
  const bgScale = options.backgroundScale ?? 3.16;

  // Locate the primary visual/video track
  const videoTrack =
    p.trackOrder
      .map((id) => p.tracks[id])
      .find((t) => t && t.kind === "video" && t.id !== REFRAME_BACKGROUND_TRACK_ID) ||
    Object.values(p.tracks).find((t) => t.kind === "video");

  if (!videoTrack) {
    return {
      ...p,
      settings: { ...p.settings, aspectRatio: "9:16" },
    };
  }

  const originalClipIds = [...videoTrack.clipIds];
  const bgClipIds: string[] = [];
  const nextClips: Record<string, Clip> = { ...p.clips };

  // 1. Reset foreground clips to fit 9:16 width (scale 1, centered, blur 0)
  for (const clipId of originalClipIds) {
    const clip = nextClips[clipId];
    if (!clip) continue;

    nextClips[clipId] = {
      ...clip,
      transform: {
        ...clip.transform,
        x: 0,
        y: 0,
        scale: 1,
        rotation: 0,
        opacity: 1,
      },
      effects: {
        ...clip.effects,
        blur: 0,
      },
    };

    // 2. Duplicate background wing clip with blur and scaling to fill vertical space
    const bgClipId = uid();
    const bgClip: Clip = {
      ...clip,
      id: bgClipId,
      trackId: REFRAME_BACKGROUND_TRACK_ID,
      name: `${clip.name} (Blurred BG)`,
      volume: 0, // Muted so audio is not doubled
      audioRole: "background",
      transform: {
        x: 0,
        y: 0,
        scale: bgScale,
        rotation: 0,
        opacity: 1,
      },
      effects: {
        ...clip.effects,
        brightness: blurBrightness,
        blur: blurAmount,
      },
    };

    nextClips[bgClipId] = bgClip;
    bgClipIds.push(bgClipId);
  }

  // Insert background track at the very back of the stack (index 0) so it renders behind
  const bgTrack: Track = {
    id: REFRAME_BACKGROUND_TRACK_ID,
    name: "Blurred Background",
    kind: "video",
    clipIds: bgClipIds,
    hidden: false,
    muted: true,
    locked: false,
  };

  const nextTracks = {
    ...p.tracks,
    [REFRAME_BACKGROUND_TRACK_ID]: bgTrack,
  };

  const nextTrackOrder = [
    REFRAME_BACKGROUND_TRACK_ID,
    ...p.trackOrder.filter((id) => id !== REFRAME_BACKGROUND_TRACK_ID),
  ];

  return {
    ...p,
    trackOrder: nextTrackOrder,
    tracks: nextTracks,
    clips: nextClips,
    settings: { ...p.settings, aspectRatio: "9:16" },
  };
}

/**
 * Center-crop: Punches in 1.77x centered on upper-third eye-line (focusY: -0.14)
 * to fill 9:16 completely without distortion.
 */
export function calculateCenterCrop(
  project: EditorProject,
  options: ReframeOptions = {}
): EditorProject {
  const p = cleanupReframeBackground(project);
  const cropScale = options.cropScale ?? options.backgroundScale ?? 1.77;
  const focusY = options.focusY ?? -0.14;
  const focusX = options.focusX ?? 0;

  const targetTransform = calculateCenterCropTransform(cropScale, focusY, focusX);
  const nextClips: Record<string, Clip> = { ...p.clips };

  for (const trackId of p.trackOrder) {
    const track = p.tracks[trackId];
    if (!track || track.kind !== "video") continue;

    for (const clipId of track.clipIds) {
      const clip = nextClips[clipId];
      if (!clip) continue;

      nextClips[clipId] = {
        ...clip,
        transform: {
          ...clip.transform,
          x: targetTransform.x,
          y: targetTransform.y,
          scale: targetTransform.scale,
          rotation: targetTransform.rotation,
          opacity: targetTransform.opacity,
        },
        effects: {
          ...clip.effects,
          blur: 0,
        },
      };

      // Anchor focusY metadata on the clip for inspector and zoom alignment
      (nextClips[clipId].transform as any).focusY = focusY;
      (nextClips[clipId] as any).focusY = focusY;
    }
  }

  return {
    ...p,
    clips: nextClips,
    settings: { ...p.settings, aspectRatio: "9:16" },
  };
}

/**
 * Split-screen: Positions A-roll speaker footage in the top half (y: -0.25)
 * and contextual B-roll / gameplay footage in the bottom half (y: +0.25).
 */
export function calculateSplitScreen(
  project: EditorProject,
  options: ReframeOptions = {}
): EditorProject {
  let p = cleanupReframeBackground(project);
  const splitScale = options.splitScale ?? 1.0;
  const brollNiche: BrollNiche = options.brollNiche ?? "gaming";

  const nextClips: Record<string, Clip> = { ...p.clips };
  const nextTracks: Record<string, Track> = { ...p.tracks };
  const nextAssets: Record<string, MediaAsset> = { ...p.assets };

  // 1. Position A-roll clips in the top half (centered vertically in top 50%: y = -0.25)
  const primaryVideoTrack =
    p.trackOrder
      .map((id) => p.tracks[id])
      .find((t) => t && t.kind === "video") ||
    Object.values(p.tracks).find((t) => t.kind === "video");

  if (primaryVideoTrack) {
    for (const clipId of primaryVideoTrack.clipIds) {
      const clip = nextClips[clipId];
      if (!clip) continue;

      nextClips[clipId] = {
        ...clip,
        transform: {
          ...clip.transform,
          x: 0,
          y: -0.25, // Upper half center (-0.25 offset from canvas center 0.5 = 0.25)
          scale: splitScale,
          rotation: 0,
          opacity: 1,
        },
        effects: {
          ...clip.effects,
          blur: 0,
        },
      };
    }
  }

  // 2. Position or create contextual B-roll / gameplay in bottom half (y = +0.25)
  let overlayTrack = p.trackOrder
    .map((id) => p.tracks[id])
    .find((t) => t && t.kind === "overlay");

  if (!overlayTrack) {
    const newTrackId = OVERLAY_TRACK_ID in p.tracks ? uid() : OVERLAY_TRACK_ID;
    overlayTrack = {
      id: newTrackId,
      name: "B-Roll / Split",
      kind: "overlay",
      clipIds: [],
      hidden: false,
      muted: false,
      locked: false,
    };
    nextTracks[overlayTrack.id] = overlayTrack;
    if (!p.trackOrder.includes(overlayTrack.id)) {
      p.trackOrder.push(overlayTrack.id);
    }
  }

  // Check if overlay track already has clips
  if (overlayTrack.clipIds.length > 0) {
    for (const clipId of overlayTrack.clipIds) {
      const clip = nextClips[clipId];
      if (!clip) continue;

      nextClips[clipId] = {
        ...clip,
        volume: 0,
        transform: {
          ...clip.transform,
          x: 0,
          y: 0.25, // Lower half center (+0.25 offset from canvas center 0.5 = 0.75)
          scale: splitScale,
          rotation: 0,
          opacity: 1,
        },
      };
    }
  } else {
    // Generate contextual B-roll from options, existing assets, or curated catalog
    let brollAsset: MediaAsset | undefined;

    if (options.brollAssetId && nextAssets[options.brollAssetId]) {
      brollAsset = nextAssets[options.brollAssetId];
    } else {
      // Find another video asset in project
      const existingOther = Object.values(nextAssets).find(
        (a) =>
          a.kind === "video" &&
          (!primaryVideoTrack ||
            !primaryVideoTrack.clipIds.some(
              (cid) => nextClips[cid]?.assetId === a.id
            ))
      );

      if (existingOther) {
        brollAsset = existingOther;
      } else {
        // Pick from curated B-roll catalog (e.g. gaming or productivity)
        const curatedList = getCuratedBrollByCategory(brollNiche);
        const curatedItem = curatedList[0] || CURATED_BROLL_CATALOG[0];

        brollAsset = {
          id: `asset-curated-${curatedItem.id}`,
          name: curatedItem.title,
          kind: "video",
          mime: "video/mp4",
          size: 8 * 1024 * 1024,
          duration: curatedItem.duration,
          width: curatedItem.width,
          height: curatedItem.height,
          url: curatedItem.videoUrl,
          thumbnail: curatedItem.thumbnail,
          stockKey: curatedItem.id,
        };
        nextAssets[brollAsset.id] = brollAsset;
      }
    }

    const duration = projectDuration({ ...p, clips: nextClips }) || 15;
    const brollClipId = uid();
    const brollClip: Clip = {
      id: brollClipId,
      assetId: brollAsset.id,
      trackId: overlayTrack.id,
      name: `${brollAsset.name} (Split Bottom)`,
      startTime: 0,
      duration,
      sourceStart: 0,
      sourceEnd: Math.min(brollAsset.duration || duration, duration),
      volume: 0, // Muted so it does not clash with A-roll dialogue
      speed: 1,
      fadeIn: 0,
      fadeOut: 0,
      audioRole: "background",
      effects: { brightness: 0, contrast: 0, saturation: 0, blur: 0 },
      transform: {
        x: 0,
        y: 0.25, // Bottom half center
        scale: splitScale,
        rotation: 0,
        opacity: 1,
      },
    };

    nextClips[brollClipId] = brollClip;
    nextTracks[overlayTrack.id] = {
      ...overlayTrack,
      clipIds: [...overlayTrack.clipIds, brollClipId],
    };
  }

  return {
    ...p,
    trackOrder: [...p.trackOrder],
    tracks: nextTracks,
    clips: nextClips,
    assets: nextAssets,
    settings: { ...p.settings, aspectRatio: "9:16" },
  };
}

/**
 * 1-Click Smart Reframing from 16:9 to 9:16.
 *
 * Supported algorithms:
 * - 'fit-with-blur': Scales 16:9 footage to fit 9:16 width, with blurred duplicated background wings filling top and bottom.
 * - 'center-crop': Punches in 1.77x centered on upper-third eye-line (focusY: -0.14) to fill 9:16 completely without distortion.
 * - 'split-screen': Positions A-roll speaker footage in the top half and contextual B-roll / gameplay footage in the bottom half.
 */
export function reframeProject(
  project: EditorProject,
  mode: ReframeMode,
  options: ReframeOptions = {}
): EditorProject {
  if (!project || !project.settings) {
    throw new Error("Invalid editor project for reframing.");
  }

  switch (mode) {
    case "fit-with-blur":
      return calculateFitWithBlur(project, options);
    case "center-crop":
      return calculateCenterCrop(project, options);
    case "split-screen":
      return calculateSplitScreen(project, options);
    default:
      throw new Error(`Unsupported reframing mode: ${String(mode)}`);
  }
}
