"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { publicErrorMessage, publicServiceText } from "@/app/lib/serviceMessages";
import { useEditor } from "./workspace/EditorContext";
import { useProject } from "@/app/lib/editor/store";
import {
  createEditingJob,
  type EditingJob,
} from "@/app/lib/editor/sequentialEdit";
import { runSequentialEdit } from "@/app/lib/editor/sequentialEditClient";
import {
  buildProgressiveSteps,
  collectDegradationNotes,
  summarizeTimelineDiff,
  type ProgressiveStep,
  type TimelineChangeItem,
} from "@/app/lib/editor/conversationalIntent";

export interface AiChatTurn {
  id: string;
  prompt: string;
  timestamp: string;
  status: "running" | "completed" | "failed" | "cancelled";
  responseText?: string;
  steps: ProgressiveStep[];
  changes: TimelineChangeItem[];
  degradationNotes: string[];
  hadCaptions: boolean;
  isClarification?: boolean;
  didModifyTimeline?: boolean;
  preRevision: number;
  postRevision?: number;
  undone?: boolean;
  job?: EditingJob;
}

function formatTurnSummary(job: EditingJob | undefined, changes: TimelineChangeItem[]): string {
  if (!job) return "Timeline updated.";

  const clarificationStage = job.stages?.find((s) => s.output?.questions?.length);
  if (clarificationStage?.output?.questions?.length) {
    return (
      publicServiceText(clarificationStage.output.questions[0]) ||
      publicServiceText(clarificationStage.output.summary) ||
      "Could you clarify how you'd like me to edit this?"
    );
  }

  const editStage =
    job.stages?.find((s) => s.id === "applyRequestedEdits") ||
    [...(job.stages || [])]
      .reverse()
      .find((s) => s.id !== "validateEdit" && s.id !== "analyzeFootage" && s.output?.summary);

  const rawSummary = editStage?.output?.summary;
  if (rawSummary) {
    const cleaned = publicServiceText(rawSummary)
      .replace(/^My understanding:\s*/i, "")
      .trim();
    if (cleaned) return cleaned;
  }

  if (changes.length > 0) {
    return `Timeline updated (${changes.map((c) => c.label.toLowerCase()).join(", ")}).`;
  }

  return "Timeline updated with your requested edits.";
}

export function useConversationalAiChat() {
  const { store, repository, scope, selection, playback, select, authToken, notify } =
    useEditor();
  const project = useProject(store);
  const activeJob = project.editingJob;

  const [input, setInput] = useState("");
  const [isExecuting, setIsExecuting] = useState(false);
  const [turns, setTurns] = useState<AiChatTurn[]>(() => {
    const history = store.getSnapshot().editingHistory || [];
    if (!history.length) return [];
    return history.map((item) => ({
      id: item.jobId,
      prompt: item.instructions,
      timestamp: "",
      status: item.status === "completed" ? "completed" : "failed",
      responseText: publicServiceText(item.summary) || "Edit completed.",
      steps: buildProgressiveSteps(
        item.instructions,
        undefined,
        false,
        false
      ).map((step) => ({
        ...step,
        status: item.status === "completed" ? "completed" : "failed",
      })),
      changes: [],
      degradationNotes: [],
      hadCaptions: false,
      didModifyTimeline: false,
      preRevision: 0,
    }));
  });

  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const stopExecution = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
      setIsExecuting(false);
      notify("AI edit paused.");
    }
  }, [notify]);

  const submitPrompt = useCallback(
    async (overridePrompt?: string) => {
      const text = (overridePrompt ?? input).trim();
      if (!text || isExecuting) return;

      const beforeProject = store.getSnapshot();
      const preRevision = beforeProject.revision;
      const hadCaptions = Object.values(beforeProject.clips).some(
        (c) => Boolean(c.contentId && beforeProject.captions[c.contentId])
      );
      const selectedClipIds = selection.filter((id) => !!beforeProject.clips[id]);
      const turnId = crypto.randomUUID();
      const timestamp = new Date().toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      });

      setInput("");
      playback.set(playback.getSnapshot().time, false);
      setIsExecuting(true);

      const initialSteps = buildProgressiveSteps(text, undefined, true, hadCaptions);
      setTurns((prev) => [
        ...prev,
        {
          id: turnId,
          prompt: text,
          timestamp,
          status: "running",
          steps: initialSteps,
          changes: [],
          degradationNotes: [],
          hadCaptions,
          preRevision,
        },
      ]);

      const controller = new AbortController();
      abortRef.current = controller;

      let createdJob: EditingJob | undefined;

      try {
        // Route all natural language instructions directly through the LLM intent parser
        createdJob = createEditingJob(beforeProject, text, selectedClipIds);

        await runSequentialEdit(
          store,
          repository,
          scope,
          createdJob,
          controller.signal,
          authToken
        );

        const afterProject = store.getSnapshot();
        const finishedJob = afterProject.editingJob;
        const clarificationStage = finishedJob?.stages?.find(
          (s) => s.output?.questions?.length
        );
        const isClarification = Boolean(clarificationStage?.output?.questions?.length);
        const changes = summarizeTimelineDiff(beforeProject, afterProject, finishedJob);
        const didModifyTimeline =
          !isClarification &&
          afterProject.revision > preRevision &&
          (changes.length > 0 || (finishedJob?.appliedOperations?.length ?? 0) > 0);
        const degradationNotes = collectDegradationNotes(finishedJob);
        const responseText = formatTurnSummary(finishedJob, changes);

        setTurns((prev) =>
          prev.map((turn) =>
            turn.id === turnId
              ? {
                  ...turn,
                  status: finishedJob?.status === "failed" ? "failed" : "completed",
                  steps: buildProgressiveSteps(text, finishedJob, false, hadCaptions),
                  changes,
                  degradationNotes,
                  responseText,
                  isClarification,
                  didModifyTimeline,
                  postRevision: afterProject.revision,
                  job: finishedJob,
                }
              : turn
          )
        );
      } catch (err: unknown) {
        const afterProject = store.getSnapshot();
        const latestJob = afterProject.editingJob;
        const wasAborted = controller.signal.aborted;
        const friendlyError = wasAborted
          ? "Edit stopped before completion."
          : publicErrorMessage(
              err instanceof Error ? err.message : undefined,
              "Could not complete that edit. Please rephrase or try again."
            );

        setTurns((prev) =>
          prev.map((turn) =>
            turn.id === turnId
              ? {
                  ...turn,
                  status: wasAborted ? "cancelled" : "failed",
                  steps: buildProgressiveSteps(
                    text,
                    latestJob || (createdJob ? { ...createdJob, status: wasAborted ? "cancelled" : "failed" } : undefined),
                    false,
                    hadCaptions
                  ),
                  degradationNotes: collectDegradationNotes(latestJob),
                  responseText: friendlyError,
                }
              : turn
          )
        );

        if (!wasAborted) {
          notify(friendlyError);
        }
      } finally {
        setIsExecuting(false);
        abortRef.current = null;
      }
    },
    [authToken, input, isExecuting, notify, playback, repository, scope, selection, store]
  );

  const canUndoTurn = useCallback(
    (turn: AiChatTurn): boolean =>
      Boolean(
        turn.didModifyTimeline &&
          !turn.undone &&
          store.canUndo &&
          project.revision === turn.postRevision
      ),
    [project.revision, store.canUndo]
  );

  const undoTurn = useCallback(
    (turnId: string) => {
      const target = turns.find((t) => t.id === turnId);
      if (!target || !canUndoTurn(target)) return;
      store.undo();
      setTurns((prev) =>
        prev.map((t) => (t.id === turnId ? { ...t, undone: true } : t))
      );
      notify("AI edit undone.");
    },
    [canUndoTurn, notify, store, turns]
  );

  const focusChange = useCallback(
    (item: TimelineChangeItem) => {
      if (item.time !== undefined) {
        playback.set(item.time, false);
      }
      if (item.clipId && store.getSnapshot().clips[item.clipId]) {
        select([item.clipId]);
      }
    },
    [playback, select, store]
  );

  const getTurnSteps = useCallback(
    (turn: AiChatTurn): ProgressiveStep[] => {
      if (turn.status === "running" && activeJob) {
        return buildProgressiveSteps(turn.prompt, activeJob, isExecuting, turn.hadCaptions);
      }
      return turn.steps;
    },
    [activeJob, isExecuting]
  );

  return {
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
  };
}
