const MAX_BYTES = 100 * 1024 * 1024;
const STOCK_HOSTS = new Set(["videos.pexels.com", "images.pexels.com", "images.unsplash.com", "image.pollinations.ai", "cdn.freesound.org"]);
export function trustedRenderMediaUrl(value: string): URL {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username || url.password || (url.port && url.port !== "443")) throw new Error("Unsupported render media URL.");
  const configured = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const ownStorage = configured && url.origin === new URL(configured).origin && /^\/storage\/v1\/object\/(?:public|sign)\/(?:videos|voiceovers|images|editor-media)\//.test(url.pathname);
  if (!STOCK_HOSTS.has(url.hostname) && !ownStorage) throw new Error("Use imported media or supported stock media for server rendering.");
  return url;
}
export async function fetchRenderMedia(value: string, timeoutMs = 30000): Promise<Uint8Array> {
  let url = trustedRenderMediaUrl(value);
  const signal = AbortSignal.timeout(timeoutMs);
  for (let redirects = 0; redirects <= 3; redirects++) {
    const res = await fetch(url, { signal, redirect: "manual" });
    if ([301,302,303,307,308].includes(res.status)) {
      await res.body?.cancel();
      const location = res.headers.get("location");
      if (!location || redirects === 3) throw new Error("Render media redirect failed.");
      url = trustedRenderMediaUrl(new URL(location, url).href);
      continue;
    }
    if (!res.ok || !res.body) throw new Error("Could not download render media.");
    if (Number(res.headers.get("content-length")) > MAX_BYTES) { await res.body.cancel(); throw new Error("Render media exceeds 100 MB."); }
    const type = res.headers.get("content-type")?.split(";")[0].trim() ?? "";
    if (!/^(audio|video|image)\//.test(type) && type !== "application/octet-stream") { await res.body.cancel(); throw new Error("Render media has an unsupported file type."); }
    const reader = res.body.getReader(), chunks: Uint8Array[] = [];
    let size = 0;
    try { while (true) { const part = await reader.read(); if (part.done) break; size += part.value.length; if (size > MAX_BYTES) throw new Error("Render media exceeds 100 MB."); chunks.push(part.value); } }
    catch (error) { await reader.cancel(); throw error; }
    finally { reader.releaseLock(); }
    if (!size) throw new Error("Render media is empty.");
    const bytes = new Uint8Array(size); let offset = 0; for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; } return bytes;
  }
  throw new Error("Render media download failed.");
}
