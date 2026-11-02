import {transformForCaptionAnchor} from './captionAnchors';
import {estimatedTextBox,textBounds} from "./textLayout";
import {dimensions,type EditorProject} from "./model";
import {changeText,changeClipProperty} from "./operations";
export const TEXT_PLACEMENTS=[
 {id:"title-center",name:"Centered title",usage:"Short title or opening statement",y:0,align:"center",size:.065},
 {id:"hook-top",name:"Top hook",usage:"Opening hook above the speaker",y:-.28,align:"center",size:.055},
 {id:"lower-third",name:"Lower third",usage:"Name, role or short supporting label; left aligned within the text box",y:.23,align:"left",size:.042},
 {id:"caption-safe",name:"Safe lower captions",usage:"Default readable speech captions, above bottom app controls",y:.26,align:"center",size:.045},
 {id:"caption-center",name:"Center captions",usage:"Centered speech emphasis only when requested",y:.08,align:"center",size:.05},
 {id:"label-top",name:"Small top label",usage:"Section label or category",y:-.34,align:"center",size:.035}
] as const;
export type TextPlacementId=typeof TEXT_PLACEMENTS[number]["id"];
export function textPlacementId(value:unknown):TextPlacementId{
 if(typeof value!=="string"||!TEXT_PLACEMENTS.some(p=>p.id===value))throw new Error("Unknown text placement preset.");return value as TextPlacementId;
}

export function applyTextPlacement(project:EditorProject,ids:string[],presetId:TextPlacementId,options:{fontSize?:number;align?:"left"|"center"|"right"}={}):EditorProject{
 const preset=TEXT_PLACEMENTS.find(p=>p.id===presetId);if(!preset||!ids.length)throw new Error("Select text or caption clips and a valid placement.");
 const [w,h]=dimensions[project.settings.aspectRatio],gap=Math.min(w,h)*.018;
 return [...new Set(ids)].reduce((p,id)=>{
  const c=p.clips[id],layer=c?.contentId?(p.textLayers[c.contentId]||p.captions[c.contentId]):undefined;
  if(!layer)throw new Error("Placement presets apply only to text or captions.");
  const base=options.fontSize??Math.min(w,h)*preset.size,min=Math.min(base,Math.min(w,h)*.022);
  let size=base,style={...layer.style,align:options.align??preset.align,size,maxWidth:.78},box=estimatedTextBox({...layer,style},w);
  if(options.fontSize!==undefined&&box.height>h*.28)throw Error("The requested font size does not fit readable safe placement. Use shorter text or a smaller size.");
  while(box.height>h*.28&&size>min){size=Math.max(min,size*.94);style={...style,size};box=estimatedTextBox({...layer,style},w);}
  if(box.height>h*.28)throw Error("This text is too long for readable safe placement. Split it into shorter captions or titles.");
  const x=preset.id==="lower-third"?-.03:0,lo=.08+box.height/h/2-.5,hi=.86-box.height/h/2-.5;
  const clampY=(y:number)=>Math.max(lo,Math.min(hi,y));
  const obstacles=Object.values(p.clips).filter(other=>other.id!==id&&!p.tracks[other.trackId].hidden&&other.startTime<c.startTime+c.duration-1e-6&&other.startTime+other.duration>c.startTime+1e-6).flatMap(other=>{
   const content=other.contentId?(p.textLayers[other.contentId]||p.captions[other.contentId]):undefined;return content?[textBounds(p,other,content)]:[];
  });
  const candidates=[preset.y,...Array.from({length:10},(_,i)=>preset.y+(i%2?-1:1)*Math.ceil((i+1)/2)*.08),...TEXT_PLACEMENTS.map(p=>p.y)].map(clampY);
  const y=candidates.find(y=>{
   const top=h*(.5+y)-box.height/2,bottom=top+box.height,left=w*(.5+x)-box.width/2,right=left+box.width;
   return obstacles.every(b=>right+gap<=b.left||left-gap>=b.right||bottom+gap<=b.top||top-gap>=b.bottom);
  });
  if(y===undefined)throw Error("No clear text space is available at this time. Move another overlay or split the text before applying placement.");
  const next=changeText(p,id,layer.text,{align:options.align??preset.align,size,maxWidth:.78});return changeClipProperty(next,id,{transform:p.captions[c.contentId!]?.studioStyle?transformForCaptionAnchor(next,next.clips[id],{x:.5+x,y:.5+y},{...c.transform,x:0,y:0,scale:1,rotation:0}):{...c.transform,x,y,scale:1,rotation:0}});
 },project);
}
