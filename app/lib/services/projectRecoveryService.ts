import { VeeloxTimelineProject } from "../timeline/types";
import { VeeloxProject } from "./types";

export interface ProjectRecoverySnapshot {
  projectId: string;
  revision: number;
  title: string;
  timeline: VeeloxTimelineProject;
  projectMeta?: Partial<VeeloxProject>;
  timestamp: number; // Epoch ms
  savedAt: string;   // ISO timestamp
}

export interface ProjectSyncMessage {
  type: "PROJECT_SAVED" | "PROJECT_MUTATED";
  projectId: string;
  revision: number;
  tabId: string;
  timestamp: number;
}

const RECOVERY_STORAGE_PREFIX = "veelox_recovery_v2_";
const CURRENT_TAB_ID = typeof crypto !== "undefined" && crypto.randomUUID
  ? crypto.randomUUID()
  : `tab_${Math.random().toString(36).slice(2, 9)}`;

export function getCurrentTabId(): string {
  return CURRENT_TAB_ID;
}

/**
 * Persists an in-progress local recovery snapshot to browser localStorage.
 * Used for zero-data-loss restoration if browser closes unexpectedly.
 */
export function saveLocalRecovery(snapshot: {
  projectId: string;
  revision: number;
  title: string;
  timeline: VeeloxTimelineProject;
  projectMeta?: Partial<VeeloxProject>;
}): void {
  if (typeof window === "undefined" || !snapshot.projectId) return;
  try {
    const payload: ProjectRecoverySnapshot = {
      projectId: snapshot.projectId,
      revision: snapshot.revision,
      title: snapshot.title,
      timeline: snapshot.timeline,
      projectMeta: snapshot.projectMeta,
      timestamp: Date.now(),
      savedAt: new Date().toISOString(),
    };
    localStorage.setItem(
      `${RECOVERY_STORAGE_PREFIX}${snapshot.projectId}`,
      JSON.stringify(payload)
    );
  } catch (err) {
    console.warn("[RecoveryService] Failed to write local recovery snapshot:", err);
  }
}

/**
 * Retrieves the local recovery snapshot for a project if available.
 */
export function getLocalRecovery(projectId: string): ProjectRecoverySnapshot | null {
  if (typeof window === "undefined" || !projectId) return null;
  try {
    const raw = localStorage.getItem(`${RECOVERY_STORAGE_PREFIX}${projectId}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ProjectRecoverySnapshot;
    if (parsed && parsed.projectId === projectId && parsed.timeline?.tracks) {
      return parsed;
    }
  } catch (err) {
    console.warn("[RecoveryService] Failed to parse local recovery snapshot:", err);
  }
  return null;
}

/**
 * Removes the local recovery snapshot once server save is confirmed.
 */
export function clearLocalRecovery(projectId: string): void {
  if (typeof window === "undefined" || !projectId) return;
  try {
    localStorage.removeItem(`${RECOVERY_STORAGE_PREFIX}${projectId}`);
  } catch {}
}

/**
 * Checks if a project has unpersisted local recovery changes newer than what the server returned.
 * Compares revision and timestamps with a 2-second tolerance window.
 */
export function checkHasUnsavedRecovery(
  projectId: string,
  serverUpdatedAt?: string,
  serverRevision?: number
): ProjectRecoverySnapshot | null {
  const recovery = getLocalRecovery(projectId);
  if (!recovery) return null;

  // 1. If recovery has higher revision number than server
  if (typeof serverRevision === "number" && recovery.revision > serverRevision) {
    return recovery;
  }

  // 2. If recovery timestamp is noticeably newer than server updated_at (> 2.5s)
  if (serverUpdatedAt) {
    const serverTime = Date.parse(serverUpdatedAt);
    if (!isNaN(serverTime) && recovery.timestamp > serverTime + 2500) {
      return recovery;
    }
  }

  return null;
}

/**
 * Multi-tab cross-communication channel using BroadcastChannel with storage fallback.
 * Allows tabs editing the same project to warn each other about conflicts.
 */
export function createProjectSyncChannel(
  projectId: string,
  onMessage: (msg: ProjectSyncMessage) => void
): {
  broadcast: (msg: Omit<ProjectSyncMessage, "tabId" | "projectId">) => void;
  destroy: () => void;
} {
  const channelName = `veelox_project_sync_${projectId}`;
  let channel: BroadcastChannel | null = null;

  if (typeof BroadcastChannel !== "undefined") {
    try {
      channel = new BroadcastChannel(channelName);
      channel.onmessage = (event) => {
        const msg = event.data as ProjectSyncMessage;
        if (msg && msg.projectId === projectId && msg.tabId !== CURRENT_TAB_ID) {
          onMessage(msg);
        }
      };
    } catch {
      channel = null;
    }
  }

  const storageHandler = (e: StorageEvent) => {
    if (e.key === `veelox_broadcast_${projectId}` && e.newValue) {
      try {
        const msg = JSON.parse(e.newValue) as ProjectSyncMessage;
        if (msg && msg.projectId === projectId && msg.tabId !== CURRENT_TAB_ID) {
          onMessage(msg);
        }
      } catch {}
    }
  };

  if (typeof window !== "undefined") {
    window.addEventListener("storage", storageHandler);
  }

  const broadcast = (msg: Omit<ProjectSyncMessage, "tabId" | "projectId">) => {
    const fullMsg: ProjectSyncMessage = {
      ...msg,
      projectId,
      tabId: CURRENT_TAB_ID,
    };

    if (channel) {
      try {
        channel.postMessage(fullMsg);
      } catch {}
    }

    if (typeof localStorage !== "undefined") {
      try {
        localStorage.setItem(`veelox_broadcast_${projectId}`, JSON.stringify(fullMsg));
      } catch {}
    }
  };

  const destroy = () => {
    if (channel) {
      channel.close();
      channel = null;
    }
    if (typeof window !== "undefined") {
      window.removeEventListener("storage", storageHandler);
    }
  };

  return { broadcast, destroy };
}
