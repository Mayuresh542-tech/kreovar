import {composeCaption,type CaptionComposition} from './captionComposition';
import {setVisualTreatment,assertInsertedVisualTreatment,type VisualTreatment} from './visualTreatment';
import {preserveCaptionAnchors} from './captionAnchors';
import {addShape,type ShapeKind,type ShapeStyle} from "./shapes";
import {addZoom,clearZooms} from "./zoom";
import {setTransformKeyframes,type TransformKeyframe,type MotionPreset,applyMotionPreset} from './keyframes';
import {addMotionGraphic,addAnimatedOverlay,type GraphicKind} from './motionGraphics';
import {rippleCut,type CutRange} from "./rippleCut";
import {applyTextPlacement,type TextPlacementId} from "./textPlacement";
import {MAX_VIDEO_SECONDS} from "./limits";
import {projectDuration} from "./model";
import { Clip, EditorProject, TransitionKind, TextStyle, Ratio, normalizeCaptionPresetId } from "./model";
import * as edit from "./operations";
import {appendSequence} from "./sequence";
import {applyCaptionTemplate,addTemplatedCaption} from "./captionTemplates";
import {ALL_CAPTION_TEMPLATES as DEFAULT_CAPTION_TEMPLATES} from "../captions/referenceTemplates";
/** Provider-neutral EDL boundary. No provider credentials, model calls, or fabricated decisions. */
export type EditDecision =
  | {op:'composeCaption';clipId:string;presentation:CaptionComposition}
  | {op:'setVisualTreatment';clipId:string;treatment:VisualTreatment}
  | {op:'addShape';kind:ShapeKind;startTime:number;duration:number;style?:Partial<ShapeStyle>;transform?:Partial<Clip["transform"]>;motion?:MotionPreset}
  | {op:'keyframes';clipId:string;frames:TransformKeyframe[]}
  | {op:'animate';clipId:string;preset:MotionPreset}
  | {op:'addGraphic';kind:GraphicKind;text:string;startTime:number;duration:number;accent?:string;motion?:MotionPreset}
  | {op:'addOverlay';assetId:string;trackId:string;startTime:number;duration:number;motion?:MotionPreset}
  | {op:"addZoom";clipId:string;startTime:number;endTime:number;fromScale:number;toScale:number;returnToStart?:boolean;easing?:"linear"|"smooth";focusX?:number;focusY?:number}
  | {op:"clearZooms";clipId:string}
  | {op:"rippleCut";ranges:CutRange[]}
  | {op:"applyTextPlacement";clipIds:string[];placementId:TextPlacementId}
  | {op:"appendSequence";assetIds:string[];trackId?:string}
  | {op:"applyCaptionTemplate";clipIds:string[];templateId:string}
  | {op:"setAudioDucking";enabled:boolean}
  | {op:"addClip";assetId:string;trackId:string;startTime:number;duration?:number;volume?:number;audioRole?:Clip["audioRole"];visualTreatment?:VisualTreatment;keyframes?:TransformKeyframe[];transform?:Clip["transform"]}
  | {op:"removeClip";clipId:string}
  | {op:"moveClip";clipId:string;startTime:number;trackId?:string}
  | {op:"trimClip";clipId:string;edge:"left"|"right";time:number}
  | {op:"splitClip";clipId:string;time:number}
  | {op:"addText";text:string;startTime:number;placementId?:TextPlacementId;style?:Partial<TextStyle>}
  | {op:"addCaption";text:string;startTime:number;duration:number;templateId?:string;placementId?:TextPlacementId;words?:import("./model").CaptionWord[]}
  | {op:"addTransition";fromClipId:string;toClipId:string;kind:TransitionKind;duration:number}
  | {op:"duplicateClip";clipId:string;startTime?:number}
  | {op:"changeText";clipId:string;text:string;style?:Partial<TextStyle>}
  | {op:"mergeCaptions";clipIds:string[]}
  | {op:"changeTrack";trackId:string;hidden?:boolean;muted?:boolean}
  | {op:"setAspectRatio";aspectRatio:Ratio}
  | {op:"changeClipProperty";clipId:string;changes:Partial<Pick<Clip,"transform"|"volume"|"speed"|"fadeIn"|"fadeOut"|"effects"|"audioRole"|"ducking"|"surface">>};
export interface EditDecisionList {version:1;projectId:string;baseRevision:number;decisions:EditDecision[];transcriptionId?:string}
/** Validate against a revision and apply atomically in one EditorStore.execute transaction. */
export function applyEditDecisionList(p:EditorProject,list:EditDecisionList):EditorProject {
  if(list.version!==1||list.projectId!==p.id||list.baseRevision!==p.revision)throw new Error("This edit plan targets a different project revision.");
  if(list.decisions.length>100)throw new Error("Edit plan exceeds the operation limit.");
  const result=list.decisions.reduce((project,d)=>{
    switch(d.op){
      case 'composeCaption':return composeCaption(project,d.clipId,d.presentation);
      case 'setVisualTreatment':return setVisualTreatment(project,d.clipId,d.treatment);
      case'keyframes':return setTransformKeyframes(project,d.clipId,d.frames);
      case'animate':return applyMotionPreset(project,d.clipId,d.preset);
      case'addShape':{const next=addShape(project,d.kind,d.startTime,d.duration,d.style,d.transform);if(!d.motion)return next;const id=Object.keys(next.clips).find(id=>!project.clips[id])!;return applyMotionPreset(next,id,d.motion);}
      case'addGraphic':return addMotionGraphic(project,d.kind,d.text,d.startTime,d.duration,d.accent,d.motion);
      case'addOverlay':return addAnimatedOverlay(project,d.assetId,d.trackId,d.startTime,d.duration,d.motion);
      case"addZoom":return addZoom(project,d.clipId,d.startTime,d.endTime,d.fromScale,d.toScale,d.returnToStart,d.easing,d.focusX,d.focusY);
      case"clearZooms":return clearZooms(project,d.clipId);
      case"rippleCut":return rippleCut(project,d.ranges);
      case"applyTextPlacement":return applyTextPlacement(project,d.clipIds,d.placementId);
      case"appendSequence":return appendSequence(project,d.assetIds,d.trackId).project;
      case"applyCaptionTemplate":{const normId=normalizeCaptionPresetId(d.templateId);const template=DEFAULT_CAPTION_TEMPLATES.find(t=>t.id===normId||t.id===d.templateId);if(!template)throw new Error("Unknown caption template.");const next=applyCaptionTemplate(project,d.clipIds,template);return preserveCaptionAnchors(project,next,d.clipIds);}
      case"setAudioDucking":return {...project,settings:{...project.settings,audioDucking:d.enabled}};
      case"addClip":{const asset=project.assets[d.assetId];if(d.duration!==undefined&&asset&&asset.kind!=="image"&&d.duration>asset.duration+.01)throw new Error("AI clip exceeds its original media.");let next=edit.addClip(project,d.assetId,d.trackId,d.startTime,{...(d.duration===undefined?{}:{duration:d.duration,sourceEnd:d.duration}),...(d.audioRole===undefined?{}:{audioRole:d.audioRole}),...(d.volume===undefined?{}:{volume:d.volume})});const added=Object.keys(next.clips).find(id=>!project.clips[id])!;if(d.transform)next=edit.changeClipProperty(next,added,{transform:d.transform});if(d.visualTreatment){assertInsertedVisualTreatment(d.visualTreatment,next.clips[added].sourceEnd);next=setVisualTreatment(next,added,d.visualTreatment);}if(d.keyframes){const c=next.clips[added];if(d.keyframes.some(f=>f.sourceTime<c.sourceStart||f.sourceTime>c.sourceEnd))throw Error('Inserted media keyframes must fit its source interval.');next=setTransformKeyframes(next,added,d.keyframes);}return next;}
      case"duplicateClip":return edit.duplicateClip(project,d.clipId,d.startTime);
      case"changeText":return edit.changeText(project,d.clipId,d.text,d.style);
      case"mergeCaptions":return edit.mergeCaptions(project,d.clipIds);
      case"changeTrack":{if(!project.tracks[d.trackId]||project.tracks[d.trackId].locked)throw new Error("Unlock this track first.");return edit.changeTrack(project,d.trackId,{...(d.hidden===undefined?{}:{hidden:d.hidden}),...(d.muted===undefined?{}:{muted:d.muted})});}
      case"removeClip":return edit.removeClip(project,d.clipId);
      case"moveClip":return edit.moveClip(project,d.clipId,d.startTime,d.trackId);
      case"trimClip":return edit.trimClip(project,d.clipId,d.edge,d.time);
      case"splitClip":return edit.splitClip(project,d.clipId,d.time);
      case"addText":{const next=edit.addText(project,d.text,d.startTime,d.style);return applyTextPlacement(next,Object.keys(next.clips).filter(id=>!project.clips[id]),d.placementId||"title-center",{fontSize:d.style?.size,align:d.style?.align});}
      case"addCaption":{const next=addTemplatedCaption(project,d.text,d.startTime,d.duration,d.templateId,d.words);return applyTextPlacement(next,Object.keys(next.clips).filter(id=>!project.clips[id]),d.placementId||"caption-safe");}
      case"addTransition":return edit.addTransition(project,d.fromClipId,d.toClipId,d.kind,d.duration);
      case"setAspectRatio":return {...project,settings:{...project.settings,aspectRatio:d.aspectRatio}};
      case"changeClipProperty":return edit.changeClipProperty(project,d.clipId,d.changes);
      default:throw new Error("Unsupported AI editing operation.");
    }
  },p);
  if(projectDuration(result)>MAX_VIDEO_SECONDS)throw new Error("AI edits must fit within 60 seconds. Trim the timeline first.");
  return result;
}
