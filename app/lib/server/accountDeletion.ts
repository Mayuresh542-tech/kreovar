import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { getAccessToken, getAdminClient, getAuthenticatedUser } from "./adminAuth";
import { isSafeMutation } from "./requestSecurity";
import { whopClient, whopCycle } from "./whopCheckout";

const BUCKETS = new Set(["studio-assets", "editor-media", "voiceovers", "videos", "images"]);
const json = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { "Cache-Control": "private, no-store" } });

export class AccountDeletionError extends Error {
  constructor(message: string, public status = 503, public code = "DELETION_UNAVAILABLE") { super(message); }
}

async function verifyPassword(user: User, password: string) {
  const auth = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { data, error } = await auth.auth.signInWithPassword({ email: user.email!, password });
  try {
    if (error || data.user?.id !== user.id || !data.session) throw new AccountDeletionError("Your password could not be verified. Try again.", 403, "REAUTH_REQUIRED");
  } finally {
    // Dispose the verification session only. Never replace the browser's session.
    if (data.session) await auth.auth.signOut({ scope: "local" });
  }
}

export async function checkDeletionBilling(db: SupabaseClient, userId: string) {
  const { data: sub, error } = await db.from("subscriptions").select("source,plan,status,external_subscription_id").eq("user_id", userId).maybeSingle();
  if (error) throw new AccountDeletionError("Billing could not be checked. Retry before deleting your account.");
  if (!sub || sub.source !== "whop") return;
  if (!sub.external_subscription_id) {
    if (sub.plan !== "free" && !["canceled", "expired"].includes(sub.status)) throw new AccountDeletionError("Cancel your subscription before deleting your account.", 409, "CANCEL_SUBSCRIPTION_FIRST");
    return;
  }
  // Read the current provider state, including subscriptions canceled at period end.
  const membership = await whopClient().memberships.retrieve({ id: sub.external_subscription_id });
  if (membership.account.id !== process.env.WHOP_ACCOUNT_ID || !whopCycle(membership.plan_id)) throw new AccountDeletionError("Your billing status needs review. Contact support before deleting your account.");
  if (!membership.cancel_at_period_end && !["canceled", "expired", "completed"].includes(membership.status)) {
    throw new AccountDeletionError("Cancel your subscription renewal in Whop, then return here to delete your account. Deleting an account does not issue a refund.", 409, "CANCEL_SUBSCRIPTION_FIRST");
  }
}

/** Only called after explicit confirmation and password verification. Safe to retry after a partial cleanup. */
export async function removeAccountData(db: SupabaseClient, userId: string, token: string) {
  if (!/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(userId)) throw new AccountDeletionError("Invalid account.");
  const current = await db.auth.admin.getUserById(userId);
  if (current.error || !current.data.user) throw new AccountDeletionError("Your account could not be checked. Please retry.");
  const locked = await db.auth.admin.updateUserById(userId, { app_metadata: { ...current.data.user.app_metadata, account_deletion_pending: true } });
  if (locked.error) throw new AccountDeletionError("Account deletion could not start. Please retry.");
  const { error: signOutError } = await db.auth.admin.signOut(token, "global");
  if (signOutError) throw new AccountDeletionError("Your sessions could not be revoked. Retry before deleting your account.");
  // Storage must be removed through its API, before deleting Auth/metadata.
  // Reading the first page repeatedly avoids skipping objects as batches disappear.
  for (let batch = 0; batch < 100; batch++) {
    const { data, error } = await db.rpc("list_kreovar_account_files", { p_user_id: userId });
    if (error || !Array.isArray(data)) throw new AccountDeletionError("File cleanup paused. Some data may already be removed. Sign in again and retry to finish deletion.");
    if (!data.length) {
      // Legacy records without cascading foreign keys need explicit scoped cleanup.
      for (const [table, column] of [["render_jobs", "user_id"], ["api_keys", "user_id"], ["videos", "user_id"], ["profiles", "id"]]) {
        const result = await db.from(table).delete().eq(column, userId);
        if (result.error) throw new AccountDeletionError("Account cleanup paused. Sign in again and retry to finish deletion.");
      }
      const deleted = await db.auth.admin.deleteUser(userId, false);
      if (deleted.error) throw new AccountDeletionError("Account cleanup paused. Sign in again and retry to finish deletion.");
      return;
    }
    const grouped = new Map<string, string[]>();
    for (const row of data as { bucket_id: string; name: string; owner_id: string | null }[]) {
      const owned = row.owner_id === userId || row.name?.startsWith(userId + "/") || (row.bucket_id === "videos" && row.name?.startsWith(userId + "_"));
      if (!BUCKETS.has(row.bucket_id) || !owned || row.name.includes("..") || row.name.includes("\\")) throw new AccountDeletionError("File ownership could not be verified. Contact support.");
      grouped.set(row.bucket_id, [...(grouped.get(row.bucket_id) || []), row.name]);
    }
    for (const [bucket, paths] of grouped) {
      const removed = await db.storage.from(bucket).remove(paths);
      if (removed.error) throw new AccountDeletionError("File cleanup paused. Some data may already be removed. Sign in again and retry to finish deletion.");
    }
  }
  throw new AccountDeletionError("Cleanup needs another pass. Sign in again and retry to finish deletion.");
}

export async function deleteOwnAccount(req: NextRequest) {
  try {
    if (!isSafeMutation(req)) return json({ error: "Cross-site request denied." }, 403);
    const user = await getAuthenticatedUser(req), token = getAccessToken(req);
    if (!user || !token) return json({ error: "Sign in to delete your account." }, 401);
    const body = await req.json().catch(() => null);
    if (!body || Object.keys(body).some(k => !["confirmation", "password"].includes(k)) || body.confirmation !== "DELETE" || typeof body.password !== "string" || !body.password || body.password.length > 1024 || !user.email) {
      return json({ error: "Enter your password and type DELETE to confirm." }, 400);
    }
    // An enrolled second factor must also be satisfied by the current verified session.
    if (user.factors?.some(f => f.status === "verified")) {
      let aal: unknown;
      try { aal = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8")).aal; } catch { aal = null; }
      if (aal !== "aal2") return json({ error: "Complete two-step verification before deleting your account.", code: "MFA_REQUIRED" }, 403);
    }
    await verifyPassword(user, body.password);
    const db = getAdminClient();
    await checkDeletionBilling(db, user.id);
    const pending = await db.from("kreovar_usage_reservations").select("id").eq("user_id", user.id).eq("state", "pending").gt("expires_at", new Date().toISOString()).limit(1);
    if (pending.error) throw new AccountDeletionError("Active work could not be checked. Please retry.");
    if (pending.data?.length) return json({ error: "Wait for your current generation or export to finish, then retry.", code: "WORK_IN_PROGRESS" }, 409);
    const renders = await db.from("render_jobs").select("id").eq("user_id", user.id).in("status", ["queued", "processing"]).gt("created_at", new Date(Date.now() - 30 * 60 * 1000).toISOString()).limit(1);
    if (renders.error) throw new AccountDeletionError("Active exports could not be checked. Please retry.");
    if (renders.data?.length) return json({ error: "Wait for your current export to finish, then retry.", code: "WORK_IN_PROGRESS" }, 409);
    // Check lookup availability before revoking sessions or removing any data.
    const files = await db.rpc("list_kreovar_account_files", { p_user_id: user.id });
    if (files.error || !Array.isArray(files.data)) throw new AccountDeletionError("Account cleanup is temporarily unavailable. Please retry.");
    await removeAccountData(db, user.id, token);
    return json({ deleted: true });
  } catch (error) {
    return json({ error: error instanceof AccountDeletionError ? error.message : "Deletion could not finish. Sign in again and retry, or contact support.", code: error instanceof AccountDeletionError ? error.code : "DELETION_UNAVAILABLE" }, error instanceof AccountDeletionError ? error.status : 503);
  }
}
