import { NextRequest, NextResponse } from "next/server";
import { requestBodyLimit } from "./requestSecurity";

/** Limit actual streamed bytes, including requests without Content-Length. */
export function withBoundedRequest<T extends unknown[]>(handler: (req: NextRequest, ...args: T) => Promise<Response>) {
  return async (req: NextRequest, ...args: T): Promise<Response> => {
    const limit = requestBodyLimit(new URL(req.url).pathname);
    const declared = req.headers.get("content-length");
    if (declared && (!/^\d+$/.test(declared) || Number(declared) > limit)) return NextResponse.json({ error: "Request is too large." }, { status: 413 });
    if (!req.body) return handler(req, ...args);
    const reader = req.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; void reader.cancel().catch(() => {}); }, 30000);
    try {
      while (true) {
        if (req.signal.aborted) return NextResponse.json({ error: "Request cancelled." }, { status: 408 });
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > limit) { await reader.cancel(); return NextResponse.json({ error: "Request is too large." }, { status: 413 }); }
        chunks.push(value);
      }
      if (timedOut) return NextResponse.json({ error: "Request timed out." }, { status: 408 });
      const bytes = Buffer.concat(chunks);
      const forwarded = new NextRequest(req.url, { method: req.method, headers: req.headers, body: bytes, signal: req.signal });
      return handler(forwarded, ...args);
    } catch { return NextResponse.json({ error: "Could not read request." }, { status: 400 }); }
    finally { clearTimeout(timer); reader.releaseLock(); }
  };
}
