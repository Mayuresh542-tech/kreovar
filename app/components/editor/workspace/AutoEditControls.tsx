"use client";
import {AUTO_EDIT_STYLES,type AutoEditOptions} from '@/app/lib/editor/autoEdit';
import AiStyleDemo from './AiStyleDemo';
import {AI_EDIT_STYLE_RECIPES,aiEditStyleRecipe} from '@/app/lib/captions/aiEditStyles';
import type {EditorProject} from '@/app/lib/editor/model';

export default function AutoEditControls({project,value,onChange,disabled}:{project:EditorProject;value:AutoEditOptions;onChange:(value:AutoEditOptions)=>void;disabled:boolean}){
 const update=(patch:Partial<AutoEditOptions>)=>onChange({...value,...patch});
 const audio=Object.values(project.assets).filter(a=>a.kind==='audio'&&a.duration>0);
 const mainIds=new Set(Object.values(project.clips).filter(c=>project.tracks[c.trackId].kind==='video').map(c=>c.assetId));
 const cutaways=Object.values(project.assets).filter(a=>(a.kind==='image'||a.kind==='video')&&!mainIds.has(a.id));
 return <div className="vx-auto-controls">
  <fieldset disabled={disabled}><legend>AI editing style</legend><div className="vx-auto-styles"><label className="vx-auto-style" data-selected={value.styleId==='ai-choice'}><input type="radio" name="vx-auto-style" value="ai-choice" checked={value.styleId==='ai-choice'} onChange={()=>update({styleId:'ai-choice'})}/><span className="vx-edit-style-card"><strong>Let AI choose</strong><small>Understand your clip, match captions and find supporting footage</small></span></label>{AI_EDIT_STYLE_RECIPES.map(style=><label className="vx-auto-style" key={style.id} data-selected={value.styleId===style.id}>
   <input type="radio" name="vx-auto-style" value={style.id} checked={value.styleId===style.id} onChange={()=>update({styleId:style.id})}/><span className="vx-edit-style-card"><span className="vx-edit-style-swatch" style={{background:style.palette[0],color:style.palette[1],borderColor:style.palette[2]}}><span style={{background:style.palette[2]}}/>{style.name}</span><strong>{style.name}</strong><small>{style.description}</small></span>
  </label>)}</div></fieldset>{aiEditStyleRecipe(value.styleId)&&<><AiStyleDemo recipe={aiEditStyleRecipe(value.styleId)!}/></>}<details><summary>Earlier editor directions</summary><div className="vx-auto-styles">{AUTO_EDIT_STYLES.filter(s=>s.id!=='ai-choice'&&!aiEditStyleRecipe(s.id)).map(s=><label className="vx-auto-style" key={s.id}><input type="radio" name="vx-auto-style" checked={value.styleId===s.id} onChange={()=>update({styleId:s.id})} disabled={disabled}/><span>{s.name}<small>{s.description}</small></span></label>)}</div></details>
  <label className="vx-auto-select">Edit intensity<select aria-label="Auto edit intensity" disabled={disabled} value={value.intensity} onChange={e=>update({intensity:e.target.value as AutoEditOptions['intensity']})}><option value="subtle">Subtle</option><option value="balanced">Balanced</option><option value="punchy">Punchy</option></select></label>
  <fieldset className="vx-auto-options" disabled={disabled}><legend>Include in this edit</legend>{([
   ['broll','Find relevant B-roll'],['surfaces','Style texture and color treatment'],['captions','Captions from speech'],['zooms','Emphasis-led camera motion'],['motionGraphics','Contextual graphic callouts'],['animateOverlays','Animate chosen image / PNG overlays'],['transitions','Dissolve at clip joins'],['removeFillers','Suggest filler-word cuts'],
  ] as const).map(([key,label])=><label key={key}><input type="checkbox" checked={!!value[key]} onChange={e=>update({[key]:e.target.checked})}/>{label}</label>)}</fieldset>
  <details><summary>Color and your media</summary><div className="vx-auto-media">
   <label className="vx-auto-select">Caption text color<div className="vx-auto-color"><input type="color" aria-label="Auto caption text color" disabled={disabled||!value.captions} value={value.captionColor||'#ffffff'} onChange={e=>update({captionColor:e.target.value})}/><button type="button" disabled={disabled||!value.captionColor} onClick={()=>update({captionColor:''})}>Use style color</button></div></label>
   <label className="vx-auto-select">Background music<select aria-label="Auto edit project music" disabled={disabled} value={value.musicAssetId} onChange={e=>update({musicAssetId:e.target.value})}><option value="">Keep existing audio</option>{audio.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select></label>
   <label className="vx-auto-select">Custom cutaway<select aria-label="Auto edit custom cutaway" disabled={disabled} value={value.cutawayAssetId} onChange={e=>update({cutawayAssetId:e.target.value})}><option value="">No extra media</option>{cutaways.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select></label>
  </div><p className="vx-ai-hint">Use your own media. PNG transparency is preserved; animated images sit over the footage. Graphic callouts use real transcript words, not guessed topics. Main footage cannot be its own cutaway.</p></details>
  <p className="vx-ai-hint">AI reads samples of your footage, transcribes speech when needed, chooses captions and finds relevant supporting footage using your existing allowance. Review the finished preview before applying.</p>
 </div>;
}
