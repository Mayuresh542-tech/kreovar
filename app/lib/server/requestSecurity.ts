import type { NextRequest } from "next/server";
import { SITE_URL } from "../seo";

export function isSafeMutation(req: NextRequest): boolean {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return true;
  const origin = req.headers.get("origin");
  const bearer = /^Bearer\s+\S+$/i.test(req.headers.get("authorization") ?? "");
  if (req.headers.get("sec-fetch-site") === "cross-site") return false;
  if (!origin) return bearer || !req.headers.has("cookie");
  try {
    const supplied = new URL(origin);
    if (origin === "null" || supplied.origin !== origin) return false;
    // Next normalizes loopback request hostnames to localhost. During local
    // development only, accept known loopback names on the same protocol/port.
    // Never derive trust from forwarded hosts or allow this on a remote request.
    const local = new URL(req.url),loopback = (url:URL) => ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    if (process.env.NODE_ENV === "development" && loopback(local) && loopback(supplied) && supplied.protocol === local.protocol && supplied.port === local.port) return true;
    const expected = process.env.SITE_URL || process.env.NEXT_PUBLIC_SITE_URL;
    // The hosting adapter can expose its Netlify URL instead of the public custom domain.
    // Trust our fixed canonical origin as well; never derive trust from forwarded host headers.
    return supplied.origin === new URL(SITE_URL).origin || supplied.origin === new URL(expected || req.url).origin;
  } catch { return false; }
}

export function requestBodyLimit(path: string): number {
  return ["/api/media/upload", "/api/transcribe", "/api/assets", "/api/editor/export-mp4"].includes(path) ? 101 * 1024 * 1024 : 1024 * 1024;
}

export function ratePolicy(path: string, method: string) {
  if (path === "/api/billing/dodo-sandbox") return {scope:"dodo-sandbox",limit:method==="POST"?6:30,seconds:60};
  if (path === "/api/account" && method === "DELETE") return { scope: "account-delete", limit: 3, seconds: 300 };
  if (path.startsWith("/api/admin")) return { scope: method === "GET" ? "admin-read" : "admin-write", limit: method === "GET" ? 120 : 20, seconds: 60 };
  if (path === "/api/render" || path === "/api/editor/export-mp4") return { scope: "render", limit: 3, seconds: 300 };
  if (path.startsWith("/api/voice") && method !== "GET") return { scope: "voice", limit: 4, seconds: 60 };
  if (["/api/assets", "/api/assets/upload", "/api/assets/text"].includes(path) && method === "POST") return {scope:"generation",limit:12,seconds:60};
  if (path === "/api/transcribe") return { scope: "transcribe", limit: 4, seconds: 60 };
  if (["/api/ai/complete", "/api/editor/ai-edit", "/api/editor/broll-choice", "/api/editor/generate-image", "/api/content-kit", "/api/platform-kit", "/api/thumbnails/generate", "/api/competitors/analysis"].includes(path)) return { scope: "generation", limit: 12, seconds: 60 };
  return { scope: "api", limit: 120, seconds: 60 };
}

export function securityHeaders(nonce: string, development: boolean): Record<string, string> {
  return {
    "Content-Security-Policy": `default-src 'self'; script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${development ? " 'unsafe-eval'" : ""}; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; img-src 'self' https: blob: data:; media-src 'self' https: blob: data:; font-src 'self' https://fonts.gstatic.com data:; connect-src 'self' https: wss:${development ? " ws:" : ""}; worker-src 'self' blob:; frame-src 'self' blob:; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'`,
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=()",
  };
}
