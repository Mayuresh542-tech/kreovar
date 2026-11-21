"use client";
import { createContext, useContext } from "react";
import { EditorStore, PlaybackStore, Edit } from "@/app/lib/editor/store";
import { MediaRepository } from "@/app/lib/editor/media";
import type { DetectedSilenceRange } from "@/app/lib/editor/audioSilenceDetector";
export interface EditorContextValue {
  store:EditorStore;playback:PlaybackStore;repository:MediaRepository;scope:string;authToken?:string|null;
  selection:string[];select:(ids:string[])=>void;run:(edit:Edit)=>void;notify:(message:string)=>void;
  isExecuting?:boolean;setIsExecuting?:(executing:boolean)=>void;
  detectedSilences?: DetectedSilenceRange[];
  setDetectedSilences?: (ranges: DetectedSilenceRange[]) => void;
}
export const EditorContext=createContext<EditorContextValue|null>(null);
export function useEditor(){const value=useContext(EditorContext);if(!value)throw new Error("Editor provider is missing.");return value;}
