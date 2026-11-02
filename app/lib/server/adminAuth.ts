import { NextRequest, NextResponse } from "next/server";
import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import { isAdminEmail } from "../admin";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

export function getAdminClient(signal?:AbortSignal): SupabaseClient {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) throw new Error("Server authentication configuration unavailable.");
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false },...(signal?{global:{fetch:(input,init)=>fetch(input,{...init,signal:AbortSignal.any([signal,...(init?.signal?[init.signal]:[])])})}}:{}) });
}

export function isAuthorizedAdminEmail(email: string | null | undefined): boolean { return isAdminEmail(email); }

/** Read credentials only; callers must verify the resulting token with Auth. */
export function getAccessToken(req: NextRequest): string | null {
  const authorization = req.headers.get("authorization");
  if (authorization) return authorization.match(/^Bearer\s+(\S+)$/i)?.[1] ?? null;
  const cookies = new Map<string, string>();
  for (const part of (req.headers.get("cookie") ?? "").split(";")) {
    const eq = part.indexOf("=");
    if (eq > 0) cookies.set(part.slice(0, eq).trim(), part.slice(eq + 1).trim());
  }
  const names = new Set([...cookies.keys()].map(name => name.replace(/\.\d+$/, "")));
  for (const name of names) {
    if (name !== "fretrend-auth" && name !== "sb-access-token" && !/^sb-.+-auth-token$/.test(name)) continue;
    let raw = cookies.get(name) ?? "";
    if (!raw) for (let i = 0; i < 32; i++) { const part = cookies.get(name + "." + i); if (!part) break; raw += part; }
    if (!raw || raw.length > 100000) continue;
    try { raw = decodeURIComponent(raw); } catch { continue; }
    try {
      if (raw.startsWith("base64-")) raw = Buffer.from(raw.slice(7), "base64url").toString("utf8");
      const session = JSON.parse(raw);
      const token = Array.isArray(session) ? session[0] : session.access_token ?? session.currentSession?.access_token;
      if (typeof token === "string" && token.length <= 20000 && token.trim()) return token.trim();
    } catch { if (name === "sb-access-token" && raw.length <= 20000) return raw; }
  }
  return null;
}

export async function getAuthenticatedUser(req: NextRequest): Promise<User | null> {
  const token = getAccessToken(req);
  if (!token || token.length > 20000) return null;
  for(let attempt=0;attempt<2;attempt++){
    try{
      const signal=AbortSignal.any([req.signal,AbortSignal.timeout(12000)]);
      const {data,error}=await getAdminClient(signal).auth.getUser(token);
      if(!error)return data.user??null;
      const temporary=error.name==='AuthRetryableFetchError'||error.status===0||(error.status??0)>=500;
      if(!temporary)return null;
    }catch{ /* Transport failure is not evidence that the user's token is invalid. */ }
    if(req.signal.aborted||attempt===1)throw new Error('AUTH_SERVICE_UNAVAILABLE');
  }
  throw new Error('AUTH_SERVICE_UNAVAILABLE');
}

export async function getAuthenticatedUserId(req: NextRequest): Promise<string | null> { return (await getAuthenticatedUser(req))?.id ?? null; }

export type AdminAuthResult = { db: SupabaseClient; user: User } | { error: NextResponse };

export async function requireAdmin(req: NextRequest): Promise<AdminAuthResult> {
  const user = await getAuthenticatedUser(req);
  if (!user) return { error: NextResponse.json({ error: "Unauthorized. Please sign in." }, { status: 401 }) };
  if (!user.email_confirmed_at || !isAdminEmail(user.email)) return { error: NextResponse.json({ error: "Forbidden. Administrator access required." }, { status: 403 }) };
  // Only inspect AAL after the token has been verified by the Auth server.
  {
    let aal: unknown;
    try { aal = JSON.parse(Buffer.from(getAccessToken(req)!.split(".")[1], "base64url").toString("utf8")).aal; } catch { aal = null; }
    if (aal !== "aal2" || !user.factors?.some(factor => factor.status === "verified")) return { error: NextResponse.json({ error: "Complete two-step verification to access administration.", code: "MFA_REQUIRED" }, { status: 403 }) };
  }
  return { db: getAdminClient(), user };
}
