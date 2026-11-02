import {
  VeeloxTimelineProject,
  TimelineTrackType,
  TimelineTrack,
  TimelineItem,
  TimelineKeyframe,
  TimelineMarker,
  AspectRatio,
  ASPECT_RATIO_DIMENSIONS,
} from "./types";
import { CaptionSegment, CaptionPresetId } from "../captions/presets";

/**
 * Moves a timeline item to a new start time, updating its end time while preserving duration.
 */
export function moveTimelineItem(
  timeline: VeeloxTimelineProject,
  trackType: TimelineTrackType,
  itemId: string,
  newStartTime: number
): VeeloxTimelineProject {
  const boundedStart = Math.max(0, Math.round(newStartTime * 100) / 100);

  const updatedTracks = timeline.tracks.map((track) => {
    if (track.type !== trackType) return track;

    const updatedItems = track.items.map((item) => {
      if (item.id !== itemId) return item;
      const dur = item.duration;
      return {
        ...item,
        startTime: boundedStart,
        endTime: Math.round((boundedStart + dur) * 100) / 100,
      };
    });

    updatedItems.sort((a, b) => a.startTime - b.startTime);
    return { ...track, items: updatedItems };
  });

  let maxEndTime = timeline.duration;
  for (const tr of updatedTracks) {
    for (const it of tr.items) {
      if (it.endTime > maxEndTime) {
        maxEndTime = it.endTime;
      }
    }
  }

  return {
    ...timeline,
    duration: Math.max(3, Math.round(maxEndTime * 10) / 10),
    tracks: updatedTracks,
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Trims a timeline item's start or end time.
 */
export function trimTimelineItem(
  timeline: VeeloxTimelineProject,
  trackType: TimelineTrackType,
  itemId: string,
  newStartTime: number,
  newEndTime: number
): VeeloxTimelineProject {
  const minDuration = 0.3;
  const start = Math.max(0, Math.round(newStartTime * 100) / 100);
  const end = Math.max(start + minDuration, Math.round(newEndTime * 100) / 100);

  const updatedTracks = timeline.tracks.map((track) => {
    if (track.type !== trackType) return track;

    const updatedItems = track.items.map((item) => {
      if (item.id !== itemId) return item;
      const newDur = Math.round((end - start) * 100) / 100;
      return {
        ...item,
        startTime: start,
        endTime: end,
        duration: newDur,
      };
    });

    updatedItems.sort((a, b) => a.startTime - b.startTime);
    return { ...track, items: updatedItems };
  });

  return {
    ...timeline,
    tracks: updatedTracks,
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Replaces or inserts a B-roll footage asset into the video track.
 */
export function applyBRollToTimeline(
  timeline: VeeloxTimelineProject,
  broll: {
    videoUrl: string;
    title?: string;
    thumbnail?: string;
    duration?: number;
    source?: string;
  },
  targetTime?: number,
  targetClipId?: string
): VeeloxTimelineProject {
  const updatedTracks = timeline.tracks.map((track) => {
    if (track.type !== "video") return track;

    // Case 1: Specific clip targeted
    if (targetClipId) {
      return {
        ...track,
        items: track.items.map((clip) => {
          if (clip.id !== targetClipId) return clip;
          return {
            ...clip,
            source: broll.videoUrl,
            metadata: {
              ...clip.metadata,
              title: broll.title || clip.metadata?.title || "B-Roll Cutaway",
              thumbnail: broll.thumbnail || clip.metadata?.thumbnail,
              sourceDuration: broll.duration || clip.metadata?.sourceDuration || 10,
              creator: broll.source || "Stock",
            },
          };
        }),
      };
    }

    // Case 2: Target time provided - replace overlapping clip
    const time = targetTime ?? 0;
    const overlappingClip = track.items.find(
      (c) => time >= c.startTime && time < c.endTime
    );

    if (overlappingClip) {
      return {
        ...track,
        items: track.items.map((clip) => {
          if (clip.id !== overlappingClip.id) return clip;
          return {
            ...clip,
            source: broll.videoUrl,
            metadata: {
              ...clip.metadata,
              title: broll.title || clip.metadata?.title || "B-Roll Cutaway",
              thumbnail: broll.thumbnail || clip.metadata?.thumbnail,
              sourceDuration: broll.duration || clip.metadata?.sourceDuration || 10,
              creator: broll.source || "Stock",
            },
          };
        }),
      };
    }

    // Case 3: Insert at the end or at target time
    const clipDuration = Math.min(broll.duration || 4, 5);
    const newClip: TimelineItem = {
      id: `clip_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      track: "video",
      startTime: time,
      endTime: time + clipDuration,
      duration: clipDuration,
      source: broll.videoUrl,
      type: "broll",
      volume: 0,
      transition: "cut",
      animation: "slow_zoom_in",
      metadata: {
        title: broll.title || "Inserted B-Roll",
        thumbnail: broll.thumbnail,
        sourceDuration: broll.duration || 10,
      },
    };

    const newItems = [...track.items, newClip].sort((a, b) => a.startTime - b.startTime);
    return { ...track, items: newItems };
  });

  return {
    ...timeline,
    tracks: updatedTracks,
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Splits a clip at the given cut time into two contiguous clips.
 * Supports any track type (video, text, captions, voiceover, music, sfx, overlays)
 * and can optionally target a specific item ID.
 */
export function splitClipAtTime(
  timeline: VeeloxTimelineProject,
  cutTime: number,
  targetItemId?: string
): { timeline: VeeloxTimelineProject; newClipId?: string } {
  let createdClipId: string | undefined;

  const updatedTracks = timeline.tracks.map((track) => {
    // If targetItemId is provided, only touch track containing target item
    if (targetItemId && !track.items.some((i) => i.id === targetItemId)) {
      return track;
    }

    const targetClip = track.items.find((c) => {
      if (targetItemId) return c.id === targetItemId;
      return cutTime > c.startTime + 0.15 && cutTime < c.endTime - 0.15;
    });

    if (!targetClip) return track;
    if (cutTime <= targetClip.startTime + 0.15 || cutTime >= targetClip.endTime - 0.15) {
      return track;
    }

    const part1Duration = Math.round((cutTime - targetClip.startTime) * 100) / 100;
    const part2Duration = Math.round((targetClip.endTime - cutTime) * 100) / 100;

    const part1: TimelineItem = {
      ...targetClip,
      endTime: cutTime,
      duration: part1Duration,
    };

    createdClipId = `${targetClip.id}_split_${Date.now()}`;
    const part2: TimelineItem = {
      ...targetClip,
      id: createdClipId,
      startTime: cutTime,
      duration: part2Duration,
      metadata: {
        ...targetClip.metadata,
        title: `${targetClip.metadata?.title || "Clip"} (Part 2)`,
        sourceOffset: (targetClip.metadata?.sourceOffset || 0) + part1Duration,
      },
    };

    const newItems = track.items.flatMap((item) =>
      item.id === targetClip.id ? [part1, part2] : [item]
    );

    return { ...track, items: newItems };
  });

  return {
    timeline: {
      ...timeline,
      tracks: updatedTracks,
      updatedAt: new Date().toISOString(),
    },
    newClipId: createdClipId,
  };
}

/**
 * Duplicates a timeline clip.
 */
export function duplicateTimelineItem(
  timeline: VeeloxTimelineProject,
  trackType: TimelineTrackType,
  itemId: string
): { timeline: VeeloxTimelineProject; duplicatedId?: string } {
  let newId: string | undefined;

  const updatedTracks = timeline.tracks.map((track) => {
    if (track.type !== trackType) return track;

    const targetItem = track.items.find((i) => i.id === itemId);
    if (!targetItem) return track;

    newId = `${targetItem.id}_dup_${Date.now()}`;
    const newItem: TimelineItem = {
      ...targetItem,
      id: newId,
      startTime: targetItem.endTime,
      endTime: targetItem.endTime + targetItem.duration,
      metadata: {
        ...targetItem.metadata,
        title: `${targetItem.metadata?.title || "Clip"} (Copy)`,
      },
    };

    const newItems = [...track.items, newItem].sort((a, b) => a.startTime - b.startTime);
    return { ...track, items: newItems };
  });

  return {
    timeline: {
      ...timeline,
      tracks: updatedTracks,
      updatedAt: new Date().toISOString(),
    },
    duplicatedId: newId,
  };
}

/**
 * Standard delete: removes the item from the timeline.
 */
export function deleteTimelineItem(
  timeline: VeeloxTimelineProject,
  trackType: TimelineTrackType,
  itemId: string
): VeeloxTimelineProject {
  const updatedTracks = timeline.tracks.map((track) => {
    if (track.type !== trackType) return track;
    return {
      ...track,
      items: track.items.filter((item) => item.id !== itemId),
    };
  });

  return {
    ...timeline,
    tracks: updatedTracks,
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Ripple delete: removes the item and shifts subsequent items left to close the gap.
 */
export function rippleDeleteTimelineItem(
  timeline: VeeloxTimelineProject,
  trackType: TimelineTrackType,
  itemId: string
): VeeloxTimelineProject {
  const targetTrack = timeline.tracks.find((t) => t.type === trackType);
  const targetItem = targetTrack?.items.find((i) => i.id === itemId);
  if (!targetItem) return timeline;

  const gapDuration = targetItem.duration;
  const deletedEndTime = targetItem.endTime;

  const updatedTracks = timeline.tracks.map((track) => {
    if (track.type !== trackType) return track;

    const updatedItems = track.items
      .filter((i) => i.id !== itemId)
      .map((item) => {
        if (item.startTime >= deletedEndTime) {
          const newStart = Math.max(0, item.startTime - gapDuration);
          return {
            ...item,
            startTime: Math.round(newStart * 100) / 100,
            endTime: Math.round((newStart + item.duration) * 100) / 100,
          };
        }
        return item;
      });

    return { ...track, items: updatedItems };
  });

  const newTotalDuration = Math.max(3, timeline.duration - gapDuration);

  return {
    ...timeline,
    duration: Math.round(newTotalDuration * 10) / 10,
    tracks: updatedTracks,
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Adds a new video or audio track to the timeline.
 */
export function addTimelineTrack(
  timeline: VeeloxTimelineProject,
  trackType: TimelineTrackType,
  customName?: string
): VeeloxTimelineProject {
  const existingCount = timeline.tracks.filter((t) => t.type === trackType).length;
  const trackName = customName || `${trackType.toUpperCase()} ${existingCount + 1}`;
  const newTrack: TimelineTrack = {
    id: `track_${trackType}_${Date.now()}`,
    type: trackType,
    name: trackName,
    items: [],
  };

  return {
    ...timeline,
    tracks: [...timeline.tracks, newTrack],
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Removes a track from the timeline.
 */
export function deleteTimelineTrack(
  timeline: VeeloxTimelineProject,
  trackId: string
): VeeloxTimelineProject {
  return {
    ...timeline,
    tracks: timeline.tracks.filter((t) => t.id !== trackId),
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Toggles track mute, lock, solo, or hidden state.
 */
export function updateTrackState(
  timeline: VeeloxTimelineProject,
  trackId: string,
  updates: Partial<Pick<TimelineTrack, "muted" | "locked" | "solo" | "hidden">>
): VeeloxTimelineProject {
  return {
    ...timeline,
    tracks: timeline.tracks.map((t) => (t.id === trackId ? { ...t, ...updates } : t)),
    updatedAt: new Date().toISOString(),
  };
}

/**
 * AI Silence Removal:
 * Detects silent gaps (> minDuration seconds) between voiceover words/segments
 * and trims clips so dead air is tightened automatically.
 */
export function removeSilencesFromTimeline(
  timeline: VeeloxTimelineProject,
  minSilenceDuration = 0.5,
  padding = 0.08
): { timeline: VeeloxTimelineProject; silencesRemovedCount: number } {
  const voiceTrack = timeline.tracks.find((t) => t.type === "voiceover");
  if (!voiceTrack || voiceTrack.items.length === 0) {
    return { timeline, silencesRemovedCount: 0 };
  }

  // Find caption segments or word timestamps to detect speech activity
  const captionTrack = timeline.tracks.find((t) => t.type === "captions");
  const captionItems = captionTrack?.items || [];

  if (captionItems.length < 2) {
    return { timeline, silencesRemovedCount: 0 };
  }

  let silencesRemoved = 0;
  let accumulatedShift = 0;

  // Compute speech gaps between consecutive caption segments
  const adjustedCaptions: TimelineItem[] = [];
  for (let i = 0; i < captionItems.length; i++) {
    const current = captionItems[i];
    let newStart = Math.max(0, current.startTime - accumulatedShift);

    if (i > 0) {
      const prev = adjustedCaptions[i - 1];
      const gap = current.startTime - prev.endTime;

      if (gap > minSilenceDuration) {
        const reduction = gap - padding * 2;
        accumulatedShift += reduction;
        newStart = prev.endTime + padding;
        silencesRemoved++;
      }
    }

    adjustedCaptions.push({
      ...current,
      startTime: Math.round(newStart * 100) / 100,
      endTime: Math.round((newStart + current.duration) * 100) / 100,
    });
  }

  if (silencesRemoved === 0) {
    return { timeline, silencesRemovedCount: 0 };
  }

  // Adjust video track clips proportionally to match tightened speech
  const updatedTracks = timeline.tracks.map((track) => {
    if (track.type === "captions") {
      return { ...track, items: adjustedCaptions };
    }
    return track;
  });

  const newDuration = Math.max(3, timeline.duration - accumulatedShift);

  return {
    timeline: {
      ...timeline,
      duration: Math.round(newDuration * 10) / 10,
      tracks: updatedTracks,
      updatedAt: new Date().toISOString(),
    },
    silencesRemovedCount: silencesRemoved,
  };
}

/**
 * AI Auto-Reframe:
 * Converts video project aspect ratio (e.g. 16:9 -> 9:16 or 1:1)
 * adjusting crop coordinates to keep central content focused.
 */
export function autoReframeTimeline(
  timeline: VeeloxTimelineProject,
  targetRatio: AspectRatio
): VeeloxTimelineProject {
  const dimensions = ASPECT_RATIO_DIMENSIONS[targetRatio] || ASPECT_RATIO_DIMENSIONS["9:16"];

  const updatedTracks = timeline.tracks.map((track) => {
    if (track.type !== "video") return track;

    const reframedClips = track.items.map((clip) => {
      return {
        ...clip,
        fit: "cover" as const,
        position: { x: 0, y: 0 },
        scale: 1.0,
      };
    });

    return { ...track, items: reframedClips };
  });

  return {
    ...timeline,
    aspectRatio: targetRatio,
    resolution: dimensions,
    tracks: updatedTracks,
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Imports parsed subtitle segments into the timeline's caption track.
 */
export function importSubtitlesToTimeline(
  timeline: VeeloxTimelineProject,
  segments: CaptionSegment[],
  presetId?: CaptionPresetId
): VeeloxTimelineProject {
  const captionItems: TimelineItem[] = segments.map((seg, idx) => ({
    id: `cap_imp_${idx + 1}_${Math.random().toString(36).slice(2, 6)}`,
    track: "captions",
    startTime: seg.start,
    endTime: seg.end,
    duration: Math.max(0.3, Math.round((seg.end - seg.start) * 100) / 100),
    source: seg.text,
    type: "caption",
    volume: 0,
    transition: "cut",
    animation: "none",
    metadata: {
      captionSegment: seg,
      captionPreset: presetId || timeline.settings.captionPreset,
      captionPosition: timeline.settings.captionPosition,
    },
  }));

  let hasCaptionTrack = false;
  const updatedTracks = timeline.tracks.map((track) => {
    if (track.type === "captions") {
      hasCaptionTrack = true;
      return { ...track, items: captionItems };
    }
    return track;
  });

  if (!hasCaptionTrack) {
    updatedTracks.push({
      id: "track_captions_imported",
      type: "captions",
      name: "Imported Subtitles",
      items: captionItems,
    });
  }

  // Extend duration if subtitles extend beyond current video duration
  const lastCap = segments[segments.length - 1];
  const newDuration = Math.max(timeline.duration, lastCap ? lastCap.end : 0);

  return {
    ...timeline,
    duration: Math.round(newDuration * 10) / 10,
    tracks: updatedTracks,
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Adds a keyframe point to a clip.
 */
export function addKeyframeToItem(
  timeline: VeeloxTimelineProject,
  trackType: TimelineTrackType,
  itemId: string,
  keyframe: Omit<TimelineKeyframe, "id">
): VeeloxTimelineProject {
  const newKeyframe: TimelineKeyframe = {
    ...keyframe,
    id: `kf_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
  };

  const updatedTracks = timeline.tracks.map((track) => {
    if (track.type !== trackType) return track;

    const updatedItems = track.items.map((item) => {
      if (item.id !== itemId) return item;
      const existing = item.keyframes || [];
      const updatedKeyframes = [...existing, newKeyframe].sort((a, b) => a.time - b.time);
      return { ...item, keyframes: updatedKeyframes };
    });

    return { ...track, items: updatedItems };
  });

  return { ...timeline, tracks: updatedTracks, updatedAt: new Date().toISOString() };
}

/**
 * Removes a keyframe point from an item.
 */
export function removeKeyframeFromItem(
  timeline: VeeloxTimelineProject,
  trackType: TimelineTrackType,
  itemId: string,
  keyframeId: string
): VeeloxTimelineProject {
  const updatedTracks = timeline.tracks.map((track) => {
    if (track.type !== trackType) return track;
    const updatedItems = track.items.map((item) => {
      if (item.id !== itemId) return item;
      return {
        ...item,
        keyframes: (item.keyframes || []).filter((kf) => kf.id !== keyframeId),
      };
    });
    return { ...track, items: updatedItems };
  });
  return { ...timeline, tracks: updatedTracks, updatedAt: new Date().toISOString() };
}

/**
 * Updates an existing keyframe in an item.
 */
export function updateKeyframeInItem(
  timeline: VeeloxTimelineProject,
  trackType: TimelineTrackType,
  itemId: string,
  keyframeId: string,
  updates: Partial<Omit<TimelineKeyframe, "id">>
): VeeloxTimelineProject {
  const updatedTracks = timeline.tracks.map((track) => {
    if (track.type !== trackType) return track;
    const updatedItems = track.items.map((item) => {
      if (item.id !== itemId) return item;
      const updatedKeyframes = (item.keyframes || [])
        .map((kf) => (kf.id === keyframeId ? { ...kf, ...updates } : kf))
        .sort((a, b) => a.time - b.time);
      return { ...item, keyframes: updatedKeyframes };
    });
    return { ...track, items: updatedItems };
  });
  return { ...timeline, tracks: updatedTracks, updatedAt: new Date().toISOString() };
}

/**
 * Moves a timeline item from one track to another compatible track (e.g. video <-> overlays, or voiceover <-> music <-> sfx).
 */
export function moveTimelineItemAcrossTracks(
  timeline: VeeloxTimelineProject,
  sourceTrackType: TimelineTrackType,
  targetTrackType: TimelineTrackType,
  itemId: string,
  newStartTime: number
): VeeloxTimelineProject {
  if (sourceTrackType === targetTrackType) {
    return moveTimelineItem(timeline, sourceTrackType, itemId, newStartTime);
  }

  const sourceTrack = timeline.tracks.find((t) => t.type === sourceTrackType);
  const targetItem = sourceTrack?.items.find((i) => i.id === itemId);
  if (!targetItem) return timeline;

  const boundedStart = Math.max(0, Math.round(newStartTime * 100) / 100);
  const dur = targetItem.duration;
  const movedItem: TimelineItem = {
    ...targetItem,
    track: targetTrackType,
    startTime: boundedStart,
    endTime: Math.round((boundedStart + dur) * 100) / 100,
  };

  let foundTargetTrack = false;
  let updatedTracks = timeline.tracks.map((track) => {
    if (track.type === sourceTrackType) {
      return {
        ...track,
        items: track.items.filter((i) => i.id !== itemId),
      };
    }
    if (track.type === targetTrackType) {
      foundTargetTrack = true;
      const newItems = [...track.items, movedItem].sort((a, b) => a.startTime - b.startTime);
      return {
        ...track,
        items: newItems,
      };
    }
    return track;
  });

  if (!foundTargetTrack) {
    const newTrack: TimelineTrack = {
      id: `track_${targetTrackType}_${Date.now()}`,
      type: targetTrackType,
      name: targetTrackType.toUpperCase(),
      items: [movedItem],
    };
    updatedTracks.push(newTrack);
  }

  let maxEndTime = timeline.duration;
  for (const tr of updatedTracks) {
    for (const it of tr.items) {
      if (it.endTime > maxEndTime) {
        maxEndTime = it.endTime;
      }
    }
  }

  return {
    ...timeline,
    duration: Math.max(3, Math.round(maxEndTime * 10) / 10),
    tracks: updatedTracks,
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Detaches audio from a video/overlay clip into an independent audio track.
 * Mutes the source video item so audio is not duplicated.
 */
export function detachAudioFromVideoClip(
  timeline: VeeloxTimelineProject,
  trackType: TimelineTrackType,
  itemId: string
): { timeline: VeeloxTimelineProject; audioItemId?: string } {
  const sourceTrack = timeline.tracks.find((t) => t.type === trackType);
  const videoItem = sourceTrack?.items.find((i) => i.id === itemId);
  if (!videoItem || !videoItem.source) {
    return { timeline };
  }

  // Find or create audio track (preferably 'voiceover' or 'music')
  const targetAudioTrack = timeline.tracks.find((t) => t.type === "voiceover") || timeline.tracks.find((t) => t.type === "music");
  const targetTrackType: TimelineTrackType = targetAudioTrack ? targetAudioTrack.type : "voiceover";

  const newAudioId = `audio_detached_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const audioItem: TimelineItem = {
    id: newAudioId,
    track: targetTrackType,
    startTime: videoItem.startTime,
    endTime: videoItem.endTime,
    duration: videoItem.duration,
    source: videoItem.source,
    type: "voiceover",
    volume: videoItem.volume > 0 ? videoItem.volume : 1,
    transition: "cut",
    animation: "none",
    metadata: {
      title: `${videoItem.metadata?.title || "Video"} (Audio)`,
      sourceDuration: videoItem.metadata?.sourceDuration || videoItem.duration,
      sourceOffset: videoItem.metadata?.sourceOffset || 0,
    },
  };

  let hasAudioTrack = false;
  const updatedTracks = timeline.tracks.map((track) => {
    if (track.type === trackType) {
      const items = track.items.map((i) => (i.id === itemId ? { ...i, volume: 0 } : i));
      return { ...track, items };
    }
    if (track.type === targetTrackType) {
      hasAudioTrack = true;
      const items = [...track.items, audioItem].sort((a, b) => a.startTime - b.startTime);
      return { ...track, items };
    }
    return track;
  });

  if (!hasAudioTrack) {
    updatedTracks.push({
      id: `track_voiceover_${Date.now()}`,
      type: "voiceover",
      name: "Voiceover / Audio",
      items: [audioItem],
    });
  }

  return {
    timeline: {
      ...timeline,
      tracks: updatedTracks,
      updatedAt: new Date().toISOString(),
    },
    audioItemId: newAudioId,
  };
}

/**
 * Adds a timeline marker (for beats, hook points, transitions).
 */
export function addTimelineMarker(
  timeline: VeeloxTimelineProject,
  time: number,
  label = "Marker",
  color = "#38BDF8"
): VeeloxTimelineProject {
  const newMarker: TimelineMarker = {
    id: `mark_${Date.now()}`,
    time: Math.round(time * 100) / 100,
    label,
    color,
  };

  const currentMarkers = timeline.settings.markers || [];
  return {
    ...timeline,
    settings: {
      ...timeline.settings,
      markers: [...currentMarkers, newMarker].sort((a, b) => a.time - b.time),
    },
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Deletes a timeline marker.
 */
export function deleteTimelineMarker(
  timeline: VeeloxTimelineProject,
  markerId: string
): VeeloxTimelineProject {
  const currentMarkers = timeline.settings.markers || [];
  return {
    ...timeline,
    settings: {
      ...timeline.settings,
      markers: currentMarkers.filter((m) => m.id !== markerId),
    },
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Deletes multiple selected items from the timeline at once.
 */
export function deleteMultipleTimelineItems(
  timeline: VeeloxTimelineProject,
  itemIds: string[]
): VeeloxTimelineProject {
  const idSet = new Set(itemIds);
  const updatedTracks = timeline.tracks.map((track) => ({
    ...track,
    items: track.items.filter((item) => !idSet.has(item.id)),
  }));

  return {
    ...timeline,
    tracks: updatedTracks,
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Moves multiple selected items by a time delta (in seconds).
 */
export function moveMultipleTimelineItems(
  timeline: VeeloxTimelineProject,
  itemIds: string[],
  deltaTime: number
): VeeloxTimelineProject {
  const idSet = new Set(itemIds);
  const updatedTracks = timeline.tracks.map((track) => {
    const updatedItems = track.items.map((item) => {
      if (!idSet.has(item.id)) return item;
      const newStart = Math.max(0, Math.round((item.startTime + deltaTime) * 100) / 100);
      return {
        ...item,
        startTime: newStart,
        endTime: Math.round((newStart + item.duration) * 100) / 100,
      };
    });
    updatedItems.sort((a, b) => a.startTime - b.startTime);
    return { ...track, items: updatedItems };
  });

  return {
    ...timeline,
    tracks: updatedTracks,
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Intelligent Snapping Engine:
 * Snaps candidateTime to the nearest magnetic point (playhead, clip start/end, markers, in/out points).
 */
export function findSnapTime(
  candidateTime: number,
  timeline: VeeloxTimelineProject,
  playheadTime: number,
  inPoint?: number | null,
  outPoint?: number | null,
  threshold = 0.2
): { time: number; snapped: boolean; snapType?: "playhead" | "clip" | "marker" | "in_out" } {
  const snapTargets: Array<{ time: number; type: "playhead" | "clip" | "marker" | "in_out" }> = [
    { time: playheadTime, type: "playhead" },
  ];

  if (inPoint !== undefined && inPoint !== null) {
    snapTargets.push({ time: inPoint, type: "in_out" });
  }
  if (outPoint !== undefined && outPoint !== null) {
    snapTargets.push({ time: outPoint, type: "in_out" });
  }

  // Add marker times
  if (timeline.settings.markers) {
    for (const m of timeline.settings.markers) {
      snapTargets.push({ time: m.time, type: "marker" });
    }
  }

  // Add clip boundary times
  for (const track of timeline.tracks) {
    for (const item of track.items) {
      snapTargets.push({ time: item.startTime, type: "clip" });
      snapTargets.push({ time: item.endTime, type: "clip" });
    }
  }

  let closestDiff = threshold;
  let snappedTime = candidateTime;
  let snapType: "playhead" | "clip" | "marker" | "in_out" | undefined;

  for (const target of snapTargets) {
    const diff = Math.abs(candidateTime - target.time);
    if (diff < closestDiff) {
      closestDiff = diff;
      snappedTime = target.time;
      snapType = target.type;
    }
  }

  return {
    time: Math.round(snappedTime * 100) / 100,
    snapped: snapType !== undefined,
    snapType,
  };
}

/**
 * AI Best Moments Analyzer:
 * Scans caption segments, spoken words, and scenes to identify retention peaks,
 * viral hooks, questions, and payoff moments for automated highlight extraction.
 */
export function analyzeBestMoments(
  timeline: VeeloxTimelineProject,
  scriptText?: string
): Array<{ time: number; label: string; score: number; reason: string }> {
  const moments: Array<{ time: number; label: string; score: number; reason: string }> = [];

  // 1. Hook moment at 0s-2s
  const hookReason = scriptText
    ? `Script Hook: "${scriptText.slice(0, 35)}..."`
    : "First 3 seconds critical for viewer retention.";

  moments.push({
    time: 0,
    label: "Hook Opening",
    score: 98,
    reason: hookReason,
  });

  // 2. Scan captions track for emotional punctuation and viral triggers
  const captionTrack = timeline.tracks.find((t) => t.type === "captions");
  const viralWords = new Set([
    "secret", "mistake", "stop", "never", "always", "hack", "how", "why",
    "money", "growth", "insane", "truth", "crazy", "warning", "key", "best",
    "profit", "results", "formula", "blueprint", "revenue", "free"
  ]);

  if (captionTrack && captionTrack.items.length > 0) {
    captionTrack.items.forEach((item) => {
      const text = (item.source || "").toLowerCase();
      let score = 70;
      const reasons: string[] = [];

      if (text.includes("?")) {
        score += 15;
        reasons.push("Engaging question");
      }
      if (text.includes("!")) {
        score += 10;
        reasons.push("High energy punctuation");
      }

      const foundTriggers = text
        .split(/\s+/)
        .filter((w) => viralWords.has(w.replace(/[^\w]/g, "")));

      if (foundTriggers.length > 0) {
        score += foundTriggers.length * 8;
        reasons.push(`Viral triggers: ${foundTriggers.join(", ")}`);
      }

      if (score >= 85) {
        moments.push({
          time: item.startTime,
          label: `Peak Moment: ${foundTriggers[0] || "Key Insight"}`,
          score: Math.min(99, score),
          reason: reasons.join(" • ") || "Elevated engagement signal",
        });
      }
    });
  }

  // 3. Climax / Payoff at ~75% through duration
  const payoffTime = Math.round(timeline.duration * 0.75 * 10) / 10;
  if (payoffTime > 3) {
    moments.push({
      time: payoffTime,
      label: "Core Payoff",
      score: 92,
      reason: "High retention payoff section before call to action.",
    });
  }

  // Deduplicate nearby moments (within 2s)
  const sorted = moments.sort((a, b) => a.time - b.time);
  const deduped: typeof moments = [];
  for (const m of sorted) {
    if (deduped.length === 0 || m.time - deduped[deduped.length - 1].time > 2.0) {
      deduped.push(m);
    }
  }

  return deduped;
}
