"use client";

import dynamic from "next/dynamic";
import type { VeeloxTimelineProject } from "@/app/lib/timeline/types";
import type { PlannerInput } from "@/app/lib/timeline/planner";
import { useAuthGate } from "@/app/lib/useAuthGate";
import AuthLoadingScreen from "../AuthLoadingScreen";

export type EditorSaveState = "saved" | "saving" | "unsaved" | "save_failed" | "offline";
export interface VeeloxVideoEditorProps {
  initialTimeline?: VeeloxTimelineProject | null;
  plannerInput?: PlannerInput;
  projectId?: string;
  projectTitle?: string;
  userCredits?: number | null;
  authToken?: string | null;
  initialMediaUrl?: string;
  onRefreshCredits?: () => void;
  onExit?: () => void;
}
const Workspace = dynamic(() => import("./workspace/Workspace"), {
  ssr: false,
  loading: () => <AuthLoadingScreen label="Opening Kreovar editor…" />,
});
/** Existing routes and studio pipeline retain their public editor interface. */
export default function VeeloxVideoEditor(props: VeeloxVideoEditorProps) {
  const { status, session } = useAuthGate();
  if (status === "loading") return <AuthLoadingScreen label="Opening Kreovar editor…" />;
  return <Workspace key={`${props.projectId}:${session?.user.id || "guest"}`} {...props} authToken={props.authToken || session?.access_token} userId={session?.user.id} />;
}
