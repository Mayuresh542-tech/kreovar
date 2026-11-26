import { analysisFootage } from "./footageContext";
import { MAX_VIDEO_SECONDS } from "./limits";
import type { Clip, EditorProject, MediaAsset } from "./model";

export interface UploadedAiVideoFile {
  uri: string;
  mimeType: string;
}

const MAX_DIRECT_UPLOAD_BYTES = 12 * 1024 * 1024;
const SUPPORTED_VIDEO_MIMES = new Set(["video/mp4", "video/webm", "video/quicktime"]);

function inferVideoMime(blob: Blob, asset: MediaAsset): string {
  const base = (blob.type || asset.mime || "").split(";")[0].trim().toLowerCase();
  if (SUPPORTED_VIDEO_MIMES.has(base)) return base;
  const ext = asset.name.split(".").pop()?.toLowerCase();
  if (ext === "webm") return "video/webm";
  if (ext === "mov") return "video/quicktime";
  return "video/mp4";
}

async function resolveFetchableVideoUrl(
  rawUrl: string,
  token: string,
  signal: AbortSignal
): Promise<string> {
  if (!rawUrl.startsWith("/api/assets/") || !rawUrl.includes("/file")) {
    return rawUrl;
  }
  const sep = rawUrl.includes("?") ? "&" : "?";
  const res = await fetch(`${rawUrl}${sep}preview=1`, {
    headers: { Authorization: `Bearer ${token}` },
    signal,
  });
  if (!res.ok) return rawUrl;
  const json = (await res.json().catch(() => null)) as { url?: string } | null;
  return json?.url || rawUrl;
}

async function buildCompactVideoProxy(
  sourceUrl: string,
  clip: Clip,
  asset: MediaAsset,
  signal: AbortSignal
): Promise<{ blob: Blob; mimeType: string; name: string } | undefined> {
  if (typeof document === "undefined") return undefined;
  try {
    const mediabunny = await import("mediabunny");
    const { Output, Mp4OutputFormat, BufferTarget, CanvasSource, Quality, canEncodeVideo } = mediabunny;

    const srcW = Math.max(1, asset.width || 720);
    const srcH = Math.max(1, asset.height || 1280);
    const scale = Math.min(1, 360 / Math.max(srcW, srcH));
    // H.264 requires even width and height.
    const width = Math.max(2, Math.round((srcW * scale) / 2) * 2);
    const height = Math.max(2, Math.round((srcH * scale) / 2) * 2);
    const start = Math.max(0, clip.sourceStart);
    const span = Math.min(MAX_VIDEO_SECONDS, Math.max(0.5, clip.sourceEnd - start));
    const fps = span > 120 ? 1 : 2;
    const bitrate = span > 150 ? 220_000 : 450_000;

    const encodable = await canEncodeVideo("avc", {
      width,
      height,
      frameRate: fps,
      quality: new Quality({ bitrate }),
    });
    if (!encodable) return undefined;

    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";
    video.crossOrigin = "anonymous";

    const waitEvent = (event: string) =>
      new Promise<void>((resolve, reject) => {
        const done = (err?: Error) => {
          clearTimeout(timer);
          video.removeEventListener(event, onReady);
          video.removeEventListener("error", onErr);
          signal.removeEventListener("abort", onAbort);
          if (err) reject(err);
          else resolve();
        };
        const onReady = () => done();
        const onErr = () => done(new Error("Proxy decode failed."));
        const onAbort = () => done(new DOMException("Cancelled", "AbortError"));
        const timer = setTimeout(() => done(new Error("Proxy decode timed out.")), 12000);
        video.addEventListener(event, onReady, { once: true });
        video.addEventListener("error", onErr, { once: true });
        signal.addEventListener("abort", onAbort, { once: true });
        if (signal.aborted) onAbort();
      });

    try {
      const loaded = waitEvent("loadeddata");
      video.src = sourceUrl;
      video.load();
      await loaded;

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) return undefined;

      const target = new BufferTarget();
      const output = new Output({
        format: new Mp4OutputFormat({ fastStart: "in-memory" }),
        target,
      });
      const videoSource = new CanvasSource(canvas, {
        codec: "avc",
        quality: new Quality({ bitrate }),
      });
      output.addVideoTrack(videoSource, { frameRate: fps });
      await output.start();

      const frameCount = Math.max(2, Math.min(300, Math.ceil(span * fps)));

      for (let i = 0; i < frameCount; i++) {
        signal.throwIfAborted();
        const t = Math.min(start + span - 0.01, start + i / fps);
        if (Math.abs(video.currentTime - t) > 0.02) {
          const sought = waitEvent("seeked");
          video.currentTime = t;
          await sought;
        }
        ctx.drawImage(video, 0, 0, width, height);
        await videoSource.add(i / fps, 1 / fps);
      }

      videoSource.close();
      await output.finalize();
      if (!target.buffer?.byteLength || target.buffer.byteLength > MAX_DIRECT_UPLOAD_BYTES) {
        return undefined;
      }
      return {
        blob: new Blob([target.buffer], { type: "video/mp4" }),
        mimeType: "video/mp4",
        name: "kreovar-ai-proxy.mp4",
      };
    } finally {
      video.pause();
      video.removeAttribute("src");
      video.load();
    }
  } catch {
    return undefined;
  }
}

/**
 * Prepares and uploads a compact video proxy for native Gemini video perception.
 * Never throws: returns undefined on missing media, size limits, or unconfigured backend
 * so AI planning transparently falls back to sampled frames.
 */
export async function captureVideoFileForAi(
  project: EditorProject,
  selection: string[],
  resolve: (asset: MediaAsset) => Promise<string>,
  token: string,
  signal: AbortSignal,
  cache?: Map<string, UploadedAiVideoFile | null>
): Promise<UploadedAiVideoFile | undefined> {
  if (typeof fetch !== "function" || typeof FormData === "undefined" || !token) return undefined;

  const clips = analysisFootage(project, selection);
  const primary = clips[0];
  const asset = primary?.assetId ? project.assets[primary.assetId] : undefined;
  if (!primary || !asset) return undefined;

  const cacheKey = `${project.id}:${asset.id}:${asset.size}:${Math.round(primary.sourceStart * 100)}:${Math.round(primary.sourceEnd * 100)}`;
  if (cache?.has(cacheKey)) {
    return cache.get(cacheKey) || undefined;
  }

  try {
    const boundedSignal = AbortSignal.any([signal, AbortSignal.timeout(45000)]);
    const rawUrl = await resolve(asset);
    boundedSignal.throwIfAborted();
    const sourceUrl = await resolveFetchableVideoUrl(rawUrl, token, boundedSignal);

    let uploadBlob: Blob;
    let mimeType: string;
    let fileName: string;

    if (asset.size > MAX_DIRECT_UPLOAD_BYTES) {
      // Stream directly from sourceUrl for oversized originals instead of buffering full bytes in JS heap.
      const proxy = await buildCompactVideoProxy(sourceUrl, primary, asset, boundedSignal);
      if (!proxy) {
        cache?.set(cacheKey, null);
        return undefined;
      }
      uploadBlob = proxy.blob;
      mimeType = proxy.mimeType;
      fileName = proxy.name;
    } else {
      const mediaRes = await fetch(
        sourceUrl,
        sourceUrl.startsWith("/") ? { headers: { Authorization: `Bearer ${token}` }, signal: boundedSignal } : { signal: boundedSignal }
      );
      if (!mediaRes.ok) return undefined;
      const rawBlob = await mediaRes.blob();
      if (!rawBlob.size) return undefined;

      if (rawBlob.size > MAX_DIRECT_UPLOAD_BYTES) {
        const proxy = await buildCompactVideoProxy(sourceUrl, primary, asset, boundedSignal);
        if (!proxy) {
          cache?.set(cacheKey, null);
          return undefined;
        }
        uploadBlob = proxy.blob;
        mimeType = proxy.mimeType;
        fileName = proxy.name;
      } else {
        uploadBlob = rawBlob;
        mimeType = inferVideoMime(rawBlob, asset);
        fileName = asset.name || "kreovar-preview.mp4";
      }
    }

    const form = new FormData();
    form.append("projectId", project.id);
    form.append("file", uploadBlob, fileName);

    const uploadRes = await fetch("/api/editor/ai-video", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: form,
      signal: boundedSignal,
    });

    if (!uploadRes.ok) {
      if (uploadRes.status === 503 || uploadRes.status === 401 || uploadRes.status === 404) {
        cache?.set(cacheKey, null);
      }
      return undefined;
    }

    const json = (await uploadRes.json().catch(() => null)) as { uri?: string; mimeType?: string } | null;
    if (!json?.uri) return undefined;

    const uploaded: UploadedAiVideoFile = {
      uri: json.uri,
      mimeType: json.mimeType || mimeType,
    };
    cache?.set(cacheKey, uploaded);
    return uploaded;
  } catch {
    return undefined;
  }
}
