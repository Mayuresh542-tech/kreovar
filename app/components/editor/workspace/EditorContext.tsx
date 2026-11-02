"use client";
import { createContext, useContext } from "react";
import { EditorStore, PlaybackStore, Edit } from "@/app/lib/editor/store";
import { MediaRepository } from "@/app/lib/editor/media";
export interface EditorContextValue {
  store:EditorStore;playback:PlaybackStore;repository:MediaRepository;scope:string;authToken?:string|null;
  selection:string[];select:(ids:string[])=>void;run:(edit:Edit)=>void;notify:(message:string)=>void;
}
export const EditorContext=createContext<EditorContextValue|null>(null);
export function useEditor(){const value=useContext(EditorContext);if(!value)throw new Error("Editor provider is missing.");return value;}
