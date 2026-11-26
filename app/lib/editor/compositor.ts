import {applyVisualMask} from './visualMasks';
import {mediaAnimationFrame} from './mediaAnimation';
import {visualTreatmentAt,drawVisualMedia} from './visualTreatment';
import {studioSegment,loadEditorStudioFonts,studioCaptionBounds} from './editorCaptionStudio';
import {drawCaptions} from '../captions/canvasCaptions';
import {wordHighlight,distinctHighlight} from "../captions/highlighting";
import {captionFontFamily,textDirection} from "../captions/languages";
import {mixedTextLines,loadCaptionFonts} from "../captions/typography";
import {textFill} from "./textGradient";
import {styledText,wrapText} from "./textLayout";
import {zoomTransform} from "./zoom";
import {keyframeTransform} from './keyframes';
import {drawShape,shapeDimensions} from "./shapes";
import {drawStyleSurface} from "./styleSurface";
import {drawGraphicPanel} from './motionGraphics';
import { Clip, EditorProject, TextLayer, Track, Transition, clamp, dimensions, textForClip } from "./model";
import { MediaRepository, waitMedia } from "./media";

import {captionMotionFrame} from "./captionMotion";
import {clipGain,speechWindows} from "./audioMix";
import {getSpeedCurvePreset, mapTimelineTimeToSourceTime, evaluateVelocityAtTime} from "./speedCurves";
import { evaluateTransition, type TransitionClipMask, type TransitionLayerPose, type TransitionOverlayFlash } from "./transitions";

interface Entry { assetKey:string; element:HTMLMediaElement|HTMLImageElement; ready:boolean; error?:Error; source?:MediaElementAudioSourceNode; gain?:GainNode; playPending?:boolean; playError?:Error; lastPlaybackRate?:number; lastPreservePitch?:boolean; lastGain?:number }
export interface VisualBounds { id:string; x:number; y:number; width:number; height:number; rotation:number }
interface Layer {
  clip:Clip;
  track:Track;
  opacity:number;
  x:number;
  y?:number;
  scale:number;
  scaleX?:number;
  scaleY?:number;
  rotation?:number;
  blur?:number;
  brightness?:number;
  contrast?:number;
  saturation?:number;
  rgbOffset?:number;
  pixelate?:number;
  glitchSlices?:number;
  ghostEcho?:number;
  skewX?:number;
  clipMask?:TransitionClipMask;
  overlayFlash?:TransitionOverlayFlash;
  hold?:boolean;
}
function applyTransitionPoseToLayer(layer: Layer, pose: TransitionLayerPose): Layer {
  return {
    ...layer,
    opacity: pose.opacity,
    x: pose.x,
    y: pose.y,
    scale: pose.scale,
    scaleX: pose.scaleX,
    scaleY: pose.scaleY,
    rotation: pose.rotation,
    blur: pose.blur,
    brightness: pose.brightness,
    contrast: pose.contrast,
    saturation: pose.saturation,
    rgbOffset: pose.rgbOffset,
    pixelate: pose.pixelate,
    glitchSlices: pose.glitchSlices,
    ghostEcho: pose.ghostEcho,
    skewX: pose.skewX,
    ...(pose.clipMask ? { clipMask: pose.clipMask } : {}),
  };
}
const WIPE_MODE_SHAPES: readonly TransitionClipMask["shape"][] = [
  "wipe-left",
  "wipe-right",
  "wipe-up",
  "wipe-down",
  "barn-door",
  "split-horizontal",
];
function applyClipMaskShape(
  ctx: CanvasRenderingContext2D,
  shape: TransitionClipMask["shape"],
  rawProgress: number,
  width: number,
  height: number
) {
  if (typeof ctx.beginPath !== "function" || typeof ctx.clip !== "function") return;
  const p = clamp(rawProgress, 0, 1);
  ctx.beginPath();
  switch (shape) {
    case "wipe-left":
      ctx.rect(width * (1 - p), 0, width * p, height);
      break;
    case "wipe-right":
      ctx.rect(0, 0, width * p, height);
      break;
    case "wipe-up":
      ctx.rect(0, height * (1 - p), width, height * p);
      break;
    case "wipe-down":
      ctx.rect(0, 0, width, height * p);
      break;
    case "barn-door":
      ctx.rect(width * (0.5 - 0.5 * p), 0, width * p, height);
      break;
    case "split-horizontal":
      ctx.rect(0, height * (0.5 - 0.5 * p), width, height * p);
      break;
    case "blinds": {
      const slats = 6;
      const slatH = height / slats;
      for (let i = 0; i < slats; i++) {
        ctx.rect(0, i * slatH, width, slatH * p);
      }
      break;
    }
    case "circle-iris": {
      const r = Math.hypot(width, height) * 0.55 * p;
      ctx.arc(width / 2, height / 2, Math.max(0.5, r), 0, Math.PI * 2);
      break;
    }
    case "clock-wipe": {
      if (p >= 0.999) {
        ctx.rect(0, 0, width, height);
      } else {
        const r = Math.hypot(width, height);
        const start = -Math.PI / 2;
        ctx.moveTo(width / 2, height / 2);
        ctx.arc(width / 2, height / 2, r, start, start + Math.PI * 2 * p);
        ctx.closePath();
      }
      break;
    }
    case "diamond-iris": {
      const hw = width * 1.05 * p;
      const hh = height * 1.05 * p;
      ctx.moveTo(width / 2, height / 2 - hh);
      ctx.lineTo(width / 2 + hw, height / 2);
      ctx.lineTo(width / 2, height / 2 + hh);
      ctx.lineTo(width / 2 - hw, height / 2);
      ctx.closePath();
      break;
    }
    case "wipe-diagonal": {
      const d = p * 2;
      if (d <= 1) {
        ctx.moveTo(0, 0);
        ctx.lineTo(width * d, 0);
        ctx.lineTo(0, height * d);
      } else {
        const q = d - 1;
        ctx.moveTo(0, 0);
        ctx.lineTo(width, 0);
        ctx.lineTo(width, height * q);
        ctx.lineTo(width * q, height);
        ctx.lineTo(0, height);
      }
      ctx.closePath();
      break;
    }
  }
  ctx.clip();
}
function drawTransitionOverlay(
  ctx: CanvasRenderingContext2D,
  overlay: TransitionOverlayFlash,
  width: number,
  height: number
) {
  if (overlay.opacity <= 0.005) return;
  ctx.save();
  ctx.globalAlpha = clamp(overlay.opacity, 0, 1);
  if (overlay.mode) ctx.globalCompositeOperation = overlay.mode;
  let fill: string | CanvasGradient = overlay.color;
  if (overlay.gradient === "radial" && typeof ctx.createRadialGradient === "function") {
    const g = ctx.createRadialGradient(width / 2, height / 2, 0, width / 2, height / 2, Math.hypot(width, height) * 0.55);
    if (g && typeof g.addColorStop === "function") {
      g.addColorStop(0, overlay.color);
      g.addColorStop(0.65, overlay.color + "99");
      g.addColorStop(1, "rgba(0,0,0,0)");
      fill = g;
    }
  } else if (overlay.gradient === "side-leak" && typeof ctx.createLinearGradient === "function") {
    const g = ctx.createLinearGradient(0, 0, width, height * 0.4);
    if (g && typeof g.addColorStop === "function") {
      g.addColorStop(0, "#ffd27a");
      g.addColorStop(0.35, overlay.color);
      g.addColorStop(1, "rgba(0,0,0,0)");
      fill = g;
    }
  } else if (overlay.gradient === "edge-burn" && typeof ctx.createRadialGradient === "function") {
    const g = ctx.createRadialGradient(width / 2, height / 2, Math.min(width, height) * 0.15, width / 2, height / 2, Math.hypot(width, height) * 0.55);
    if (g && typeof g.addColorStop === "function") {
      g.addColorStop(0, "rgba(255,210,130,0.45)");
      g.addColorStop(0.55, overlay.color);
      g.addColorStop(1, "#660a00");
      fill = g;
    }
  }
  ctx.fillStyle = fill;
  ctx.fillRect(0, 0, width, height);
  ctx.restore();
}
const priority={video:0,overlay:1,image:2,text:3,caption:4,audio:5};
interface ProjectRenderIndex {
  revision: number;
  trackOrderRef: string[];
  tracksRef: EditorProject['tracks'];
  clipsRef: EditorProject['clips'];
  transitionsRef: EditorProject['transitions'];
  trackSig: string;
  trackOrderLength: number;
  clipCount: number;
  transitionCount: number;
  allClips: Clip[];
  visualTracks: Track[];
  trackOrderIndex: Map<string, number>;
  transitionsByToClipId: Map<string, Transition[]>;
  speechWindows: { start: number; end: number }[];
  studioSegments: Map<string, import("../captions/presets").CaptionSegment>;
}
const projectIndexCache = new WeakMap<EditorProject, ProjectRenderIndex>();
function objectKeyCount(obj: Record<string, unknown>): number {
  let count = 0;
  for (const key in obj) {
    if (Object.hasOwn(obj, key)) count++;
  }
  return count;
}
function trackFlagsSignature(tracks: EditorProject['tracks']): string {
  let sig = '';
  for (const id in tracks) {
    const t = tracks[id];
    sig += `${id}:${t.hidden ? 1 : 0}${t.muted ? 1 : 0};`;
  }
  return sig;
}
function getProjectIndex(p: EditorProject): ProjectRenderIndex {
  let cached = projectIndexCache.get(p);
  const clipCount = objectKeyCount(p.clips);
  const transitionCount = objectKeyCount(p.transitions);
  const trackSig = trackFlagsSignature(p.tracks);
  if (
    cached &&
    cached.revision === p.revision &&
    cached.trackOrderRef === p.trackOrder &&
    cached.tracksRef === p.tracks &&
    cached.clipsRef === p.clips &&
    cached.transitionsRef === p.transitions &&
    cached.trackSig === trackSig &&
    cached.trackOrderLength === p.trackOrder.length &&
    cached.clipCount === clipCount &&
    cached.transitionCount === transitionCount
  ) {
    return cached;
  }
  const allClips = Object.values(p.clips);
  const visualTracks: Track[] = [];
  const trackOrderIndex = new Map<string, number>();
  for (let i = 0; i < p.trackOrder.length; i++) {
    const id = p.trackOrder[i];
    trackOrderIndex.set(id, i);
    const t = p.tracks[id];
    if (t && t.kind !== "audio") visualTracks.push(t);
  }
  const transitionsByToClipId = new Map<string, Transition[]>();
  for (const t of Object.values(p.transitions)) {
    const list = transitionsByToClipId.get(t.toClipId);
    if (list) list.push(t);
    else transitionsByToClipId.set(t.toClipId, [t]);
  }
  cached = {
    revision: p.revision,
    trackOrderRef: p.trackOrder,
    tracksRef: p.tracks,
    clipsRef: p.clips,
    transitionsRef: p.transitions,
    trackSig,
    trackOrderLength: p.trackOrder.length,
    clipCount,
    transitionCount,
    allClips,
    visualTracks,
    trackOrderIndex,
    transitionsByToClipId,
    speechWindows: speechWindows(p),
    studioSegments: new Map(),
  };
  projectIndexCache.set(p, cached);
  return cached;
}
export function visibleLayers(p:EditorProject,time:number):Layer[]{
  const layers:Layer[]=[];
  const { visualTracks, transitionsByToClipId, trackOrderIndex } = getProjectIndex(p);
  for(const track of visualTracks){
    if(track.hidden)continue;
    for(const id of track.clipIds){const c=p.clips[id];if(!c||time<c.startTime || time>=c.startTime+c.duration)continue;
      const candidateTransitions = transitionsByToClipId.get(id);
      const transition = candidateTransitions?.find(t=>time<c.startTime+t.duration);
      const layer:Layer={clip:c,track,opacity:1,x:0,scale:1};
      if(transition){const progress=clamp((time-c.startTime)/transition.duration,0,1),out=p.clips[transition.fromClipId];
        if(out){
          const evalResult = evaluateTransition(transition, progress);
          const outgoing:Layer = applyTransitionPoseToLayer({clip:out,track,opacity:1,x:0,scale:1,hold:true}, evalResult.outgoing);
          Object.assign(layer, applyTransitionPoseToLayer(layer, evalResult.incoming));
          if (evalResult.overlayFlash) layer.overlayFlash = evalResult.overlayFlash;
          layers.push(outgoing);
        }
      }layers.push(layer);
    }
  }
  if (layers.length <= 1) return layers;
  return layers.sort((a, b) => {
    const idxA = trackOrderIndex.get(a.track.id) ?? 0;
    const idxB = trackOrderIndex.get(b.track.id) ?? 0;
    if (idxA !== idxB) {
      if (a.clip.shape && !b.clip.shape && b.track.kind === 'image') return 1;
      if (b.clip.shape && !a.clip.shape && a.track.kind === 'image') return -1;
      return idxA - idxB;
    }
    if (a.clip.shape && !b.clip.shape) return 1;
    if (b.clip.shape && !a.clip.shape) return -1;
    return 0;
  });
}
type TextLayoutResult = { mixed?: ReturnType<typeof mixedTextLines>; lines: string[]; inkWidth: number; width: number; height: number };
const textLayoutCache = new Map<string, TextLayoutResult>();
function layoutText(ctx:CanvasRenderingContext2D,layer:TextLayer,width:number,totalWords?:number):TextLayoutResult{
  const s=layer.style;
  const caption=layer as import("./model").Caption;
  const cacheKey=`${layer.text}\0${s.font}\0${s.weight}\0${s.size}\0${s.letterSpacing}\0${s.lineHeight}\0${s.maxWidth??""}\0${s.casing??""}\0${s.maxWordsPerLine??""}\0${s.fontAccent?.font??""}:${s.fontAccent?.weight??""}\0${caption.highlightMode??""}\0${width}\0${totalWords??""}`;
  const cached=textLayoutCache.get(cacheKey);
  ctx.font=`${s.weight} ${s.size}px ${captionFontFamily(s.font,layer.text)}`;
  if("letterSpacing" in ctx)ctx.letterSpacing=`${s.letterSpacing}px`;
  if(cached)return cached;
  const maxWidth=width*(s.maxWidth??.86);
  let result:TextLayoutResult;
  if(s.fontAccent||s.maxWordsPerLine||caption.highlightMode){const mixed=mixedTextLines(ctx,styledText(layer),s.size,s.font,s.weight,s.fontAccent,Math.max(1,maxWidth-32),s.maxWordsPerLine,totalWords);const inkWidth=Math.max(1,...mixed.rows.map(row=>row.reduce((n,r)=>n+r.width,0)+Math.max(0,row.length-1)*mixed.gap));result={mixed,lines:mixed.rows.map(row=>row.map(r=>r.text).join(' ')),inkWidth,width:s.maxWidth?maxWidth:Math.max(40,inkWidth)+32,height:mixed.rows.length*s.size*s.lineHeight+24};}
  else{const lines=wrapText(styledText(layer),Math.max(1,maxWidth-32),text=>ctx.measureText(text).width);const inkWidth=Math.max(1,...lines.map(line=>ctx.measureText(line).width));result={lines,inkWidth,width:s.maxWidth?maxWidth:Math.max(40,inkWidth)+32,height:lines.length*s.size*s.lineHeight+24};}
  if(textLayoutCache.size>=128){const first=textLayoutCache.keys().next().value;if(first!==undefined)textLayoutCache.delete(first);}
  textLayoutCache.set(cacheKey,result);
  return result;
}
/** Shared preview/export renderer. Its media pool is bounded to active + one second of lookahead. */
export class Compositor {
  private entries=new Map<string,Entry>();private loading=new Map<string,Promise<void>>();
  private context?:AudioContext;private destination?:MediaStreamAudioDestinationNode;private output?:GainNode;private closed=false;
  private isScrubbing=false;private lastSyncTime=-1;private lastSyncNow=0;
  private cachedFrames=new Map<string,{canvas:HTMLCanvasElement;width:number;height:number}>();
  constructor(private repository:MediaRepository,private onError:(error:Error)=>void=()=>{}){}
  setScrubbing(scrubbing:boolean){
    this.isScrubbing=scrubbing;
    if(scrubbing){
      if(this.output&&this.context)this.output.gain.setValueAtTime(0,this.context.currentTime);
      for(const entry of this.entries.values()){
        if(entry.gain&&this.context)entry.gain.gain.setValueAtTime(0,this.context.currentTime);
        if(entry.element instanceof HTMLMediaElement&&!entry.element.paused)entry.element.pause();
      }
    }else{
      if(this.output&&this.context)this.output.gain.setValueAtTime(1,this.context.currentTime);
      // Precision seek all media on scrub release
      for(const entry of this.entries.values()){
        if(entry.element instanceof HTMLMediaElement&&entry.ready&&!entry.element.seeking){
          // Will be synced to exact target on next frame
        }
      }
    }
  }
  getScrubbing():boolean{return this.isScrubbing;}
  async activateAudio(exporting=false){
    if(!this.context){this.context=new AudioContext();this.output=this.context.createGain();if(exporting){this.destination=this.context.createMediaStreamDestination();this.output.connect(this.destination);}else this.output.connect(this.context.destination);}
    await this.context.resume();for(const entry of this.entries.values())this.connectAudio(entry);
  }
  get audioStream(){return this.destination?.stream;}
  private connectAudio(entry:Entry){
    if(!this.context||!this.output||entry.source||!(entry.element instanceof HTMLMediaElement))return;
    entry.source=this.context.createMediaElementSource(entry.element);entry.gain=this.context.createGain();entry.source.connect(entry.gain);entry.gain.connect(this.output);entry.element.muted=false;
  }
  private ensure(p:EditorProject,c:Clip):Promise<void>{
    if(!c.assetId)return Promise.resolve();
    const asset=p.assets[c.assetId];
    const key=asset?.id+":"+(asset?.localKey||asset?.libraryId||asset?.cloud?.path||asset?.url||"");if(this.entries.has(c.id)&&this.entries.get(c.id)?.assetKey!==key)this.release(c.id);
    if(this.entries.has(c.id))return this.loading.get(c.id)||Promise.resolve();if(!asset)return Promise.reject(new Error(`Missing asset for ${c.name}.`));
    const element=asset.kind==="image"?new Image():document.createElement(asset.kind==="video"?"video":"audio");
    const entry:Entry={assetKey:key,element,ready:false};this.entries.set(c.id,entry);
    const task=(async()=>{
      element.crossOrigin="anonymous";
      const url=await this.repository.resolve(asset);if(this.closed||this.entries.get(c.id)!==entry)return;
      if(typeof HTMLMediaElement!=="undefined"&&element instanceof HTMLMediaElement){element.preload="auto";element.muted=true;if(typeof HTMLVideoElement!=="undefined"&&element instanceof HTMLVideoElement)element.playsInline=true;
        const loaded=waitMedia(element);element.src=url;element.load();await loaded;this.connectAudio(entry);
      }else{await new Promise<void>((resolve,reject)=>{const timer=setTimeout(()=>{element.onload=null;element.onerror=null;reject(new Error(`Loading ${asset.name} timed out.`));},20000);element.onload=()=>{clearTimeout(timer);resolve();};element.onerror=()=>{clearTimeout(timer);reject(new Error(`Cannot load ${asset.name}. Remote media requires CORS permission.`));};element.src=url;});}
      entry.ready=true;
    })().catch(error=>{if(this.closed||this.entries.get(c.id)!==entry)return;entry.error=new Error(`${asset.name}: ${error instanceof Error?error.message:"Unable to load media."}`);this.onError(entry.error);});
    this.loading.set(c.id,task);return task;
  }
  async prepare(p:EditorProject){
    await document.fonts.ready;await loadEditorStudioFonts(p);
    await Promise.all([...Object.values(p.textLayers),...Object.values(p.captions)].map(layer=>loadCaptionFonts(`"${layer.style.font}"`,layer.style.weight,layer.style.size,layer.style.fontAccent,layer.text)));
    // Export validates every used original before starting recording.
    for(const c of Object.values(p.clips)){if(p.tracks[c.trackId].hidden)continue;await this.ensure(p,c);const e=this.entries.get(c.id);if(e?.error)throw e.error;this.release(c.id);}
    await this.prepareAt(p,0);
  }
  async prepareAt(p:EditorProject,time:number){
    const clips=[...visibleLayers(p,time).map(l=>l.clip),...Object.values(p.clips).filter(c=>time>=c.startTime&&time<c.startTime+c.duration&&p.tracks[c.trackId].kind==="audio"&&!p.tracks[c.trackId].hidden)];
    await Promise.all(clips.map(c=>this.ensure(p,c)));
    for(const c of clips){const e=this.entries.get(c.id);if(e?.error)throw e.error;}
    await Promise.all(clips.map(async c=>{const e=this.entries.get(c.id)?.element;if(e instanceof HTMLMediaElement){const target=this.sourceTime(c,time);if(Math.abs(e.currentTime-target)>.01){const seek=waitMedia(e,"seeked");e.currentTime=Math.min(target,Math.max(0,e.duration-.001));await seek;}}}));
  }
  private sourceTime(c:Clip,time:number,hold=false){
    if(c.speedCurveId && c.speedCurveId !== "standard"){
      const preset=getSpeedCurvePreset(c.speedCurveId);
      const effectiveTime=hold?c.startTime+c.duration-0.001:time;
      const remapped=mapTimelineTimeToSourceTime({
        timelineTime:effectiveTime,
        clipStartTime:c.startTime,
        sourceStartTime:c.sourceStart,
        duration:c.duration,
        curve:preset
      });
      return clamp(remapped,c.sourceStart,Math.max(c.sourceStart,c.sourceEnd-0.001));
    }
    return clamp(c.sourceStart+(hold?c.duration-0.001:time-c.startTime)*c.speed,c.sourceStart,Math.max(c.sourceStart,c.sourceEnd-0.001));
  }
  sync(p:EditorProject,time:number,playing:boolean):boolean {
    const now=typeof performance!=="undefined"?performance.now():Date.now();
    if(!playing&&this.lastSyncTime>=0&&Math.abs(time-this.lastSyncTime)>0.001){
      if(now-this.lastSyncNow<150)this.isScrubbing=true;
    }
    this.lastSyncTime=time;this.lastSyncNow=now;
    const index=getProjectIndex(p),windows=index.speechWindows,layers=visibleLayers(p,time);
    const holdIds=new Set<string>(),layerIds=new Set<string>(),wanted=new Set<string>();
    for(const l of layers){layerIds.add(l.clip.id);wanted.add(l.clip.id);if(l.hold)holdIds.add(l.clip.id);}
    let ready=true;
    const lookahead=playing?3:1;
    for(const c of index.allClips){
      const track=p.tracks[c.trackId],active=time>=c.startTime&&time<c.startTime+c.duration;
      if(active&&!track.hidden)wanted.add(c.id);
      if(!track.hidden&&c.startTime>time&&c.startTime<time+lookahead){wanted.add(c.id);void this.ensure(p,c);}
    }
    for(const id of wanted){const c=p.clips[id];void this.ensure(p,c);const entry=this.entries.get(id),element=entry?.element;
      if(entry?.error)throw entry.error;if(entry?.playError)throw entry.playError;
      const active=layerIds.has(id)||(time>=c.startTime&&time<c.startTime+c.duration);
      if(!active){if(entry?.ready&&element instanceof HTMLMediaElement){if(!element.paused)element.pause();const target=Math.min(c.sourceStart,Math.max(0,element.duration-.001));if(!element.seeking&&Math.abs(element.currentTime-target)>.015)element.currentTime=target;}continue;}
      // Text and captions render directly to canvas; they have no media element.
      if(!c.assetId){if(!c.shape&&!textForClip(p,c))throw new Error(`Missing text for ${c.name}.`);continue;}
      if(!entry?.ready){ready=false;continue;}
      if(element instanceof HTMLMediaElement){
        const hold=holdIds.has(id),target=Math.min(this.sourceTime(c,time,hold),Math.max(0,element.duration-.001));
        const delta=Math.abs(element.currentTime-target);
        if(this.isScrubbing||!playing){
          if(entry.gain&&this.context&&entry.lastGain!==0){entry.gain.gain.setValueAtTime(0,this.context.currentTime);entry.lastGain=0;}
          if(!element.paused)element.pause();
          if(!element.seeking&&delta>0.03){
            if("fastSeek" in element&&typeof (element as any).fastSeek==="function"){
              (element as any).fastSeek(target);
            }else{
              element.currentTime=target;
            }
          }
        }else{
          let targetRate = c.speed;
          if (c.speedCurveId && c.speedCurveId !== "standard") {
            const preset = getSpeedCurvePreset(c.speedCurveId);
            const localT = Math.max(0, Math.min(c.duration, time - c.startTime));
            targetRate = evaluateVelocityAtTime(localT, c.duration, preset);
          }
          let nextRate: number;
          if(!element.seeking&&delta>(playing?0.65:0.02)){
            element.currentTime=target;
            if(!this.cachedFrames.has(c.id))ready=false;
            nextRate=clamp(targetRate, 0.25, 4.0);
          }else if(playing&&delta>0.04){
            const driftRatio=target>element.currentTime?Math.min(1.15,1+delta*0.2):Math.max(0.85,1-delta*0.2);
            nextRate=clamp(targetRate*driftRatio, 0.25, 4.0);
          }else{
            nextRate=clamp(targetRate, 0.25, 4.0);
          }
          if(entry.lastPlaybackRate===undefined||Math.abs(entry.lastPlaybackRate-nextRate)>1e-4){
            element.playbackRate=nextRate;
            entry.lastPlaybackRate=nextRate;
          }
          if(!this.cachedFrames.has(c.id)&&(element.seeking||element.readyState<2))ready=false;
          const wantPitch=c.preservePitch!==false;
          if(entry.lastPreservePitch!==wantPitch){
            if('preservesPitch' in element){(element as any).preservesPitch=wantPitch;}
            else if('webkitPreservesPitch' in element){(element as any).webkitPreservesPitch=wantPitch;}
            entry.lastPreservePitch=wantPitch;
          }
          if(entry.gain&&this.context){
            const nextGain=hold?0:clipGain(p,c,time,windows);
            if(entry.lastGain===undefined||Math.abs(entry.lastGain-nextGain)>0.002){
              entry.gain.gain.setTargetAtTime(nextGain,this.context.currentTime,.008);
              entry.lastGain=nextGain;
            }
          }
          // Start active sources together only after the readiness pass below.
          if((!playing||hold)&&!element.paused)element.pause();
        }
      }
    }
    for(const id of wanted){const entry=this.entries.get(id),element=entry?.element,c=p.clips[id];
      if(!entry||!(element instanceof HTMLMediaElement)||!c)continue;
      const active=time>=c.startTime&&time<c.startTime+c.duration&&!holdIds.has(id);
      if(!playing||!active){if(!element.paused)element.pause();continue;}
      if(!ready)continue;
      if(element.paused&&!entry.playPending){entry.playPending=true;void element.play().catch(error=>{if(this.closed||this.entries.get(id)!==entry||error?.name==="AbortError")return;entry.playError=new Error(`${c.name}: ${error.message}`);}).finally(()=>{entry.playPending=false;});}
    }
    for(const id of this.entries.keys())if(!wanted.has(id))this.release(id);
    return ready;
  }
  private frames=new Map<string,{image:CanvasImageSource;width:number;height:number}>();
  setFrame(id:string,image:CanvasImageSource,width:number,height:number){this.frames.set(id,{image,width,height});}
  clearFrames(){this.frames.clear();}
  render(canvas:HTMLCanvasElement,p:EditorProject,time:number):VisualBounds[]{
    const ctx=canvas.getContext("2d");if(!ctx)return[];
    const index=getProjectIndex(p);
    const [width,height]=dimensions[p.settings.aspectRatio],bounds:VisualBounds[]=[];
    ctx.setTransform(canvas.width/width,0,0,canvas.height/height,0,0);ctx.globalAlpha=1;ctx.filter="none";ctx.fillStyle=p.settings.background;ctx.fillRect(0,0,width,height);
    for(const layer of visibleLayers(p,time)){
      const c=layer.clip,base=zoomTransform({...c,transform:keyframeTransform(c,time)},time),animation=mediaAnimationFrame(c,layer.hold?c.startTime+c.duration-1/p.settings.fps:time),t={...base,x:base.x+animation.x,y:base.y+animation.y,scale:base.scale*animation.scale,rotation:base.rotation+animation.rotation,opacity:base.opacity*animation.opacity},element=this.entries.get(c.id)?.element,frame=this.frames.get(c.id),text=textForClip(p,c);
      if(!c.shape&&!text&&!frame&&(!element||!this.entries.get(c.id)?.ready))continue;
      const sourceTime=c.sourceStart+Math.max(0,(layer.hold?c.startTime+c.duration-1/p.settings.fps:time)-c.startTime)*c.speed,treatment=visualTreatmentAt(c,layer.hold?c.startTime+c.duration-1/p.settings.fps:time);
      const local=time-c.startTime,fade=layer.hold?1:Math.min(c.fadeIn?clamp(local/c.fadeIn,0,1):1,c.fadeOut?clamp((c.duration-local)/c.fadeOut,0,1):1);
      const treatmentEyeLine = (!c.shape && !text && treatment.scale > 1.001) ? (treatment.scale - 1) * 0.14 : 0;
      const layerY = layer.y ?? 0;
      const layerScaleX = layer.scaleX ?? 1;
      const layerScaleY = layer.scaleY ?? 1;
      const layerRotRad = layer.rotation ?? 0;
      const animSkewX = animation.skewX ?? 0;
      const totalSkewX = animSkewX + (layer.skewX ?? 0);
      ctx.save();
      if (layer.clipMask) {
        applyClipMaskShape(ctx, layer.clipMask.shape, layer.clipMask.progress, width, height);
      }
      if (animation.wipeMode > 0 && animation.wipeMode <= WIPE_MODE_SHAPES.length) {
        applyClipMaskShape(ctx, WIPE_MODE_SHAPES[animation.wipeMode - 1], animation.wipeProgress, width, height);
      }
      ctx.globalAlpha=t.opacity*layer.opacity*fade*treatment.opacity;
      ctx.translate(width*(.5+t.x+layer.x),height*(.5+t.y+layerY+treatmentEyeLine));
      ctx.rotate(t.rotation*Math.PI/180 + layerRotRad);
      if (Math.abs(totalSkewX) > 1e-4 && typeof ctx.transform === "function") {
        ctx.transform(1, 0, Math.tan(totalSkewX), 1, 0, 0);
      }
      ctx.scale(t.scale*layer.scale*treatment.scale*animation.scaleX*layerScaleX,t.scale*layer.scale*treatment.scale*animation.scaleY*layerScaleY);
      const fx=c.effects;
      const blur=Math.min(50,fx.blur+treatment.blur+animation.blur+(layer.blur ?? 0));
      const animBright = animation.brightness ?? 1;
      const layerBright = layer.brightness ?? 1;
      const layerContrast = layer.contrast ?? 1;
      const layerSat = layer.saturation ?? 1;
      const brightnessMul = (1 + fx.brightness / 100) * animBright * layerBright;
      const contrastMul = (1 + fx.contrast / 100) * layerContrast;
      const satMul = (1 + fx.saturation / 100) * layerSat;
      if(Math.abs(brightnessMul-1)>0.005||Math.abs(contrastMul-1)>0.005||Math.abs(satMul-1)>0.005||blur>0.01){
        const parts:string[]=[];
        if(Math.abs(brightnessMul-1)>0.005)parts.push(`brightness(${Math.max(0, brightnessMul)})`);
        if(Math.abs(contrastMul-1)>0.005)parts.push(`contrast(${Math.max(0, contrastMul)})`);
        if(Math.abs(satMul-1)>0.005)parts.push(`saturate(${Math.max(0, satMul)})`);
        if(blur>0.01)parts.push(`blur(${blur}px)`);
        ctx.filter=parts.join(" ");
      }
      const rgbFraction = Math.max(animation.rgbOffset ?? 0, layer.rgbOffset ?? 0);
      const canRasterRgb = typeof OffscreenCanvas !== "undefined" || typeof document !== "undefined";
      const combinedRgbOffset = treatment.rgbOffset
        ? (rgbFraction > 0.001 && canRasterRgb
            ? { x: treatment.rgbOffset.x + rgbFraction * 720, y: treatment.rgbOffset.y }
            : treatment.rgbOffset)
        : (rgbFraction > 0.001 && canRasterRgb ? { x: rgbFraction * 720, y: 0 } : undefined);
      let bw=width,bh=height;
      const rich=c.contentId?p.captions[c.contentId]:undefined;
      if(rich?.studioStyle){let segment=index.studioSegments.get(c.id);if(!segment){segment=studioSegment(p,c);index.studioSegments.set(c.id,segment);}ctx.translate(-width/2,-height/2);drawCaptions(ctx,[segment],rich.studioStyle,time,width,height);const b=studioCaptionBounds(rich.studioStyle,width,height);if(!layer.hold){const rad=(t.rotation*Math.PI)/180,sx=t.scale*layer.scale*treatment.scale*animation.scaleX*layerScaleX,sy=t.scale*layer.scale*treatment.scale*animation.scaleY*layerScaleY,dx=(b.x-width/2)*sx,dy=(b.y-height/2)*sy;bounds.push({id:c.id,x:width*(0.5+t.x+layer.x)+dx*Math.cos(rad)-dy*Math.sin(rad),y:height*(0.5+t.y+layerY+treatmentEyeLine)+dx*Math.sin(rad)+dy*Math.cos(rad),width:b.width*Math.abs(sx),height:b.height*Math.abs(sy),rotation:t.rotation});}ctx.restore();if(layer.overlayFlash)drawTransitionOverlay(ctx,layer.overlayFlash,width,height);continue;}
      if(c.shape){const size=shapeDimensions(c.shape,p.settings.aspectRatio);bw=size.width;bh=size.height;drawShape(ctx,c.shape,bw,bh,{sourceTime});}
      else if(text){const caption=c.contentId?p.captions[c.contentId]:undefined,motion=caption?captionMotionFrame(caption,c,time):undefined;
        const rendered=motion?{...text,text:motion.text}:text;
        if(motion)ctx.scale(motion.scale,motion.scale);
        const metrics=layoutText(ctx,rendered,width,styledText(text).trim().split(/\s+/).length);bw=metrics.width;bh=metrics.height;const s=text.style;
        let graphicHandlesText=false;
        if(c.graphic){const graphic=drawGraphicPanel(ctx,c.graphic,bw,bh,local,{title:text.text,frameWidth:width,frameHeight:height,duration:c.duration,font:s.font});bw=graphic.width;bh=graphic.height;graphicHandlesText=Boolean(graphic.handlesText);}
        if(graphicHandlesText){if(!layer.hold)bounds.push({id:c.id,x:width*(.5+t.x+layer.x),y:height*(.5+t.y+layerY),width:bw*t.scale*treatment.scale*Math.abs(animation.scaleX*layerScaleX),height:bh*t.scale*treatment.scale*Math.abs(animation.scaleY*layerScaleY),rotation:t.rotation});ctx.restore();if(layer.overlayFlash)drawTransitionOverlay(ctx,layer.overlayFlash,width,height);continue;}
        if(s.background!=="transparent"){ctx.fillStyle=s.background;ctx.fillRect(-bw/2,-bh/2,bw,bh);}
        ctx.direction=textDirection(text.text);ctx.textAlign=s.align;ctx.textBaseline="middle";ctx.fillStyle=textFill(ctx,s.gradient,s.color,metrics.inkWidth,bh,s.align==="left"?-bw/2+16+metrics.inkWidth/2:s.align==="right"?bw/2-16-metrics.inkWidth/2:0);ctx.strokeStyle=s.stroke;ctx.lineWidth=s.strokeWidth*2;ctx.lineJoin="round";ctx.shadowColor="rgba(0,0,0,.8)";ctx.shadowBlur=s.shadow;
        const x=s.align==="left"?-bw/2+16:s.align==="right"?bw/2-16:0;
        let wordIndex=0;
        metrics.lines.forEach((line,i)=>{const y=(i-(metrics.lines.length-1)/2)*s.size*s.lineHeight;
          if(metrics.mixed){const row=metrics.mixed.rows[i],rowWidth=row.reduce((n,r)=>n+r.width,0)+Math.max(0,row.length-1)*metrics.mixed.gap;let offset=s.align==='left'?x:s.align==='right'?x-rowWidth:x-rowWidth/2;
            const rtl=textDirection(text.text)==='rtl';if(rtl)offset+=rowWidth;ctx.save();ctx.textAlign='left';for(const run of row){const at=rtl?offset-run.width:offset;ctx.font=run.font;ctx.direction=textDirection(run.text);if(s.strokeWidth)ctx.strokeText(run.text,at,y);ctx.fillText(run.text,at,y);if(caption&&wordHighlight(caption.highlightMode||'current-word',run.text,run.index,!!motion&&motion.active===run.index,caption.highlightWords,!!motion&&motion.active>=run.index)){ctx.save();ctx.fillStyle=caption.highlightMode==='full-line'?(caption.highlightColor||s.color):distinctHighlight(s.color,caption.highlightColor||'#d9ff43');ctx.fillText(run.text,at,y);ctx.restore();}offset+=(rtl?-1:1)*(run.width+metrics.mixed.gap);}ctx.restore();return;
          }
          if(s.strokeWidth)ctx.strokeText(line,x,y);ctx.fillText(line,x,y);
          if(motion&&motion.active>=0){const words=line.split(/\s+/).filter(Boolean),lineWidth=ctx.measureText(line).width;
            let offset=s.align==="left"?x:s.align==="right"?x-lineWidth:x-lineWidth/2;
            for(const word of words){if(wordIndex===motion.active){ctx.save();ctx.textAlign="left";ctx.fillStyle=caption?.highlightColor||"#d9ff43";ctx.fillText(word,offset,y);ctx.restore();}offset+=ctx.measureText(word+" ").width;wordIndex++;}
          }
        });
      }else if(frame||(typeof HTMLVideoElement!=="undefined"&&element instanceof HTMLVideoElement)||(typeof HTMLImageElement!=="undefined"&&element instanceof HTMLImageElement)||(element&&((element as any).naturalWidth!==undefined||(element as any).videoWidth!==undefined))){
        const isVideo=typeof HTMLVideoElement!=="undefined"&&element instanceof HTMLVideoElement;
        const ew=frame?frame.width:isVideo?(element as HTMLVideoElement).videoWidth:(element as any)?.naturalWidth||0,eh=frame?frame.height:isVideo?(element as HTMLVideoElement).videoHeight:(element as any)?.naturalHeight||0;
        let mediaSource: CanvasImageSource | undefined;
        let sw = 0;
        let sh = 0;
        if(isVideo && (element as HTMLVideoElement).readyState>=2 && ew>0 && eh>0){
          if(typeof document!=="undefined"){
            let cached=this.cachedFrames.get(c.id);
            if(!cached||cached.width!==ew||cached.height!==eh){
              const offscreen=document.createElement("canvas");
              offscreen.width=ew;offscreen.height=eh;
              cached={canvas:offscreen,width:ew,height:eh};
              this.cachedFrames.set(c.id,cached);
            }
            const offCtx=cached.canvas.getContext("2d");
            if(offCtx)offCtx.drawImage(element as HTMLVideoElement,0,0,ew,eh);
          }
          mediaSource = frame?.image||(element as any);
          sw = ew; sh = eh;
        }else if(isVideo && this.cachedFrames.has(c.id)){
          const cached=this.cachedFrames.get(c.id)!;
          mediaSource = cached.canvas;
          sw = cached.width; sh = cached.height;
        }else if(frame||(typeof HTMLImageElement!=="undefined"&&element instanceof HTMLImageElement)||(isVideo&&ew&&eh)||(!isVideo&&ew&&eh)){
          if(!ew||!eh){ctx.restore();if(layer.overlayFlash)drawTransitionOverlay(ctx,layer.overlayFlash,width,height);continue;}
          mediaSource = frame?.image||(element as any);
          sw = ew; sh = eh;
        }else{ctx.restore();if(layer.overlayFlash)drawTransitionOverlay(ctx,layer.overlayFlash,width,height);continue;}
        if(!mediaSource){ctx.restore();if(layer.overlayFlash)drawTransitionOverlay(ctx,layer.overlayFlash,width,height);continue;}

        const pixelateLevel = Math.max(animation.pixelate ?? 0, layer.pixelate ?? 0);
        const glitchLevel = layer.glitchSlices ?? 0;
        const ghostLevel = layer.ghostEcho ?? 0;
        if (pixelateLevel > 0.04 && typeof document !== "undefined") {
          const gridW = Math.max(10, Math.round(72 * (1 - clamp(pixelateLevel, 0, 0.92))));
          const gridH = Math.max(10, Math.round((gridW * sh) / Math.max(1, sw)));
          let pix = this.cachedFrames.get("__pix__");
          if (!pix || pix.width !== gridW || pix.height !== gridH) {
            const pCanvas = document.createElement("canvas");
            pCanvas.width = gridW; pCanvas.height = gridH;
            pix = { canvas: pCanvas, width: gridW, height: gridH };
            this.cachedFrames.set("__pix__", pix);
          }
          const pCtx = pix.canvas.getContext("2d");
          if (pCtx) {
            pCtx.clearRect(0, 0, gridW, gridH);
            pCtx.drawImage(mediaSource, 0, 0, gridW, gridH);
            const prevSmooth = ctx.imageSmoothingEnabled;
            ctx.imageSmoothingEnabled = false;
            const mediaBounds = drawVisualMedia(ctx, pix.canvas, sw, sh, width, height, c.visualTreatment, sourceTime, combinedRgbOffset);
            bw = mediaBounds.width; bh = mediaBounds.height;
            ctx.imageSmoothingEnabled = prevSmooth;
          } else {
            const mediaBounds = drawVisualMedia(ctx, mediaSource, sw, sh, width, height, c.visualTreatment, sourceTime, combinedRgbOffset);
            bw = mediaBounds.width; bh = mediaBounds.height;
          }
        } else {
          const mediaBounds=drawVisualMedia(ctx,mediaSource,sw,sh,width,height,c.visualTreatment,sourceTime,combinedRgbOffset);
          bw=mediaBounds.width;bh=mediaBounds.height;
        }
        if (glitchLevel > 0.04) {
          const slices = 5;
          const shSlice = sh / slices;
          const bhSlice = bh / slices;
          for (let sIdx = 0; sIdx < slices; sIdx++) {
            const shift = Math.sin(sIdx * 17.3 + time * 41) * glitchLevel * bw * 0.08;
            if (Math.abs(shift) > 1) {
              ctx.drawImage(
                mediaSource,
                0,
                sIdx * shSlice,
                sw,
                shSlice,
                -bw / 2 + shift,
                -bh / 2 + sIdx * bhSlice,
                bw,
                bhSlice
              );
            }
          }
        }
        if (ghostLevel > 0.04) {
          ctx.save();
          ctx.globalAlpha = clamp(ghostLevel * 0.32, 0, 0.45);
          ctx.scale(1 + 0.08 * ghostLevel, 1 + 0.08 * ghostLevel);
          drawVisualMedia(ctx, mediaSource, sw, sh, width, height, c.visualTreatment, sourceTime);
          ctx.restore();
        }
        if(c.surface&&c.surface!=="none"){ctx.save();if(c.visualTreatment?.mask)applyVisualMask(ctx,c.visualTreatment.mask,bw,bh,sourceTime);drawStyleSurface(ctx,bw,bh,local,c.surface);ctx.restore();}
      }
      if(!layer.hold)bounds.push({id:c.id,x:width*(.5+t.x+layer.x),y:height*(.5+t.y+layerY),width:bw*t.scale*treatment.scale*Math.abs(animation.scaleX*layerScaleX),height:bh*t.scale*treatment.scale*Math.abs(animation.scaleY*layerScaleY),rotation:t.rotation});
      ctx.restore();
      if(layer.overlayFlash)drawTransitionOverlay(ctx,layer.overlayFlash,width,height);
    }ctx.setTransform(1,0,0,1,0,0);return bounds;
  }
  pause(){for(const e of this.entries.values())if(e.element instanceof HTMLMediaElement)e.element.pause();}
  private release(id:string){this.cachedFrames.delete(id);const entry=this.entries.get(id);if(!entry)return;entry.source?.disconnect();entry.gain?.disconnect();if(entry.element instanceof HTMLMediaElement){entry.element.pause();entry.element.removeAttribute("src");entry.element.load();}this.entries.delete(id);this.loading.delete(id);}
  dispose(){this.closed=true;this.frames.clear();this.cachedFrames.clear();for(const id of this.entries.keys())this.release(id);void this.context?.close();}
}
