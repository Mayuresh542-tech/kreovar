import { VeeloxTimelineProject, TimelineItem, TimelineTrackType, ASPECT_RATIO_DIMENSIONS } from "../timeline/types";
import { VeeloxProject, VeeloxTimeline } from "../services/types";
import { PlannerInput } from "../timeline/planner";
import { Clip, EditorProject, MediaAsset, Ratio, TrackKind, createProject, defaultStyle, defaultTransform, dimensions, aspectRatios, projectDuration, uid } from "./model";
import { addAsset, addCaption, addClip, addText } from "./operations";

const trackMap: Record<TimelineTrackType, TrackKind>={video:"video",overlays:"overlay",text:"text",captions:"caption",voiceover:"audio",music:"audio",sfx:"audio"};
export function fromLegacy(t:VeeloxTimelineProject):EditorProject {
  const embedded=(t as VeeloxTimelineProject & {editorModel?:EditorProject}).editorModel;
  if(embedded?.schemaVersion===1) return embedded;
  let p=createProject(t.id,t.title);
  p.settings={...p.settings,aspectRatio:aspectRatios.includes(t.aspectRatio as Ratio)?t.aspectRatio as Ratio:"16:9",fps:t.settings?.fps||30};
  p.revision=t.revision||0;p.tracks={};p.trackOrder=[];
  for(const track of t.tracks){
    const kind=trackMap[track.type];
    p.trackOrder.push(track.id);p.tracks[track.id]={id:track.id,name:track.name,kind,hidden:!!track.hidden,muted:!!track.muted,locked:!!track.locked,clipIds:[]};
    for(const item of track.items){
      let assetId:string|undefined,contentId:string|undefined;
      if(kind==="text" || kind==="caption"){
        contentId=uid();const s=item.textStyle;
        const layer={id:contentId,text:item.source,style:{...defaultStyle,font:s?.fontFamily||"Inter",size:s?.fontSize||(kind==="caption"?56:72),weight:s?.fontWeight||700,color:s?.color||"#ffffff",align:s?.textAlign||"center",strokeWidth:s?.outlineWidth||(kind==="caption"?3:0),stroke:s?.outlineColor||"#000000",background:s?.backgroundColor||"transparent",letterSpacing:s?.letterSpacing||0,lineHeight:s?.lineHeight||1.2,shadow:s?.shadowBlur||0}};
        if(kind==="caption")p.captions[contentId]=layer;else p.textLayers[contentId]=layer;
      }else if(item.source){
        // Existing blob URLs cannot survive navigation. They are surfaced as missing media.
        assetId=Object.values(p.assets).find(a=>a.url===item.source)?.id||uid();
        p.assets[assetId]={id:assetId,name:item.metadata?.title||track.name,kind:kind==="audio"?"audio":item.type==="image"?"image":"video",mime:"",size:0,duration:Number(item.metadata?.sourceDuration)||((item.metadata?.sourceOffset||0)+item.duration*(item.speed||1)),width:item.metadata?.width||0,height:item.metadata?.height||0,url:item.source.startsWith("blob:")?undefined:item.source,thumbnail:item.metadata?.thumbnail};
      }
      if(!assetId&&!contentId)continue;
      const sourceStart=item.metadata?.sourceOffset||0;
      const c:Clip={id:item.id,assetId,contentId,trackId:track.id,name:item.metadata?.title||item.source.slice(0,40),startTime:item.startTime,duration:item.duration,sourceStart,sourceEnd:sourceStart+item.duration*(item.speed||1),transform:{...defaultTransform,x:(item.position?.x||0)/100,y:kind==="caption"?0.35:(item.position?.y||0)/100,scale:item.scale||1,rotation:item.rotation||0,opacity:item.opacity??1},volume:item.volume,speed:item.speed||1,fadeIn:item.fadeIn||0,fadeOut:item.fadeOut||0,effects:{brightness:item.colorAdjustments?.brightness||0,contrast:item.colorAdjustments?.contrast||0,saturation:item.colorAdjustments?.saturation||0,blur:0}};
      p.clips[c.id]=c;p.tracks[track.id].clipIds.push(c.id);
    }
  }
  // Old timelines sometimes omit a text/overlay/audio track.
  const defaults=createProject(t.id,t.title);
  for(const id of defaults.trackOrder)if(!Object.values(p.tracks).some(track=>track.kind===defaults.tracks[id].kind)){p.tracks[id]=defaults.tracks[id];p.trackOrder.push(id);}
  return p;
}
/** Mirror for existing project pages and server integrations; editorModel is authoritative. */
export function toLegacy(p:EditorProject):VeeloxTimelineProject & {editorModel:EditorProject} {
  const [width,height]=dimensions[p.settings.aspectRatio];
  const map:Record<TrackKind,TimelineTrackType>={video:"video",overlay:"overlays",image:"overlays",text:"text",caption:"captions",audio:"voiceover"};
  return {id:p.id,title:p.title,duration:projectDuration(p),aspectRatio:p.settings.aspectRatio,resolution:{width,height},version:2,revision:p.revision,createdAt:p.updatedAt,updatedAt:p.updatedAt,editorModel:p,settings:{audioDucking:false,duckingFactor:1,musicVolume:1,voiceVolume:1,captionPreset:"clean",captionPosition:"bottom",fps:p.settings.fps},tracks:p.trackOrder.map(id=>{
    const track=p.tracks[id];
    return {id,name:track.name,type:map[track.kind],hidden:track.hidden,muted:track.muted,locked:track.locked,items:track.clipIds.map(clipId=>{
      const c=p.clips[clipId],asset=c.assetId?p.assets[c.assetId]:undefined,layer=c.contentId?p.textLayers[c.contentId]||p.captions[c.contentId]:undefined;
      const item:TimelineItem={id:c.id,track:map[track.kind],startTime:c.startTime,endTime:c.startTime+c.duration,duration:c.duration,source:layer?.text||asset?.url||"",type:track.kind==="caption"?"caption":track.kind==="text"?"text":asset?.kind==="image"?"image":asset?.kind==="audio"?"voiceover":"raw",volume:c.volume,speed:c.speed,transition:"cut",animation:"none",position:{x:c.transform.x*100,y:c.transform.y*100},scale:c.transform.scale,rotation:c.transform.rotation,opacity:c.transform.opacity,fadeIn:c.fadeIn,fadeOut:c.fadeOut,metadata:{sourceOffset:c.sourceStart,sourceDuration:asset?.duration,title:c.name,thumbnail:asset?.thumbnail}};
      if(layer)item.textStyle={fontFamily:layer.style.font,fontSize:layer.style.size,fontWeight:layer.style.weight,color:layer.style.color,textAlign:layer.style.align,backgroundColor:layer.style.background,outlineColor:layer.style.stroke,outlineWidth:layer.style.strokeWidth,letterSpacing:layer.style.letterSpacing,lineHeight:layer.style.lineHeight};
      return item;
    })};
  })};
}
export function projectFromRecord(record:VeeloxProject):EditorProject {
  const timeline=record.timeline as unknown as VeeloxTimelineProject|undefined;
  let p=timeline?.tracks?fromLegacy(timeline):createProject(record.id,record.title);
  p.title=record.title;
  if (!timeline?.tracks && record.aspect_ratio) p.settings.aspectRatio=record.aspect_ratio;
  const studioTimeline=record.timeline as VeeloxTimeline|undefined;
  if(!timeline?.tracks && studioTimeline?.videoTracks){
    for(const track of [...studioTimeline.videoTracks,...studioTimeline.audioTracks])for(const c of track.clips){
      if(track.type==="text" && c.content){p=addText(p,c.content,c.startTime,{},false,c.duration);continue;}
      if(!c.content)continue;const id=uid(),kind=track.type==="voice"||track.type==="music"||track.type==="sfx"?"audio":"video";
      p=addAsset(p,{id,name:track.name,kind,mime:"",size:0,duration:c.duration,width:0,height:0,url:c.content});
      p=addClip(p,id,kind==="audio"?"track-audio":"track-video",c.startTime,{duration:c.duration});
    }

  }
  return mergeProjectAssets(p, record);
}

/** Merge newly attached project assets without changing the user's existing edit. */
export function mergeProjectAssets(p: EditorProject, record: VeeloxProject): EditorProject {
  // Bring project assets into the library without placing media automatically.
  const assets:MediaAsset[]=[...(record.raw_footage||[]).map(a=>({id:a.id,name:a.name,kind:"video" as const,mime:"",size:a.size||0,duration:a.duration||5,width:0,height:0,url:a.url})),...(record.broll_assets||[]).map(a=>({id:a.id,name:a.title,kind:"video" as const,mime:"",size:0,duration:a.duration||5,width:0,height:0,url:a.url,thumbnail:a.thumbnail||a.thumbnail_url})),...(record.voiceovers||[]).map(a=>({id:a.id,name:a.title||"Voiceover",kind:"audio" as const,mime:"",size:0,duration:a.duration||5,width:0,height:0,url:a.audio_url||a.url})),...(record.sfx_assets||[]).map(a=>({id:a.id,name:a.name||"Sound effect",kind:"audio" as const,mime:"",size:0,duration:a.duration||1,width:0,height:0,url:a.url})),...(record.thumbnails||[]).map(a=>({id:a.id,name:a.title||"Thumbnail",kind:"image" as const,mime:"",size:0,duration:5,width:0,height:0,url:a.image_url||a.url})),...(record.backgrounds||[]).filter(a=>a.type==="image"||a.type==="video").map(a=>({id:a.id,name:a.name,kind:a.type==="video"?"video" as const:"image" as const,mime:"",size:0,duration:5,width:0,height:0,url:a.value}))];
  for(const a of assets){const match=a.url?.match(/^\/api\/assets\/([0-9a-f-]{36})\/file$/i);if(match)a.libraryId=match[1];}
  for(const a of assets)if(!p.removedProjectAssetIds?.includes(a.id)&&!(a.libraryId&&p.removedProjectAssetIds?.includes(a.libraryId))&&a.url&&!p.assets[a.id]&&!Object.values(p.assets).some(x=>x.url===a.url))p=addAsset(p,a);
  const imported = new Set(p.importedProjectCaptionIds || []);
  let changed = false;
  for (const cap of record.captions || []) {
    const source = cap as typeof cap & { start?: number; end?: number };
    const start = Number(source.startTime ?? source.start), end = Number(source.endTime ?? source.end);
    if (!cap.text || !Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end <= start) continue;
    const key = JSON.stringify([cap.id, start, end, cap.text]);
    if (imported.has(key)) continue;
    const exists = Object.values(p.clips).some(c => c.contentId && p.captions[c.contentId]?.text === cap.text && c.startTime === start && Math.abs(c.duration - (end-start)) < 0.001);
    if (!exists) p = addCaption(p, cap.text, start, end-start);
    imported.add(key); changed = true;
  }
  if (changed) p = {...p, importedProjectCaptionIds: [...imported]};
  return p;
}
/** Import real upstream studio assets/captions; never synthesize footage or transcription. */
export function projectFromPlanner(input:PlannerInput,title:string):EditorProject {
  let p=createProject(input.projectId,title);p.settings.aspectRatio=input.aspectRatio&&input.aspectRatio in ASPECT_RATIO_DIMENSIONS&&input.aspectRatio!=="custom"?input.aspectRatio:"16:9";
  const videos=input.rawVideoUrl?[{id:uid(),videoUrl:input.rawVideoUrl,title:"Raw footage",duration:input.voiceover?.duration||30}]:input.brollClips||[];
  let time=0;for(const v of videos){const id=uid();p=addAsset(p,{id,name:v.title||"Footage",kind:"video",mime:"",size:0,duration:v.duration||5,width:0,height:0,url:v.videoUrl});p=addClip(p,id,"track-video",time);time+=v.duration||5;}
  if(input.voiceover?.audioUrl){const id=uid();p=addAsset(p,{id,name:"Kreovar voiceover",kind:"audio",mime:"",size:0,duration:input.voiceover.duration||time||30,width:0,height:0,url:input.voiceover.audioUrl});p=addClip(p,id,"track-audio",0);}
  for(const cap of input.captions?.segments||[])p=addCaption(p,cap.text,cap.start,cap.end-cap.start);
  return p;
}
