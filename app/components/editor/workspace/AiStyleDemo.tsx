"use client";
import {useEffect,useRef,useState} from 'react';
import {drawCaptions} from '@/app/lib/captions/canvasCaptions';
import {loadCaptionDocumentFonts} from '@/app/lib/captions/studioFonts';
import {drawStyleSurface} from '@/app/lib/editor/styleSurface';
import type {AiEditStyleRecipe} from '@/app/lib/captions/aiEditStyles';
/** Original design sample, explicitly separate from an AI edit of the user's footage. */
export default function AiStyleDemo({recipe}:{recipe:AiEditStyleRecipe}){
 const canvas=useRef<HTMLCanvasElement>(null),[playing,setPlaying]=useState(false);
 useEffect(()=>{let frame=0,closed=false;const style={...recipe.caption,position:'center' as const,fontSize:recipe.caption.fontSize*2},sample=[{id:'design-sample',text:'Make your point clearly',start:0,end:4,words:['Make','your','point','clearly'].map((word,i)=>({word,start:i,end:i+1}))}];
  const draw=(time:number)=>{const c=canvas.current,ctx=c?.getContext('2d');if(!c||!ctx||closed)return;const w=c.width,h=c.height;ctx.fillStyle=recipe.palette[0];ctx.fillRect(0,0,w,h);ctx.fillStyle=recipe.palette[2]+'20';ctx.fillRect(w*.1,h*.12,w*.8,h*.76);ctx.save();ctx.translate(w/2,h/2);drawStyleSurface(ctx,w,h,time,recipe.surface);ctx.restore();drawCaptions(ctx,sample,style,time,w,h);ctx.fillStyle=recipe.palette[1]+'88';ctx.font='20px sans-serif';ctx.fillText('KREOVAR · ORIGINAL DESIGN SAMPLE',32,h-24);};
  const tick=(now:number)=>{draw((now/1000)%4);frame=requestAnimationFrame(tick);};draw(2.4);void loadCaptionDocumentFonts(sample,style).catch(()=>{}).then(()=>{if(!closed&&!playing)draw(2.4);});if(playing)frame=requestAnimationFrame(tick);return()=>{closed=true;cancelAnimationFrame(frame);};
 },[recipe,playing]);
 return <div className="vx-style-demo"><canvas ref={canvas} width={960} height={540} role="img" aria-label={recipe.name+' original design sample'}/><div><span>Style demo · not your footage</span><button type="button" aria-pressed={playing} onClick={()=>setPlaying(v=>!v)}>{playing?'Pause sample':'Play sample'}</button></div></div>;
}
