"use client";
import {loadCaptionDocumentFonts} from '../../lib/captions/studioFonts';
import {useEffect,useRef} from "react";
import type {CaptionStyleConfig} from "../../lib/captions/templates";
import type {CaptionSegment} from "../../lib/captions/presets";
import {drawCaptions} from "../../lib/captions/canvasCaptions";

/** Static cards are inexpensive; only the selected sample animates on request. */
export default function CaptionStylePreview({style,compact=false,animate=false,sampleText="Create something amazing",previewFontSize}:{style:CaptionStyleConfig;compact?:boolean;animate?:boolean;sampleText?:string;previewFontSize?:number}){
 const canvas=useRef<HTMLCanvasElement>(null);
 useEffect(()=>{
  let frame=0,disposed=false;const reduced=window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const tokens=sampleText.split(/\s+/).filter(Boolean),sample:CaptionSegment[]=[{id:'preview',text:sampleText,start:0,end:3,words:tokens.map((word,i)=>({word,start:3*i/tokens.length,end:3*(i+1)/tokens.length}))}],magnification=compact?(previewFontSize??style.fontSize*3)/style.fontSize:1;
  const draw=(now:number)=>{const target=canvas.current,ctx=target?.getContext("2d");if(!target||!ctx||disposed)return;ctx.clearRect(0,0,target.width,target.height);drawCaptions(ctx,sample,compact?{...style,fontSize:style.fontSize*magnification,strokeWidth:(style.strokeWidth||0)*magnification,shadowOffsetX:(style.shadowOffsetX||0)*magnification,shadowOffsetY:(style.shadowOffsetY||0)*magnification,position:"center"}:style,animate&&!reduced?(now/1000)%3:1.35,target.width,target.height);};
  const tick=(now:number)=>{draw(now);frame=requestAnimationFrame(tick);};
  draw(1350);void loadCaptionDocumentFonts(sample,style).catch(()=>{}).then(()=>{if(!disposed)draw(1350);});
  if(animate&&!reduced)frame=requestAnimationFrame(tick);
  return()=>{disposed=true;cancelAnimationFrame(frame);};
 },[style,compact,animate,sampleText,previewFontSize]);
 return <canvas ref={canvas} width={1280} height={720} role="img" aria-label={`Caption style sample: ${sampleText}`} className="block aspect-video w-full rounded-lg bg-gradient-to-br from-slate-800 to-slate-950"/>;
}
