"use client";

import React, { useRef, useEffect } from "react";
import { ArrowUp, Square, Sparkles } from "lucide-react";
import BrandMark from "../BrandMark";
import AiResponseBubble from "./AiResponseBubble";
import { useConversationalAiChat } from "./useConversationalAiChat";
import { STARTER_PROMPTS } from "@/app/lib/editor/conversationalIntent";
import { useEditor } from "./workspace/EditorContext";
import { useProject } from "@/app/lib/editor/store";

export default function EditorAIChat() {
  const { store } = useEditor();
  const project = useProject(store);
  const {
    input,
    setInput,
    isExecuting,
    turns,
    submitPrompt,
    stopExecution,
    canUndoTurn,
    undoTurn,
    focusChange,
    getTurnSteps,
  } = useConversationalAiChat();

  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Keep conversation scrolled to newest progress
  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [turns, isExecuting, project.editingJob?.currentStage, project.editingJob?.status]);

  // Auto-expand textarea vertically up to 136px
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 136)}px`;
  }, [input]);

  const isEmpty = turns.length === 0;

  return (
    <aside
      className="flex h-full w-[360px] flex-shrink-0 flex-col border-l border-slate-200 bg-white text-slate-900 select-none z-20"
      aria-label="Kreovar AI"
    >
      {/* 1. Minimalist Header: Logo + Status Indicator */}
      <header className="flex h-12 flex-shrink-0 items-center justify-between border-b border-slate-200 bg-white px-4">
        <div className="flex items-center gap-2.5">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg border border-blue-200 bg-blue-50">
            <BrandMark size={18} />
          </div>
          <span className="text-[13px] font-semibold tracking-tight text-slate-900">
            Kreovar AI
          </span>
        </div>

        <div className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-medium text-slate-600">
          <span
            className={`h-1.5 w-1.5 rounded-full transition-colors ${
              isExecuting
                ? "bg-blue-600 animate-pulse"
                : "bg-emerald-500"
            }`}
          />
          <span>{isExecuting ? "Processing..." : "Ready"}</span>
        </div>
      </header>

      {/* 2. Clean Scrollable Conversation Feed */}
      <div
        ref={scrollRef}
        aria-live="polite"
        className="flex-1 min-h-0 overflow-y-auto px-4 py-5 scrollbar-thin scrollbar-thumb-slate-300 scrollbar-track-transparent"
      >
        {isEmpty ? (
          <div className="flex h-full flex-col items-center justify-center px-3 text-center">
            <div className="mb-3.5 flex h-11 w-11 items-center justify-center rounded-2xl border border-blue-200 bg-blue-50 shadow-sm">
              <Sparkles size={20} className="text-blue-600" />
            </div>
            <h2 className="text-[15px] font-semibold tracking-tight text-slate-900">
              How should we edit this?
            </h2>
            <p className="mt-1.5 max-w-[260px] text-[12px] leading-relaxed text-slate-500">
              Ask in plain English, Hindi, or Hinglish for captions, punch zooms, B-roll, cuts, or SFX.
            </p>
          </div>
        ) : (
          <div className="space-y-5">
            {turns.map((turn) => (
              <AiResponseBubble
                key={turn.id}
                turn={turn}
                steps={getTurnSteps(turn)}
                canUndo={canUndoTurn(turn)}
                onUndo={undoTurn}
                onFocusChange={focusChange}
              />
            ))}
          </div>
        )}
      </div>

      {/* 3. Bottom-Pinned Starter Pills (Empty State) & Auto-Expanding Input */}
      <footer className="flex-shrink-0 border-t border-slate-100 bg-white px-3.5 pb-3.5 pt-2.5">
        {isEmpty && (
          <div className="mb-2.5 flex flex-wrap gap-1.5">
            {STARTER_PROMPTS.map((chip) => (
              <button
                key={chip}
                type="button"
                disabled={isExecuting}
                onClick={() => void submitPrompt(chip)}
                className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-[11.5px] font-medium text-slate-700 transition-all hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700 active:scale-[0.98] disabled:opacity-40"
              >
                {chip}
              </button>
            ))}
          </div>
        )}

        <form
          onSubmit={(e) => {
            e.preventDefault();
            void submitPrompt();
          }}
          className="flex items-end gap-2 rounded-2xl border border-slate-200 bg-slate-50 p-2 shadow-sm transition-colors focus-within:border-blue-600 focus-within:bg-white focus-within:ring-2 focus-within:ring-blue-600/15"
        >
          <textarea
            ref={textareaRef}
            aria-label="Message Kreovar AI"
            value={input}
            maxLength={2000}
            disabled={isExecuting}
            rows={1}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                if (input.trim() && !isExecuting) {
                  void submitPrompt();
                }
              }
            }}
            placeholder="Describe any edit..."
            className="max-h-[136px] min-h-[24px] flex-1 resize-none bg-transparent py-1 pl-1.5 text-[13px] leading-relaxed text-slate-900 placeholder-slate-400 focus:outline-none disabled:opacity-50"
          />

          {isExecuting ? (
            <button
              type="button"
              onClick={stopExecution}
              aria-label="Stop processing"
              className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl bg-rose-600 text-white transition-all hover:bg-rose-700 active:scale-95"
            >
              <Square size={12} fill="currentColor" />
            </button>
          ) : (
            <button
              type="submit"
              disabled={!input.trim()}
              aria-label="Send message"
              className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white transition-all hover:bg-blue-700 active:scale-95 disabled:bg-slate-200 disabled:text-slate-400"
            >
              <ArrowUp size={16} strokeWidth={2.25} />
            </button>
          )}
        </form>
      </footer>
    </aside>
  );
}
