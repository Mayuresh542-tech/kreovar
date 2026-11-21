import type { SupabaseClient } from "@supabase/supabase-js";

export async function requireOwnedProject(
  db: SupabaseClient,
  userId: string,
  projectId: unknown,
  options?: { optional?: boolean }
) {
  if (projectId == null) {
    if (options?.optional) return;
    throw new Error("Invalid project.");
  }
  if (typeof projectId !== "string" || !/^[0-9a-f-]{36}$/i.test(projectId)) throw new Error("Invalid project.");
  const { data, error } = await db.from("projects").select("id, user_id").eq("id", projectId).maybeSingle();
  if (error) throw new Error("This project is unavailable.");
  if (data) {
    if (data.user_id !== userId) throw new Error("This project is unavailable.");
    return;
  }
  // Auto-provision draft project row for current user if it doesn't exist yet
  const { error: insertError } = await db.from("projects").insert({
    id: projectId,
    user_id: userId,
    title: "Untitled Video",
    status: "draft"
  });
  if (insertError) {
    const { data: retryData } = await db.from("projects").select("id, user_id").eq("id", projectId).maybeSingle();
    if (!retryData || retryData.user_id !== userId) {
      throw new Error("This project is unavailable.");
    }
  }
}

