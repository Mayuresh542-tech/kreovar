/**
 * Audio Waveform Peak Extractor & Cache
 *
 * Extracts peak samples (0..1 Float32Array) from audio sources (URLs, Blobs, ArrayBuffers)
 * using OfflineAudioContext.decodeAudioData() or AudioContext, caching results in-memory
 * to optimize timeline scrubbing and rendering performance.
 */

// In-memory cache for audio peaks keyed by source URL or custom key
export const waveformCache = new Map<string, Float32Array>();

/**
 * Retrieves the global in-memory waveform cache map.
 */
export function getWaveformCache(): Map<string, Float32Array> {
  return waveformCache;
}

/**
 * Manually populates peak samples for a given key. Useful for tests or preloaded tracks.
 */
export function setWaveformCache(key: string, peaks: Float32Array): void {
  waveformCache.set(key, peaks);
}

/**
 * Clears the in-memory waveform cache.
 */
export function clearWaveformCache(): void {
  waveformCache.clear();
}

/**
 * Normalizes channels and computes peak amplitudes (0..1) from an AudioBuffer.
 * Samples are downsampled into `samplesCount` buckets taking the maximum absolute amplitude.
 */
export function extractPeaksFromAudioBuffer(
  audioBuffer: AudioBuffer,
  samplesCount = 800
): Float32Array {
  const numChannels = audioBuffer.numberOfChannels;
  const totalLength = audioBuffer.length;
  const count = Math.max(1, Math.min(samplesCount, totalLength));
  const blockSize = Math.floor(totalLength / count) || 1;
  const peaks = new Float32Array(count);

  const channels: Float32Array[] = [];
  for (let c = 0; c < numChannels; c++) {
    channels.push(audioBuffer.getChannelData(c));
  }

  for (let i = 0; i < count; i++) {
    const start = i * blockSize;
    const end = i === count - 1 ? totalLength : Math.min(totalLength, start + blockSize);
    let max = 0;

    for (let c = 0; c < numChannels; c++) {
      const data = channels[c];
      for (let j = start; j < end; j++) {
        const val = Math.abs(data[j]);
        if (val > max) max = val;
      }
    }

    // Clamp peak to [0, 1]
    peaks[i] = Math.min(1, Math.max(0, max));
  }

  return peaks;
}

/**
 * Creates an OfflineAudioContext or AudioContext across browser implementations.
 */
function createAudioContext(): OfflineAudioContext | AudioContext | null {
  if (typeof window === "undefined") return null;

  const OfflineCtx =
    window.OfflineAudioContext ||
    (window as unknown as { webkitOfflineAudioContext?: typeof OfflineAudioContext })
      .webkitOfflineAudioContext;

  if (OfflineCtx) {
    try {
      return new OfflineCtx(1, 44100, 44100);
    } catch {
      // Fall through to standard AudioContext
    }
  }

  const AudioCtx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;

  if (AudioCtx) {
    try {
      return new AudioCtx();
    } catch {
      // AudioContext could fail without user interaction in strict environments
    }
  }

  return null;
}

/**
 * Safely decodes an ArrayBuffer using OfflineAudioContext or AudioContext.
 */
export async function decodeAudioBuffer(
  arrayBuffer: ArrayBuffer,
  customContext?: OfflineAudioContext | AudioContext
): Promise<AudioBuffer> {
  const ctx = customContext || createAudioContext();
  if (!ctx) {
    throw new Error("Web Audio API (OfflineAudioContext/AudioContext) not available.");
  }

  return new Promise<AudioBuffer>((resolve, reject) => {
    // Clone array buffer because decodeAudioData detaches the buffer in some browsers
    const bufferCopy = arrayBuffer.slice(0);
    const result = ctx.decodeAudioData(
      bufferCopy,
      (decoded) => resolve(decoded),
      (err) => reject(err)
    );

    if (result && typeof (result as Promise<AudioBuffer>).then === "function") {
      (result as Promise<AudioBuffer>).then(resolve).catch(reject);
    }
  });
}

export interface ExtractAudioPeaksOptions {
  samplesCount?: number;
  cacheKey?: string;
  audioContext?: OfflineAudioContext | AudioContext;
}

/**
 * Extracts normalized peak samples (0..1 Float32Array) for an audio source (URL, Blob, or ArrayBuffer).
 * Uses in-memory cache to avoid redundant network fetches and audio decoding.
 */
export async function extractAudioPeaks(
  source: string | ArrayBuffer | Blob,
  options?: ExtractAudioPeaksOptions
): Promise<Float32Array> {
  const samplesCount = options?.samplesCount ?? 800;
  const cacheKey = options?.cacheKey ?? (typeof source === "string" ? source : undefined);

  if (cacheKey && waveformCache.has(cacheKey)) {
    return waveformCache.get(cacheKey)!;
  }

  let arrayBuffer: ArrayBuffer;
  if (typeof source === "string") {
    try {
      const res = await fetch(source);
      if (!res.ok) {
        throw new Error(`Failed to fetch audio: ${res.statusText}`);
      }
      arrayBuffer = await res.arrayBuffer();
    } catch (fetchErr) {
      console.warn(`[audioWaveform] Could not load audio from ${source}:`, fetchErr);
      const fallback = new Float32Array(samplesCount);
      if (cacheKey) waveformCache.set(cacheKey, fallback);
      return fallback;
    }
  } else if (typeof Blob !== "undefined" && source instanceof Blob) {
    arrayBuffer = await source.arrayBuffer();
  } else if (source instanceof ArrayBuffer) {
    arrayBuffer = source;
  } else {
    const fallback = new Float32Array(samplesCount);
    if (cacheKey) waveformCache.set(cacheKey, fallback);
    return fallback;
  }

  try {
    const audioBuffer = await decodeAudioBuffer(arrayBuffer, options?.audioContext);
    const peaks = extractPeaksFromAudioBuffer(audioBuffer, samplesCount);
    if (cacheKey) {
      waveformCache.set(cacheKey, peaks);
    }
    return peaks;
  } catch (decodeErr) {
    console.warn("[audioWaveform] Failed to decode audio data:", decodeErr);
    const fallback = new Float32Array(samplesCount);
    if (cacheKey) waveformCache.set(cacheKey, fallback);
    return fallback;
  }
}

/**
 * Slices a waveform peak array by clip sourceStartTime/sourceEndTime within totalDuration,
 * and downsamples into `targetBars` bars for rendering in the timeline SVG.
 */
export function sliceWaveformPeaks(
  peaks: Float32Array,
  sourceStartTime: number,
  sourceEndTime: number,
  totalDuration: number,
  targetBars = 60
): Float32Array {
  const count = Math.max(1, targetBars);
  const result = new Float32Array(count);
  if (!peaks || peaks.length === 0) {
    return result;
  }

  const duration = totalDuration > 0 ? totalDuration : Math.max(sourceEndTime, 0.001);
  const safeStart = Math.max(0, Math.min(duration, sourceStartTime));
  const safeEnd = Math.max(safeStart, Math.min(duration, sourceEndTime));

  const startFrac = safeStart / duration;
  const endFrac = safeEnd / duration;

  const startIdx = Math.min(peaks.length - 1, Math.floor(startFrac * peaks.length));
  const endIdx = Math.max(startIdx + 1, Math.min(peaks.length, Math.ceil(endFrac * peaks.length)));
  const sliceLen = endIdx - startIdx;

  if (sliceLen <= 0) {
    return result;
  }

  const step = sliceLen / count;
  for (let i = 0; i < count; i++) {
    const binStart = startIdx + Math.floor(i * step);
    const binEnd = Math.min(endIdx, startIdx + Math.max(binStart + 1, Math.ceil((i + 1) * step)));
    let maxVal = 0;
    for (let j = binStart; j < binEnd; j++) {
      if (j < peaks.length && peaks[j] > maxVal) {
        maxVal = peaks[j];
      }
    }
    result[i] = Math.min(1, Math.max(0, maxVal));
  }

  return result;
}
