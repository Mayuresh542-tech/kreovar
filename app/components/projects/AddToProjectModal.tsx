"use client";
import {importStockAsset,projectAssetItem} from "../../lib/assets/client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { FolderPlus, Check, ArrowRight, X, Film, Plus } from "lucide-react";
import {
  getProjects,
  saveProject,
  addAssetToProject,
  generateProjectId,
  AssetTypeKey,
} from "@/app/lib/services/projectService";
import { supabase } from "@/app/lib/supabase";
import { VeeloxProject } from "@/app/lib/services/types";

interface AddToProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  assetType: AssetTypeKey;
  assetData?: any;
  assetItem?: any;
  assetLabel?: string;
  defaultTitle?: string;
  onAdded?: (project: VeeloxProject) => void;
}

export default function AddToProjectModal({
  isOpen,
  onClose,
  assetType,
  assetData,
  assetItem,
  assetLabel,
  defaultTitle,
  onAdded,
}: AddToProjectModalProps) {
  const router = useRouter();
  const [projects, setProjects] = useState<VeeloxProject[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>("");
  const [isCreatingNew, setIsCreatingNew] = useState(false);
  const [newProjectTitle, setNewProjectTitle] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadingProjects, setLoadingProjects] = useState(false);
  const [savedProject, setSavedProject] = useState<VeeloxProject | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    setSavedProject(null); setSelectedProjectId(""); setError(null); setLoadingProjects(true);
    void (async () => {
      const { data, error: authError } = await supabase.auth.getUser();
      if (authError || !data.user) throw new Error("Sign in again to add assets.");
      const list = await getProjects(data.user.id);
      if (cancelled) return;
      setProjects(list);
      const requested = new URLSearchParams(window.location.search).get("projectId");
      const selected = list.find(p => p.id === requested) || list[0];
      if (requested && !list.some(p => p.id === requested)) throw new Error("This project is unavailable. Return to Projects and try again.");
      setSelectedProjectId(selected?.id || ""); setIsCreatingNew(!selected);
    })().catch(e => { if (!cancelled) setError(e instanceof Error ? e.message : "Could not load projects."); })
      .finally(() => { if (!cancelled) setLoadingProjects(false); });
    return () => { cancelled = true; };
  }, [isOpen]);

  if (!isOpen) return null;

  async function handleAdd() {
    setIsSubmitting(true);
    setError(null);
    try {
      let targetProjectId = selectedProjectId;

      if (isCreatingNew || !targetProjectId) {
        const title = newProjectTitle.trim() || defaultTitle || (assetLabel ? `Project: ${assetLabel}` : "New Project");
        const newProj = await saveProject({
          id: generateProjectId(),
          title,
          status: "in_progress",
          aspect_ratio: "9:16",
        });
        targetProjectId = newProj.id;
      }

      let payload = assetItem || assetData;
      if(assetType==="broll_assets"&&!payload?.libraryId&&typeof payload?.url==="string"&&payload.url.startsWith("https://")){const saved=await importStockAsset(payload.url,payload.title||"B-roll",payload.duration);payload=projectAssetItem(saved);}
      const updated = await addAssetToProject(targetProjectId, assetType, payload);
      if (!updated) throw new Error("Project unavailable. Please reopen it and retry.");
      if (updated) {
        setSavedProject(updated);
        onAdded?.(updated);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add the asset. Please retry.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs">
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.96 }}
        className="w-full max-w-md rounded-2xl bg-white border border-slate-200 shadow-xl overflow-hidden p-6 space-y-5"
      >
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center text-slate-700">
              <FolderPlus className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-slate-900">
                Add to Project
              </h3>
              <p className="text-xs text-slate-500">
                {assetLabel ? `Asset: ${assetLabel}` : `Save ${assetType.replace("_", " ")}`}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {loadingProjects && <p role="status" className="text-sm text-slate-500">Loading your projects…</p>}
        {error && <p role="alert" className="text-sm text-rose-600">{error}</p>}
        {savedProject ? (
          <div className="space-y-4 py-2 text-center">
            <div className="w-12 h-12 rounded-full bg-emerald-50 text-emerald-600 border border-emerald-200 flex items-center justify-center mx-auto">
              <Check className="w-6 h-6" />
            </div>
            <div>
              <h4 className="text-base font-bold text-slate-900">
                Added to &ldquo;{savedProject.title}&rdquo;!
              </h4>
              <p className="text-xs text-slate-500 mt-1">
                Your resource is now connected to this project workspace.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3 pt-2">
              <button
                type="button"
                onClick={() => {
                  onClose();
                  router.push(`/projects/${savedProject.id}`);
                }}
                className="py-2.5 px-3 rounded-xl border border-slate-200 hover:bg-slate-50 text-xs font-semibold text-slate-700 transition-colors"
              >
                View Project
              </button>
              <button
                type="button"
                onClick={() => {
                  onClose();
                  router.push(`/editor?projectId=${savedProject.id}`);
                }}
                className="py-2.5 px-3 rounded-xl bg-slate-900 hover:bg-slate-800 text-xs font-semibold text-white flex items-center justify-center gap-1.5 transition-colors shadow-2xs"
              >
                <span>Open in Editor</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Toggle: Select Existing vs New */}
            {projects.length > 0 && (
              <div className="flex rounded-lg bg-slate-100 p-1 border border-slate-200 text-xs">
                <button
                  type="button"
                  onClick={() => setIsCreatingNew(false)}
                  className={`flex-1 py-1.5 rounded-md font-medium transition-all ${
                    !isCreatingNew
                      ? "bg-white text-slate-900 shadow-2xs font-semibold"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  Existing Project
                </button>
                <button
                  type="button"
                  onClick={() => setIsCreatingNew(true)}
                  className={`flex-1 py-1.5 rounded-md font-medium transition-all ${
                    isCreatingNew
                      ? "bg-white text-slate-900 shadow-2xs font-semibold"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  + New Project
                </button>
              </div>
            )}

            {!isCreatingNew && projects.length > 0 ? (
              <div className="space-y-2">
                <label className="text-xs font-medium text-slate-700 block">
                  Select Project
                </label>
                <select
                  value={selectedProjectId}
                  onChange={(e) => setSelectedProjectId(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-sm text-slate-900 focus:outline-none focus:border-slate-400"
                >
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.title}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <div className="space-y-2">
                <label className="text-xs font-medium text-slate-700 block">
                  New Project Name
                </label>
                <input
                  type="text"
                  value={newProjectTitle}
                  onChange={(e) => setNewProjectTitle(e.target.value)}
                  placeholder="e.g. 5 AI Tools You Need in 2026"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-slate-400"
                />
              </div>
            )}

            <div className="pt-2 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl text-xs font-medium text-slate-600 hover:bg-slate-100 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleAdd}
                disabled={loadingProjects || isSubmitting || (!isCreatingNew && !selectedProjectId) || (isCreatingNew && !newProjectTitle.trim())}
                className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white font-medium text-xs transition-colors shadow-2xs"
              >
                {isSubmitting ? "Adding..." : "Add to Project"}
              </button>
            </div>
          </div>
        )}
      </motion.div>
    </div>
  );
}
