"use client";
import type {TextStyle} from '@/app/lib/editor/model';
import {TEXT_GRADIENTS,readTextGradient} from '@/app/lib/editor/textGradient';
export default function TextFillControls({style,onChange}:{style:TextStyle;onChange:(changes:Partial<TextStyle>)=>void}){
 const gradient=style.gradient||TEXT_GRADIENTS[1];
 const update=(patch:Partial<typeof gradient>)=>onChange({gradient:readTextGradient({...gradient,...patch})});
 return <div className="space-y-3">
  <label className="vx-field"><span>Text fill</span><select aria-label="Text fill" value={style.gradient?'gradient':'solid'} onChange={e=>onChange({gradient:e.target.value==='solid'?null:readTextGradient(gradient)})}><option value="solid">Solid colour</option><option value="gradient">Gradient</option></select></label>
  {style.gradient&&<>
   <div className="grid grid-cols-2 gap-2">{TEXT_GRADIENTS.map(preset=><button type="button" key={preset.id} aria-label={preset.name+' text gradient'} title={preset.name} className="rounded-lg px-3 py-2 text-xs font-semibold text-slate-950 border border-slate-200" style={{background:'linear-gradient('+(preset.angle+90)+'deg,'+preset.stops.map(s=>s.color+' '+s.offset*100+'%').join(',')+')'}} onClick={()=>onChange({gradient:readTextGradient(preset)})}>{preset.name}</button>)}</div>
   <div className="vx-field-grid">{[0,gradient.stops.length-1].map((index,i)=><label key={i} className="vx-color-field">{i===0?'Start colour':'End colour'}<input type="color" aria-label={i===0?'Gradient start colour':'Gradient end colour'} value={gradient.stops[index].color} onChange={e=>update({stops:gradient.stops.map((s,n)=>n===index?{...s,color:e.target.value}:s)})}/></label>)}</div>
   <label className="vx-field"><span>Gradient angle · {gradient.angle}°</span><input type="range" aria-label="Gradient angle" min={0} max={360} step={5} value={gradient.angle} onChange={e=>update({angle:Number(e.target.value)})}/></label>
  </>}
 </div>;
}
