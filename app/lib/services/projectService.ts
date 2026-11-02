import { supabase } from "../supabase";
import { VeeloxProject } from "./types";

const LOCAL_STORAGE_KEY = "veelox_projects_v2";

function getLocalProjects(): VeeloxProject[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter(p => p && typeof p.id === "string") : [];
  } catch (err) {
    console.warn("Failed to read local projects:", err);
    return [];
  }
}

function saveLocalProjects(projects: VeeloxProject[]): void {
  if (typeof window === "undefined") throw new Error("Device storage is unavailable.");
  localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(projects));
}

function visibleLocally(project: VeeloxProject, userId?: string): boolean {
  return !project.user_id || project.user_id === userId;
}

async function currentUserId(): Promise<string | undefined> {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw new Error(error.message);
  return data.session?.user?.id;
}

export function isUUID(str?: string | null): boolean {
  if (!str) return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(str);
}

export function generateProjectId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// Unpack project assets and revision metadata stored in timeline JSONB if needed
function unpackProject(p: any): VeeloxProject {
  const assets = p?.timeline?.project_assets || {};
  return {
    ...p,
    revision: p.revision ?? p?.timeline?.revision ?? 1,
    last_saved_at: p.last_saved_at || p?.timeline?.lastSavedAt || p.updated_at,
    video_mode: p.video_mode || assets.video_mode || "mixed",
    raw_footage: p.raw_footage || assets.raw_footage || [],
    broll_assets: p.broll_assets || assets.broll_assets || [],
    voiceovers: p.voiceovers || assets.voiceovers || [],
    thumbnails: p.thumbnails || assets.thumbnails || [],
    ideas: p.ideas || assets.ideas || [],
    scripts: p.scripts || assets.scripts || [],
    sfx_assets: p.sfx_assets || assets.sfx_assets || [],
    backgrounds: p.backgrounds || assets.backgrounds || [],
    typography_scenes: p.typography_scenes || assets.typography_scenes || [],
    activity: p.activity || assets.activity || [],
  };
}

export async function getProjects(userId?: string): Promise<VeeloxProject[]> {
  const localList = getLocalProjects().filter(p => visibleLocally(p, userId)).map(unpackProject);

  if (!userId) {
    return localList.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
  }

  try {
    const { data, error } = await supabase
      .from("projects")
      .select("*")
      .eq("user_id", userId)
      .order("updated_at", { ascending: false });

    if (error || !data) {
      return localList.filter((p) => !p.user_id || p.user_id === userId);
    }

    const map = new Map<string, VeeloxProject>();
    localList.forEach((p) => map.set(p.id, p));
    data.forEach((p: any) => {
      if (p.user_id !== userId) return;
      const cloud = unpackProject(p), local = map.get(p.id);
      // A failed cloud sync must not hide newer device edits from the project list.
      if (!local || Date.parse(cloud.updated_at) >= Date.parse(local.updated_at)) map.set(p.id, cloud);
    });

    return Array.from(map.values()).sort(
      (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
    );
  } catch {
    return localList;
  }
}

export async function getProjectWithSource(id: string): Promise<{project: VeeloxProject | null; source: "cloud" | "device" | "missing"}> {
  const userId = await currentUserId();
  const localList = getLocalProjects();
  const localMatch = localList.find((p) => p.id === id && visibleLocally(p, userId));

  try {
    if (userId && isUUID(id)) {
      const { data, error } = await supabase.from("projects").select("*").eq("id", id).eq("user_id", userId).maybeSingle();
      if (!error && data && data.user_id === userId) {
        return {project: unpackProject(data), source: "cloud"};
      }
    }
  } catch {
    // Fall back to local
  }

  return {project: localMatch ? unpackProject(localMatch) : null, source: localMatch ? "device" : "missing"};
}

export async function getProject(id: string): Promise<VeeloxProject | null> {
  return (await getProjectWithSource(id)).project;
}

export interface ProjectSaveResult {
  project: VeeloxProject;
  success: boolean;
  persistedToDb: boolean;
  persistedLocally: boolean;
  revision: number;
  error?: string;
}

export async function saveProjectWithResult(
  projectData: Partial<VeeloxProject> & { id: string; title: string }
): Promise<ProjectSaveResult> {
  const now = new Date().toISOString();
  const validId = projectData.id || generateProjectId();
  const userId = await currentUserId();

  const priorProject=await getProject(validId);
  const existing = priorProject || {
    id: validId,
    title: projectData.title,
    trend_topic: projectData.trend_topic || "",
    niche: projectData.niche || "general",
    status: "draft" as const,
    video_mode: projectData.video_mode || "mixed",
    aspect_ratio: "9:16" as const,
    duration: 60,
    scenes: [],
    raw_footage: [],
    broll_assets: [],
    voiceovers: [],
    thumbnails: [],
    ideas: [],
    scripts: [],
    sfx_assets: [],
    backgrounds: [],
    typography_scenes: [],
    activity: [],
    revision: 1,
    created_at: now,
    updated_at: now,
  };

  const nextRevision = typeof projectData.revision === "number"
    ? projectData.revision
    : (existing.revision || 0) + 1;

  const updated: VeeloxProject = {
    ...existing,
    ...projectData,
    id: validId,
    user_id: userId,
    revision: nextRevision,
    last_saved_at: now,
    video_mode: projectData.video_mode ?? existing.video_mode ?? "mixed",
    raw_footage: projectData.raw_footage ?? existing.raw_footage ?? [],
    broll_assets: projectData.broll_assets ?? existing.broll_assets ?? [],
    voiceovers: projectData.voiceovers ?? existing.voiceovers ?? [],
    thumbnails: projectData.thumbnails ?? existing.thumbnails ?? [],
    ideas: projectData.ideas ?? existing.ideas ?? [],
    scripts: projectData.scripts ?? existing.scripts ?? [],
    sfx_assets: projectData.sfx_assets ?? existing.sfx_assets ?? [],
    backgrounds: projectData.backgrounds ?? existing.backgrounds ?? [],
    typography_scenes: projectData.typography_scenes ?? existing.typography_scenes ?? [],
    activity: projectData.activity ?? existing.activity ?? [],
    updated_at: now,
  };

  // Reject foreign cached IDs before changing either device or cloud data.
  const cachedOwner = getLocalProjects().find(p => p.id === validId)?.user_id;
  if ((projectData.user_id && projectData.user_id !== userId) || (cachedOwner && cachedOwner !== userId)) {
    return { project: updated, success: false, persistedToDb: false, persistedLocally: false,
      revision: nextRevision, error: "You do not own this project." };
  }

  // 1. Save to local storage
  let persistedLocally = false;
  let localError: string | undefined;
  try {
    const localList = getLocalProjects();
    const existingIndex = localList.findIndex((p) => p.id === updated.id);
    if (existingIndex >= 0) {
      localList[existingIndex] = updated;
    } else {
      localList.unshift(updated);
    }
    saveLocalProjects(localList);
    persistedLocally = true;
  } catch (err) {
    localError = err instanceof Error ? err.message : "Device storage save failed.";
    console.warn("[ProjectService] Local storage save failed:", err);
  }

  // 2. Try saving to Supabase if authenticated and ID is a valid UUID
  let persistedToDb = false;
  let dbError: string | undefined = undefined;

  try {
    if (await currentUserId() !== userId) throw new Error("Your account changed. Reopen the editor before saving.");

    if (userId) {
      updated.user_id = userId;

      if (isUUID(updated.id)) {
        // Ownership check: ensure existing DB project does not belong to another user
        const { data: existingCheck, error: ownershipError } = await supabase
          .from("projects")
          .select("user_id")
          .eq("id", updated.id)
          .maybeSingle();

        if (ownershipError) throw new Error(ownershipError.message);

        if (existingCheck?.user_id && existingCheck.user_id !== userId) {
          const errMsg = "Security violation: You do not own this project.";
          console.error(`[ProjectService] ${errMsg}`);
          return {
            project: updated,
            success: false,
            persistedToDb: false,
            persistedLocally,
            revision: nextRevision,
            error: errMsg,
          };
        }

        // Embed asset arrays inside timeline JSONB to ensure 100% database persistence without schema changes
        const currentTimeline = (updated.timeline as any) || {};
        const timelineWithAssets = {
          ...currentTimeline,
          revision: nextRevision,
          lastSavedAt: now,
          project_assets: {
            video_mode: updated.video_mode,
            raw_footage: updated.raw_footage,
            broll_assets: updated.broll_assets,
            voiceovers: updated.voiceovers,
            thumbnails: updated.thumbnails,
            ideas: updated.ideas,
            scripts: updated.scripts,
            sfx_assets: updated.sfx_assets,
            backgrounds: updated.backgrounds,
            typography_scenes: updated.typography_scenes,
            activity: updated.activity,
          },
        };

        const dbPayload = {
          id: updated.id,
          user_id: userId,
          title: updated.title,
          trend_topic: updated.trend_topic || null,
          niche: updated.niche || "general",
          status: updated.status || "draft",
          aspect_ratio: updated.aspect_ratio || "9:16",
          duration: typeof updated.duration === "number" ? updated.duration : 60,
          idea: updated.idea || null,
          research: updated.research || null,
          script: updated.script || null,
          scenes: updated.scenes || [],
          timeline: timelineWithAssets,
          captions: updated.captions || null,
          export_url: updated.export_url || null,
          thumbnail_url: updated.thumbnail_url || (updated.thumbnails?.[0]?.url || null),
          updated_at: now,
        };

        const { data: savedRow, error: upsertErr } = await supabase
          .from("projects")
          .upsert(dbPayload, { onConflict: "id" })
          .select("id,user_id")
          .single();

        if (upsertErr) {
          dbError = upsertErr.message;
          if(upsertErr.message.includes("KREOVAR_PROJECT_LIMIT")){dbError="Active project limit reached. Complete or delete a project, or upgrade your plan.";if(!priorProject){saveLocalProjects(getLocalProjects().filter(p=>p.id!==updated.id));persistedLocally=false;}}
          console.warn("[ProjectService] Supabase sync failed:", upsertErr.message);
        } else if (savedRow?.id === updated.id && savedRow.user_id === userId) {
          persistedToDb = true;
        } else {
          dbError = "Cloud save could not be confirmed.";
        }
      } else {
        dbError = "This project ID cannot sync to the cloud.";
      }
    }
  } catch (err: any) {
    dbError = err?.message || "Failed to communicate with Supabase";
    console.warn("[ProjectService] Supabase sync error:", err);
  }

  // 3. Dispatch in-browser event so UI updates reactively
  if ((persistedLocally || persistedToDb) && typeof window !== "undefined") {
    try {
      window.dispatchEvent(new CustomEvent("veelox_project_saved", { detail: updated }));
    } catch {}
  }

  const isSuccess = persistedToDb || (persistedLocally && !dbError);

  return {
    project: updated,
    success: isSuccess,
    persistedToDb,
    persistedLocally,
    revision: nextRevision,
    error: dbError || (!persistedLocally && !persistedToDb ? localError : undefined),
  };
}

export async function saveProject(
  projectData: Partial<VeeloxProject> & { id: string; title: string }
): Promise<VeeloxProject> {
  const result = await saveProjectWithResult(projectData);
  return result.project;
}

export async function deleteProject(id: string): Promise<boolean> {
  const userId = await currentUserId();
  const localList = getLocalProjects();
  const local = localList.find(p => p.id === id);
  if (local && !visibleLocally(local, userId)) throw new Error("You do not own this project.");
  // Keep recovery data until the cloud confirms deletion (or absence).
  if (userId && isUUID(id)) {
    const { error } = await supabase.from("projects").delete().eq("id", id).eq("user_id", userId);
    if (error) throw new Error(error.message);
    const { data, error: checkError } = await supabase.from("projects").select("id").eq("id", id).eq("user_id", userId).maybeSingle();
    if (checkError) throw new Error(checkError.message);
    if (data) throw new Error("Cloud deletion could not be confirmed. Your project was kept.");
  }
  saveLocalProjects(localList.filter(p => p.id !== id));
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("veelox_project_deleted", { detail: { id } }));
  }
  return true;
}

export type AssetTypeKey =
  | "raw_footage"
  | "raw"
  | "broll_assets"
  | "broll"
  | "voiceovers"
  | "voice"
  | "thumbnails"
  | "thumbnail"
  | "ideas"
  | "idea"
  | "scripts"
  | "script"
  | "captions"
  | "caption"
  | "sfx"
  | "sfx_assets"
  | "background"
  | "backgrounds"
  | "typography_scene"
  | "typography_scenes";

function normalizeAssetType(
  key: AssetTypeKey
): "raw_footage" | "broll_assets" | "voiceovers" | "thumbnails" | "ideas" | "scripts" | "sfx_assets" | "backgrounds" | "typography_scenes" {
  switch (key) {
    case "raw":
    case "raw_footage":
      return "raw_footage";
    case "broll":
    case "broll_assets":
      return "broll_assets";
    case "voice":
    case "voiceovers":
      return "voiceovers";
    case "thumbnail":
    case "thumbnails":
      return "thumbnails";
    case "idea":
    case "ideas":
      return "ideas";
    case "script":
    case "scripts":
      return "scripts";
    case "sfx":
    case "sfx_assets":
      return "sfx_assets";
    case "background":
    case "backgrounds":
      return "backgrounds";
    case "typography_scene":
    case "typography_scenes":
      return "typography_scenes";
    case "caption":
    case "captions":
    default:
      return "scripts";
  }
}

import {linkAsset} from "../assets/client";
export async function addAssetToProject(
  projectId: string,
  assetType: AssetTypeKey,
  assetItem: any
): Promise<VeeloxProject | null> {
  const project = await getProject(projectId);
  if (!project) return null;

  if (assetItem?.libraryId) await linkAsset(projectId, (assetType === "caption" || assetType === "captions" ? "captions" : normalizeAssetType(assetType)) as import("../assets/types").AssetRole, assetItem.libraryId);
  if (assetType === "caption" || assetType === "captions") {
    if (!Array.isArray(assetItem.segments) || !assetItem.segments.length) throw new Error("No timed captions to add.");
    const captions = assetItem.segments.map((segment: any) => ({
      id: segment.id || crypto.randomUUID(), text: String(segment.text || ""),
      startTime: Number(segment.startTime ?? segment.start), endTime: Number(segment.endTime ?? segment.end),
      words: Array.isArray(segment.words) ? segment.words : [],
    }));
    if (captions.some((c: any) => !c.text.trim() || !Number.isFinite(c.startTime) || !Number.isFinite(c.endTime) || c.startTime < 0 || c.endTime <= c.startTime)) throw new Error("Captions need valid text and start/end times.");
    const result = await saveProjectWithResult({ ...project, captions });
    if (!result.success) throw new Error(result.error || "Could not save captions. Please retry.");
    return result.project;
  }
  const canonical = normalizeAssetType(assetType);
  const currentList = Array.isArray(project[canonical]) ? [...(project[canonical] as any[])] : [];
  if (!assetItem?.id) throw new Error("Asset is missing an ID.");
  if (!currentList.some((item: any) => item.id === assetItem.id)) currentList.unshift(assetItem);

  const actionText = `Added ${canonical.replace("_", " ")}: ${assetItem.name || assetItem.title || assetItem.voiceName || "Asset"}`;
  const currentActivity = Array.isArray(project.activity) ? [...project.activity] : [];
  currentActivity.unshift({
    id: `act_${Date.now()}`,
    action: actionText,
    timestamp: new Date().toISOString(),
  });

  const updates: Partial<VeeloxProject> = {
    [canonical]: currentList,
    activity: currentActivity,
  };

  const result = await saveProjectWithResult({ ...project, ...updates });
  if (!result.success) throw new Error(result.error || "Could not save the asset. Please retry.");
  return result.project;
}

export async function removeAssetFromProject(
  projectId: string,
  assetType: AssetTypeKey,
  assetId: string
): Promise<VeeloxProject | null> {
  const project = await getProject(projectId);
  if (!project) return null;

  const canonical = normalizeAssetType(assetType);
  const currentList = Array.isArray(project[canonical]) ? [...(project[canonical] as any[])] : [];
  const filtered = currentList.filter((item: any) => item.id !== assetId);

  return await saveProject({
    ...project,
    [canonical]: filtered,
  });
}
