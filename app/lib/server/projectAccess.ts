import type { SupabaseClient } from "@supabase/supabase-js";
export async function requireOwnedProject(db: SupabaseClient, userId: string, projectId: unknown) {
  if (projectId == null) return;
  if (typeof projectId !== "string" || !/^[0-9a-f-]{36}$/i.test(projectId)) throw new Error("Invalid project.");
  const {data,error} = await db.from("projects").select("id").eq("id",projectId).eq("user_id",userId).maybeSingle();
  if (error || !data) throw new Error("This project is unavailable.");
}
