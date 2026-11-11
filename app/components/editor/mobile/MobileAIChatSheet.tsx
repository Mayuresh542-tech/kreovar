"use client";

import React, { useState, useRef, useEffect } from "react";
import {
  ChevronDown,
  ArrowUp,
  Square,
  Mic,
  MicOff,
  Sparkles,
} from "lucide-react";
import BrandMark from "../../BrandMark";
import AiResponseBubble from "../AiResponseBubble";
import { useConversationalAiChat } from "../useConversationalAiChat";
import { STARTER_PROMPTS } from "@/app/lib/editor/conversationalIntent";
import { useEditor } from "../workspace/EditorContext";
import { useProject } from "@/app/lib/editor/store";

interface MobileAIChatSheetProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function MobileAIChatSheet({
  isOpen,
  onClose,
}: MobileAIChatSheetProps) {
  const { notify } = useEditor();
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

  const [isListening, setIsListening] = useState(false);
  const [translateY, setTranslateY] = useState(0);

  const dragStartYRef = useRef<number | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<{ stop: () => void } | null>(null);
  const inputBoxRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (isOpen) {
      setTranslateY(0);
      scrollRef.current?.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: "smooth",
      });
    }
  }, [isOpen, turns, isExecuting, project.editingJob?.currentStage, project.editingJob?.status]);

  // Auto-expand textarea height up to 108px on mobile
  useEffect(() => {
    const el = inputBoxRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 108)}px`;
  }, [input]);

  useEffect(() => {
    return () => {
      recognitionRef.current?.stop();
    };
  }, []);

  if (!isOpen) return null;

  const isEmpty = turns.length === 0;

  const onHeaderTouchStart = (e: React.TouchEvent) => {
    dragStartYRef.current = e.touches[0].clientY;
  };
  const onHeaderTouchMove = (e: React.TouchEvent) => {
    if (dragStartYRef.current === null) return;
    const delta = e.touches[0].clientY - dragStartYRef.current;
    if (delta > 0) setTranslateY(delta);
  };
  const onHeaderTouchEnd = () => {
    if (translateY > 90) onClose();
    setTranslateY(0);
    dragStartYRef.current = null;
  };

  const handleSend = async (overrideText?: string) => {
    navigator.vibrate?.(8);
    await submitPrompt(overrideText);
  };

  const toggleVoiceDictation = () => {
    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
      return;
    }
    const win = window as unknown as {
      SpeechRecognition?: new () => {
        lang: string;
        interimResults: boolean;
        onresult: (e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void;
        onerror: () => void;
        onend: () => void;
        start: () => void;
        stop: () => void;
      };
      webkitSpeechRecognition?: new () => {
        lang: string;
        interimResults: boolean;
        onresult: (e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void;
        onerror: () => void;
        onend: () => void;
        start: () => void;
        stop: () => void;
      };
    };
    const SpeechRec = win.SpeechRecognition || win.webkitSpeechRecognition;
    if (!SpeechRec) {
      notify("Voice dictation is not supported in this browser.");
      return;
    }
    try {
      const rec = new SpeechRec();
      rec.lang = "en-IN";
      rec.interimResults = false;
      rec.onresult = (event) => {
        const transcript = event.results?.[0]?.[0]?.transcript || "";
        if (transcript) {
          setInput((prev) => (prev ? `${prev} ${transcript}` : transcript));
        }
      };
      rec.onerror = () => setIsListening(false);
      rec.onend = () => setIsListening(false);
      recognitionRef.current = rec;
      rec.start();
      setIsListening(true);
      navigator.vibrate?.(8);
    } catch {
      setIsListening(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      {/* Backdrop */}
      <div
        onClick={onClose}
        className="absolute inset-0 bg-slate-950/35 backdrop-blur-sm"
        aria-hidden="true"
      />

      {/* Minimalist 80dvh Bottom Sheet */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Kreovar AI"
        style={{ transform: `translateY(${translateY}px)` }}
        className="relative flex h-[80dvh] max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-3xl border-t border-slate-200 bg-white shadow-2xl transition-transform duration-200 ease-out"
      >
        {/* Top Bar: Swipe Handle + Logo + Ready/Processing */}
        <header
          onTouchStart={onHeaderTouchStart}
          onTouchMove={onHeaderTouchMove}
          onTouchEnd={onHeaderTouchEnd}
          className="flex-shrink-0 touch-none border-b border-slate-200 bg-white px-4 pb-2.5 pt-2"
        >
          <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-slate-300" />
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-xl border border-blue-200 bg-blue-50">
                <BrandMark size={18} />
              </div>
              <span className="text-[13.5px] font-semibold tracking-tight text-slate-900">
                Kreovar AI
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-[11px] font-medium text-slate-600">
                <span
                  className={`h-1.5 w-1.5 rounded-full ${
                    isExecuting ? "bg-blue-600 animate-pulse" : "bg-emerald-500"
                  }`}
                />
                {isExecuting ? "Processing..." : "Ready"}
              </span>
            </div>

            <button
              type="button"
              onClick={onClose}
              aria-label="Minimize Kreovar AI"
              className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl text-slate-500 active:bg-slate-100 active:text-slate-900"
            >
              <ChevronDown size={20} />
            </button>
          </div>
        </header>

        {/* Scrollable Conversation Feed */}
        <div
          ref={scrollRef}
          aria-live="polite"
          className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-3.5 py-4 scrollbar-thin scrollbar-thumb-slate-300"
        >
          {isEmpty ? (
            <div className="flex h-full flex-col items-center justify-center px-4 text-center">
              <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-2xl border border-blue-200 bg-blue-50">
                <Sparkles size={20} className="text-blue-600" />
              </div>
              <h2 className="text-[15px] font-semibold text-slate-900">
                How should we edit this?
              </h2>
              <p className="mt-1.5 max-w-[260px] text-xs leading-relaxed text-slate-500">
                Describe captions, cuts, punch zooms, B-roll, or sound effects in English, Hindi, or Hinglish.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {turns.map((turn) => (
                <AiResponseBubble
                  key={turn.id}
                  turn={turn}
                  steps={getTurnSteps(turn)}
                  canUndo={canUndoTurn(turn)}
                  onUndo={undoTurn}
                  onFocusChange={focusChange}
                  touchFriendly
                />
              ))}
            </div>
          )}
        </div>

        {/* Bottom-Pinned Empty-State Starter Pills + Auto-Expanding Input */}
        <footer className="flex-shrink-0 space-y-2.5 border-t border-slate-200 bg-white px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2.5">
          {isEmpty && (
            <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-0.5">
              {STARTER_PROMPTS.map((pill) => (
                <button
                  key={pill}
                  type="button"
                  disabled={isExecuting}
                  onClick={() => void handleSend(pill)}
                  className="min-h-[36px] whitespace-nowrap rounded-full border border-slate-200 bg-slate-50 px-3 text-[12px] font-medium text-slate-700 active:scale-95 disabled:opacity-40"
                >
                  {pill}
                </button>
              ))}
            </div>
          )}

          <div className="flex items-end gap-1.5 rounded-2xl border border-slate-200 bg-slate-50 p-1.5 focus-within:border-blue-600 focus-within:bg-white">
            <button
              type="button"
              onClick={toggleVoiceDictation}
              aria-label={isListening ? "Stop voice dictation" : "Start voice dictation"}
              className={`flex min-h-[44px] min-w-[44px] flex-shrink-0 items-center justify-center rounded-xl transition-colors ${
                isListening
                  ? "animate-pulse bg-rose-600 text-white"
                  : "text-slate-500 active:text-slate-900"
              }`}
            >
              {isListening ? <MicOff size={18} /> : <Mic size={18} />}
            </button>

            <textarea
              ref={inputBoxRef}
              value={input}
              maxLength={2000}
              disabled={isExecuting}
              onChange={(e) => setInput(e.target.value)}
              onFocus={() => {
                setTimeout(() => {
                  inputBoxRef.current?.scrollIntoView({ block: "nearest" });
                }, 150);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  if (input.trim() && !isExecuting) {
                    void handleSend();
                  }
                }
              }}
              rows={1}
              placeholder="Describe any edit..."
              className="max-h-[108px] min-h-[44px] flex-1 resize-none bg-transparent py-2.5 text-base leading-snug text-slate-900 placeholder-slate-400 focus:outline-none disabled:opacity-50"
            />

            {isExecuting ? (
              <button
                type="button"
                onClick={stopExecution}
                aria-label="Stop processing"
                className="flex min-h-[44px] min-w-[44px] flex-shrink-0 items-center justify-center rounded-xl bg-rose-600 text-white active:scale-95"
              >
                <Square size={15} fill="currentColor" />
              </button>
            ) : (
              <button
                type="button"
                disabled={!input.trim()}
                onClick={() => void handleSend()}
                aria-label="Send message"
                className="flex min-h-[44px] min-w-[44px] flex-shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white transition-colors active:scale-95 disabled:bg-slate-200 disabled:text-slate-400"
              >
                <ArrowUp size={18} strokeWidth={2.25} />
              </button>
            )}
          </div>
        </footer>
      </div>
    </div>
  );
}
