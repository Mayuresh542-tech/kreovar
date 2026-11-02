import { withSafeResponse } from "@/app/lib/server/safeResponse";
import { withBoundedRequest } from "@/app/lib/server/boundedRequest";
import { NextRequest, NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { encrypt, decrypt } from "../../lib/crypto";

// Reads the caller's Authorization header to authorize, so it must always run
// dynamically at request time (never prerendered/cached).
export const dynamic = "force-dynamic";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

/**
 * Service-role client — bypasses Row Level Security. Server-only key (no
 * NEXT_PUBLIC_ prefix); must NEVER be imported into a client component.
 */
function adminClient(): SupabaseClient {
  return createClient(SUPABASE_URL!, SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * Verify the bearer token against Supabase Auth and resolve the user. Identity
 * comes from verifying the JWT server-side — the client's claims are never
 * trusted. Returns the admin client plus the authenticated user id.
 */
async function authorize(
  req: NextRequest,
): Promise<{ db: SupabaseClient; userId: string } | { error: NextResponse }> {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    return {
      error: NextResponse.json(
        { error: "Server is missing SUPABASE_SERVICE_ROLE_KEY." },
        { status: 500 },
      ),
    };
  }

  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!token) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  const db = adminClient();
  const { data, error } = await db.auth.getUser(token);
  if (error || !data.user) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  return { db, userId: data.user.id };
}

/** Return the caller's own Groq and YouTube keys, decrypted, so Settings can prefill them. */
async function getHandler(req: NextRequest) {
  const auth = await authorize(req);
  if ("error" in auth) return auth.error;
  const { db, userId } = auth;

  try {
    const { data, error } = await db
      .from("api_keys")
      .select("groq_key, youtube_api_key")
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw error;

    const storedGroq = data?.groq_key;
    const storedYt = data?.youtube_api_key;
    const groqKey = storedGroq ? decrypt(storedGroq) : "";
    const youtubeApiKey = storedYt ? decrypt(storedYt) : "";
    return NextResponse.json({ groqKey, youtubeApiKey });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to load keys";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** Encrypt and store the caller's Groq and/or YouTube keys. */
async function postHandler(req: NextRequest) {
  const auth = await authorize(req);
  if ("error" in auth) return auth.error;
  const { db, userId } = auth;

  try {
    const body = await req.json().catch(() => ({}));
    const payload: { user_id: string; groq_key?: string; youtube_api_key?: string } = {
      user_id: userId,
    };

    if (typeof body.groqKey === "string") {
      const trimmed = body.groqKey.trim();
      payload.groq_key = trimmed ? encrypt(trimmed) : "";
    }
    if (typeof body.youtubeApiKey === "string") {
      const trimmed = body.youtubeApiKey.trim();
      payload.youtube_api_key = trimmed ? encrypt(trimmed) : "";
    }

    const { error } = await db
      .from("api_keys")
      .upsert(payload, { onConflict: "user_id" });
    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to save keys";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export const POST = withSafeResponse(withBoundedRequest(postHandler));

export const GET = withSafeResponse(getHandler);
