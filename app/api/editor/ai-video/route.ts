import { NextRequest, NextResponse } from "next/server";
import { withSafeResponse } from "@/app/lib/server/safeResponse";
import { withBoundedRequest } from "@/app/lib/server/boundedRequest";
import { getAdminClient } from "@/app/lib/server/adminAuth";
import { requireOwnedProject } from "@/app/lib/server/projectAccess";
import { uploadGeminiFile } from "@/app/lib/server/geminiService";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_VIDEO_PROXY_BYTES = 15 * 1024 * 1024;
const ALLOWED_VIDEO_MIMES = new Set(["video/mp4", "video/webm", "video/quicktime"]);
const requests = new Map<string, { since: number; count: number; busy: boolean }>();

function normalizeVideoMime(raw: string, filename?: string): string | null {
  const base = raw.split(";")[0].trim().toLowerCase();
  if (ALLOWED_VIDEO_MIMES.has(base)) return base;
  const ext = filename?.split(".").pop()?.toLowerCase();
  if (ext === "mp4" || ext === "m4v") return "video/mp4";
  if (ext === "webm") return "video/webm";
  if (ext === "mov") return "video/quicktime";
  return null;
}

async function postHandler(req: NextRequest) {
  let release: (() => void) | undefined;
  try {
    const token = req.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
    if (!token) return NextResponse.json({ error: "Sign in to analyze video." }, { status: 401 });

    const admin = getAdminClient();
    const { data, error } = await admin.auth.getUser(token);
    if (error || !data.user) {
      return NextResponse.json({ error: "Your session expired. Sign in again." }, { status: 401 });
    }

    let form: FormData;
    try {
      form = await req.formData();
    } catch {
      return NextResponse.json({ error: "Expected multipart video upload." }, { status: 400 });
    }

    const projectId = form.get("projectId");
    const fileEntry = form.get("file");

    if (typeof projectId !== "string" || !/^[0-9a-f-]{36}$/i.test(projectId.trim())) {
      return NextResponse.json({ error: "Invalid project identifier." }, { status: 400 });
    }
    if (!(fileEntry instanceof Blob)) {
      return NextResponse.json({ error: "Missing video proxy file." }, { status: 400 });
    }
    if (fileEntry.size <= 0) {
      return NextResponse.json({ error: "Video proxy file is empty." }, { status: 400 });
    }
    if (fileEntry.size > MAX_VIDEO_PROXY_BYTES) {
      return NextResponse.json(
        { error: "Video proxy exceeds the 15 MB upload limit." },
        { status: 413 }
      );
    }

    const filename = fileEntry instanceof File ? fileEntry.name : "video-preview.mp4";
    const mimeType = normalizeVideoMime(fileEntry.type || "", filename);
    if (!mimeType) {
      return NextResponse.json(
        { error: "Unsupported video proxy format. Use MP4, WebM, or MOV." },
        { status: 400 }
      );
    }

    try {
      await requireOwnedProject(admin, data.user.id, projectId.trim());
    } catch {
      return NextResponse.json({ error: "This project is unavailable." }, { status: 404 });
    }

    const now = Date.now();
    for (const [id, s] of requests) {
      if (now - s.since > 90000 || (!s.busy && now - s.since > 60000)) requests.delete(id);
    }
    let state = requests.get(data.user.id);
    if (!state || now - state.since > 60000) {
      state = { since: now, count: 0, busy: false };
      requests.set(data.user.id, state);
    } else if (state.busy && now - state.since > 65000) {
      state.busy = false;
    }
    if (state.busy || state.count >= 12) {
      return NextResponse.json(
        { error: "Please wait a moment before uploading another video preview." },
        { status: 429, headers: { "Retry-After": "60" } }
      );
    }
    state.count++;
    state.busy = true;
    release = () => {
      state!.busy = false;
    };

    const buffer = Buffer.from(await fileEntry.arrayBuffer());
    const uploaded = await uploadGeminiFile(
      buffer,
      mimeType,
      filename.slice(0, 120),
      AbortSignal.any([req.signal, AbortSignal.timeout(45000)])
    );

    return NextResponse.json(
      { uri: uploaded.uri, mimeType: uploaded.mimeType, name: uploaded.name },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.includes("GEMINI_NOT_CONFIGURED")) {
      return NextResponse.json(
        { available: false, error: "Native video perception is unavailable." },
        { status: 503, headers: { "Cache-Control": "no-store" } }
      );
    }
    const timeout = error instanceof Error && ["TimeoutError", "AbortError"].includes(error.name);
    return NextResponse.json(
      {
        error: timeout
          ? "Video perception upload timed out."
          : "Video perception upload failed; continuing with sampled frames.",
      },
      { status: timeout ? 504 : 502, headers: { "Cache-Control": "no-store" } }
    );
  } finally {
    release?.();
  }
}

export const POST = withSafeResponse(withBoundedRequest(postHandler));
