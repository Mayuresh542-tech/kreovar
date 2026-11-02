import {defaultTransform,type EditorProject,type TextStyle} from './model';
import type {CaptionStyleConfig} from '../captions/templates';
/** Compact prompt projection only; validation and application use the full original document. */
export function planningMetadata(p:EditorProject){
 const styles:Record<string,TextStyle>={},styleIds=new Map<string,string>(),captionDesigns:Record<string,CaptionStyleConfig>={},designIds=new Map<string,string>();
 const layers=(items:EditorProject['textLayers'])=>Object.fromEntries(Object.entries(items).map(([id,layer])=>{const key=JSON.stringify(layer.style);let styleId=styleIds.get(key);if(!styleId){styleId='style-'+styleIds.size;styleIds.set(key,styleId);styles[styleId]=layer.style;}return[id,{text:layer.text,styleId}];}));
 const textLayers=layers(p.textLayers),captions=layers(p.captions);for(const [id,c]of Object.entries(p.captions))if(c.studioStyle){const key=JSON.stringify(c.studioStyle);let designId=designIds.get(key);if(!designId){designId="design-"+designIds.size;designIds.set(key,designId);captionDesigns[designId]=c.studioStyle;}Object.assign(captions[id],{studioStyleId:designId,...(c.studioData?{studioData:c.studioData}:{})});}
 return {id:p.id,revision:p.revision,settings:p.settings,trackOrder:p.trackOrder,
  defaults:{transform:defaultTransform,effects:{brightness:0,contrast:0,saturation:0,blur:0},fadeIn:0,fadeOut:0},styles,captionDesigns,textLayers,captions,
  assets:Object.fromEntries(Object.entries(p.assets).map(([id,a])=>[id,{name:a.name,kind:a.kind,duration:a.duration,width:a.width,height:a.height}])),
  tracks:Object.fromEntries(Object.entries(p.tracks).map(([id,t])=>[id,{name:t.name,kind:t.kind,hidden:t.hidden,muted:t.muted,locked:t.locked}])),
  clips:Object.fromEntries(Object.entries(p.clips).map(([id,c])=>[id,{...(c.assetId?{assetId:c.assetId}:{}),...(c.contentId?{contentId:c.contentId}:{}),trackId:c.trackId,startTime:c.startTime,duration:c.duration,sourceStart:c.sourceStart,sourceEnd:c.sourceEnd,speed:c.speed,volume:c.volume,...(c.mediaAnimation?{mediaAnimation:c.mediaAnimation}:{}),...(c.visualTreatment?{visualTreatment:c.visualTreatment}:{}),...(c.keyframes?.length?{keyframes:c.keyframes}:{}),...(c.graphic?{graphic:c.graphic}:{}),...(c.shape?{shape:c.shape}:{}),...(c.surface?{surface:c.surface}:{}),...(c.zooms?.length?{zooms:c.zooms}:{}),...(c.audioRole?{audioRole:c.audioRole}:{}),...(c.ducking===undefined?{}:{ducking:c.ducking}),...(JSON.stringify(c.transform)===JSON.stringify(defaultTransform)?{}:{transform:c.transform}),...(Object.values(c.effects).some(v=>v!==0)?{effects:c.effects}:{}),...(c.fadeIn?{fadeIn:c.fadeIn}:{}),...(c.fadeOut?{fadeOut:c.fadeOut}:{})}])),
  transitions:p.transitions};
}
