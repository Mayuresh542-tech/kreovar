/** Remove only this user's editor data. Other accounts on this device are preserved. */
export async function clearDeletedAccountDeviceData(userId: string) {
  const { clearAccountCache } = await import("../editor/cache");
  const projectIds = new Set(await clearAccountCache(userId).catch(() => [] as string[]));
  try {
    const projects: { id: string; user_id?: string }[] = JSON.parse(localStorage.getItem("veelox_projects_v2") || "[]");
    if (Array.isArray(projects)) {
      for (const p of projects) if (p.user_id === userId) projectIds.add(p.id);
      localStorage.setItem("veelox_projects_v2", JSON.stringify(projects.filter(p => p.user_id !== userId)));
    }
    const templates: { userId?: string }[] = JSON.parse(localStorage.getItem("veelox_custom_caption_templates_v1") || "[]");
    if (Array.isArray(templates)) localStorage.setItem("veelox_custom_caption_templates_v1", JSON.stringify(templates.filter(t => t.userId !== userId)));
    for (const id of projectIds) for (const prefix of ["veelox_recovery_v2_", "veelox_broadcast_"]) localStorage.removeItem(prefix + id);
    localStorage.removeItem("fretrend_pref_duration"); localStorage.removeItem("fretrend_pref_platform");
  } catch { /* Browser storage may be unavailable; the server account has already been removed. */ }
}
