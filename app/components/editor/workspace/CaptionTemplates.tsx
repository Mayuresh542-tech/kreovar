"use client";
import {useState} from 'react';
import CaptionDesignPanel from '@/app/components/captions/CaptionDesignPanel';
import CaptionTimingTools from '@/app/components/captions/CaptionTimingTools';
import CaptionWordTools from '@/app/components/captions/CaptionWordTools';
import {studioCaptions,applyStudioStyle,replaceStudioCaptions,resolvedStudioStyle,studioTemplate} from '@/app/lib/editor/editorCaptionStudio';
import {splitCaption,mergeCaptionNext} from '@/app/lib/captions/captionEditing';
import {deleteCaptionWord,moveBoundaryWord} from '@/app/lib/captions/wordActions';
import {DEFAULT_CAPTION_TEMPLATES,type CaptionStyleConfig} from '@/app/lib/captions/templates';
import type {CaptionSegment} from '@/app/lib/captions/presets';
import {useProject} from '@/app/lib/editor/store';
import {projectDuration} from '@/app/lib/editor/model';
import {useEditor} from './EditorContext';
export default function CaptionTemplates(){
 const {store,selection,run,notify}=useEditor(),p=useProject(store),[scope,setScope]=useState('all'),[templateId,setTemplate]=useState('clean-sub'),[draft,setDraft]=useState<CaptionStyleConfig>(DEFAULT_CAPTION_TEMPLATES.find(t=>t.id==='clean-sub')!.style);
 const rows=studioCaptions(p).filter(s=>!p.tracks[p.clips[s.id].trackId].locked&&(scope!=='selected'||selection.includes(s.id))),ids=rows.map(s=>s.id),first=rows[0],style=first?resolvedStudioStyle(p.captions[p.clips[first.id].contentId!]):draft;
 const replace=(next:CaptionSegment[])=>run(p=>replaceStudioCaptions(p,ids,next,draft));
 function update(patch:Partial<CaptionStyleConfig>){const next={...style,...patch};setDraft(next);if(ids.length)run(p=>applyStudioStyle(p,ids,next));}
 const action=(task:()=>CaptionSegment[])=>{try{replace(task());}catch(e){notify(e instanceof Error?e.message:'Caption edit failed.');}};
 return <div className="vx-editor-caption-studio"><div className="vx-studio-intro"><span>47 reference looks · editable on your timeline</span></div><label className="vx-field"><span>Apply changes to</span><select aria-label="Caption Studio scope" value={scope} onChange={e=>setScope(e.target.value)}><option value="all">All unlocked captions ({studioCaptions(p).filter(s=>!p.tracks[p.clips[s.id].trackId].locked).length})</option><option value="selected">Selected caption clips</option></select></label>{!ids.length&&<p className="vx-hint">Add captions to apply a look. Browse templates below.</p>}
 <CaptionDesignPanel style={style} templateId={templateId} disabled={false} onStyle={update} onTemplate={id=>{const t=studioTemplate(id);if(t){setTemplate(id);setDraft(t.style);if(ids.length)run(p=>applyStudioStyle(p,ids,t.style));}}} onReset={()=>update(studioTemplate(templateId)?.style||draft)}/>
 {!!rows.length&&<details className="vx-caption-transcript"><summary>Full timing &amp; word tools</summary><CaptionTimingTools segments={rows} onChange={replace} onError={notify} disabled={false} duration={projectDuration(p)} undo={()=>store.undo()} redo={()=>store.redo()} canUndo={store.canUndo} canRedo={store.canRedo}/>{rows.map((s,i)=><CaptionWordTools key={s.id} segment={s} index={i} disabled={false} onError={notify} onChange={next=>replace(rows.map(r=>r.id===s.id?next:r))} onSplit={()=>action(()=>splitCaption(rows,s.id,Math.max(1,Math.ceil(s.words.length/2))))} onMerge={()=>action(()=>mergeCaptionNext(rows,s.id))} onDelete={()=>replace(rows.filter(r=>r.id!==s.id))} onWordAction={(kind,n)=>action(()=>kind==='delete'?deleteCaptionWord(rows,s.id,n):kind==='split'?splitCaption(rows,s.id,n+1):moveBoundaryWord(rows,s.id,n,kind))}/>)}</details>}
 <p className="vx-hint">Styles, word effects and animations are included in this editor’s preview, saved project and video export. Free font equivalents stay labelled.</p></div>;
}
