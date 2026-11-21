"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import { LoaderCircle } from "lucide-react";
import { createProject } from "@/app/lib/editor/model";
import { createDemoProject, isDemoProject, DEMO_PROJECT_TITLE } from "@/app/lib/editor/demoProject";
import { fromLegacy, projectFromPlanner } from "@/app/lib/editor/bridge";
import { EditorStore, PlaybackStore, Edit } from "@/app/lib/editor/store";
import { MediaRepository } from "@/app/lib/editor/media";
import { cacheKey } from "@/app/lib/editor/cache";
import { usePersistence } from "@/app/lib/editor/usePersistence";
import { EditorContext } from "./EditorContext";
import type { DetectedSilenceRange } from "@/app/lib/editor/audioSilenceDetector";
import { InitialMedia } from "./ConnectedTools";
import EditorLayout from "../EditorLayout";
import MobileEditorLayout from "../mobile/MobileEditorLayout";
import type { VeeloxVideoEditorProps } from "../VeeloxVideoEditor";
import "./editor.css";
import "./editor-layout.css";

export default function Workspace({
  initialTimeline,
  plannerInput,
  projectId = "default_project",
  projectTitle = "Untitled video",
  onExit,
  userId,
  authToken,
  initialMediaUrl,
}: VeeloxVideoEditorProps & { userId?: string }) {
  const [store] = useState(
    () =>
      new EditorStore(
        initialTimeline
          ? fromLegacy(initialTimeline)
          : plannerInput
          ? projectFromPlanner({ ...plannerInput, projectId }, projectTitle)
          : isDemoProject(projectId)
          ? createDemoProject(projectId, projectTitle === "Untitled video" ? DEMO_PROJECT_TITLE : projectTitle)
          : createProject(projectId, projectTitle)
      )
  );
  const [playback] = useState(() => new PlaybackStore());
  const [repository] = useState(() => new MediaRepository());
  const [selection, setSelection] = useState<string[]>([]);
  const [notice, setNotice] = useState<string>();

  const [isExecuting, setIsExecuting] = useState(false);
  const [detectedSilences, setDetectedSilences] = useState<DetectedSilenceRange[]>([]);

  const persistence = usePersistence(store, userId);
  const notify = useCallback((message: string) => setNotice(message), []);
  const select = useCallback((ids: string[]) => {
    setSelection(ids);
  }, []);

  const run = useCallback(
    (edit: Edit) => {
      if (isExecuting) {
        notify("Timeline is locked while AI is editing.");
        return;
      }
      try {
        store.execute(edit);
      } catch (e) {
        notify(e instanceof Error ? e.message : "This edit could not be applied.");
      }
    },
    [store, notify, isExecuting]
  );

  const context = useMemo(
    () => ({
      store,
      playback,
      repository,
      scope: cacheKey(userId, projectId),
      authToken,
      selection,
      select,
      run,
      notify,
      isExecuting,
      setIsExecuting,
      detectedSilences,
      setDetectedSilences,
    }),
    [store, playback, repository, userId, projectId, authToken, selection, select, run, notify, isExecuting, detectedSilences]
  );

  useEffect(() => {
    repository.activate();
    return () => repository.dispose();
  }, [repository]);

  useEffect(
    () =>
      store.subscribe(() =>
        setSelection((previous) =>
          previous.some((id) => !store.getSnapshot().clips[id])
            ? previous.filter((id) => store.getSnapshot().clips[id])
            : previous
        )
      ),
    [store]
  );

  const [isMobile, setIsMobile] = useState<boolean>(() =>
    typeof window !== "undefined" ? window.matchMedia("(max-width: 767px)").matches : false
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(max-width: 767px)");
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  const layoutProps = {
    onExit,
    persistenceState: persistence.state,
    retrySave: persistence.retry,
    recoveryMessage: persistence.recoveryMessage,
    dismissRecovery: persistence.dismissRecovery,
    notice: notice || persistence.error,
    onDismissNotice: () => setNotice(undefined),
    conflict: !!persistence.conflict,
    onReloadConflict: persistence.reload,
  };

  return (
    <EditorContext.Provider value={context}>
      <InitialMedia url={initialMediaUrl} />
      {!persistence.ready ? (
        <div className="h-[100dvh] w-screen bg-[#F8FAFC] flex flex-col items-center justify-center text-slate-600 gap-3 select-none">
          <LoaderCircle className="animate-spin text-blue-600" size={32} />
          <span className="font-medium text-sm text-slate-800">Opening your Kreovar workspace…</span>
        </div>
      ) : isMobile ? (
        <MobileEditorLayout {...layoutProps} />
      ) : (
        <EditorLayout {...layoutProps} />
      )}
    </EditorContext.Provider>
  );
}
