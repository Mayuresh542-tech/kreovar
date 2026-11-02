"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { X, ArrowRight } from "lucide-react";
import { generateProjectId, saveProjectWithResult } from "@/app/lib/services/projectService";
import { VeeloxProject } from "@/app/lib/services/types";
import { supabase } from "@/app/lib/supabase";

interface CreateProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function CreateProjectModal({ isOpen, onClose }: CreateProjectModalProps) {
  const router = useRouter();
  const [projectName, setProjectName] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    const title = projectName.trim() || "Untitled Project";
    setCreating(true);
    setError(null);

    try {
      const { data: authData } = await supabase.auth.getUser();
      const userId = authData?.user?.id;
      if (!userId) throw new Error("Sign in again to create a project.");
      const newId = generateProjectId();

      const newProj: VeeloxProject = {
        id: newId,
        user_id: userId,
        title,
        trend_topic: title,
        niche: "General",
        status: "in_progress",
        aspect_ratio: "9:16",
        duration: 30,
        raw_footage: [],
        broll_assets: [],
        voiceovers: [],
        thumbnails: [],
        scripts: [],
        scenes: [],
        ideas: [],
        activity: [
          {
            id: `act_${Date.now()}`,
            action: "Project created",
            description: "Project created",
            timestamp: new Date().toISOString(),
            created_at: new Date().toISOString(),
          },
        ],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const result = await saveProjectWithResult(newProj);
      if (!result.success) throw new Error(result.error || "Project could not be saved. Please retry.");
      onClose();
      router.push(`/projects/${result.project.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create the project. Please retry.");
    } finally {
      setCreating(false);
    }
  }

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/40 backdrop-blur-xs">
        <motion.div
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.96 }}
          transition={{ duration: 0.15 }}
          className="relative w-full max-w-md bg-white rounded-2xl border border-slate-200 shadow-xl overflow-hidden p-6 space-y-5"
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div>
              <h2 className="text-base font-semibold text-slate-900">
                Create a new project
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                A project connects all your independent media, scripts &amp; timelines.
              </p>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <form onSubmit={handleCreate} className="space-y-4">
            {/* Project Name */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Project Name
              </label>
              <input
                type="text"
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                placeholder="e.g. 5 AI Tools You Need in 2026"
                className="w-full px-3.5 py-2 rounded-lg border border-slate-200 text-sm text-slate-900 focus:outline-none focus:border-slate-900 font-sans"
                autoFocus
              />
            </div>

            <p className="text-xs text-slate-500">Add footage, voiceover, B-roll, thumbnails and captions inside your project, then open the editor.</p>
            {error && <p role="alert" className="text-sm text-rose-600">{error}</p>}

            {/* Footer Actions */}
            <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-100">
              <button
                type="button"
                onClick={onClose}
                className="px-3.5 py-2 rounded-lg border border-slate-200 text-xs font-medium text-slate-600 hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={creating}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-medium transition-colors shadow-xs cursor-pointer"
              >
                <span>{creating ? "Creating…" : "Create Project"}</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </form>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
