import {dimensions,type EditorProject,type Clip,type Transform} from './model';
import {resolveCaptionStyle} from '../captions/studioCanvas';

/** Legacy text is drawn around the canvas center; rich captions own an absolute layout anchor. */
export function captionLayoutAnchor(project:EditorProject,clip:Clip){
 const caption=clip.contentId?project.captions[clip.contentId]:undefined;
 if(!caption?.studioStyle)return {x:.5,y:.5};
 const style=resolveCaptionStyle({id:clip.id,text:caption.text,start:clip.startTime,end:clip.startTime+clip.duration,words:[],...caption.studioData},caption.studioStyle);
 const percent=style.position==='top'?18:style.position==='center'?50:style.position==='bottom'?80:style.positionYPercent??80;
 return {x:Math.max(5,Math.min(95,style.studio?.positionXPercent??50))/100,y:percent/100};
}

/** The physical caption anchor after the compositor's rotation and scale, in frame fractions. */
export function captionVisualAnchor(project:EditorProject,clip:Clip,transform:Transform=clip.transform){
 const anchor=captionLayoutAnchor(project,clip),[width,height]=dimensions[project.settings.aspectRatio],r=transform.rotation*Math.PI/180;
 const dx=(anchor.x-.5)*width,dy=(anchor.y-.5)*height;
 return {x:.5+transform.x+transform.scale*(dx*Math.cos(r)-dy*Math.sin(r))/width,y:.5+transform.y+transform.scale*(dx*Math.sin(r)+dy*Math.cos(r))/height};
}

/** Placement presets describe a desired on-screen position, not an extra offset from a rich layout. */
export function transformForCaptionAnchor(project:EditorProject,clip:Clip,anchor:{x:number;y:number},transform:Transform=clip.transform):Transform{
 const origin=captionVisualAnchor(project,clip,{...transform,x:0,y:0});
 return {...transform,x:anchor.x-origin.x,y:anchor.y-origin.y};
}

/** Preserve physical manual placement/motion when switching coordinate representations. */
export function preserveCaptionAnchors(before:EditorProject,after:EditorProject,ids:string[]):EditorProject{
 const clips={...after.clips};
 for(const id of ids){const original=before.clips[id],next=clips[id];if(!original||!next)continue;
  const remap=(transform:Transform)=>transformForCaptionAnchor(after,next,captionVisualAnchor(before,original,transform),transform);
  const oldAnchor=captionLayoutAnchor(before,original),newAnchor=captionLayoutAnchor(after,next);
  if(oldAnchor.x===newAnchor.x&&oldAnchor.y===newAnchor.y){clips[id]={...next,transform:original.transform,...(original.keyframes?{keyframes:original.keyframes}:{})};continue;}
  clips[id]={...next,transform:remap(original.transform),...(original.keyframes?{keyframes:original.keyframes.map(frame=>({...frame,value:remap(frame.value)}))}:{})};
 }
 return {...after,clips};
}
