import {readMediaAnimation} from './mediaAnimation';
import {readCaptionComposition} from './captionComposition';
import {readVisualTreatment,setVisualTreatment} from './visualTreatment';
import {readStudioStyle,readStudioData} from './editorCaptionStudio';
import {readFontAccent} from "../captions/typography";
import {readTextGradient} from "./textGradient";
import {validateZoom} from "./zoom";
import {readShape,SHAPE_KINDS,defaultShape} from './shapes';
import {readStyleSurface} from './styleSurface';
import {readKeyframes,MOTION_PRESETS} from './keyframes';
import {readMotionGraphic,GRAPHIC_KINDS} from './motionGraphics';
import {textPlacementId} from "./textPlacement";
import {ALL_CAPTION_TEMPLATES as DEFAULT_CAPTION_TEMPLATES} from "../captions/referenceTemplates";
import { EditorProject, MediaAsset, Clip, Track, TextLayer, Ratio, defaultStyle, defaultTransform, aspectRatios } from "./model";
import { EditDecision, EditDecisionList, applyEditDecisionList } from "./ai";

const ratios = aspectRatios;
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Expected an object.");
  return value as Record<string, unknown>;
}
function string(value: unknown, max = 200): string {
  if (typeof value !== "string" || !value.trim() || value.length > max) throw new Error("Invalid or missing text.");
  return value;
}
function id(value: unknown): string {
  const result = string(value, 200);
  if (["__proto__", "prototype", "constructor"].includes(result)) throw new Error("Invalid identifier.");
  return result;
}
function number(value: unknown, min = 0, max = 86400): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) throw new Error("Number outside the supported range.");
  return value;
}
function choice<T extends string>(value: unknown, values: readonly T[]): T {
  if (!values.includes(value as T)) throw new Error("Unsupported value.");
  return value as T;
}
function boolean(value: unknown): boolean {
  if (typeof value !== "boolean") throw new Error("Expected a boolean.");
  return value;
}
function array(value: unknown, max = 300): unknown[] {
  if (!Array.isArray(value) || value.length > max) throw new Error("Too many items or invalid list.");
  return value;
}
function record<T>(value: unknown, read: (item: unknown) => T): Record<string, T> {
  const entries = Object.entries(object(value));
  if (entries.length > 300) throw new Error("Use a project with at most 300 assets or clips for AI editing.");
  return Object.fromEntries(entries.map(([key, item]) => [id(key), read(item)]));
}
function transform(value: unknown): Clip["transform"] {
  const t = object(value);
  return { x: number(t.x, -2, 2), y: number(t.y, -2, 2), scale: number(t.scale, .05, 10), rotation: number(t.rotation, -3600, 3600), opacity: number(t.opacity, 0, 1) };
}
function effects(value: unknown): Clip["effects"] {
  const e = object(value);
  return { brightness: number(e.brightness, -100, 100), contrast: number(e.contrast, -100, 100), saturation: number(e.saturation, -100, 100), blur: number(e.blur, 0, 50) };
}
function style(value: unknown): TextLayer["style"] {
  const s = object(value);
  return { ...(s.fontAccent===undefined?{}:{fontAccent:readFontAccent(s.fontAccent)}),...(s.maxWordsPerLine===undefined?{}:{maxWordsPerLine:number(s.maxWordsPerLine,1,8)}),...(s.gradient===undefined?{}:{gradient:readTextGradient(s.gradient)}),...(s.maxWidth===undefined?{}:{maxWidth:number(s.maxWidth,.1,.86)}),...(s.casing===undefined?{}:{casing:choice(s.casing,["uppercase","none","capitalize"] as const)}),font: string(s.font, 100), size: number(s.size, 1, 500), weight: number(s.weight, 100, 900), align: choice(s.align, ["left", "center", "right"]), color: string(s.color, 80), background: string(s.background, 80), stroke: string(s.stroke, 80), strokeWidth: number(s.strokeWidth, 0, 30), shadow: number(s.shadow, 0, 50), letterSpacing: number(s.letterSpacing, -20, 100), lineHeight: number(s.lineHeight, .1, 5) };
}

function partialStyle(value:unknown):Partial<TextLayer["style"]>{const supplied=object(value);if(Object.keys(supplied).some(k=>!(k in defaultStyle)&&!["gradient","maxWidth","casing","fontAccent","maxWordsPerLine"].includes(k)))throw new Error("Unsupported text style.");const validated=style({...defaultStyle,...supplied});return Object.fromEntries(Object.keys(supplied).map(k=>[k,validated[k as keyof typeof validated]]));}

/** Only editing metadata crosses the AI boundary; URLs, media bytes and cache keys do not. */
export function aiProjectSnapshot(value: unknown): EditorProject {
  const p = object(value), settings = object(p.settings);
  if (p.schemaVersion !== 1) throw new Error("Unsupported editor document.");
  const assets = record<MediaAsset>(p.assets, value => {
    const a = object(value);
    return { id: id(a.id), name: string(a.name), kind: choice(a.kind, ["video", "audio", "image"]), mime: typeof a.mime === "string" ? a.mime.slice(0, 100) : "", size: 0, duration: number(a.duration), width: number(a.width), height: number(a.height) };
  });
  const tracks = record<Track>(p.tracks, value => {
    const t = object(value);
    return { id: id(t.id), name: string(t.name), kind: choice(t.kind, ["video", "overlay", "image", "text", "caption", "audio"]), clipIds: array(t.clipIds).map(id), hidden: boolean(t.hidden), muted: boolean(t.muted), locked: boolean(t.locked) };
  });
  const clips = record<Clip>(p.clips, value => {
    const c = object(value);
    return { id: id(c.id),...(c.mediaAnimation===undefined?{}:{mediaAnimation:readMediaAnimation(c.mediaAnimation)}),...(c.visualTreatment===undefined?{}:{visualTreatment:readVisualTreatment(c.visualTreatment)}),...(c.keyframes===undefined?{}:{keyframes:readKeyframes(c.keyframes)}),...(c.graphic===undefined?{}:{graphic:readMotionGraphic(c.graphic)}),...(c.shape===undefined?{}:{shape:readShape(c.shape)}),...(c.surface===undefined?{}:{surface:readStyleSurface(c.surface)}), ...(c.zooms===undefined?{}:{zooms:array(c.zooms,12).map(value=>{const z=object(value);return validateZoom({sourceStart:number(z.sourceStart),sourceEnd:number(z.sourceEnd),fromScale:number(z.fromScale,1,2),toScale:number(z.toScale,1,2),easing:choice(z.easing,["linear","smooth"]),returnToStart:boolean(z.returnToStart),focusX:number(z.focusX,-.4,.4),focusY:number(z.focusY,-.4,.4)});})}), ...(c.assetId ? { assetId: id(c.assetId) } : {}), ...(c.contentId ? { contentId: id(c.contentId) } : {}), trackId: id(c.trackId), name: string(c.name), startTime: number(c.startTime), duration: number(c.duration, 1 / 120), sourceStart: number(c.sourceStart), sourceEnd: number(c.sourceEnd), transform: transform(c.transform), effects: effects(c.effects), volume: number(c.volume, 0, 2), speed: number(c.speed, .25, 4), fadeIn: number(c.fadeIn), fadeOut: number(c.fadeOut),...(c.audioRole===undefined?{}:{audioRole:choice(c.audioRole,["speech","background","sfx"] as const)}),...(c.ducking===undefined?{}:{ducking:boolean(c.ducking)}) };
  });
  for(const c of Object.values(clips))if(c.visualTreatment)setVisualTreatment({assets,tracks,clips} as EditorProject,c.id,c.visualTreatment);
  const readText = (value: unknown): TextLayer => {
    const t = object(value);
    return { id: id(t.id), text: typeof t.text === "string" && t.text.length <= 5000 ? t.text : string(t.text, 5000), style: style(t.style) };
  };
  const textLayers = record(p.textLayers, readText), captions = record(p.captions, value=>{
    const c=object(value),layer=readText(c);
    const words=c.words===undefined?undefined:array(c.words,500).map(value=>{const w=object(value),start=number(w.start),end=number(w.end);if(end<start)throw Error("Invalid word timing.");return {word:string(w.word,200),start,end};});
    if(words?.length&&(words.map(w=>w.word).join(" ").trim()!==layer.text.trim()||words.some((w,i)=>i>0&&w.start<words[i-1].start)))throw Error("Caption words do not match their text.");
    return {...layer,...(c.studioStyle===undefined?{}:{studioStyle:readStudioStyle(c.studioStyle)}),...(c.studioData===undefined?{}:{studioData:readStudioData(c.studioData)}),...(c.highlightMode===undefined?{}:{highlightMode:choice(c.highlightMode,["keyword","current-word","alternating","full-line","cumulative"] as const)}),...(c.highlightWords===undefined?{}:{highlightWords:typeof c.highlightWords==='string'&&c.highlightWords.length<=1000?c.highlightWords:string(c.highlightWords,1000)}),...(words?{words}:{}),...(c.motion===undefined?{}:{motion:choice(c.motion,["none","pop","word-reveal","karaoke"] as const)}),...(c.highlightColor===undefined?{}:{highlightColor:string(c.highlightColor,80)})};
  });
  const trackOrder = array(p.trackOrder, 30).map(id);
  if (new Set(trackOrder).size !== trackOrder.length || Object.keys(tracks).length !== trackOrder.length || trackOrder.some(key => !tracks[key])) throw new Error("Invalid project tracks.");
  for (const [key, track] of Object.entries(tracks)) {
    if (key !== track.id || new Set(track.clipIds).size !== track.clipIds.length || track.clipIds.some(key => !clips[key] || clips[key].trackId !== track.id)) throw new Error("Invalid track clips.");
  }
  for (const [key, asset] of Object.entries(assets)) if (key !== asset.id) throw new Error("Invalid asset identifier.");
  for (const [key, clip] of Object.entries(clips)) {
    if(clip.shape&&(clip.assetId||clip.contentId||tracks[clip.trackId]?.kind!=='overlay'))throw Error('Shapes need an overlay track and no external content.');
    if(clip.mediaAnimation&&(!clip.assetId||!['video','image'].includes(assets[clip.assetId]?.kind)))throw Error('Media animation needs visual media.');
    if(clip.surface&&(!clip.assetId||assets[clip.assetId]?.kind==='audio'))throw Error('Surfaces need visual media.');
    if(clip.keyframes?.length&&tracks[clip.trackId]?.kind==='audio'||clip.graphic&&(!clip.contentId||tracks[clip.trackId]?.kind!=='text'))throw Error('Motion needs compatible visual content.');
    if (key !== clip.id || !tracks[clip.trackId]?.clipIds.includes(key) || clip.sourceEnd < clip.sourceStart || clip.startTime + clip.duration > 86400) throw new Error("Invalid clip timing or track.");
    if (clip.assetId && !assets[clip.assetId] || clip.contentId && !textLayers[clip.contentId] && !captions[clip.contentId]) throw new Error("Missing clip content.");
    const asset = clip.assetId ? assets[clip.assetId] : undefined;
    if (asset && asset.kind !== "image" && clip.sourceEnd > asset.duration + .01) throw new Error("Clip exceeds its original media.");
  }
  return { schemaVersion: 1, id: id(p.id), title: string(p.title), revision: number(p.revision, 0, Number.MAX_SAFE_INTEGER), updatedAt: "", trackOrder, tracks, clips, assets, textLayers, captions, transitions: {}, settings: { aspectRatio: choice(settings.aspectRatio, ratios), fps: number(settings.fps, 1, 120), background: "#000000",...(settings.audioDucking===undefined?{}:{audioDucking:boolean(settings.audioDucking)}) } };
}

function templateId(value:unknown){const result=id(value);if(!DEFAULT_CAPTION_TEMPLATES.some(t=>t.id===result))throw new Error("Unknown caption template.");return result;}
function decision(value: unknown): EditDecision {
  const d = object(value);
  switch (d.op) {
    case 'composeCaption':return {op:d.op,clipId:id(d.clipId),presentation:readCaptionComposition(d.presentation)};
    case 'setVisualTreatment':return {op:d.op,clipId:id(d.clipId),treatment:readVisualTreatment(d.treatment)};
    case 'addShape':{const kind=choice(d.kind,SHAPE_KINDS);return {op:d.op,kind,startTime:number(d.startTime),duration:number(d.duration,1/120,60),...(d.style===undefined?{}:{style:readShape({...defaultShape,...object(d.style),kind})}),...(d.transform===undefined?{}:{transform:transform({...defaultTransform,...object(d.transform)})}),...(d.motion===undefined?{}:{motion:choice(d.motion,MOTION_PRESETS)})};}
    case 'keyframes':return {op:d.op,clipId:id(d.clipId),frames:readKeyframes(d.frames)};
    case 'animate':return {op:d.op,clipId:id(d.clipId),preset:choice(d.preset,MOTION_PRESETS)};
    case 'addGraphic':return {op:d.op,kind:choice(d.kind,GRAPHIC_KINDS),text:string(d.text,120),startTime:number(d.startTime),duration:number(d.duration,.5,12),...(d.accent===undefined?{}:{accent:string(d.accent,9)}),...(d.motion===undefined?{}:{motion:choice(d.motion,MOTION_PRESETS)})};
    case 'addOverlay':return {op:d.op,assetId:id(d.assetId),trackId:id(d.trackId),startTime:number(d.startTime),duration:number(d.duration,.5,12),...(d.motion===undefined?{}:{motion:choice(d.motion,MOTION_PRESETS)})};
    case "addZoom":return {op:d.op,clipId:id(d.clipId),startTime:number(d.startTime),endTime:number(d.endTime),fromScale:number(d.fromScale,1,2),toScale:number(d.toScale,1,2),...(d.returnToStart===undefined?{}:{returnToStart:boolean(d.returnToStart)}),...(d.easing===undefined?{}:{easing:choice(d.easing,["linear","smooth"] as const)}),...(d.focusX===undefined?{}:{focusX:number(d.focusX,-.4,.4)}),...(d.focusY===undefined?{}:{focusY:number(d.focusY,-.4,.4)})};
    case "clearZooms":return {op:d.op,clipId:id(d.clipId)};
    case "rippleCut":return {op:d.op,ranges:array(d.ranges,20).map(value=>{const r=object(value);return {start:number(r.start),end:number(r.end)};})};
    case "applyTextPlacement":return {op:d.op,clipIds:array(d.clipIds,100).map(id),placementId:textPlacementId(d.placementId)};
    case "appendSequence": return {op:d.op,assetIds:array(d.assetIds,30).map(id),...(d.trackId===undefined?{}:{trackId:id(d.trackId)})};
    case "applyCaptionTemplate": return {op:d.op,clipIds:array(d.clipIds).map(id),templateId:templateId(d.templateId)};
    case "setAudioDucking": return {op:d.op,enabled:boolean(d.enabled)};
    case "addClip": return { op: d.op,...(d.visualTreatment===undefined?{}:{visualTreatment:readVisualTreatment(d.visualTreatment)}),...(d.keyframes===undefined?{}:{keyframes:readKeyframes(d.keyframes)}),...(d.transform===undefined?{}:{transform:transform({...defaultTransform,...object(d.transform)})}), assetId: id(d.assetId), trackId: id(d.trackId), startTime: number(d.startTime),...(d.duration===undefined?{}:{duration:number(d.duration,1/120)}),...(d.audioRole===undefined?{}:{audioRole:choice(d.audioRole,["speech","background","sfx"] as const)}),...(d.volume===undefined?{}:{volume:number(d.volume,0,2)}) };
    case "duplicateClip":return {op:d.op,clipId:id(d.clipId),...(d.startTime===undefined?{}:{startTime:number(d.startTime)})};
    case "changeText":return {op:d.op,clipId:id(d.clipId),text:string(d.text,5000),...(d.style?{style:partialStyle(d.style)}:{})};
    case "mergeCaptions":return {op:d.op,clipIds:array(d.clipIds,100).map(id)};
    case "changeTrack":return {op:d.op,trackId:id(d.trackId),...(d.hidden===undefined?{}:{hidden:boolean(d.hidden)}),...(d.muted===undefined?{}:{muted:boolean(d.muted)})};
    case "removeClip": return { op: d.op, clipId: id(d.clipId) };
    case "moveClip": return { op: d.op, clipId: id(d.clipId), startTime: number(d.startTime), ...(d.trackId ? { trackId: id(d.trackId) } : {}) };
    case "trimClip": return { op: d.op, clipId: id(d.clipId), edge: choice(d.edge, ["left", "right"]), time: number(d.time) };
    case "splitClip": return { op: d.op, clipId: id(d.clipId), time: number(d.time) };
    case "addText": return { op: d.op,...(d.placementId===undefined?{}:{placementId:textPlacementId(d.placementId)}), text: string(d.text, 5000), startTime: number(d.startTime), ...(d.style ? { style: style({ ...defaultStyle, ...object(d.style) }) } : {}) };
    case "addCaption": return { op: d.op,...(d.placementId===undefined?{}:{placementId:textPlacementId(d.placementId)}), text: string(d.text, 5000), startTime: number(d.startTime), duration: number(d.duration, 1 / 120),...(d.templateId===undefined?{}:{templateId:templateId(d.templateId)}),...(d.words===undefined?{}:{words:array(d.words,500).map(value=>{const w=object(value);return {word:string(w.word,200),start:number(w.start),end:number(w.end)};})}) };
    case "setAspectRatio": return { op: d.op, aspectRatio: choice(d.aspectRatio, ratios) as Ratio };
    case "addTransition": return { op: d.op, fromClipId: id(d.fromClipId), toClipId: id(d.toClipId), kind: choice(d.kind, ["fade", "dissolve", "slide", "zoom"]), duration: number(d.duration, 1 / 120, 5) };
    case "changeClipProperty": {
      const c = object(d.changes), changes: Extract<EditDecision, { op: "changeClipProperty" }>["changes"] = {};
      if (Object.keys(c).some(key => !["transform", "effects", "volume", "speed", "fadeIn", "fadeOut", "audioRole", "ducking", "surface"].includes(key)) || !Object.keys(c).length) throw new Error("Unsupported clip property.");
      if(c.audioRole!==undefined)changes.audioRole=choice(c.audioRole,["speech","background","sfx"] as const);
      if(c.ducking!==undefined)changes.ducking=boolean(c.ducking);
      if (c.transform !== undefined) changes.transform = transform(c.transform);
      if (c.effects !== undefined) changes.effects = effects(c.effects);
      if (c.volume !== undefined) changes.volume = number(c.volume, 0, 2);
      if (c.speed !== undefined) changes.speed = number(c.speed, .25, 4);
      if (c.fadeIn !== undefined) changes.fadeIn = number(c.fadeIn);
      if (c.fadeOut !== undefined) changes.fadeOut = number(c.fadeOut);
      if(c.surface!==undefined)changes.surface=readStyleSurface(c.surface);
      return { op: d.op, clipId: id(d.clipId), changes };
    }
    default: throw new Error("Unsupported AI editing operation.");
  }
}

export function validateAiPlan(value: unknown, project: EditorProject): { summary: string; list: EditDecisionList } {
  const result = object(value);
  const list: EditDecisionList = { version: 1, projectId: project.id, baseRevision: project.revision, decisions: array(result.decisions, 100).map(decision) };
  const cutIndex=list.decisions.findIndex(d=>d.op==="rippleCut");
  if(cutIndex>=0&&(cutIndex!==list.decisions.length-1||list.decisions.filter(d=>d.op==="rippleCut").length!==1))throw Error("Combine all cut ranges in one rippleCut operation and put it last, after clip-specific edits.");
  // A dry run rejects missing assets, locked tracks and incompatible transitions atomically.
  const next = applyEditDecisionList(project, list);
  aiProjectSnapshot(next);
  return { summary: string(result.summary, 2000), list };
}
