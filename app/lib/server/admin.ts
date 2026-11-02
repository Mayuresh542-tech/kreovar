import { NextRequest } from "next/server";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { getAdminClient, requireAdmin } from "./adminAuth";

export const createAdminSupabaseClient = getAdminClient;

export async function verifyServerAdmin(authHeaderOrToken: string | null | undefined): Promise<{ user: User; db: SupabaseClient }> {
  if (!authHeaderOrToken) throw new Error("Missing authentication token.");
  const result = await requireAdmin(new NextRequest("http://localhost", { headers: { Authorization: authHeaderOrToken.startsWith("Bearer ") ? authHeaderOrToken : `Bearer ${authHeaderOrToken}` } }));
  if ("error" in result) throw new Error(result.error.status === 401 ? "Invalid or expired session token." : "Forbidden: Account is not an authorized administrator or requires two-step verification.");
  return result;
}
