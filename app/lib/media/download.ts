import {legacyStoragePath,legacyStorageEndpoint} from "./legacyStorage";
const extensions: Record<string, string> = { "video/mp4": "mp4", "video/webm": "webm", "video/quicktime": "mov", "video/ogg": "ogv", "video/x-matroska": "mkv", "audio/mpeg": "mp3", "audio/wav": "wav", "audio/x-wav": "wav", "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };
export const MAX_DOWNLOAD_BYTES = 100 * 1024 * 1024;

export function mediaType(contentType: string | null, url: string): string {
  const mime = contentType?.split(";")[0].trim().toLowerCase() || "";
  if (extensions[mime]) return mime;
  if (mime && mime !== "application/octet-stream") throw new Error("The asset host returned an unsupported file type.");
  const extension = new URL(url, "https://localhost").pathname.split(".").at(-1)?.toLowerCase();
  const matched = Object.entries(extensions).find(([, ext]) => ext === extension);
  if (!matched) throw new Error("The asset host did not return a supported media file.");
  return matched[0];
}

export function mediaFilename(name: string, mime: string): string {
  const extension = extensions[mime];
  if (!extension) throw new Error("Unsupported media type.");
  const clean = name.normalize("NFC").replace(/[\x00-\x1f\x7f<>:"/\\|?*]/g, "_").replace(/\.(mp4|webm|mov|ogv|mkv|mp3|wav|png|jpe?g|webp)$/i, "").replace(/[. ]+$/g, "").trim().slice(0, 120);
  const stem = !clean || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(clean) ? `veelox-${clean || "broll"}` : clean;
  return `${stem}.${extension}`;
}

export function attachmentHeader(filename: string): string {
  const ascii = filename.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  const encoded = encodeURIComponent(filename).replace(/['()*]/g, char => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}

/** Download bytes from a same-origin proxy, avoiding cross-origin <a download> behavior. */
export async function downloadMedia(url: string, name: string, token: string, signal: AbortSignal, beforeDownload?: (file: File) => Promise<void>): Promise<void> {
  const endpoint=legacyStoragePath(url)?legacyStorageEndpoint(url):/^\/api\/assets\/[0-9a-f-]{36}\/file$/i.test(url)?url:`/api/broll/download?url=${encodeURIComponent(url)}&filename=${encodeURIComponent(name)}`;
  const res = await fetch(endpoint, { headers: { Authorization: `Bearer ${token}` }, signal });
  if (!res.ok) {
    const error = await res.json().catch(() => null);
    throw new Error(error?.error || "Download failed. Please retry.");
  }
  const mime = mediaType(res.headers.get("content-type"), url);
  const blob = await res.blob();
  signal.throwIfAborted();
  if (!blob.size || blob.size > MAX_DOWNLOAD_BYTES) throw new Error("The download is empty or exceeds the 100 MB limit.");
  if(beforeDownload)await beforeDownload(new File([blob],mediaFilename(name,mime),{type:mime}));
  const objectUrl = URL.createObjectURL(blob), link = document.createElement("a");
  try {
    link.href = objectUrl; link.download = mediaFilename(name, mime);
    document.body.appendChild(link); link.click();
  } finally {
    link.remove();
    // Keep bytes alive while the browser's download manager takes ownership.
    setTimeout(() => URL.revokeObjectURL(objectUrl), 60000);
  }
}
