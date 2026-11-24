import {anchorVisualTreatment} from './visualTreatment';
import {getSpeedCurvePreset, calculateTimelineDurationFromSource} from './speedCurves';
import {readStyleSurface} from "./styleSurface";
import {studioStyleFromEditor} from './captionStyleBridge';
import {readFontAccent} from "../captions/typography";
import {readTextGradient} from "./textGradient";
import { Clip, EditorProject, MediaAsset, TrackKind, TransitionKind, TextStyle, canPlace, clamp, defaultStyle, defaultTransform, uid, dimensions } from "./model";

// All edits, including future AI EDLs, pass through these pure document operations.
function editable(p: EditorProject, id: string): Clip {
  const c = p.clips[id];
  if (!c) throw new Error("Clip no longer exists.");
  if (p.tracks[c.trackId].locked) throw new Error("Unlock this track before editing.");
  return c;
}
function put(p: EditorProject, c: Clip): EditorProject { return { ...p, clips:{...p.clips,[c.id]:c} }; }
function cleanTransitions(p: EditorProject): EditorProject {
  return {...p,transitions:Object.fromEntries(Object.entries(p.transitions).filter(([,t]) => {
    const a=p.clips[t.fromClipId], b=p.clips[t.toClipId];
    return a && b && a.trackId===b.trackId && Math.abs(a.startTime+a.duration-b.startTime)<1/p.settings.fps && t.duration<=Math.min(a.duration,b.duration);
  }))};
}
export function addClip(p: EditorProject, assetId: string, trackId: string, startTime: number, options: Partial<Clip> = {}): EditorProject {
  const asset=p.assets[assetId], track=p.tracks[trackId];
  if (!asset || !track || !canPlace(track.kind,asset.kind)) throw new Error("This media is not compatible with the selected track.");
  if (track.locked) throw new Error("Unlock this track before adding media.");
  const duration=options.duration ?? (asset.kind==="image" ? 5 : asset.duration);
  const c: Clip = { id:uid(),assetId,trackId,name:asset.name,startTime:Math.max(0,startTime),duration,sourceStart:0,sourceEnd:asset.kind==="image"?duration:asset.duration,transform:{...defaultTransform},volume:1,speed:1,fadeIn:0,fadeOut:0,effects:{brightness:0,contrast:0,saturation:0,blur:0},...options };
  if (!Number.isFinite(c.duration) || c.duration<1/p.settings.fps) throw new Error("The media has no usable duration.");
  return {...put(p,c),tracks:{...p.tracks,[trackId]:{...track,clipIds:[...track.clipIds,c.id]}}};
}
export function addAsset(p: EditorProject, asset: MediaAsset): EditorProject { return {...p,assets:{...p.assets,[asset.id]:asset},...(p.removedProjectAssetIds?{removedProjectAssetIds:p.removedProjectAssetIds.filter(id=>id!==asset.id&&id!==asset.libraryId)}:{})}; }
export function removeClip(p: EditorProject,id: string): EditorProject {
  const c=editable(p,id), clips={...p.clips}, textLayers={...p.textLayers}, captions={...p.captions};
  delete clips[id]; if(c.contentId){delete textLayers[c.contentId];delete captions[c.contentId];}
  return cleanTransitions({...p,clips,textLayers,captions,tracks:{...p.tracks,[c.trackId]:{...p.tracks[c.trackId],clipIds:p.tracks[c.trackId].clipIds.filter(x=>x!==id)}}});
}
export function moveClip(p: EditorProject,id: string,startTime: number,trackId?: string): EditorProject {
  const c=editable(p,id), target=p.tracks[trackId || c.trackId], asset=c.assetId?p.assets[c.assetId]:undefined;
  if(!target || target.locked) throw new Error("The destination track is locked.");
  if(asset ? !canPlace(target.kind,asset.kind) : target.kind!==p.tracks[c.trackId].kind) throw new Error("Incompatible track.");
  const safeStartTime = Number.isFinite(startTime) ? Math.max(0, startTime) : c.startTime;
  let next=put(p,{...c,startTime:safeStartTime,trackId:target.id});
  if(target.id!==c.trackId) next={...next,tracks:{...p.tracks,[c.trackId]:{...p.tracks[c.trackId],clipIds:p.tracks[c.trackId].clipIds.filter(x=>x!==id)},[target.id]:{...target,clipIds:[...target.clipIds,id]}}};
  return cleanTransitions(next);
}
function reindexStudioData(data: import("./editorCaptionStudio").StudioCaptionData | undefined, surviving: { origIdx: number }[]): import("./editorCaptionStudio").StudioCaptionData | undefined {
  if (!data) return undefined;
  const origToNew = new Map(surviving.map(({ origIdx }, newIdx) => [origIdx, newIdx]));
  const emphasizedWords = data.emphasizedWords
    ?.map(i => origToNew.get(i))
    .filter((i): i is number => i !== undefined);
  const wordStyles: Record<string, any> = {};
  if (data.wordStyles) {
    for (const [k, v] of Object.entries(data.wordStyles)) {
      const newIdx = origToNew.get(Number(k));
      if (newIdx !== undefined) wordStyles[String(newIdx)] = v;
    }
  }
  return {
    ...data,
    ...(emphasizedWords !== undefined ? { emphasizedWords } : {}),
    ...(data.wordStyles ? { wordStyles } : {})
  };
}

export function trimClip(p: EditorProject,id: string,edge: "left"|"right",time: number, options?: { ripple?: boolean }): EditorProject {
  if(!Number.isFinite(time)) return p;
  const c=editable(p,id), min=Math.max(1/p.settings.fps, 0.05), asset=c.assetId?p.assets[c.assetId]:undefined;
  const bounded=asset && asset.kind!=="image";
  const oldDuration = c.duration;
  const oldStart = c.startTime;
  let nextClip: Clip;
  if(edge==="left") {
    const start=clamp(time,bounded?Math.max(0,c.startTime-c.sourceStart/c.speed):0,c.startTime+c.duration-min);
    const delta=start-c.startTime;
    nextClip = {...c,...(c.visualTreatment?{visualTreatment:anchorVisualTreatment(c)}:{}),startTime:start,duration:c.duration-delta,sourceStart:c.sourceStart+delta*c.speed};
  } else {
    const end=clamp(time,c.startTime+min,bounded?c.startTime+(asset.duration-c.sourceStart)/c.speed:86400);
    nextClip = {...c,...(c.visualTreatment?{visualTreatment:anchorVisualTreatment(c)}:{}),duration:end-c.startTime,sourceEnd:c.sourceStart+(end-c.startTime)*c.speed};
  }
  let next = put(p, nextClip);
  if (c.contentId && p.captions[c.contentId]) {
    const orig = p.captions[c.contentId];
    if (orig.words && orig.words.length > 0) {
      const sStart = nextClip.sourceStart;
      const sEnd = nextClip.sourceEnd;
      const surviving = orig.words
        .map((w, origIdx) => ({ w, origIdx }))
        .filter(({ w }) => w.end > sStart && w.start < sEnd);
      const words = surviving.map(({ w }) => ({
        ...w,
        start: Math.max(sStart, w.start),
        end: Math.min(sEnd, w.end)
      }));
      next = {
        ...next,
        captions: {
          ...next.captions,
          [c.contentId]: {
            ...orig,
            text: words.map(w => w.word).join(" "),
            words,
            ...(orig.studioData ? { studioData: reindexStudioData(orig.studioData, surviving) } : {})
          }
        }
      };
    }
  }

  // Ripple handling: pull downstream clips on the same track to close or adjust gaps
  if (options?.ripple) {
    if (edge === "right") {
      const deltaDuration = nextClip.duration - oldDuration;
      if (Math.abs(deltaDuration) > 1e-4) {
        const downstream = (next.tracks[c.trackId]?.clipIds || [])
          .map(cid => next.clips[cid])
          .filter((other): other is Clip => !!other && other.id !== c.id && other.startTime >= oldStart + oldDuration - 1e-4)
          .sort((a, b) => a.startTime - b.startTime);
        for (const down of downstream) {
          next = put(next, { ...down, startTime: Math.max(0, down.startTime + deltaDuration) });
        }
      }
    } else if (edge === "left") {
      const deltaStart = nextClip.startTime - oldStart;
      if (Math.abs(deltaStart) > 1e-4) {
        // In ripple left-trim, the clip's start stays anchored at oldStart, with trimmed content
        next = put(next, { ...nextClip, startTime: oldStart });
        const downstream = (next.tracks[c.trackId]?.clipIds || [])
          .map(cid => next.clips[cid])
          .filter((other): other is Clip => !!other && other.id !== c.id && other.startTime >= oldStart + oldDuration - 1e-4)
          .sort((a, b) => a.startTime - b.startTime);
        for (const down of downstream) {
          next = put(next, { ...down, startTime: Math.max(0, down.startTime - deltaStart) });
        }
      }
    }
  }

  return cleanTransitions(next);
}
export function splitClip(p: EditorProject,id: string,time: number): EditorProject {
  const c=editable(p,id), left=time-c.startTime,min=1/p.settings.fps;
  if(left<min || c.duration-left<min) throw new Error("Move the playhead inside the clip to split.");
  const newId=uid(), contentId=c.contentId?uid():undefined, source=c.sourceStart+left*c.speed;
  const visual=anchorVisualTreatment(c),right: Clip={...c,...(visual?{visualTreatment:visual}:{}),id:newId,contentId,startTime:time,duration:c.duration-left,sourceStart:source,fadeIn:0};
  const next=put(put(p,{...c,...(visual?{visualTreatment:visual}:{}),duration:left,sourceEnd:source,fadeOut:0}),right);
  return cleanTransitions({
    ...next,
    tracks: {
      ...p.tracks,
      [c.trackId]: { ...p.tracks[c.trackId], clipIds: [...p.tracks[c.trackId].clipIds, newId] }
    },
    textLayers: contentId && c.contentId && p.textLayers[c.contentId]
      ? { ...p.textLayers, [contentId]: { ...p.textLayers[c.contentId], id: contentId } }
      : p.textLayers,
    captions: contentId && c.contentId && p.captions[c.contentId]
      ? { ...p.captions, [contentId]: { ...p.captions[c.contentId], id: contentId } }
      : p.captions
  });
}
export function duplicateClip(p: EditorProject,id: string,time?:number): EditorProject {
  const c=editable(p,id), newId=uid(), contentId=c.contentId?uid():undefined;
  return {...put(p,{...c,id:newId,contentId,startTime:time??c.startTime+c.duration}),tracks:{...p.tracks,[c.trackId]:{...p.tracks[c.trackId],clipIds:[...p.tracks[c.trackId].clipIds,newId]}},textLayers:contentId&&c.contentId&&p.textLayers[c.contentId]?{...p.textLayers,[contentId]:{...p.textLayers[c.contentId],id:contentId}}:p.textLayers,captions:contentId&&c.contentId&&p.captions[c.contentId]?{...p.captions,[contentId]:{...p.captions[c.contentId],id:contentId}}:p.captions};
}
export function changeClipProperty(p: EditorProject,id: string,changes: Partial<Pick<Clip,"name"|"transform"|"volume"|"speed"|"fadeIn"|"fadeOut"|"effects"|"audioRole"|"ducking"|"surface"|"mediaAnimation"|"kenBurns"|"preservePitch"|"speedCurveId">>): EditorProject {
  const c=editable(p,id), next={...c,...changes};
  if(changes.surface!==undefined){if(!c.assetId||p.assets[c.assetId]?.kind==='audio')throw Error('Select a video or image for a surface treatment.');next.surface=readStyleSurface(changes.surface);}
  if(next.audioRole!==undefined&&!["speech","background","sfx"].includes(next.audioRole))throw new Error("Choose a supported audio role.");
  if(next.ducking!==undefined&&typeof next.ducking!=="boolean")throw new Error("Invalid audio ducking setting.");
  next.volume=clamp(next.volume,0,2); next.speed=clamp(next.speed,0.1,10);
  if(changes.preservePitch!==undefined) next.preservePitch=Boolean(changes.preservePitch);
  if(changes.speedCurveId!==undefined){
    next.speedCurveId=changes.speedCurveId;
    if(changes.speedCurveId && changes.speedCurveId !== "standard") {
      const preset = getSpeedCurvePreset(changes.speedCurveId);
      const span = Math.max(0.05, c.sourceEnd - c.sourceStart);
      next.duration = Math.max(0.05, calculateTimelineDurationFromSource(span, preset));
    }
  } else if(changes.speed!==undefined) {
    next.duration=(c.sourceEnd-c.sourceStart)/next.speed;
  }
  next.fadeIn=clamp(next.fadeIn,0,next.duration);next.fadeOut=clamp(next.fadeOut,0,next.duration);
  if(changes.transform){
    next.transform={
      x: Number.isFinite(changes.transform.x) ? changes.transform.x : c.transform.x,
      y: Number.isFinite(changes.transform.y) ? changes.transform.y : c.transform.y,
      scale: clamp(Number.isFinite(changes.transform.scale) ? changes.transform.scale : c.transform.scale, 0.05, 10),
      rotation: Number.isFinite(changes.transform.rotation) ? changes.transform.rotation : c.transform.rotation,
      opacity: clamp(Number.isFinite(changes.transform.opacity) ? changes.transform.opacity : c.transform.opacity, 0, 1)
    };
  } else {
    next.transform={...next.transform,scale:clamp(next.transform.scale,0.05,10),opacity:clamp(next.transform.opacity,0,1)};
  }
  if(changes.effects){
    next.effects={
      brightness: clamp(Number.isFinite(changes.effects.brightness) ? changes.effects.brightness : c.effects.brightness, -100, 100),
      contrast: clamp(Number.isFinite(changes.effects.contrast) ? changes.effects.contrast : c.effects.contrast, -100, 100),
      saturation: clamp(Number.isFinite(changes.effects.saturation) ? changes.effects.saturation : c.effects.saturation, -100, 100),
      blur: clamp(Number.isFinite(changes.effects.blur) ? changes.effects.blur : c.effects.blur, 0, 50)
    };
  }
  return cleanTransitions(put(p,next));
}
export function resetClipTransform(p: EditorProject, id: string): EditorProject {
  const c = editable(p, id);
  const track = p.tracks[c.trackId];
  const isCaption = track?.kind === "caption";
  return changeClipProperty(p, id, {
    transform: {
      x: 0,
      y: isCaption ? 0.35 : 0,
      scale: 1,
      rotation: 0,
      opacity: 1
    }
  });
}
export function changeCaptionProperty(p: EditorProject, id: string, changes: Partial<Pick<import("./model").Caption, "highlightColor" | "motion" | "highlightMode" | "highlightWords">>): EditorProject {
  const c = editable(p, id);
  if (!c.contentId || !p.captions[c.contentId]) throw new Error("Select a caption clip.");
  const caption = p.captions[c.contentId];
  return {
    ...p,
    captions: {
      ...p.captions,
      [c.contentId]: {
        ...caption,
        ...changes,
        ...(caption.studioStyle && changes.highlightColor ? {
          studioStyle: {
            ...caption.studioStyle,
            highlightColor: changes.highlightColor
          }
        } : {})
      }
    }
  };
}
export function changeCaptionHighlightColor(p: EditorProject, id: string, highlightColor: string): EditorProject {
  return changeCaptionProperty(p, id, { highlightColor });
}
export function addText(p: EditorProject,text: string,time: number,style: Partial<TextStyle>={},caption=false,duration=3,preferredTrackId?:string): EditorProject {
  const kind=caption?"caption":"text",track=p.trackOrder.map(id=>p.tracks[id]).find(t=>t.kind===kind&&!t.locked&&(!preferredTrackId||t.id===preferredTrackId));
  if(!track) throw new Error(`Add or unlock a ${kind} track.`);
  const contentId=uid(),id=uid(), layer={id:contentId,text,style:{...defaultStyle,...(caption?{size:56,strokeWidth:3,shadow:8}:{}),...style}};
  const clip: Clip={id,contentId,trackId:track.id,name:text.slice(0,50),startTime:Math.max(0,time),duration:Math.max(1/p.settings.fps,duration),sourceStart:0,sourceEnd:duration,transform:{...defaultTransform,y:caption?0.35:0},volume:0,speed:1,fadeIn:0,fadeOut:0,effects:{brightness:0,contrast:0,saturation:0,blur:0}};
  return {...put(p,clip),tracks:{...p.tracks,[track.id]:{...track,clipIds:[...track.clipIds,id]}},[caption?"captions":"textLayers"]:{...(caption?p.captions:p.textLayers),[contentId]:layer}};
}
export const addCaption=(p:EditorProject,text:string,time:number,duration=3,style:Partial<TextStyle>={},words?:import("./model").CaptionWord[])=>{
 const next=addText(p,text,time,style,true,duration);
 if(!words?.length)return next;
 const id=Object.keys(next.captions).find(id=>!p.captions[id])!;
 if(words.length>500||words.map(w=>w.word).join(" ").trim()!==text.trim()||words.some((w,i)=>!w.word.trim()||!Number.isFinite(w.start)||!Number.isFinite(w.end)||w.start<0||w.end<w.start||w.end>duration+.001||(i>0&&w.start<words[i-1].start)))throw new Error("Invalid caption word timing.");
 return {...next,captions:{...next.captions,[id]:{...next.captions[id],words:words.map(w=>({...w}))}}};
};
export function changeText(p:EditorProject,id:string,text:string,style?:Partial<TextStyle>):EditorProject {
  const c=editable(p,id);if(!c.contentId)throw new Error("Select a text or caption clip.");
  if(style?.fontAccent!==undefined)style={...style,fontAccent:readFontAccent(style.fontAccent)};
  if(style?.maxWordsPerLine!==undefined&&(!Number.isInteger(style.maxWordsPerLine)||style.maxWordsPerLine<1||style.maxWordsPerLine>8))throw Error("Choose one to eight words per line.");
  if(style?.gradient!==undefined)style={...style,gradient:readTextGradient(style.gradient)};
  if(style?.maxWidth!==undefined&&(!Number.isFinite(style.maxWidth)||style.maxWidth<.1||style.maxWidth>.86))throw Error("Choose a text width between 10% and 86%.");
  const key=p.captions[c.contentId]?"captions":"textLayers",layer=p[key][c.contentId];

  let updatedWords = key === "captions" ? (layer as import("./model").Caption).words : undefined;
  let updatedStudioData = key === "captions" ? (layer as import("./model").Caption).studioData : undefined;
  let normalizedText = text;

  if (key === "captions" && text !== layer.text) {
    updatedWords = undefined;
    updatedStudioData = undefined;
    normalizedText = text;
  }

  return {
    ...put(p, { ...c, name: normalizedText.slice(0, 50).trim() || c.name || (key === 'captions' ? 'Caption' : 'Text') }),
    [key]: {
      ...p[key],
      [c.contentId]: {
        ...layer,
        text: normalizedText,
        ...(key === "captions" ? { words: updatedWords, studioData: updatedStudioData } : {}),
        ...((layer as import("./model").Caption).studioStyle && style
          ? { studioStyle: studioStyleFromEditor((layer as import("./model").Caption).studioStyle!, style, p) }
          : {}),
        style: { ...layer.style, ...style }
      }
    }
  };
}
export function mergeCaptions(p:EditorProject,ids:string[]):EditorProject {
  const clips=ids.map(id=>editable(p,id)).sort((a,b)=>a.startTime-b.startTime);
  if(clips.length<2 || clips.some(c=>p.tracks[c.trackId].kind!=="caption" || c.trackId!==clips[0].trackId)) throw new Error("Select at least two captions on the same track.");
  const first=clips[0],end=Math.max(...clips.map(c=>c.startTime+c.duration));
  let next=p;for(const c of clips.slice(1))next=removeClip(next,c.id);

  const mergedSourceEnd = first.sourceStart + (end - first.startTime) * first.speed;
  next = put(next, { ...first, duration: end - first.startTime, sourceEnd: mergedSourceEnd });

  const allMergedWords: import("./model").CaptionWord[] = [];
  let mergedEmphasized: number[] = [];
  const mergedWordStyles: Record<string, any> = {};
  let wordOffset = 0;

  for (const c of clips) {
    const caption = p.captions[c.contentId!];
    if (caption?.words?.length) {
      for (const w of caption.words) {
        const timelineStart = c.startTime + (w.start - c.sourceStart) / c.speed;
        const timelineEnd = c.startTime + (w.end - c.sourceStart) / c.speed;
        allMergedWords.push({
          word: w.word,
          start: Number((first.sourceStart + (timelineStart - first.startTime) * first.speed).toFixed(3)),
          end: Number((first.sourceStart + (timelineEnd - first.startTime) * first.speed).toFixed(3))
        });
      }
      if (caption.studioData?.emphasizedWords) {
        mergedEmphasized.push(...caption.studioData.emphasizedWords.map(i => i + wordOffset));
      }
      if (caption.studioData?.wordStyles) {
        for (const [k, v] of Object.entries(caption.studioData.wordStyles)) {
          mergedWordStyles[String(Number(k) + wordOffset)] = v;
        }
      }
      wordOffset += caption.words.length;
    }
  }

  const firstCaption = p.captions[first.contentId!];
  const mergedStudioData = firstCaption?.studioData ? {
    ...firstCaption.studioData,
    ...(mergedEmphasized.length ? { emphasizedWords: Array.from(new Set(mergedEmphasized)) } : {}),
    ...(Object.keys(mergedWordStyles).length ? { wordStyles: mergedWordStyles } : {})
  } : undefined;

  const text = allMergedWords.length > 0
    ? allMergedWords.map(w => w.word).join(" ")
    : clips.map(c => p.captions[c.contentId!].text).join(" ");

  if (allMergedWords.length > 0) {
    next = {
      ...next,
      captions: {
        ...next.captions,
        [first.contentId!]: {
          ...firstCaption,
          text,
          words: allMergedWords,
          ...(mergedStudioData ? { studioData: mergedStudioData } : {})
        }
      }
    };
  }
  return changeText(next, first.id, text);
}
export function addTransition(p:EditorProject,fromClipId:string,toClipId:string,kind:TransitionKind,duration:number):EditorProject {
  const a=editable(p,fromClipId),b=editable(p,toClipId);
  if(a.trackId!==b.trackId || !["video","overlay","image"].includes(p.tracks[a.trackId].kind) || Math.abs(a.startTime+a.duration-b.startTime)>1/p.settings.fps) throw new Error("Transitions need two adjacent visual clips on the same track.");
  const id=`transition-${a.id}-${b.id}`;
  return {...p,transitions:{...p.transitions,[id]:{id,fromClipId,toClipId,kind,duration:clamp(duration,1/p.settings.fps,Math.min(a.duration,b.duration,5))}}};
}
export function addTrack(p:EditorProject,kind:TrackKind):EditorProject {
  if (p.trackOrder.length >= 30 || Object.keys(p.tracks).length >= 30) throw new Error("A project can have up to 30 tracks.");
  const id=uid(),num=Object.values(p.tracks).filter(t=>t.kind===kind).length+1;
  return {...p,trackOrder:[...p.trackOrder,id],tracks:{...p.tracks,[id]:{id,name:`${kind[0].toUpperCase()+kind.slice(1)} ${num}`,kind,clipIds:[],hidden:false,muted:false,locked:false}}};
}
export function changeTrack(p:EditorProject,id:string,changes:Partial<Pick<EditorProject["tracks"][string],"hidden"|"muted"|"locked"|"name">>):EditorProject {
  if(!p.tracks[id])throw new Error("Track not found.");return {...p,tracks:{...p.tracks,[id]:{...p.tracks[id],...changes}}};
}
export function toggleTrackLock(p: EditorProject, trackId: string): EditorProject {
  const track = p.tracks[trackId];
  if (!track) throw new Error("Track not found.");
  return changeTrack(p, trackId, { locked: !track.locked });
}

export function toggleTrackMute(p: EditorProject, trackId: string): EditorProject {
  const track = p.tracks[trackId];
  if (!track) throw new Error("Track not found.");
  return changeTrack(p, trackId, { muted: !track.muted });
}

export function toggleTrackHidden(p: EditorProject, trackId: string): EditorProject {
  const track = p.tracks[trackId];
  if (!track) throw new Error("Track not found.");
  return changeTrack(p, trackId, { hidden: !track.hidden });
}

export function removeTrack(p: EditorProject, trackId: string): EditorProject {
  const track = p.tracks[trackId];
  if (!track) throw new Error("Track not found.");
  if (p.trackOrder.length <= 1) throw new Error("A project must have at least one track.");
  let next = p;
  for (const clipId of [...track.clipIds]) {
    next = removeClip(next, clipId);
  }
  const tracks = { ...next.tracks };
  delete tracks[trackId];
  return {
    ...next,
    trackOrder: next.trackOrder.filter(id => id !== trackId),
    tracks,
  };
}

export interface SnapTarget {
  time: number;
  type: "zero" | "playhead" | "clip-start" | "clip-end";
  weight: number;
  clipId?: string;
}

export interface SnapResult {
  time: number;
  snapped: boolean;
  snapLineTime: number | null;
  target?: SnapTarget;
}

/**
 * CapCut Magnetic Snapping Engine with Hysteresis Detent Model:
 * Evaluates candidate targets (playhead, other clip starts/ends, 0)
 * using potential well weighted scoring: S_j = w_j / (d_px + 0.1).
 * Hysteresis: locks at snap threshold (10px) and resists breaking until 16px (1.6x).
 */
export function findSnapPoint(
  p: EditorProject,
  time: number,
  excluding: string[] = [],
  playhead = 0,
  pixelsPerSecond = 60,
  clipDuration = 0,
  currentlySnapped = false,
  snapThresholdPx = 10,
  breakThresholdPx = 16
): SnapResult {
  if (!Number.isFinite(time) || pixelsPerSecond <= 0) {
    return { time: Math.max(0, time), snapped: false, snapLineTime: null };
  }

  const pps = pixelsPerSecond;
  const snapDistSec = snapThresholdPx / pps;
  const breakDistSec = breakThresholdPx / pps;

  // Build target candidate list with weights according to CapCut spec 3.1
  const targets: SnapTarget[] = [
    { time: 0, type: "zero", weight: 0.75 },
  ];

  if (Number.isFinite(playhead) && playhead > 0) {
    targets.push({ time: playhead, type: "playhead", weight: 1.0 });
  }

  for (const c of Object.values(p.clips)) {
    if (excluding.includes(c.id)) continue;
    targets.push(
      { time: c.startTime, type: "clip-start", weight: 0.95, clipId: c.id },
      { time: c.startTime + c.duration, type: "clip-end", weight: 0.95, clipId: c.id }
    );
  }

  let bestScore = -1;
  let bestTime = time;
  let bestSnapLine: number | null = null;
  let bestTarget: SnapTarget | undefined;

  for (const target of targets) {
    // 1. Check leading edge: time vs target.time
    const distLead = Math.abs(time - target.time);
    const maxAllowedLead = currentlySnapped ? breakDistSec : snapDistSec;

    if (distLead <= maxAllowedLead) {
      const distPx = distLead * pps;
      const score = target.weight / (distPx + 0.1);
      if (score > bestScore) {
        bestScore = score;
        bestTime = target.time;
        bestSnapLine = target.time;
        bestTarget = target;
      }
    }

    // 2. If moving clip with duration > 0, check trailing edge: (time + clipDuration) vs target.time
    if (clipDuration > 0) {
      const trailingTime = time + clipDuration;
      const distTrail = Math.abs(trailingTime - target.time);
      const maxAllowedTrail = currentlySnapped ? breakDistSec : snapDistSec;

      if (distTrail <= maxAllowedTrail) {
        const distPx = distTrail * pps;
        const score = (target.weight * 0.92) / (distPx + 0.1);
        if (score > bestScore) {
          bestScore = score;
          bestTime = Math.max(0, target.time - clipDuration);
          bestSnapLine = target.time;
          bestTarget = target;
        }
      }
    }
  }

  if (bestScore > 0) {
    const quantized = Math.max(0, Math.round(bestTime * p.settings.fps) / p.settings.fps);
    return {
      time: quantized,
      snapped: true,
      snapLineTime: bestSnapLine,
      target: bestTarget,
    };
  }

  return {
    time: Math.max(0, time),
    snapped: false,
    snapLineTime: null,
  };
}

export function snapPlayhead(
  p: EditorProject,
  time: number,
  pixelsPerSecond = 60,
  currentlySnapped = false,
  snapThresholdPx = 10,
  breakThresholdPx = 16
): SnapResult {
  return findSnapPoint(p, time, [], 0, pixelsPerSecond, 0, currentlySnapped, snapThresholdPx, breakThresholdPx);
}

export function snapTime(
  p: EditorProject,
  time: number,
  excluding: string[] = [],
  playhead = 0,
  pixelsPerSecond = 60,
  clipDuration = 0
): number {
  return findSnapPoint(p, time, excluding, playhead, pixelsPerSecond, clipDuration).time;
}

/**
 * Splits selected clip(s) intersecting playhead. If none selected, falls back to
 * topmost unmuted clip under playhead according to visual track priority.
 */
export function splitAtPlayhead(
  p: EditorProject,
  time: number,
  selectedClipIds: string[] = []
): { project: EditorProject; splitClipIds: string[]; wasFallback: boolean } {
  const min = 1 / p.settings.fps;

  // 1. If clips are selected, check if any qualify
  if (selectedClipIds.length > 0) {
    const valid = selectedClipIds
      .map(id => p.clips[id])
      .filter((c): c is Clip => {
        if (!c) return false;
        const track = p.tracks[c.trackId];
        return !!track && !track.locked && time > c.startTime + min && time < c.startTime + c.duration - min;
      });

    if (valid.length > 0) {
      let next = p;
      const createdIds: string[] = [];
      for (const c of valid) {
        const preClips = new Set(Object.keys(next.clips));
        next = splitClip(next, c.id, time);
        const addedId = Object.keys(next.clips).find(id => !preClips.has(id));
        if (addedId) createdIds.push(addedId);
      }
      return { project: next, splitClipIds: createdIds, wasFallback: false };
    }
  }

  // 2. Fallback: topmost unmuted & unlocked clip under playhead
  const TRACK_KIND_PRIORITY: Record<string, number> = {
    overlay: 1,
    video: 2,
    image: 3,
    caption: 4,
    text: 5,
    audio: 6,
  };

  const candidates = Object.values(p.clips).filter(c => {
    const track = p.tracks[c.trackId];
    return !!track && !track.locked && !track.muted && time > c.startTime + min && time < c.startTime + c.duration - min;
  });

  if (candidates.length > 0) {
    candidates.sort((a, b) => {
      const pA = TRACK_KIND_PRIORITY[p.tracks[a.trackId]?.kind] ?? 99;
      const pB = TRACK_KIND_PRIORITY[p.tracks[b.trackId]?.kind] ?? 99;
      if (pA !== pB) return pA - pB;
      return p.trackOrder.indexOf(a.trackId) - p.trackOrder.indexOf(b.trackId);
    });

    const target = candidates[0];
    const preClips = new Set(Object.keys(p.clips));
    const next = splitClip(p, target.id, time);
    const addedId = Object.keys(next.clips).find(id => !preClips.has(id));
    return { project: next, splitClipIds: addedId ? [addedId] : [], wasFallback: true };
  }

  return { project: p, splitClipIds: [], wasFallback: false };
}

/**
 * Trims in-point (start) or out-point (end) of target clips to the playhead.
 * Corresponds to CapCut shortcuts `[` (Trim Start) and `]` (Trim End).
 */
export function trimToPlayhead(
  p: EditorProject,
  edge: "start" | "end",
  time: number,
  selectedClipIds: string[] = [],
  options?: { ripple?: boolean }
): { project: EditorProject; modifiedClipIds: string[] } {
  const min = 1 / p.settings.fps;

  let targets = selectedClipIds
    .map(id => p.clips[id])
    .filter((c): c is Clip => {
      if (!c) return false;
      const track = p.tracks[c.trackId];
      return !!track && !track.locked && time > c.startTime + min && time < c.startTime + c.duration - min;
    });

  if (!targets.length) {
    const candidates = Object.values(p.clips).filter(c => {
      const track = p.tracks[c.trackId];
      return !!track && !track.locked && !track.muted && time > c.startTime + min && time < c.startTime + c.duration - min;
    });
    if (candidates.length) {
      const TRACK_KIND_PRIORITY: Record<string, number> = {
        overlay: 1,
        video: 2,
        image: 3,
        caption: 4,
        text: 5,
        audio: 6,
      };
      candidates.sort((a, b) => {
        const pA = TRACK_KIND_PRIORITY[p.tracks[a.trackId]?.kind] ?? 99;
        const pB = TRACK_KIND_PRIORITY[p.tracks[b.trackId]?.kind] ?? 99;
        if (pA !== pB) return pA - pB;
        return p.trackOrder.indexOf(a.trackId) - p.trackOrder.indexOf(b.trackId);
      });
      targets = [candidates[0]];
    }
  }

  if (!targets.length) return { project: p, modifiedClipIds: [] };

  let next = p;
  const modified: string[] = [];
  for (const c of targets) {
    const trimEdge = edge === "start" ? "left" : "right";
    next = trimClip(next, c.id, trimEdge, time, options);
    modified.push(c.id);
  }
  return { project: next, modifiedClipIds: modified };
}

/**
 * Removes target clips and ripple shifts downstream clips on each affected track
 * to close gaps cleanly.
 */
export function rippleDeleteClips(p: EditorProject, ids: string[]): EditorProject {
  if (!ids.length) return p;
  const valid = ids
    .map(id => p.clips[id])
    .filter((c): c is Clip => !!c && !p.tracks[c.trackId]?.locked)
    .sort((a, b) => b.startTime - a.startTime); // Process downstream first

  let next = p;
  for (const c of valid) {
    if (!next.clips[c.id]) continue;
    const removedDuration = c.duration;
    const removedStart = c.startTime;
    const trackId = c.trackId;

    next = removeClip(next, c.id);

    const downstream = (next.tracks[trackId]?.clipIds || [])
      .map(id => next.clips[id])
      .filter((other): other is Clip => !!other && other.startTime >= removedStart - 1e-4)
      .sort((a, b) => a.startTime - b.startTime);

    for (const d of downstream) {
      next = moveClip(next, d.id, Math.max(0, d.startTime - removedDuration));
    }
  }
  return next;
}

export function rippleDeleteClip(p: EditorProject, id: string): EditorProject {
  return rippleDeleteClips(p, [id]);
}

/** Paste uses fresh IDs and copies editable text, while retaining original media references. */
export function pasteClips(p:EditorProject,source:EditorProject,ids:string[],time:number):EditorProject{
 if(!ids.length)return p;const clips=ids.map(id=>source.clips[id]);if(clips.some(c=>!c))throw new Error("Copied clips are no longer available.");const start=Math.min(...clips.map(c=>c.startTime));let next={...p,assets:{...p.assets}};
 for(const c of clips){const track=next.tracks[c.trackId];if(!track||track.locked)throw new Error("Unlock the destination track before pasting.");const id=uid(),contentId=c.contentId?uid():undefined;
  if(c.assetId){if(!source.assets[c.assetId])throw new Error("The copied media is missing.");next.assets[c.assetId]=source.assets[c.assetId];}
  next={...next,clips:{...next.clips,[id]:{...c,id,contentId,startTime:Math.max(0,time)+c.startTime-start}},tracks:{...next.tracks,[track.id]:{...track,clipIds:[...track.clipIds,id]}}};
  if(contentId&&c.contentId){if(source.textLayers[c.contentId])next.textLayers={...next.textLayers,[contentId]:{...source.textLayers[c.contentId],id:contentId}};if(source.captions[c.contentId])next.captions={...next.captions,[contentId]:{...source.captions[c.contentId],id:contentId}};}
 }return next;
}

/** Fit and fill use the same transform in preview and export; fill crops at canvas edges. */
export function frameClip(p:EditorProject,id:string,mode:"fit"|"fill"):EditorProject {
 const c=editable(p,id),asset=c.assetId?p.assets[c.assetId]:undefined;
 if(!asset || asset.kind==="audio" || !asset.width || !asset.height)throw new Error("This clip has no readable visual dimensions.");
 const [width,height]=dimensions[p.settings.aspectRatio],fit=Math.min(width/asset.width,height/asset.height),fill=Math.max(width/asset.width,height/asset.height);
 return changeClipProperty(p,id,{transform:{...c.transform,x:0,y:0,rotation:0,scale:mode==="fill"?fill/fit:1}});
}

export function replaceClipAsset(p:EditorProject,id:string,assetId:string,sourceStart=0):EditorProject{
 const c=editable(p,id),asset=p.assets[assetId];
 if(!c.assetId||!asset||!canPlace(p.tracks[c.trackId].kind,asset.kind))throw new Error('Choose compatible media for this clip.');
 if(!Number.isFinite(sourceStart)||sourceStart<0)throw new Error('Source start must be a valid time.');
 const sourceEnd=sourceStart+c.duration*c.speed;
 if(asset.kind!=='image'&&(!Number.isFinite(asset.duration)||sourceEnd>asset.duration+1e-6))throw new Error('Replacement is too short for this clip. Trim the clip or choose a longer original.');
 return put(p,{...c,assetId,name:assetId===c.assetId?c.name:asset.name,sourceStart,sourceEnd});
}

export {
  reframeProject,
  calculateFitWithBlur,
  calculateCenterCrop,
  calculateSplitScreen,
  calculateCenterCropTransform,
  type ReframeMode,
  type ReframeOptions,
} from "./reframing";

