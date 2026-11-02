import {
  AspectRatio,
  VeeloxCaption,
  VeeloxScene,
  VeeloxTimeline,
  VeeloxTimelineClip,
  VeeloxTimelineTrack,
} from "./types";

export function buildTimeline(
  scenes: VeeloxScene[],
  captions: VeeloxCaption[] = [],
  aspectRatio: AspectRatio = "9:16",
  options?: {
    fps?: number;
    backgroundMusicUrl?: string;
    musicVolume?: number;
  }
): VeeloxTimeline {
  const fps = options?.fps || 30;
  const width = aspectRatio === "9:16" ? 1080 : aspectRatio === "16:9" ? 1920 : 1080;
  const height = aspectRatio === "9:16" ? 1920 : aspectRatio === "16:9" ? 1080 : 1080;

  // Calculate cumulative timestamps for each scene
  let currentTime = 0;
  const videoClips: VeeloxTimelineClip[] = [];
  const textClips: VeeloxTimelineClip[] = [];
  const voiceClips: VeeloxTimelineClip[] = [];

  scenes.forEach((scene, index) => {
    const sceneDuration = Math.max(2, scene.duration || 5);
    const startTime = currentTime;

    // Video / Visual clip
    videoClips.push({
      id: `clip_video_${scene.id}_${index}`,
      sceneId: scene.id,
      trackType: "video",
      startTime,
      duration: sceneDuration,
      content: scene.assetUrl,
      properties: {
        assetType: scene.assetType,
        animation: scene.animation || "ken_burns",
        transition: scene.transition || "fade",
      },
    });

    // On-screen text clip
    if (scene.onScreenText?.trim()) {
      textClips.push({
        id: `clip_text_${scene.id}_${index}`,
        sceneId: scene.id,
        trackType: "text",
        startTime: startTime + 0.3, // slight delay for impact
        duration: Math.max(1.5, sceneDuration - 0.6),
        content: scene.onScreenText,
      });
    }

    // Voiceover audio clip
    if (scene.voiceAudioUrl) {
      voiceClips.push({
        id: `clip_voice_${scene.id}_${index}`,
        sceneId: scene.id,
        trackType: "voice",
        startTime,
        duration: scene.voiceDuration || sceneDuration,
        content: scene.voiceAudioUrl,
      });
    }

    currentTime += sceneDuration;
  });

  const totalDuration = currentTime;

  // Compile Video Track
  const videoTracks: VeeloxTimelineTrack[] = [
    {
      id: "track_main_video",
      name: "Visuals",
      type: "video",
      clips: videoClips,
    },
    {
      id: "track_text_overlays",
      name: "Text Overlays",
      type: "text",
      clips: textClips,
    },
  ];

  // Compile Audio Track (Voice + Background Music)
  const audioTracks: VeeloxTimelineTrack[] = [
    {
      id: "track_voiceover",
      name: "Voiceover",
      type: "voice",
      volume: 1.0,
      clips: voiceClips,
    },
  ];

  if (options?.backgroundMusicUrl) {
    audioTracks.push({
      id: "track_music",
      name: "Background Music",
      type: "music",
      volume: options.musicVolume ?? 0.2,
      clips: [
        {
          id: "clip_bg_music",
          sceneId: "global",
          trackType: "music",
          startTime: 0,
          duration: totalDuration,
          content: options.backgroundMusicUrl,
        },
      ],
    });
  }

  return {
    duration: totalDuration,
    fps,
    resolution: { width, height },
    videoTracks,
    audioTracks,
    captionTrack: captions,
    backgroundMusicUrl: options?.backgroundMusicUrl,
    musicVolume: options?.musicVolume ?? 0.2,
  };
}

/**
 * Builds synchronized word-level captions from scenes with voice data
 */
export function buildCaptionsFromScenes(scenes: VeeloxScene[]): VeeloxCaption[] {
  let currentTime = 0;
  const captions: VeeloxCaption[] = [];

  scenes.forEach((scene, index) => {
    const sceneDuration = scene.duration || 5;
    const text = scene.voiceoverText.trim();
    if (!text) {
      currentTime += sceneDuration;
      return;
    }

    const words = text.split(/\s+/).filter(Boolean);
    const wordDur = sceneDuration / Math.max(1, words.length);

    const wordTimestamps = words.map((w, wIdx) => ({
      word: w,
      start: Number((currentTime + wIdx * wordDur).toFixed(2)),
      end: Number((currentTime + (wIdx + 1) * wordDur).toFixed(2)),
    }));

    captions.push({
      id: `caption_${scene.id}_${index}`,
      text,
      startTime: currentTime,
      endTime: currentTime + sceneDuration,
      words: wordTimestamps,
      style: {
        textColor: "#FFFFFF",
        highlightColor: "#00F298",
        position: "bottom",
        fontSize: 44,
      },
    });

    currentTime += sceneDuration;
  });

  return captions;
}
