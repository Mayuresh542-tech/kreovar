"use client";
import {useProject} from '@/app/lib/editor/store';
import {useEditor} from './EditorContext';
export default function AudioBalance(){
 const {store,run}=useEditor(),p=useProject(store);
 return <section className="vx-feature-note"><h3>Audio balance</h3><label className="vx-check"><input aria-label="Auto audio ducking" type="checkbox" checked={!!p.settings.audioDucking} onChange={e=>run(q=>({...q,settings:{...q.settings,audioDucking:e.target.checked}}))}/> Soften background audio during speech</label><p>Uses caption timing when available; otherwise the full speech clip. Soft fades reduce background/SFX to 25% of their manual volume. Set each clip’s audio role in Clip controls. Speech volume stays unchanged.</p></section>;
}
