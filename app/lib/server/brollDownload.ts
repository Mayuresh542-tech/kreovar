import { MAX_DOWNLOAD_BYTES, attachmentHeader, mediaFilename, mediaType } from "../media/download";

export function allowedDownloadUrl(raw: string, storageUrl = process.env.NEXT_PUBLIC_SUPABASE_URL): URL {
  const url = new URL(raw);
  if (raw.length > 4096 || url.protocol !== "https:" || url.username || url.password || url.port || url.hash) throw new Error("Unsupported B-roll URL.");
  const stock = url.hostname === "videos.pexels.com" || (url.hostname === "cdn.pixabay.com" && url.pathname.startsWith("/video/"));
  const storage = storageUrl ? new URL(storageUrl) : undefined;
  const uploaded = storage && url.origin === storage.origin && url.pathname.startsWith("/storage/v1/object/public/videos/") && !/%2f|%5c/i.test(url.pathname);
  if (!stock && !uploaded) throw new Error("Downloads support Pexels videos and Kreovar uploaded footage.");
  return url;
}

export async function fetchBrollDownload(raw: string, name: string, signal: AbortSignal): Promise<Response> {
  let url = allowedDownloadUrl(raw);
  let upstream: Response | undefined;
  for (let redirects = 0; redirects <= 3; redirects++) {
    upstream = await fetch(url, { redirect: "manual", signal, headers: { Accept: "video/*,application/octet-stream" } });
    if (![301, 302, 303, 307, 308].includes(upstream.status)) break;
    const location = upstream.headers.get("location");
    await upstream.body?.cancel();
    if (!location || redirects === 3) throw new Error("The asset host returned too many redirects.");
    url = allowedDownloadUrl(new URL(location, url).href);
  }
  if (!upstream?.ok || !upstream.body) { await upstream?.body?.cancel(); throw new Error("The asset is unavailable or its link has expired. Search for it again."); }
  let mime: string;
  try { mime = mediaType(upstream.headers.get("content-type"), url.href); }
  catch (error) { await upstream.body.cancel(); throw error; }
  if (!mime.startsWith("video/")) { await upstream.body.cancel(); throw new Error("This B-roll file is not a video."); }
  const length = Number(upstream.headers.get("content-length"));
  if (length > MAX_DOWNLOAD_BYTES) { await upstream.body.cancel(); throw new Error("This file exceeds the 100 MB download limit."); }
  const reader = upstream.body.getReader();
  let bytes = 0;
  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        signal.throwIfAborted();
        const { done, value } = await reader.read();
        if (done) {
          if (!bytes || length > 0 && bytes !== length) throw new Error("The asset host returned an incomplete file.");
          controller.close(); return;
        }
        bytes += value.byteLength;
        if (bytes > MAX_DOWNLOAD_BYTES) throw new Error("This file exceeds the 100 MB download limit.");
        controller.enqueue(value);
      } catch (error) { await reader.cancel().catch(() => {}); controller.error(error); }
    },
    cancel(reason) { return reader.cancel(reason); },
  });
  return new Response(stream, { headers: { "Content-Type": mime, "Content-Disposition": attachmentHeader(mediaFilename(name, mime)), "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
}
