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
