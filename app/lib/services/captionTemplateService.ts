import {
  CaptionTemplate,
  CaptionStyleConfig,
  DEFAULT_CAPTION_TEMPLATES,
  getTemplateById,
} from "../captions/templates";
import { VeeloxProject, VeeloxCaption } from "./types";
import { VeeloxTimelineProject } from "../timeline/types";
import { saveProject } from "./projectService";
import { groupWordsIntoSegments, createSegmentsFromTranscript } from "../captions/presets";

const LOCAL_CUSTOM_TEMPLATES_KEY = "veelox_custom_caption_templates_v1";

function getLocalCustomTemplates(): CaptionTemplate[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(LOCAL_CUSTOM_TEMPLATES_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveLocalCustomTemplates(templates: CaptionTemplate[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(LOCAL_CUSTOM_TEMPLATES_KEY, JSON.stringify(templates));
  } catch (err) {
    console.warn("Failed to save local custom caption templates:", err);
  }
}

export async function fetchAllCaptionTemplates(): Promise<{
  systemTemplates: CaptionTemplate[];
  userTemplates: CaptionTemplate[];
}> {
  const localCustom = getLocalCustomTemplates();

  try {
    const res = await fetch("/api/captions/templates");
    if (res.ok) {
      const data = await res.json();
      const serverCustom: CaptionTemplate[] = data.userTemplates || [];

      // Merge server + local custom templates
      const mergedMap = new Map<string, CaptionTemplate>();
      localCustom.forEach((t) => mergedMap.set(t.id, t));
      serverCustom.forEach((t) => mergedMap.set(t.id, t));

      const mergedCustom = Array.from(mergedMap.values());
      saveLocalCustomTemplates(mergedCustom);

      return {
        systemTemplates: data.systemTemplates || DEFAULT_CAPTION_TEMPLATES,
        userTemplates: mergedCustom,
      };
    }
  } catch (err) {
    console.warn("[CaptionTemplateService] Network fetch failed, using local/system templates:", err);
  }

  return {
    systemTemplates: DEFAULT_CAPTION_TEMPLATES,
    userTemplates: localCustom,
  };
}

export async function createCustomCaptionTemplate(
  input: {
    name: string;
    category?: string;
    description?: string;
    style: CaptionStyleConfig;
  }
): Promise<CaptionTemplate> {
  const localId = `custom_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const localTemplate: CaptionTemplate = {
    id: localId,
    name: input.name,
    category: (input.category as any) || "Custom",
    tagline: input.description || "Custom Creator Preset",
    description: input.description || `Custom ${input.name} preset`,
    isCustom: true,
    style: input.style,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  try {
    const res = await fetch("/api/captions/templates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });

    if (res.ok) {
      const data = await res.json();
      if (data.template) {
        const saved = data.template as CaptionTemplate;
        const currentLocal = getLocalCustomTemplates().filter((t) => t.id !== saved.id);
        currentLocal.unshift(saved);
        saveLocalCustomTemplates(currentLocal);
        return saved;
      }
    }
  } catch (err) {
    console.warn("[CaptionTemplateService] Server save failed, saving locally:", err);
  }

  // Fallback to local storage
  const currentLocal = getLocalCustomTemplates();
  currentLocal.unshift(localTemplate);
  saveLocalCustomTemplates(currentLocal);
  return localTemplate;
}

export async function deleteCustomCaptionTemplate(id: string): Promise<boolean> {
  const currentLocal = getLocalCustomTemplates().filter((t) => t.id !== id);
  saveLocalCustomTemplates(currentLocal);

  try {
    const res = await fetch(`/api/captions/templates/${id}`, {
      method: "DELETE",
    });
    return res.ok;
  } catch {
    return true;
  }
}

/**
 * Applies a CaptionTemplate to an existing VeeloxProject.
 * One-click apply:
 * - Updates typography, colors, animation, positioning, and highlighting
 * - Updates project state cleanly
 * - Does NOT duplicate captions
 * - Does NOT overwrite unrelated video settings (scenes, audio, footage, b-roll)
 */
export async function applyTemplateToProject(
  project: VeeloxProject,
  template: CaptionTemplate
): Promise<VeeloxProject> {
  const currentTimeline = project.timeline || ({} as any);
  const currentSettings = currentTimeline.settings || {};

  const updatedSettings = {
    ...currentSettings,
    captionPreset: template.id,
    captionTemplateId: template.id,
    captionPosition: template.style.position,
    captionStyle: template.style,
  };

  // Update caption track inside timeline tracks if present
  let updatedTracks = currentTimeline.tracks;
  if (Array.isArray(updatedTracks)) {
    updatedTracks = updatedTracks.map((track: any) => {
      if (track.type === "captions" && Array.isArray(track.items)) {
        return {
          ...track,
          items: track.items.map((item: any) => ({
            ...item,
            metadata: {
              ...item.metadata,
              captionPreset: template.id,
              captionStyle: template.style,
            },
          })),
        };
      }
      return track;
    });
  }

  // Update project.captions styling if present
  let updatedCaptions = project.captions;
  if (Array.isArray(updatedCaptions) && updatedCaptions.length > 0) {
    updatedCaptions = updatedCaptions.map((c) => ({
      ...c,
      style: {
        textColor: template.style.textColor,
        highlightColor: template.style.highlightColor,
        position: template.style.position === "custom" ? "center" : template.style.position,
        fontSize: template.style.fontSize,
      },
    }));
  }

  const updatedProject: VeeloxProject = {
    ...project,
    timeline: {
      ...currentTimeline,
      settings: updatedSettings,
      tracks: updatedTracks,
    },
    captions: updatedCaptions,
  };

  return await saveProject(updatedProject);
}

/**
 * Applies a CaptionTemplate to a VeeloxTimelineProject in the video editor.
 */
export function applyTemplateToTimelineProject(
  timeline: VeeloxTimelineProject,
  template: CaptionTemplate
): VeeloxTimelineProject {
  const updatedSettings = {
    ...timeline.settings,
    captionPreset: template.id,
    captionTemplateId: template.id,
    captionPosition: template.style.position,
    captionStyle: template.style,
  };

  const updatedTracks = timeline.tracks.map((track) => {
    if (track.type === "captions") {
      return {
        ...track,
        items: track.items.map((item) => ({
          ...item,
          metadata: {
            ...item.metadata,
            captionPreset: template.id,
            captionStyle: template.style,
          },
        })),
      };
    }
    return track;
  });

  return {
    ...timeline,
    settings: updatedSettings,
    tracks: updatedTracks,
    updatedAt: new Date().toISOString(),
  };
}
