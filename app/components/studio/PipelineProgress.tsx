"use client";

import React from "react";
import { Check } from "lucide-react";

export type StudioPipelineStage =
  | "idea"
  | "script"
  | "voiceover"
  | "visuals"
  | "editor"
  | "captions"
  | "export"
  | "raw_upload";

interface PipelineProgressProps {
  currentStage: StudioPipelineStage;
  completedStages: StudioPipelineStage[];
  onSelectStage: (stage: StudioPipelineStage) => void;
  mode?: "ai" | "raw";
  onToggleMode?: (mode: "ai" | "raw") => void;
}

const FLOW_STAGES: Array<{ id: StudioPipelineStage; label: string }> = [
  { id: "idea", label: "Idea" },
  { id: "script", label: "Script" },
  { id: "voiceover", label: "Voice" },
  { id: "visuals", label: "Assets" },
  { id: "editor", label: "Edit" },
  { id: "captions", label: "Captions" },
  { id: "export", label: "Export" },
];

export default function PipelineProgress({
  currentStage,
  completedStages,
  onSelectStage,
  mode = "ai",
  onToggleMode,
}: PipelineProgressProps) {
  // Normalize current stage for the visual stepper
  const activeIndex = FLOW_STAGES.findIndex(
    (s) => s.id === currentStage || (currentStage === "raw_upload" && s.id === "idea")
  );

  return (
    <nav
      aria-label="Creation Pipeline Workflow"
      className="w-full bg-white border-b border-slate-200 px-4 py-4 sm:px-6 select-none"
    >
      <div className="max-w-4xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-4">
        {/* Stepper Dots & Line */}
        <div className="flex items-center justify-between w-full relative">
          {FLOW_STAGES.map((stage, idx) => {
            const isCurrent = (stage.id === currentStage) || (currentStage === "raw_upload" && stage.id === "idea");
            const isCompleted = completedStages.includes(stage.id) || idx < activeIndex;

            return (
              <React.Fragment key={stage.id}>
                <button
                  type="button"
                  onClick={() => onSelectStage(stage.id)}
                  className="flex flex-col items-center gap-1.5 group cursor-pointer focus:outline-none z-10"
                >
                  <div
                    className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium transition-colors ${
                      isCurrent
                        ? "bg-slate-900 text-white"
                        : isCompleted
                        ? "bg-slate-900 text-white"
                        : "bg-white border border-slate-300 text-slate-400 group-hover:border-slate-400"
                    }`}
                  >
                    {isCompleted && !isCurrent ? (
                      <Check className="w-3 h-3 text-white" />
                    ) : (
                      <span className="text-[10px]">{idx + 1}</span>
                    )}
                  </div>
                  <span
                    className={`text-xs transition-colors ${
                      isCurrent
                        ? "font-semibold text-slate-900"
                        : isCompleted
                        ? "text-slate-700"
                        : "text-slate-400 group-hover:text-slate-600"
                    }`}
                  >
                    {stage.label}
                  </span>
                </button>

                {/* Connecting Line */}
                {idx < FLOW_STAGES.length - 1 && (
                  <div className="flex-1 h-0.5 mx-2 -mt-4 bg-slate-200">
                    <div
                      className="h-full bg-slate-900 transition-all duration-300"
                      style={{
                        width: idx < activeIndex ? "100%" : "0%",
                      }}
                    />
                  </div>
                )}
              </React.Fragment>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
