import {mediaAnimationFrame} from './mediaAnimation';
import {visualTreatmentAt,drawVisualMedia} from './visualTreatment';
import {studioSegment,loadEditorStudioFonts,studioCaptionBounds} from './editorCaptionStudio';
import {drawCaptions} from '../captions/canvasCaptions';
import {wordHighlight,distinctHighlight} from "../captions/highlighting";
import {captionFontFamily,textDirection} from "../captions/languages";
import {mixedTextLines,loadCaptionFonts} from "../captions/typography";
import {textFill} from "./textGradient";
import {styledText,wrapText} from "./textLayout";
import {zoomTransform} from "./zoom";
import {keyframeTransform} from './keyframes';
import {drawShape,shapeDimensions} from "./shapes";
import {drawStyleSurface} from "./styleSurface";
import {drawGraphicPanel} from './motionGraphics';
import { Clip, EditorProject, TextLayer, Track, clamp, dimensions, textForClip } from "./model";
import { MediaRepository, waitMedia } from "./media";

import {captionMotionFrame} from "./captionMotion";
import {clipGain,speechWindows} from "./audioMix";

interface Entry { assetKey:string; element:HTMLMediaElement|HTMLImageElement; ready:boolean; error?:Error; source?:MediaElementAudioSourceNode; gain?:GainNode; playPending?:boolean; playError?:Error }
export interface VisualBounds { id:string; x:number; y:number; width:number; height:number; rotation:number }
interface Layer { clip:Clip; track:Track; opacity:number; x:number; scale:number; hold?:boolean }
const priority={video:0,overlay:1,image:2,text:3,caption:4,audio:5};
export function visibleLayers(p:EditorProject,time:number):Layer[]{
  const layers:Layer[]=[];
  const tracks=p.trackOrder.map(id=>p.tracks[id]).filter(t=>!t.hidden&&t.kind!=="audio").sort((a,b)=>priority[a.kind]-priority[b.kind]);
  for(const track of tracks){
    for(const id of track.clipIds){const c=p.clips[id];if(time<c.startTime || time>=c.startTime+c.duration)continue;
      const transition=Object.values(p.transitions).find(t=>t.toClipId===id&&time<c.startTime+t.duration);
      const layer:Layer={clip:c,track,opacity:1,x:0,scale:1};
      if(transition){const progress=clamp((time-c.startTime)/transition.duration,0,1),out=p.clips[transition.fromClipId];
        if(out){const outgoing:Layer={clip:out,track,opacity:1,x:0,scale:1,hold:true};
          if(transition.kind==="fade"){outgoing.opacity=Math.max(0,1-progress*2);layer.opacity=Math.max(0,progress*2-1);}
          if(transition.kind==="dissolve"){layer.opacity=progress;}
          if(transition.kind==="slide"){outgoing.x=-progress;layer.x=1-progress;}
          if(transition.kind==="zoom"){outgoing.opacity=1-progress;outgoing.scale=1+progress*0.25;layer.opacity=progress;layer.scale=0.8+progress*0.2;}
          layers.push(outgoing);
        }
      }layers.push(layer);
    }
  }return layers.sort((a,b)=>(a.clip.shape?2.5:priority[a.track.kind])-(b.clip.shape?2.5:priority[b.track.kind]));
}
function layoutText(ctx:CanvasRenderingContext2D,layer:TextLayer,width:number,totalWords?:number){
  const s=layer.style;ctx.font=`${s.weight} ${s.size}px ${captionFontFamily(s.font,layer.text)}`;
  if("letterSpacing" in ctx)ctx.letterSpacing=`${s.letterSpacing}px`;
  const maxWidth=width*(s.maxWidth??.86);
  if(s.fontAccent||s.maxWordsPerLine||(layer as import("./model").Caption).highlightMode){const mixed=mixedTextLines(ctx,styledText(layer),s.size,s.font,s.weight,s.fontAccent,Math.max(1,maxWidth-32),s.maxWordsPerLine,totalWords);const inkWidth=Math.max(1,...mixed.rows.map(row=>row.reduce((n,r)=>n+r.width,0)+Math.max(0,row.length-1)*mixed.gap));return {mixed,lines:mixed.rows.map(row=>row.map(r=>r.text).join(' ')),inkWidth,width:s.maxWidth?maxWidth:Math.max(40,inkWidth)+32,height:mixed.rows.length*s.size*s.lineHeight+24};}
  const lines=wrapText(styledText(layer),Math.max(1,maxWidth-32),text=>ctx.measureText(text).width);
  return {lines,inkWidth:Math.max(1,...lines.map(line=>ctx.measureText(line).width)),width:s.maxWidth?maxWidth:Math.max(40,...lines.map(line=>ctx.measureText(line).width))+32,height:lines.length*s.size*s.lineHeight+24};
}
/** Shared preview/export renderer. Its media pool is bounded to active + one second of lookahead. */
export class Compositor {
  private entries=new Map<string,Entry>();private loading=new Map<string,Promise<void>>();
  private context?:AudioContext;private destination?:MediaStreamAudioDestinationNode;private output?:GainNode;private closed=false;
  constructor(private repository:MediaRepository,private onError:(error:Error)=>void=()=>{}){}
  async activateAudio(exporting=false){
    if(!this.context){this.context=new AudioContext();this.output=this.context.createGain();if(exporting){this.destination=this.context.createMediaStreamDestination();this.output.connect(this.destination);}else this.output.connect(this.context.destination);}
    await this.context.resume();for(const entry of this.entries.values())this.connectAudio(entry);
  }
  get audioStream(){return this.destination?.stream;}
  private connectAudio(entry:Entry){
    if(!this.context||!this.output||entry.source||!(entry.element instanceof HTMLMediaElement))return;
    entry.source=this.context.createMediaElementSource(entry.element);entry.gain=this.context.createGain();entry.source.connect(entry.gain);entry.gain.connect(this.output);entry.element.muted=false;
  }
  private ensure(p:EditorProject,c:Clip):Promise<void>{
    if(!c.assetId)return Promise.resolve();
    const asset=p.assets[c.assetId];
    const key=asset?.id+":"+(asset?.localKey||asset?.libraryId||asset?.cloud?.path||asset?.url||"");if(this.entries.has(c.id)&&this.entries.get(c.id)?.assetKey!==key)this.release(c.id);
    if(this.entries.has(c.id))return this.loading.get(c.id)||Promise.resolve();if(!asset)return Promise.reject(new Error(`Missing asset for ${c.name}.`));
    const element=asset.kind==="image"?new Image():document.createElement(asset.kind==="video"?"video":"audio");
    const entry:Entry={assetKey:key,element,ready:false};this.entries.set(c.id,entry);
    const task=(async()=>{
      element.crossOrigin="anonymous";
      const url=await this.repository.resolve(asset);if(this.closed||this.entries.get(c.id)!==entry)return;
      if(element instanceof HTMLMediaElement){element.preload="auto";element.muted=true;if(element instanceof HTMLVideoElement)element.playsInline=true;
        const loaded=waitMedia(element);element.src=url;element.load();await loaded;this.connectAudio(entry);
      }else{await new Promise<void>((resolve,reject)=>{const timer=setTimeout(()=>{element.onload=null;element.onerror=null;reject(new Error(`Loading ${asset.name} timed out.`));},20000);element.onload=()=>{clearTimeout(timer);resolve();};element.onerror=()=>{clearTimeout(timer);reject(new Error(`Cannot load ${asset.name}. Remote media requires CORS permission.`));};element.src=url;});}
      entry.ready=true;
    })().catch(error=>{if(this.closed||this.entries.get(c.id)!==entry)return;entry.error=new Error(`${asset.name}: ${error instanceof Error?error.message:"Unable to load media."}`);this.onError(entry.error);});
    this.loading.set(c.id,task);return task;
  }
  async prepare(p:EditorProject){
    await document.fonts.ready;await loadEditorStudioFonts(p);
    await Promise.all([...Object.values(p.textLayers),...Object.values(p.captions)].map(layer=>loadCaptionFonts(`"${layer.style.font}"`,layer.style.weight,layer.style.size,layer.style.fontAccent,layer.text)));
    // Export validates every used original before starting recording.
    for(const c of Object.values(p.clips)){if(p.tracks[c.trackId].hidden)continue;await this.ensure(p,c);const e=this.entries.get(c.id);if(e?.error)throw e.error;this.release(c.id);}
    await this.prepareAt(p,0);
  }
  async prepareAt(p:EditorProject,time:number){
    const clips=[...visibleLayers(p,time).map(l=>l.clip),...Object.values(p.clips).filter(c=>time>=c.startTime&&time<c.startTime+c.duration&&p.tracks[c.trackId].kind==="audio"&&!p.tracks[c.trackId].hidden)];
    await Promise.all(clips.map(c=>this.ensure(p,c)));
    for(const c of clips){const e=this.entries.get(c.id);if(e?.error)throw e.error;}
    await Promise.all(clips.map(async c=>{const e=this.entries.get(c.id)?.element;if(e instanceof HTMLMediaElement){const target=this.sourceTime(c,time);if(Math.abs(e.currentTime-target)>.01){const seek=waitMedia(e,"seeked");e.currentTime=Math.min(target,Math.max(0,e.duration-.001));await seek;}}}));
  }
  private sourceTime(c:Clip,time:number,hold=false){return clamp(c.sourceStart+(hold?c.duration-0.001:time-c.startTime)*c.speed,c.sourceStart,Math.max(c.sourceStart,c.sourceEnd-0.001));}
  sync(p:EditorProject,time:number,playing:boolean):boolean {
    const windows=speechWindows(p),layers=visibleLayers(p,time),holdIds=new Set(layers.filter(l=>l.hold).map(l=>l.clip.id));
    const wanted=new Set(layers.map(l=>l.clip.id));let ready=true;
    for(const c of Object.values(p.clips)){
      const track=p.tracks[c.trackId],active=time>=c.startTime&&time<c.startTime+c.duration;
      if(active&&!track.hidden)wanted.add(c.id);
      if(!track.hidden&&c.startTime>time&&c.startTime<time+1){wanted.add(c.id);void this.ensure(p,c);}
    }
    for(const id of wanted){const c=p.clips[id];void this.ensure(p,c);const entry=this.entries.get(id),element=entry?.element;
      if(entry?.error)throw entry.error;if(entry?.playError)throw entry.playError;
      const active=layers.some(l=>l.clip.id===id)||(time>=c.startTime&&time<c.startTime+c.duration);
      if(!active){if(entry?.ready&&element instanceof HTMLMediaElement){element.pause();const target=Math.min(c.sourceStart,Math.max(0,element.duration-.001));if(!element.seeking&&Math.abs(element.currentTime-target)>.015)element.currentTime=target;}continue;}
      // Text and captions render directly to canvas; they have no media element.
      if(!c.assetId){if(!c.shape&&!textForClip(p,c))throw new Error(`Missing text for ${c.name}.`);continue;}
      if(!entry?.ready){ready=false;continue;}
      if(element instanceof HTMLMediaElement){
        const hold=holdIds.has(id),target=Math.min(this.sourceTime(c,time,hold),Math.max(0,element.duration-.001));
        if(!element.seeking&&Math.abs(element.currentTime-target)>(playing?.12*c.speed:.015)){element.currentTime=target;ready=false;}
        if(element.seeking||element.readyState<2)ready=false;
        element.playbackRate=c.speed;
        if(entry.gain&&this.context)entry.gain.gain.setTargetAtTime(hold?0:clipGain(p,c,time,windows),this.context.currentTime,.008);
        // Start active sources together only after the readiness pass below.
        if(!playing||hold)element.pause();
      }
    }
    for(const id of wanted){const entry=this.entries.get(id),element=entry?.element,c=p.clips[id];
      if(!entry||!(element instanceof HTMLMediaElement)||!c)continue;
      const active=time>=c.startTime&&time<c.startTime+c.duration&&!holdIds.has(id);
      if(!playing||!ready||!active){element.pause();continue;}
      if(element.paused&&!entry.playPending){entry.playPending=true;void element.play().catch(error=>{if(this.closed||this.entries.get(id)!==entry||error?.name==="AbortError")return;entry.playError=new Error(`${c.name}: ${error.message}`);}).finally(()=>{entry.playPending=false;});}
    }
    for(const id of this.entries.keys())if(!wanted.has(id))this.release(id);
    return ready;
  }
  private frames=new Map<string,{image:CanvasImageSource;width:number;height:number}>();
  setFrame(id:string,image:CanvasImageSource,width:number,height:number){this.frames.set(id,{image,width,height});}
  render(canvas:HTMLCanvasElement,p:EditorProject,time:number):VisualBounds[]{
    const ctx=canvas.getContext("2d");if(!ctx)return[];
    const [width,height]=dimensions[p.settings.aspectRatio],bounds:VisualBounds[]=[];
    ctx.setTransform(canvas.width/width,0,0,canvas.height/height,0,0);ctx.globalAlpha=1;ctx.filter="none";ctx.fillStyle=p.settings.background;ctx.fillRect(0,0,width,height);
    for(const layer of visibleLayers(p,time)){
      const c=layer.clip,base=zoomTransform({...c,transform:keyframeTransform(c,time)},time),animation=mediaAnimationFrame(c,layer.hold?c.startTime+c.duration-1/p.settings.fps:time),t={...base,x:base.x+animation.x,y:base.y+animation.y,scale:base.scale*animation.scale,rotation:base.rotation+animation.rotation,opacity:base.opacity*animation.opacity},element=this.entries.get(c.id)?.element,frame=this.frames.get(c.id),text=textForClip(p,c);
      if(!c.shape&&!text&&!frame&&(!element||!this.entries.get(c.id)?.ready))continue;
      const treatment=visualTreatmentAt(c,time);
      const local=time-c.startTime,fade=layer.hold?1:Math.min(c.fadeIn?clamp(local/c.fadeIn,0,1):1,c.fadeOut?clamp((c.duration-local)/c.fadeOut,0,1):1);
      ctx.save();ctx.globalAlpha=t.opacity*layer.opacity*fade*treatment.opacity;ctx.translate(width*(.5+t.x+layer.x),height*(.5+t.y));ctx.rotate(t.rotation*Math.PI/180);ctx.scale(t.scale*layer.scale*treatment.scale*animation.scaleX,t.scale*layer.scale*treatment.scale*animation.scaleY);
      const fx=c.effects;ctx.filter=`brightness(${1+fx.brightness/100}) contrast(${1+fx.contrast/100}) saturate(${1+fx.saturation/100}) blur(${Math.min(50,fx.blur+treatment.blur+animation.blur)}px)`;
      let bw=width,bh=height;
      const rich=c.contentId?p.captions[c.contentId]:undefined;
      if(rich?.studioStyle){const segment=studioSegment(p,c);ctx.translate(-width/2,-height/2);drawCaptions(ctx,[segment],rich.studioStyle,time,width,height);const b=studioCaptionBounds(rich.studioStyle,width,height);if(!layer.hold)bounds.push({id:c.id,x:b.x+width*t.x,y:b.y+height*t.y,width:b.width*t.scale,height:b.height*t.scale,rotation:t.rotation});ctx.restore();continue;}
      if(c.shape){const size=shapeDimensions(c.shape,p.settings.aspectRatio);bw=size.width;bh=size.height;drawShape(ctx,c.shape,bw,bh);}
      else if(text){const caption=c.contentId?p.captions[c.contentId]:undefined,motion=caption?captionMotionFrame(caption,c,time):undefined;
        const rendered=motion?{...text,text:motion.text}:text;
        if(motion)ctx.scale(motion.scale,motion.scale);
        const metrics=layoutText(ctx,rendered,width,styledText(text).trim().split(/\s+/).length);bw=metrics.width;bh=metrics.height;const s=text.style;
        if(c.graphic){const graphic=drawGraphicPanel(ctx,c.graphic,bw,bh,local);bw=graphic.width;bh=graphic.height;}
        if(s.background!=="transparent"){ctx.fillStyle=s.background;ctx.fillRect(-bw/2,-bh/2,bw,bh);}
        ctx.direction=textDirection(text.text);ctx.textAlign=s.align;ctx.textBaseline="middle";ctx.fillStyle=textFill(ctx,s.gradient,s.color,metrics.inkWidth,bh,s.align==="left"?-bw/2+16+metrics.inkWidth/2:s.align==="right"?bw/2-16-metrics.inkWidth/2:0);ctx.strokeStyle=s.stroke;ctx.lineWidth=s.strokeWidth*2;ctx.lineJoin="round";ctx.shadowColor="rgba(0,0,0,.8)";ctx.shadowBlur=s.shadow;
        const x=s.align==="left"?-bw/2+16:s.align==="right"?bw/2-16:0;
        let wordIndex=0;
        metrics.lines.forEach((line,i)=>{const y=(i-(metrics.lines.length-1)/2)*s.size*s.lineHeight;
          if(metrics.mixed){const row=metrics.mixed.rows[i],rowWidth=row.reduce((n,r)=>n+r.width,0)+Math.max(0,row.length-1)*metrics.mixed.gap;let offset=s.align==='left'?x:s.align==='right'?x-rowWidth:x-rowWidth/2;
            const rtl=textDirection(text.text)==='rtl';if(rtl)offset+=rowWidth;ctx.save();ctx.textAlign='left';for(const run of row){const at=rtl?offset-run.width:offset;ctx.font=run.font;ctx.direction=textDirection(run.text);if(s.strokeWidth)ctx.strokeText(run.text,at,y);ctx.fillText(run.text,at,y);if(caption&&wordHighlight(caption.highlightMode||'current-word',run.text,run.index,!!motion&&motion.active===run.index,caption.highlightWords)){ctx.save();ctx.fillStyle=caption.highlightMode==='full-line'?(caption.highlightColor||s.color):distinctHighlight(s.color,caption.highlightColor||'#d9ff43');ctx.fillText(run.text,at,y);ctx.restore();}offset+=(rtl?-1:1)*(run.width+metrics.mixed.gap);}ctx.restore();return;
          }
          if(s.strokeWidth)ctx.strokeText(line,x,y);ctx.fillText(line,x,y);
          if(motion&&motion.active>=0){const words=line.split(/\s+/).filter(Boolean),lineWidth=ctx.measureText(line).width;
            let offset=s.align==="left"?x:s.align==="right"?x-lineWidth:x-lineWidth/2;
            for(const word of words){if(wordIndex===motion.active){ctx.save();ctx.textAlign="left";ctx.fillStyle=caption?.highlightColor||"#d9ff43";ctx.fillText(word,offset,y);ctx.restore();}offset+=ctx.measureText(word+" ").width;wordIndex++;}
          }
        });
      }else if(frame||element instanceof HTMLVideoElement||element instanceof HTMLImageElement){
        const ew=frame?frame.width:element instanceof HTMLVideoElement?element.videoWidth:(element as HTMLImageElement).naturalWidth,eh=frame?frame.height:element instanceof HTMLVideoElement?element.videoHeight:(element as HTMLImageElement).naturalHeight;
        if(!ew||!eh){ctx.restore();continue;}const mediaBounds=drawVisualMedia(ctx,frame?.image||element as HTMLVideoElement|HTMLImageElement,ew,eh,width,height,c.visualTreatment);bw=mediaBounds.width;bh=mediaBounds.height;if(c.surface&&c.surface!=="none")drawStyleSurface(ctx,bw,bh,local,c.surface);
      }
      if(!layer.hold)bounds.push({id:c.id,x:width*(.5+t.x),y:height*(.5+t.y),width:bw*t.scale*treatment.scale*Math.abs(animation.scaleX),height:bh*t.scale*treatment.scale*Math.abs(animation.scaleY),rotation:t.rotation});ctx.restore();
    }ctx.setTransform(1,0,0,1,0,0);return bounds;
  }
  pause(){for(const e of this.entries.values())if(e.element instanceof HTMLMediaElement)e.element.pause();}
  private release(id:string){const entry=this.entries.get(id);if(!entry)return;entry.source?.disconnect();entry.gain?.disconnect();if(entry.element instanceof HTMLMediaElement){entry.element.pause();entry.element.removeAttribute("src");entry.element.load();}this.entries.delete(id);this.loading.delete(id);}
  dispose(){this.closed=true;this.frames.clear();for(const id of this.entries.keys())this.release(id);void this.context?.close();}
}
