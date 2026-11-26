import {composeCaption,type CaptionComposition} from './captionComposition';
import {setVisualTreatment,assertInsertedVisualTreatment,type VisualTreatment} from './visualTreatment';
import {preserveCaptionAnchors} from './captionAnchors';
import {addShape,type ShapeKind,type ShapeStyle} from "./shapes";
import {addZoom,clearZooms} from "./zoom";
import {setTransformKeyframes,type TransformKeyframe,type MotionPreset,applyMotionPreset} from './keyframes';
import {addMotionGraphic,changeMotionGraphic,addAnimatedOverlay,type GraphicKind,type GraphicTheme,type GraphicIcon,type GraphicBar,type GraphicComparison,type CustomGraphicSpec} from './motionGraphics';
import {rippleCut,type CutRange} from "./rippleCut";
import {applyTextPlacement,type TextPlacementId} from "./textPlacement";
import {MAX_VIDEO_SECONDS} from "./limits";
import {projectDuration} from "./model";
import { Clip, EditorProject, TransitionKind, TransitionEasing, TransitionDirection, TextStyle, Ratio, normalizeCaptionPresetId } from "./model";
import * as edit from "./operations";
import {appendSequence} from "./sequence";
import {applyCaptionTemplate,addTemplatedCaption} from "./captionTemplates";
import {reframeProject,type ReframeMode} from "./reframing";
import {ALL_CAPTION_TEMPLATES as DEFAULT_CAPTION_TEMPLATES} from "../captions/referenceTemplates";
/** Provider-neutral EDL boundary. No provider credentials, model calls, or fabricated decisions. */
export type EditDecision =
  | {op:'composeCaption';clipId:string;presentation:CaptionComposition}
  | {op:'setVisualTreatment';clipId:string;treatment:VisualTreatment}
  | {op:'addShape';kind:ShapeKind;startTime:number;duration:number;style?:Partial<ShapeStyle>;transform?:Partial<Clip["transform"]>;motion?:MotionPreset}
  | {op:'keyframes';clipId:string;frames:TransformKeyframe[]}
  | {op:'animate';clipId:string;preset:MotionPreset}
  | {op:'addGraphic';kind:GraphicKind;text:string;startTime:number;duration:number;accent?:string;motion?:MotionPreset;theme?:GraphicTheme;subtitle?:string;icon?:GraphicIcon;value?:number;prefix?:string;suffix?:string;items?:string[];bars?:GraphicBar[];comparison?:GraphicComparison;targetX?:number;targetY?:number;customSpec?:CustomGraphicSpec;x?:number;y?:number;scale?:number}
  | {op:'changeGraphic';clipId:string;kind?:GraphicKind;text?:string;startTime?:number;duration?:number;accent?:string;motion?:MotionPreset;theme?:GraphicTheme;subtitle?:string;icon?:GraphicIcon;value?:number;prefix?:string;suffix?:string;items?:string[];bars?:GraphicBar[];comparison?:GraphicComparison;targetX?:number;targetY?:number;customSpec?:CustomGraphicSpec;x?:number;y?:number;scale?:number}
  | {op:'removeGraphic';clipId:string}
  | {op:'addOverlay';assetId:string;trackId:string;startTime:number;duration:number;motion?:MotionPreset}
  | {op:"addZoom";clipId:string;startTime:number;endTime:number;fromScale:number;toScale:number;returnToStart?:boolean;easing?:"linear"|"smooth";focusX?:number;focusY?:number;style?:import('./zoom').ZoomStyle}
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
  | {op:"addTransition";fromClipId:string;toClipId:string;kind:TransitionKind;duration:number;intensity?:number;easing?:TransitionEasing;direction?:TransitionDirection}
  | {op:"duplicateClip";clipId:string;startTime?:number}
  | {op:"changeText";clipId:string;text:string;style?:Partial<TextStyle>}
  | {op:"mergeCaptions";clipIds:string[]}
  | {op:"changeTrack";trackId:string;hidden?:boolean;muted?:boolean}
  | {op:"setAspectRatio";aspectRatio:Ratio}
  | {op:"reframeProject";mode:ReframeMode;focusX?:number;focusY?:number;blurAmount?:number;backgroundScale?:number;topRatio?:number}
  | {op:"applySpeedCurve";clipId:string;presetId:"hero"|"bullet"|"montage"|"jump_cut"|"flash_in"|"flash_out"|"standard";preservePitch?:boolean}
  | {op:"changeClipProperty";clipId:string;changes:Partial<Pick<Clip,"transform"|"volume"|"speed"|"preservePitch"|"fadeIn"|"fadeOut"|"effects"|"audioRole"|"ducking"|"surface"|"mediaAnimation"|"kenBurns"|"speedCurveId">>};
export interface EditDecisionList {version:1;projectId:string;baseRevision:number;decisions:EditDecision[];transcriptionId?:string}
/** Validate against a revision and apply atomically in one EditorStore.execute transaction. */
export function applyEditDecisionList(p:EditorProject,list:EditDecisionList):EditorProject {
  if(list.version!==1||list.projectId!==p.id||list.baseRevision!==p.revision)throw new Error("This edit plan targets a different project revision.");
  if(list.decisions.length>400)throw new Error("Edit plan exceeds the operation limit.");
  const result=list.decisions.reduce((project,d)=>{
    switch(d.op){
      case 'composeCaption':return composeCaption(project,d.clipId,d.presentation);
      case 'setVisualTreatment':return setVisualTreatment(project,d.clipId,d.treatment);
      case'keyframes':return setTransformKeyframes(project,d.clipId,d.frames);
      case'animate':return applyMotionPreset(project,d.clipId,d.preset);
      case'addShape':{const next=addShape(project,d.kind,d.startTime,d.duration,d.style,d.transform);if(!d.motion)return next;const id=Object.keys(next.clips).find(id=>!project.clips[id])!;return applyMotionPreset(next,id,d.motion);}
      case'addGraphic':return addMotionGraphic(project,d.kind,d.text,d.startTime,d.duration,d.accent,d.motion,{theme:d.theme,subtitle:d.subtitle,icon:d.icon,value:d.value,prefix:d.prefix,suffix:d.suffix,items:d.items,bars:d.bars,comparison:d.comparison,targetX:d.targetX,targetY:d.targetY,customSpec:d.customSpec,x:d.x,y:d.y,scale:d.scale,allowNewTrack:true});
      case'changeGraphic':{
        let next=changeMotionGraphic(project,d.clipId,{
          ...(d.text===undefined?{}:{text:d.text}),
          ...(d.kind===undefined?{}:{kind:d.kind}),
          ...(d.accent===undefined?{}:{accent:d.accent}),
          ...(d.theme===undefined?{}:{theme:d.theme}),
          ...(d.subtitle===undefined?{}:{subtitle:d.subtitle}),
          ...(d.icon===undefined?{}:{icon:d.icon}),
          ...(d.value===undefined?{}:{value:d.value}),
          ...(d.prefix===undefined?{}:{prefix:d.prefix}),
          ...(d.suffix===undefined?{}:{suffix:d.suffix}),
          ...(d.items===undefined?{}:{items:d.items}),
          ...(d.bars===undefined?{}:{bars:d.bars}),
          ...(d.comparison===undefined?{}:{comparison:d.comparison}),
          ...(d.targetX===undefined?{}:{targetX:d.targetX}),
          ...(d.targetY===undefined?{}:{targetY:d.targetY}),
          ...(d.customSpec===undefined?{}:{customSpec:d.customSpec}),
        });
        if(d.startTime!==undefined)next=edit.moveClip(next,d.clipId,d.startTime);
        if(d.duration!==undefined)next=edit.trimClip(next,d.clipId,'right',next.clips[d.clipId].startTime+d.duration);
        if(d.x!==undefined||d.y!==undefined||d.scale!==undefined){
          const clip=next.clips[d.clipId];
          next=edit.changeClipProperty(next,d.clipId,{transform:{...clip.transform,...(d.x===undefined?{}:{x:d.x}),...(d.y===undefined?{}:{y:d.y}),...(d.scale===undefined?{}:{scale:d.scale})}});
        }
        if(d.motion!==undefined)next=applyMotionPreset(next,d.clipId,d.motion);
        return next;
      }
      case'removeGraphic':{
        const clip=project.clips[d.clipId];
        if(!clip?.graphic||project.tracks[clip.trackId]?.locked)throw new Error("Select an unlocked motion graphic.");
        return edit.removeClip(project,d.clipId);
      }
      case'addOverlay':return addAnimatedOverlay(project,d.assetId,d.trackId,d.startTime,d.duration,d.motion);
      case"addZoom":return addZoom(project,d.clipId,d.startTime,d.endTime,d.fromScale,d.toScale,d.returnToStart,d.easing,d.focusX,d.focusY,d.style);
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
      case"addTransition":return edit.addTransition(project,d.fromClipId,d.toClipId,d.kind,d.duration,{...(d.intensity!==undefined?{intensity:d.intensity}:{}),...(d.easing!==undefined?{easing:d.easing}:{}),...(d.direction!==undefined?{direction:d.direction}:{})});
      case"setAspectRatio":return {...project,settings:{...project.settings,aspectRatio:d.aspectRatio}};
      case"reframeProject":return reframeProject(project,d.mode,{focusX:d.focusX,focusY:d.focusY,blurAmount:d.blurAmount,backgroundScale:d.backgroundScale,topRatio:d.topRatio});
      case"applySpeedCurve":{
        const clip=project.clips[d.clipId];
        if(!clip)throw new Error("Target clip not found.");
        const track=project.tracks[clip.trackId];
        if(!track||track.locked)throw new Error("Track is locked.");
        return edit.changeClipProperty(project,d.clipId,{
          speedCurveId:d.presetId,
          preservePitch:d.preservePitch??true
        });
      }
      case"changeClipProperty":return edit.changeClipProperty(project,d.clipId,d.changes);
      default:throw new Error("Unsupported AI editing operation.");
    }
  },p);
  if(projectDuration(result)>MAX_VIDEO_SECONDS)throw new Error(`AI edits must fit within ${MAX_VIDEO_SECONDS} seconds (5 minutes). Trim the timeline first.`);
  return result;
}
