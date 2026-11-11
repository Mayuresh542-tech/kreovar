"use client";

import React, { useState } from "react";
import {
  Check,
  LoaderCircle,
  XCircle,
  RotateCcw,
  Eye,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  ArrowUpRight,
} from "lucide-react";
import BrandMark from "../BrandMark";
import type { AiChatTurn } from "./useConversationalAiChat";
import type { ProgressiveStep, TimelineChangeItem } from "@/app/lib/editor/conversationalIntent";

interface AiResponseBubbleProps {
  turn: AiChatTurn;
  steps: ProgressiveStep[];
  canUndo: boolean;
  onUndo: (turnId: string) => void;
  onFocusChange: (item: TimelineChangeItem) => void;
  touchFriendly?: boolean;
}

export default function AiResponseBubble({
  turn,
  steps,
  canUndo,
  onUndo,
  onFocusChange,
  touchFriendly = false,
}: AiResponseBubbleProps) {
  const [showChanges, setShowChanges] = useState(false);
  const [showNotes, setShowNotes] = useState(false);

  const showActions =
    turn.status === "completed" &&
    !turn.isClarification &&
    (turn.didModifyTimeline || turn.changes.length > 0 || turn.undone);

  const actionBtnClass = touchFriendly
    ? "min-h-[38px] px-3 rounded-xl text-[12px]"
    : "h-7 px-2.5 rounded-lg text-[11px]";

  return (
    <div className="space-y-3">
      {/* User Prompt Bubble */}
      <div className="flex justify-end">
        <div className="max-w-[86%] rounded-2xl rounded-br-sm bg-blue-600 px-3.5 py-2.5 text-[13px] leading-relaxed text-white shadow-sm">
          {turn.prompt}
        </div>
      </div>

      {/* Assistant Response Bubble */}
      <div className="flex items-start gap-2.5">
        <div className="mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-lg border border-blue-200 bg-blue-50">
          <BrandMark size={15} />
        </div>

        <div className="min-w-0 flex-1 space-y-2.5 rounded-2xl rounded-tl-sm border border-slate-200 bg-slate-50/90 px-3.5 py-3 text-slate-800 shadow-sm transition-all">
          {/* Progressive Timeline Steps */}
          {steps.length > 0 && (
            <ul className="space-y-1.5" aria-label="Edit progress steps">
              {steps.map((step) => (
                <li
                  key={step.id}
                  className="flex items-center gap-2 text-[12px] leading-snug transition-opacity duration-200"
                >
                  {step.status === "completed" ? (
                    <Check
                      size={13}
                      strokeWidth={2.5}
                      className="flex-shrink-0 text-emerald-600"
                    />
                  ) : step.status === "active" ? (
                    <LoaderCircle
                      size={13}
                      className="flex-shrink-0 animate-spin text-blue-600"
                    />
                  ) : step.status === "failed" ? (
                    <XCircle size={13} className="flex-shrink-0 text-rose-600" />
                  ) : step.status === "skipped" ? (
                    <span className="h-2 w-2 flex-shrink-0 rounded-full bg-amber-500 mx-0.5" />
                  ) : (
                    <span className="h-2.5 w-2.5 flex-shrink-0 rounded-full border border-slate-300 mx-0.5" />
                  )}

                  <span
                    className={
                      step.status === "completed"
                        ? "text-slate-800"
                        : step.status === "active"
                        ? "font-medium text-blue-700"
                        : step.status === "failed"
                        ? "text-rose-700"
                        : step.status === "skipped"
                        ? "text-amber-700"
                        : "text-slate-400"
                    }
                  >
                    {step.label}
                  </span>
                </li>
              ))}
            </ul>
          )}

          {/* Execution Summary / Clarification / Error */}
          {turn.responseText && turn.status !== "running" && (
            <p
              className={`border-t border-slate-200 pt-2 text-[12.5px] leading-relaxed ${
                turn.status === "failed"
                  ? "text-rose-700"
                  : turn.status === "cancelled"
                  ? "text-slate-500"
                  : "text-slate-700"
              }`}
            >
              {turn.responseText}
            </p>
          )}

          {/* Subtle Collapsible Degradation Notes */}
          {turn.degradationNotes.length > 0 && turn.status !== "running" && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-2.5 py-1.5">
              <button
                type="button"
                onClick={() => setShowNotes((v) => !v)}
                className="flex w-full items-center justify-between text-[11px] font-medium text-amber-800"
              >
                <span className="flex items-center gap-1.5">
                  <AlertTriangle size={12} className="text-amber-600" />
                  <span>
                    {turn.degradationNotes.length} skipped or adjusted{" "}
                    {turn.degradationNotes.length === 1 ? "item" : "items"}
                  </span>
                </span>
                {showNotes ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
              </button>

              {showNotes && (
                <div className="mt-1.5 space-y-1 border-t border-amber-200/70 pt-1.5 text-[11px] leading-relaxed text-amber-800">
                  {turn.degradationNotes.map((note, idx) => (
                    <p key={idx}>• {note}</p>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* 1-Click Actions Directly Inside AI Response Bubble */}
          {showActions && (
            <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
              {(canUndo || turn.undone) && (
                <button
                  type="button"
                  disabled={!canUndo}
                  onClick={() => onUndo(turn.id)}
                  className={`${actionBtnClass} inline-flex items-center gap-1.5 font-medium transition-colors ${
                    turn.undone
                      ? "border border-slate-200 bg-slate-100 text-slate-400"
                      : "border border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-100 hover:text-slate-900 active:scale-95"
                  }`}
                >
                  {turn.undone ? (
                    <>
                      <Check size={12} />
                      <span>Undone</span>
                    </>
                  ) : (
                    <>
                      <RotateCcw size={12} />
                      <span>Undo Edit</span>
                    </>
                  )}
                </button>
              )}

              {turn.changes.length > 0 && (
                <button
                  type="button"
                  onClick={() => setShowChanges((v) => !v)}
                  aria-expanded={showChanges}
                  className={`${actionBtnClass} inline-flex items-center gap-1.5 border border-slate-200 bg-white font-medium text-slate-700 transition-colors hover:border-slate-300 hover:bg-slate-100 hover:text-slate-900 active:scale-95`}
                >
                  <Eye size={12} />
                  <span>{showChanges ? "Hide Changes" : "View Changes"}</span>
                  {showChanges ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                </button>
              )}
            </div>
          )}

          {/* Inline Timeline Diff Drawer */}
          {showChanges && turn.changes.length > 0 && (
            <div className="space-y-1.5 rounded-xl border border-slate-200 bg-white p-2.5">
              {turn.changes.map((item) => {
                const interactive = item.time !== undefined || item.clipId !== undefined;
                return (
                  <button
                    key={item.id}
                    type="button"
                    disabled={!interactive}
                    onClick={() => interactive && onFocusChange(item)}
                    className={`flex w-full items-start justify-between gap-2 rounded-lg px-2 py-1 text-left transition-colors ${
                      interactive
                        ? "hover:bg-slate-50 active:bg-slate-100"
                        : "cursor-default"
                    }`}
                  >
                    <div className="min-w-0">
                      <p className="text-[11.5px] font-medium text-slate-900 truncate">
                        {item.label}
                      </p>
                      {item.detail && (
                        <p className="text-[10.5px] text-slate-500 truncate">
                          {item.detail}
                        </p>
                      )}
                    </div>
                    {interactive && (
                      <ArrowUpRight
                        size={12}
                        className="mt-0.5 flex-shrink-0 text-blue-600"
                      />
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
