"use client";
import {useEffect,useMemo,useState} from 'react';
import {EditorStore,PlaybackStore} from '@/app/lib/editor/store';
import {MediaRepository} from '@/app/lib/editor/media';
import type {EditorProject} from '@/app/lib/editor/model';
import {EditorContext} from '../editor/workspace/EditorContext';
import Preview from '../editor/workspace/Preview';
import '../editor/workspace/editor.css';
import '../editor/workspace/editor-layout.css';

/** Stable existing preview/compositor; no new timeline renderer or media deadline. */
export default function ReferenceTimelinePreview({project}:{project:EditorProject}){
 const [store]=useState(()=>new EditorStore(project)),[playback]=useState(()=>new PlaybackStore()),[repository]=useState(()=>new MediaRepository()),[error,notify]=useState('');
 useEffect(()=>{repository.activate();return()=>repository.dispose();},[repository]);
 const context=useMemo(()=>({store,playback,repository,scope:'reference-preview:'+project.id,selection:[] as string[],select:()=>{},run:()=>{},notify}),[store,playback,repository,project.id]);
 return <EditorContext.Provider value={context}><div className="vx-editor rp-timeline-preview" style={{display:'flex',height:490,minHeight:300,width:'100%',borderRadius:9,overflow:'hidden'}}><Preview quality={720} readOnly/></div>{error&&<p role="alert">{error}</p>}</EditorContext.Provider>;
}
