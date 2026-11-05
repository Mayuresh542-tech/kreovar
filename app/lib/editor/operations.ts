import {anchorVisualTreatment} from './visualTreatment';
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
  let next=put(p,{...c,startTime:Math.max(0,startTime),trackId:target.id});
  if(target.id!==c.trackId) next={...next,tracks:{...p.tracks,[c.trackId]:{...p.tracks[c.trackId],clipIds:p.tracks[c.trackId].clipIds.filter(x=>x!==id)},[target.id]:{...target,clipIds:[...target.clipIds,id]}}};
  return cleanTransitions(next);
}
export function trimClip(p: EditorProject,id: string,edge: "left"|"right",time: number): EditorProject {
  const c=editable(p,id), min=1/p.settings.fps, asset=c.assetId?p.assets[c.assetId]:undefined;
  const bounded=asset && asset.kind!=="image";
  if(edge==="left") {
    const start=clamp(time,bounded?Math.max(0,c.startTime-c.sourceStart/c.speed):0,c.startTime+c.duration-min);
    const delta=start-c.startTime;
    return cleanTransitions(put(p,{...c,...(c.visualTreatment?{visualTreatment:anchorVisualTreatment(c)}:{}),startTime:start,duration:c.duration-delta,sourceStart:c.sourceStart+delta*c.speed}));
  }
  const end=clamp(time,c.startTime+min,bounded?c.startTime+(asset.duration-c.sourceStart)/c.speed:86400);
  return cleanTransitions(put(p,{...c,...(c.visualTreatment?{visualTreatment:anchorVisualTreatment(c)}:{}),duration:end-c.startTime,sourceEnd:c.sourceStart+(end-c.startTime)*c.speed}));
}
export function splitClip(p: EditorProject,id: string,time: number): EditorProject {
  const c=editable(p,id), left=time-c.startTime,min=1/p.settings.fps;
  if(left<min || c.duration-left<min) throw new Error("Move the playhead inside the clip to split.");
  const newId=uid(), contentId=c.contentId?uid():undefined, source=c.sourceStart+left*c.speed;
  const visual=anchorVisualTreatment(c),right: Clip={...c,...(visual?{visualTreatment:visual}:{}),id:newId,contentId,startTime:time,duration:c.duration-left,sourceStart:source,fadeIn:0};
  const next=put(put(p,{...c,...(visual?{visualTreatment:visual}:{}),duration:left,sourceEnd:source,fadeOut:0}),right);
  return cleanTransitions({...next,tracks:{...p.tracks,[c.trackId]:{...p.tracks[c.trackId],clipIds:[...p.tracks[c.trackId].clipIds,newId]}},textLayers:contentId&&c.contentId&&p.textLayers[c.contentId]?{...p.textLayers,[contentId]:{...p.textLayers[c.contentId],id:contentId}}:p.textLayers,captions:contentId&&c.contentId&&p.captions[c.contentId]?{...p.captions,[contentId]:{...p.captions[c.contentId],id:contentId}}:p.captions});
}
export function duplicateClip(p: EditorProject,id: string,time?:number): EditorProject {
  const c=editable(p,id), newId=uid(), contentId=c.contentId?uid():undefined;
  return {...put(p,{...c,id:newId,contentId,startTime:time??c.startTime+c.duration}),tracks:{...p.tracks,[c.trackId]:{...p.tracks[c.trackId],clipIds:[...p.tracks[c.trackId].clipIds,newId]}},textLayers:contentId&&c.contentId&&p.textLayers[c.contentId]?{...p.textLayers,[contentId]:{...p.textLayers[c.contentId],id:contentId}}:p.textLayers,captions:contentId&&c.contentId&&p.captions[c.contentId]?{...p.captions,[contentId]:{...p.captions[c.contentId],id:contentId}}:p.captions};
}
export function changeClipProperty(p: EditorProject,id: string,changes: Partial<Pick<Clip,"name"|"transform"|"volume"|"speed"|"fadeIn"|"fadeOut"|"effects"|"audioRole"|"ducking"|"surface">>): EditorProject {
  const c=editable(p,id), next={...c,...changes};
  if(changes.surface!==undefined){if(!c.assetId||p.assets[c.assetId]?.kind==='audio')throw Error('Select a video or image for a surface treatment.');next.surface=readStyleSurface(changes.surface);}
  if(next.audioRole!==undefined&&!["speech","background","sfx"].includes(next.audioRole))throw new Error("Choose a supported audio role.");
  if(next.ducking!==undefined&&typeof next.ducking!=="boolean")throw new Error("Invalid audio ducking setting.");
  next.volume=clamp(next.volume,0,2); next.speed=clamp(next.speed,0.25,4);
  if(changes.speed!==undefined) next.duration=(c.sourceEnd-c.sourceStart)/next.speed;
  next.fadeIn=clamp(next.fadeIn,0,next.duration);next.fadeOut=clamp(next.fadeOut,0,next.duration);
  next.transform={...next.transform,scale:clamp(next.transform.scale,0.05,10),opacity:clamp(next.transform.opacity,0,1)};
  return cleanTransitions(put(p,next));
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
  return {...put(p,{...c,name:text.slice(0,50)}),[key]:{...p[key],[c.contentId]:{...layer,text,...(key==="captions"&&text!==layer.text?{words:undefined,studioData:undefined}:{}),...((layer as import("./model").Caption).studioStyle&&style?{studioStyle:studioStyleFromEditor((layer as import("./model").Caption).studioStyle!,style,p)}:{}),style:{...layer.style,...style}}}};
}
export function mergeCaptions(p:EditorProject,ids:string[]):EditorProject {
  const clips=ids.map(id=>editable(p,id)).sort((a,b)=>a.startTime-b.startTime);
  if(clips.length<2 || clips.some(c=>p.tracks[c.trackId].kind!=="caption" || c.trackId!==clips[0].trackId)) throw new Error("Select at least two captions on the same track.");
  const first=clips[0],end=Math.max(...clips.map(c=>c.startTime+c.duration)),text=clips.map(c=>p.captions[c.contentId!].text).join(" ");
  let next=p;for(const c of clips.slice(1))next=removeClip(next,c.id);
  next=put(next,{...first,duration:end-first.startTime,sourceEnd:end-first.startTime});
  return changeText(next,first.id,text);
}
export function addTransition(p:EditorProject,fromClipId:string,toClipId:string,kind:TransitionKind,duration:number):EditorProject {
  const a=editable(p,fromClipId),b=editable(p,toClipId);
  if(a.trackId!==b.trackId || !["video","overlay","image"].includes(p.tracks[a.trackId].kind) || Math.abs(a.startTime+a.duration-b.startTime)>1/p.settings.fps) throw new Error("Transitions need two adjacent visual clips on the same track.");
  const id=`transition-${a.id}-${b.id}`;
  return {...p,transitions:{...p.transitions,[id]:{id,fromClipId,toClipId,kind,duration:clamp(duration,1/p.settings.fps,Math.min(a.duration,b.duration,5))}}};
}
export function addTrack(p:EditorProject,kind:TrackKind):EditorProject {
  const id=uid(),num=Object.values(p.tracks).filter(t=>t.kind===kind).length+1;
  return {...p,trackOrder:[...p.trackOrder,id],tracks:{...p.tracks,[id]:{id,name:`${kind[0].toUpperCase()+kind.slice(1)} ${num}`,kind,clipIds:[],hidden:false,muted:false,locked:false}}};
}
export function changeTrack(p:EditorProject,id:string,changes:Partial<Pick<EditorProject["tracks"][string],"hidden"|"muted"|"locked"|"name">>):EditorProject {
  if(!p.tracks[id])throw new Error("Track not found.");return {...p,tracks:{...p.tracks,[id]:{...p.tracks[id],...changes}}};
}
export function snapTime(p:EditorProject,time:number,excluding:string[],playhead:number,pixelsPerSecond:number,clipDuration=0):number {
  const edges=[0,playhead,...Object.values(p.clips).filter(c=>!excluding.includes(c.id)).flatMap(c=>[c.startTime,c.startTime+c.duration])];
  let result=time,distance=8/pixelsPerSecond;
  for(const edge of edges) for(const point of [edge,edge-clipDuration])if(Math.abs(time-point)<distance){result=point;distance=Math.abs(time-point);}
  return Math.max(0,Math.round(result*p.settings.fps)/p.settings.fps);
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
