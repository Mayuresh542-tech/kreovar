import {assertRenderSettings} from './settingsValidation';
import { fetchRenderMedia } from "./mediaDownload";
import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import os from "os";
import { getAdminClient } from "../adminAuth";
import { VeeloxTimelineProject, TimelineItem } from "../../timeline/types";
import { CAPTION_PRESETS, CaptionPresetId } from "../../captions/presets";

export interface RenderResult {
  success: boolean;
  outputUrl: string;
  duration: number;
  width: number;
  height: number;
  fileSize: number;
  jobId: string;
}

export interface RenderProgressCallback {
  (progress: number, message: string): Promise<void> | void;
}

/**
 * Converts seconds into ASS subtitle timestamp format: H:MM:SS.cs
 */
function formatAssTime(seconds: number): string {
  const s = Math.max(0, seconds);
  const hours = Math.floor(s / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  const secs = Math.floor(s % 60);
  const centiseconds = Math.floor((s % 1) * 100);

  const mm = String(minutes).padStart(2, "0");
  const ss = String(secs).padStart(2, "0");
  const cs = String(centiseconds).padStart(2, "0");

  return `${hours}:${mm}:${ss}.${cs}`;
}

/**
 * Downloads a remote URL to a local destination file.
 */
async function downloadAsset(url: string, destPath: string, timeoutMs = 30000): Promise<boolean> {
  try {
    const buffer = await fetchRenderMedia(url, timeoutMs);
    await fs.promises.writeFile(destPath, buffer);
    return true;
  } catch (err) {
    console.warn(`[FFmpegRenderer] Error downloading asset ${url}:`, err);
    return false;
  }
}

/**
 * Generates an Advanced Substation Alpha (ASS) file from the timeline captions track
 * matching Veelox presets (Clean, Bold, Highlight, Minimal, Creator).
 */
function generateAssSubtitles(timeline: VeeloxTimelineProject): string {
  const { width, height } = timeline.resolution;
  const presetId = (timeline.settings?.captionPreset || "clean") as CaptionPresetId;
  const position = timeline.settings?.captionPosition || "center";
  const preset = CAPTION_PRESETS[presetId] || CAPTION_PRESETS.clean;

  // Map alignment for ASS (NumPad style: 2=bottom-center, 5=middle-center, 8=top-center)
  let alignment = 2; // bottom
  let marginV = Math.round(height * 0.14); // 14% from bottom
  if (position === "center") {
    alignment = 5; // middle-center
    marginV = 0;
  } else if (position === "top") {
    alignment = 8; // top-center
    marginV = Math.round(height * 0.12);
  }

  // Calculate scaled font size based on video height
  const baseFontSize =
    presetId === "bold" || presetId === "creator"
      ? Math.round(height * 0.046) // ~88px on 1920
      : Math.round(height * 0.038); // ~72px on 1920

  // ASS uses BGR hex: &H00BBGGRR&
  const primaryColor = "&H00FFFFFF&"; // pure white
  let highlightColor = "&H0015CCFA&"; // default bright yellow/gold
  if (presetId === "clean") highlightColor = "&H00F8BD38&"; // sky blue
  if (presetId === "creator") highlightColor = "&H0080DE4A&"; // neon green

  const fontName = presetId === "bold" || presetId === "creator" ? "Impact" : "Arial";
  const outlineWidth = presetId === "minimal" ? 2 : 4;
  const shadowDepth = presetId === "minimal" ? 1 : 3;

  let ass = `[Script Info]
ScriptType: v4.00+
PlayResX: ${width}
PlayResY: ${height}
WrapStyle: 0
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Main,${fontName},${baseFontSize},${primaryColor},${highlightColor},&H00000000,&H80000000,-1,0,0,0,100,100,1,0,1,${outlineWidth},${shadowDepth},${alignment},60,60,${marginV},1

[Events]
Format: Marked, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

  const captionTrack = timeline.tracks.find((t) => t.type === "captions");
  if (!captionTrack || captionTrack.items.length === 0) {
    return ass;
  }

  for (const item of captionTrack.items) {
    const seg = item.metadata?.captionSegment;
    const startTimeStr = formatAssTime(item.startTime);
    const endTimeStr = formatAssTime(item.endTime);

    if (seg && seg.words && seg.words.length > 0) {
      // Generate word-highlighted timed sub-events for maximum kinetic polish
      for (let wIdx = 0; wIdx < seg.words.length; wIdx++) {
        const activeWord = seg.words[wIdx];
        const wStartStr = formatAssTime(activeWord.start);
        const wEndStr = formatAssTime(activeWord.end);

        // Build text with active word highlighted
        const formattedWords = seg.words.map((w, idx) => {
          const clean = w.word.toUpperCase();
          if (idx === wIdx) {
            return `{\\c${highlightColor}\\fscx108\\fscy108}${clean}{\\c${primaryColor}\\fscx100\\fscy100}`;
          }
          return clean;
        });

        ass += `Dialogue: 0,${wStartStr},${wEndStr},Main,,0,0,0,,${formattedWords.join(" ")}\n`;
      }
    } else {
      // Standard segment dialogue line
      const cleanText = item.source.toUpperCase();
      ass += `Dialogue: 0,${startTimeStr},${endTimeStr},Main,,0,0,0,,${cleanText}\n`;
    }
  }

  return ass;
}

/**
 * Compiles and renders the timeline into a production-ready MP4 using FFmpeg.
 */
export async function renderTimelineWithFFmpeg(
  timeline: VeeloxTimelineProject,
  jobId: string,
  onProgress?: RenderProgressCallback
): Promise<RenderResult> {
  assertRenderSettings(timeline.settings);
  const startTime = Date.now();
  const scratchDir = path.join(os.tmpdir(), `veelox_render_${jobId}`);
  await fs.promises.mkdir(scratchDir, { recursive: true });

  const { width, height } = timeline.resolution;
  const totalDuration = Math.max(3, timeline.duration);

  try {
    await onProgress?.(5, "Preparing video compilation assets...");

    // 1. Collect and download video clips
    const videoTrack = timeline.tracks.find((t) => t.type === "video");
    const rawClips = videoTrack?.items || [];

    const localClipFiles: Array<{ path: string; duration: number; animation: string }> = [];

    for (let i = 0; i < rawClips.length; i++) {
      const clip = rawClips[i];
      const clipFileName = `clip_${i}.mp4`;
      const clipDest = path.join(scratchDir, clipFileName);

      await onProgress?.(
        Math.min(25, 5 + Math.round((i / Math.max(1, rawClips.length)) * 20)),
        `Downloading B-roll footage ${i + 1}/${rawClips.length}...`
      );

      const downloaded = await downloadAsset(clip.source, clipDest);
      if (!downloaded) throw new Error("An original clip could not be downloaded. Relink it and retry.");
      if (downloaded) {
        localClipFiles.push({
          path: clipFileName,
          duration: clip.duration,
          animation: clip.animation || "none",
        });
      } else {
        // Fallback: Generate a clean solid gradient video using ffmpeg color filter
        const fallbackName = `clip_fallback_${i}.mp4`;
        const fallbackPath = path.join(scratchDir, fallbackName);

        await new Promise<void>((resolve, reject) => {
          const gen = spawn(
            "ffmpeg",
            [
              "-y",
              "-f",
              "lavfi",
              "-i",
              `color=c=0x0E1322:s=${width}x${height}:d=${clip.duration}:r=30`,
              "-c:v",
              "libx264",
              "-pix_fmt",
              "yuv420p",
              fallbackName,
            ],
            { cwd: scratchDir }
          );
          gen.on("close", (code) => {
            if (code === 0) {
              localClipFiles.push({
                path: fallbackName,
                duration: clip.duration,
                animation: "none",
              });
              resolve();
            } else {
              reject(new Error(`Failed to generate fallback clip ${i}`));
            }
          });
        });
      }
    }

    if (localClipFiles.length === 0) {
      // Guarantee at least one video background
      const baseClipName = "base_clip.mp4";
      await new Promise<void>((resolve, reject) => {
        const gen = spawn(
          "ffmpeg",
          [
            "-y",
            "-f",
            "lavfi",
            "-i",
            `color=c=0x0A0D14:s=${width}x${height}:d=${totalDuration}:r=30`,
            "-c:v",
            "libx264",
            "-pix_fmt",
            "yuv420p",
            baseClipName,
          ],
          { cwd: scratchDir }
        );
        gen.on("close", (code) => (code === 0 ? resolve() : reject(new Error("Failed base clip"))));
      });
      localClipFiles.push({ path: baseClipName, duration: totalDuration, animation: "none" });
    }

    // 2. Collect and download voiceover audio
    const voiceoverTrack = timeline.tracks.find((t) => t.type === "voiceover");
    const voiceoverItem = voiceoverTrack?.items?.[0];
    let localVoiceoverName: string | null = null;

    if (voiceoverItem?.source) {
      await onProgress?.(30, "Syncing spoken voiceover audio...");
      const voName = "voiceover.mp3";
      const voPath = path.join(scratchDir, voName);
      const voDownloaded = await downloadAsset(voiceoverItem.source, voPath);
      if (!voDownloaded) throw new Error("Voiceover could not be downloaded. Regenerate or relink it.");
      if (voDownloaded) {
        localVoiceoverName = voName;
      }
    }

    // 3. Collect and download background music
    const musicTrack = timeline.tracks.find((t) => t.type === "music");
    const musicItem = musicTrack?.items?.[0];
    let localMusicName: string | null = null;

    if (musicItem?.source) {
      await onProgress?.(35, "Configuring background music & audio ducking...");
      const musicName = "music.mp3";
      const musicPath = path.join(scratchDir, musicName);
      const musicDownloaded = await downloadAsset(musicItem.source, musicPath);
      if (!musicDownloaded) throw new Error("Music could not be downloaded. Remove or replace it.");
      if (musicDownloaded) {
        localMusicName = musicName;
      }
    }

    // 4. Check for watermark
    const watermarkConfig = timeline.settings?.watermark;
    let localWatermarkName: string | null = null;
    if (watermarkConfig?.enabled && watermarkConfig.logoUrl) {
      const wmName = "watermark.png";
      const wmPath = path.join(scratchDir, wmName);
      const wmDownloaded = await downloadAsset(watermarkConfig.logoUrl, wmPath);
      if (!wmDownloaded) throw new Error("Watermark could not be downloaded. Remove or replace it.");
      if (wmDownloaded) {
        localWatermarkName = wmName;
      }
    }

    // 5. Generate ASS subtitles file
    await onProgress?.(40, "Generating kinetic subtitle overlays...");
    const assContent = generateAssSubtitles(timeline);
    const assFileName = "subtitles.ass";
    await fs.promises.writeFile(path.join(scratchDir, assFileName), assContent, "utf-8");

    // 6. Construct FFmpeg filtergraph
    await onProgress?.(45, "Building composition graph & visual motion...");

    const fps = timeline.settings?.fps || 30;
    const ffmpegArgs: string[] = ["-y"];

    // Add Video Inputs
    for (const clip of localClipFiles) {
      ffmpegArgs.push("-protocol_whitelist", "file,pipe", "-i", clip.path);
    }

    // Add Watermark Input if present
    let watermarkInputIndex = -1;
    if (localWatermarkName) {
      watermarkInputIndex = localClipFiles.length;
      ffmpegArgs.push("-i", localWatermarkName);
    }

    // Add Audio Inputs
    let voiceoverInputIndex = -1;
    if (localVoiceoverName) {
      voiceoverInputIndex = localClipFiles.length + (localWatermarkName ? 1 : 0);
      ffmpegArgs.push("-i", localVoiceoverName);
    }

    let musicInputIndex = -1;
    if (localMusicName) {
      musicInputIndex =
        localClipFiles.length +
        (localWatermarkName ? 1 : 0) +
        (localVoiceoverName ? 1 : 0);
      ffmpegArgs.push("-i", localMusicName);
    }

    // Build Video Filtergraph
    const filterParts: string[] = [];

    // Scale, crop, speed, color, filter, and animate each clip
    for (let i = 0; i < localClipFiles.length; i++) {
      const clip = localClipFiles[i];
      const rawClipItem = rawClips[i];
      const dur = Math.max(1, clip.duration);
      const speed = rawClipItem?.speed && rawClipItem.speed > 0 ? rawClipItem.speed : 1.0;

      // Base scaling & crop
      let filterChain = `[${i}:v]trim=duration=${dur},setpts=${(1 / speed).toFixed(4)}*(PTS-STARTPTS),scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height}:(in_w-${width})/2:(in_h-${height})/2,setsar=1,fps=${fps}`;

      // Ken Burns Motion Animation
      if (clip.animation === "slow_zoom_in") {
        filterChain += `,zoompan=z='min(zoom+0.0012,1.12)':d=${Math.round(dur * fps)}:s=${width}x${height}:fps=${fps}`;
      } else if (clip.animation === "slow_zoom_out") {
        filterChain += `,zoompan=z='max(1.12-0.0012*on,1.0)':d=${Math.round(dur * fps)}:s=${width}x${height}:fps=${fps}`;
      }

      // Color Adjustments (Brightness, Contrast, Saturation)
      if (rawClipItem?.colorAdjustments) {
        const ca = rawClipItem.colorAdjustments;
        const b = Math.max(-1, Math.min(1, ca.brightness / 100)).toFixed(2);
        const c = Math.max(0.1, Math.min(3, 1 + ca.contrast / 100)).toFixed(2);
        const s = Math.max(0, Math.min(3, 1 + ca.saturation / 100)).toFixed(2);
        filterChain += `,eq=brightness=${b}:contrast=${c}:saturation=${s}`;
      }

      // Filter Presets
      if (rawClipItem?.filterPreset && rawClipItem.filterPreset !== "none") {
        const fp = rawClipItem.filterPreset;
        if (fp === "cinematic") {
          filterChain += `,eq=contrast=1.15:saturation=0.9:brightness=-0.02`;
        } else if (fp === "warm") {
          filterChain += `,colorbalance=rs=0.1:gs=0.03:bs=-0.08`;
        } else if (fp === "cool") {
          filterChain += `,colorbalance=rs=-0.06:gs=0.02:bs=0.12`;
        } else if (fp === "vintage") {
          filterChain += `,eq=contrast=1.1:saturation=0.85`;
        } else if (fp === "bw") {
          filterChain += `,hue=s=0`;
        } else if (fp === "film") {
          filterChain += `,eq=contrast=1.2:saturation=0.92`;
        }
      }

      filterChain += `[v${i}]`;
      filterParts.push(filterChain);
    }

    // Concatenate all visual clips
    const concatInputs = localClipFiles.map((_, i) => `[v${i}]`).join("");
    filterParts.push(`${concatInputs}concat=n=${localClipFiles.length}:v=1:a=0[vconcat]`);

    // Burn-in ASS Subtitles
    let currentVNode = "vsubbed";
    filterParts.push(`[vconcat]ass=${assFileName}[${currentVNode}]`);

    // Overlay Watermark if present
    if (watermarkInputIndex !== -1 && watermarkConfig) {
      const wmScale = watermarkConfig.scale || 0.15;
      const wmOpacity = watermarkConfig.opacity || 0.8;
      const wmWidth = Math.round(width * wmScale);
      const pos = watermarkConfig.position || "top-right";

      let overlayX = "W-w-30";
      let overlayY = "30";
      if (pos === "top-left") {
        overlayX = "30";
        overlayY = "30";
      } else if (pos === "bottom-left") {
        overlayX = "30";
        overlayY = "H-h-50";
      } else if (pos === "bottom-right") {
        overlayX = "W-w-30";
        overlayY = "H-h-50";
      }

      filterParts.push(
        `[${watermarkInputIndex}:v]scale=${wmWidth}:-1,format=rgba,colorchannelmixer=aa=${wmOpacity.toFixed(2)}[wm]`,
        `[${currentVNode}][wm]overlay=x=${overlayX}:y=${overlayY}[vout]`
      );
    } else {
      filterParts.push(`[${currentVNode}]null[vout]`);
    }

    // Build Audio Mixing Filtergraph
    const musicVolume = timeline.settings?.musicVolume ?? 0.16;

    if (voiceoverInputIndex !== -1 && musicInputIndex !== -1) {
      // Both Voiceover & Background Music with Auto-Ducking
      filterParts.push(
        `[${voiceoverInputIndex}:a]volume=1.0[avoice]`,
        `[${musicInputIndex}:a]aloop=loop=-1:size=2e+09,volume=${musicVolume},afade=t=in:st=0:d=1.5,afade=t=out:st=${Math.max(
          1,
          totalDuration - 2
        )}:d=2[amusic]`,
        `[amusic][avoice]sidechaincompress=threshold=0.08:ratio=4:attack=50:release=350[aducked]`,
        `[aducked][avoice]amix=inputs=2:duration=first:dropout_transition=2,volume=1.1[aout]`
      );
    } else if (voiceoverInputIndex !== -1) {
      // Only Voiceover
      filterParts.push(
        `[${voiceoverInputIndex}:a]volume=1.0,aformat=sample_fmts=fltp:sample_rates=44100:channel_layouts=stereo[aout]`
      );
    } else if (musicInputIndex !== -1) {
      // Only Background Music
      filterParts.push(
        `[${musicInputIndex}:a]aloop=loop=-1:size=2e+09,volume=${musicVolume},afade=t=in:st=0:d=1.5,afade=t=out:st=${Math.max(
          1,
          totalDuration - 2
        )}:d=2,aformat=sample_fmts=fltp:sample_rates=44100:channel_layouts=stereo[aout]`
      );
    } else {
      // Silent audio track fallback
      filterParts.push(`anullsrc=r=44100:cl=stereo:d=${totalDuration}[aout]`);
    }

    const outputFileName = `render_output_${jobId}.mp4`;
    const outputPath = path.join(scratchDir, outputFileName);

    ffmpegArgs.push(
      "-filter_complex",
      filterParts.join(";"),
      "-map",
      "[vout]",
      "-map",
      "[aout]",
      "-t",
      String(totalDuration),
      "-c:v",
      "libx264",
      "-preset",
      "fast",
      "-crf",
      "22",
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "aac",
      "-b:a",
      "192k",
      "-ar",
      "44100",
      "-movflags",
      "+faststart",
      outputFileName
    );

    // 6. Execute FFmpeg process and monitor progress
    await onProgress?.(50, "Rendering frames and mixing audio (FFmpeg)...");

    await new Promise<void>((resolve, reject) => {
      const proc = spawn("ffmpeg", ffmpegArgs, { cwd: scratchDir });

      let lastPercent = 50;

      proc.stderr.on("data", (chunk: Buffer) => {
        const text = chunk.toString();
        // Match time=HH:MM:SS.cs to estimate progress
        const timeMatch = text.match(/time=(\d{2}):(\d{2}):(\d{2}\.\d{2})/);
        if (timeMatch) {
          const hours = parseFloat(timeMatch[1]);
          const minutes = parseFloat(timeMatch[2]);
          const seconds = parseFloat(timeMatch[3]);
          const currentRenderSeconds = hours * 3600 + minutes * 60 + seconds;
          const ratio = Math.min(1.0, currentRenderSeconds / totalDuration);
          const computedPercent = Math.round(50 + ratio * 40); // maps 50% -> 90%

          if (computedPercent > lastPercent) {
            lastPercent = computedPercent;
            void onProgress?.(computedPercent, `Encoding video frames (${Math.round(ratio * 100)}%)...`);
          }
        }
      });

      proc.on("error", (err) => {
        console.error("[FFmpegRenderer] FFmpeg spawn error:", err);
        reject(err);
      });

      proc.on("close", (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`FFmpeg exited with non-zero code ${code}`));
        }
      });
    });

    // 7. Upload final rendered MP4 to Supabase Storage bucket 'videos'
    await onProgress?.(92, "Uploading final publish-ready MP4 to cloud storage...");

    const fileBytes = await fs.promises.readFile(outputPath);
    const adminDb = getAdminClient();
    const job=await adminDb.from("render_jobs").select("user_id").eq("id",jobId).single();
    if(job.error||!job.data?.user_id)throw new Error("Render owner unavailable.");
    const storagePath = `${job.data.user_id}/rendered/${jobId}.mp4`;

    const { error: uploadError } = await adminDb.storage
      .from("videos")
      .upload(storagePath, fileBytes, {
        contentType: "video/mp4",
        upsert: true,
      });

    if (uploadError) {
      throw new Error(`Failed to upload rendered video to storage: ${uploadError.message}`);
    }

    const { data: pubData } = adminDb.storage.from("videos").getPublicUrl(storagePath);
    const outputUrl = pubData.publicUrl;

    await onProgress?.(100, "Render complete! Your video is ready.");

    const renderTime = (Date.now() - startTime) / 1000;
    console.log(`[FFmpegRenderer] Video render completed in ${renderTime.toFixed(1)}s.`);

    return {
      success: true,
      outputUrl,
      duration: totalDuration,
      width,
      height,
      fileSize: fileBytes.length,
      jobId,
    };
  } finally {
    // 8. Clean up temporary scratch directory
    try {
      await fs.promises.rm(scratchDir, { recursive: true, force: true });
    } catch (cleanupErr) {
      console.warn("[FFmpegRenderer] Failed to remove scratch dir:", cleanupErr);
    }
  }
}
