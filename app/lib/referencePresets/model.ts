import type {EditorProject,CaptionMotion,TextStyle,Ratio} from '../editor/model';
import type {EditDecision} from '../editor/ai';
import type {AiToolRequest} from '../editor/aiTools';
export const CATEGORIES=['Talking Head','Podcasts','Real Estate','Educational','Vlogs'] as const;
export type Category=typeof CATEGORIES[number];
export interface StyleSpec {
 schemaVersion:1;summary:string;confidence:'low'|'medium'|'high';limitations:string[];
 caption:{enabled:boolean;font:string;sizeRatio:number;weight:number;color:string;highlightColor:string;background:string;stroke:string;strokeWidth:number;y:number;maxWidth:number;wordsPerCaption:number;motion:CaptionMotion};
 pacing:{enabled:boolean;minimumPause:number;padding:number;maxRemovalRatio:number;description:string};
 graphics:{enabled:boolean;kinds:('label'|'lower-third'|'stat'|'callout')[];accent:string;motion:'pop'|'slide-up'|'slide-left'|'float';maximumPerMinute:number;description:string};
 broll:{enabled:boolean;fit:'cover'|'contain';minimumDuration:number;maximumDuration:number;maxCoverage:number;description:string};
 zooms:{enabled:boolean;maximumScale:number;minimumInterval:number;description:string};
 transitions:{enabled:boolean;kind:'fade'|'dissolve'|'slide'|'zoom';duration:number};
 sound:{enabled:boolean;soundIds:string[];gain:number;description:string};
}
export interface ReferencePreset {
 id:string;ownerId:string;name:string;category:Category;description:string;referenceAssetId:string;thumbnailAssetId?:string;
 provenance:'original'|'private-reference';sourcePage?:string;visibility:'private';
 status:'pending'|'analyzing'|'ready'|'failed';version:number;referenceHash?:string;spec?:StyleSpec;history:{version:number;hash:string;spec:StyleSpec;analyzedAt:string}[];
 referenceInfo?:{duration:number;width:number;height:number;aspectRatio:Ratio};
 error?:string;analysisLease?:string;analysisLeaseUntil?:number;updatedAt:string;
}
export interface Word {word:string;start:number;end:number}
export interface MediaAnalysis {version:1;hash:string;duration:number;width:number;height:number;aspectRatio:Ratio;fps:number;hasAudio:boolean;sceneBoundaries:number[];silences:{start:number;end:number}[];words:Word[];transcriptionAssetId?:string;sampleTimes:number[];observations:string[]}
export const REFERENCE_STAGES=['analyzeFootage','matchReference','applyPacing','applyCaptions','applyCaptionAnimations','applyMotionGraphics','findBroll','applyBroll','applyZoomsTransitions','applySoundEffects','validateTimeline','render'] as const;
export type ReferenceStage=typeof REFERENCE_STAGES[number];
export const LABELS:Record<ReferenceStage,string>={analyzeFootage:'Analyzing your footage',matchReference:'Matching reference editing style',applyPacing:'Applying cuts and pacing',applyCaptions:'Applying captions',applyCaptionAnimations:'Matching caption animations',applyMotionGraphics:'Creating motion graphics',findBroll:'Finding relevant B-roll',applyBroll:'Inserting B-roll',applyZoomsTransitions:'Applying zooms and transitions',applySoundEffects:'Applying sound effects',validateTimeline:'Validating the timeline',render:'Rendering and verifying your edited video'};
export interface ReferenceOutput {summary:string;brollCandidates?:{assetId:string;startTime:number;duration:number;relevanceScore:number;reason:string}[];decisions?:EditDecision[];requests?:AiToolRequest[];media?:EditorProject['assets'];assetIds?:string[];analysis?:MediaAnalysis;direction?:{summary:string;priorities:string[];limitations:string[]};evidence?:{clipIds:string[];duration:number;revision:number};render?:{assetId:string;duration:number;width:number;height:number;sha256:string};}
export interface ReferenceJob {
 id:string;ownerId:string;presetId:string;presetVersion:number;spec:StyleSpec;referenceAssetId:string;rawAssetId:string;projectId:string;
 status:'ready'|'running'|'failed'|'cancelled'|'awaiting_render'|'completed';cursor:number;stages:{id:ReferenceStage;status:'pending'|'running'|'completed'|'failed'|'cancelled';attempts:number;output?:ReferenceOutput;error?:string}[];
 original:EditorProject;project:EditorProject;analysis?:MediaAnalysis;direction?:ReferenceOutput['direction'];appliedKeys:string[];createdAt:string;updatedAt:string;
 frameSamples?:{time:number;data:string}[];
 lease?:string;leaseUntil?:number;error?:string;tokenLimit:number;renderProgress?:number;outputAssetId?:string;
}
export interface Budget {limit:number;used:number;reserved:number;estimatedCost:number|null;pricingSource:string|null;requests:Record<string,{reserved:number;actual:number|null;input:number|null;output:number|null;createdAt:string}>}
export function stagesForReference(s:StyleSpec):ReferenceStage[]{return ['analyzeFootage','matchReference',...(s.pacing.enabled?['applyPacing' as const]:[]),...(s.caption.enabled?['applyCaptions' as const,'applyCaptionAnimations' as const]:[]),...(s.graphics.enabled?['applyMotionGraphics' as const]:[]),...(s.broll.enabled?['findBroll' as const,'applyBroll' as const]:[]),...(s.zooms.enabled||s.transitions.enabled?['applyZoomsTransitions' as const]:[]),...(s.sound.enabled?['applySoundEffects' as const]:[]),'validateTimeline','render'];}
export function captionStyle(spec:StyleSpec,minimumDimension:number):Partial<TextStyle>{const c=spec.caption;return {font:c.font,size:Math.round(c.sizeRatio*minimumDimension),weight:c.weight,color:c.color,background:c.background,stroke:c.stroke,strokeWidth:c.strokeWidth,align:'center',maxWidth:c.maxWidth,maxWordsPerLine:c.wordsPerCaption};}
export const ANALYZER_VERSION='ffmpeg-reference-v1';
