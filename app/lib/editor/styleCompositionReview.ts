import {applyEditDecisionList,type EditDecisionList} from './ai';
import {analysisFootage} from './footageContext';
import {studioSegment,resolvedStudioStyle} from './editorCaptionStudio';
import {resolveCaptionStyle} from '../captions/studioCanvas';
import type {EditorProject} from './model';
/** Rejects an under-specified reference edit. It never authors replacement decisions or timings. */
export function reviewPrismComposition(project:EditorProject,list:EditDecisionList,selection:string[],templateId:string){
 const scope=analysisFootage(project,selection),captions=Object.values(project.clips).filter(c=>c.contentId&&project.captions[c.contentId]&&!project.tracks[c.trackId].hidden&&!project.tracks[c.trackId].locked&&scope.some(v=>c.startTime>=v.startTime-.01&&c.startTime+c.duration<=v.startTime+v.duration+.01));
 if(!captions.length)return;
 if(templateId!=='edit-prism')throw Error('An explicit Prism Pro edit must choose edit-prism, not a different caption style.');
 const composed=new Set(list.decisions.flatMap(d=>d.op==='composeCaption'?[d.clipId]:[]));
 if(captions.some(c=>!composed.has(c.id)))throw Error('Prism Pro needs a per-phrase composeCaption for every scoped caption, not a preset and zoom alone.');
 const next=applyEditDecisionList(project,list),regions=new Set<number>();let hierarchy=false;
 for(const original of captions){const c=next.clips[original.id],layer=next.captions[c.contentId!],segment=studioSegment(next,c),style=resolveCaptionStyle(segment,resolvedStudioStyle(layer));regions.add(Math.round(style.positionYPercent??(style.position==='top'?18:style.position==='center'?50:80)));if(segment.emphasizedWords?.length&&style.fontWeight<=500&&(style.studio?.emphasisWeight||0)>=700&&style.studio?.emphasisItalic)hierarchy=true;}
 if(!hierarchy)throw Error('Prism Pro needs actual selected-word heavy italic hierarchy over lighter phrase text, not plain boxed labels.');
 if(captions.length>=3&&regions.size<2)throw Error('Prism Pro needs content-led caption region changes across shots, not one fixed lower subtitle position.');
}

interface ReferenceToolPresentation {type?:string;visualTreatment?:import('./visualTreatment').VisualTreatment;transform?:{scale:number}}
/** Capability and composition floor, not an automatic editor or replacement schedule. */
export function reviewReferenceComposition(project:EditorProject,list:EditDecisionList,selection:string[],referenceId:string,templateId:string,tools:ReferenceToolPresentation[]=[],enabled:{graphics:boolean;media:boolean}={graphics:true,media:true}){
 const templates:Record<string,string>={'prism-pro':'edit-prism',prime:'edit-prime',vista:'edit-vista','impact-ii':'edit-impact','paper-ii':'edit-paper',sketch:'edit-sketch'};
 if(!templates[referenceId])return;
 if(templateId!==templates[referenceId])throw Error('Use the matching caption template for the explicitly selected reference.');
 if(referenceId==='prism-pro'){reviewPrismComposition(project,list,selection,templateId);return;}
 const scope=analysisFootage(project,selection),inside=(c:EditorProject['clips'][string])=>scope.some(v=>c.startTime<v.startTime+v.duration&&c.startTime+c.duration>v.startTime);
 const next=applyEditDecisionList(project,list),clips=Object.values(next.clips).filter(c=>inside(c)&&!next.tracks[c.trackId].hidden&&!next.tracks[c.trackId].locked);
 const captionClips=clips.filter(c=>c.contentId&&next.captions[c.contentId]);
 const treatments=[...clips.flatMap(c=>c.visualTreatment?[{visualTreatment:c.visualTreatment,transform:c.transform}]:[]),...tools];
 const hasMask=(kinds:string[],small=false)=>treatments.some(p=>{const m=p.visualTreatment?.mask;return m&&kinds.includes(m.kind)&&(!small||(p.visualTreatment?.card?.width??1)<=.5||(p.transform?.scale??1)<=.5);});
 const animatedMask=(kinds:string[])=>treatments.some(p=>{const m=p.visualTreatment?.mask;return m&&kinds.includes(m.kind)&&(m.keyframes?.length??0)>=2&&m.keyframes!.some(f=>f.progress!==m.keyframes![0].progress);});
 const hasStroke=clips.some(c=>c.shape?.strokePath&&(c.shape.strokePath.revealDuration??.6)>0&&(c.shape.strokeWidth??0)>0);
 if(enabled.graphics&&(referenceId==='prime'||referenceId==='sketch')&&!hasStroke)throw Error('This reference needs an original drawn stroke accent, not a caption preset and zoom alone.');
 if(referenceId==='sketch'&&enabled.media&&!hasMask(['circle'],true))throw Error('Sketch needs an actual small circular media inset on owned footage, not a rectangle labelled circular.');
 if(referenceId==='vista'&&enabled.media&&!animatedMask(['polygon','stepped']))throw Error('Vista needs an animated polygon or stepped media reveal, not a rectangle transform.');
 if(referenceId==='paper-ii'){
  for(const c of captionClips){const layer=next.captions[c.contentId!],style=resolveCaptionStyle(studioSegment(next,c),resolvedStudioStyle(layer));if(style.highlightingMode!=='cumulative')throw Error('Paper captions need cumulative darkening of spoken words while future words stay gray.');}
  if(enabled.media&&!animatedMask(['torn-paper']))throw Error('Paper needs an animated original torn-paper media reveal when media inserts are enabled.');
 }
 if(referenceId==='impact-ii'&&enabled.graphics&&!treatments.some(p=>p.visualTreatment?.effects?.some(e=>e.rgbOffset&&(e.rgbOffset.x!==0||e.rgbOffset.y!==0)&&e.sourceEnd-e.sourceStart<=1)))throw Error('Impact needs a brief bounded RGB accent, not unsupported chromatic prose or a full-video colour shift.');
}
