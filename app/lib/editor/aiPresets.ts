import type {EditorProject} from './model';
import {mainFootage} from './aiTools';
/** Resolve the preset's placement from real source/timeline metadata before planning. */
export function cleanEditInstruction(project:EditorProject){
 const footage=mainFootage(project),originals=Object.values(project.assets).filter(a=>a.kind==='video'&&!a.stockKey&&Number.isFinite(a.duration)&&a.duration>0).sort((a,b)=>a.name.localeCompare(b.name,undefined,{numeric:true}));
 const sequence=footage.length?'Preserve the current footage sequence.':originals.length?'Join these video originals in this exact order: '+originals.map(a=>JSON.stringify(a.name)+' (asset '+a.id+')').join(' → ')+'.':'There is no usable footage; do not invent video assets.';
 const at=footage.length>1?footage[1].startTime:footage.length?footage[0].startTime:originals.length>1?originals[0].duration:0;
 const hasSfx=Object.values(project.clips).some(c=>c.audioRole==='sfx'),hasFootage=footage.length>0||originals.length>0;
 const sound=!hasSfx&&hasFootage?'Add exactly one built-in soft whoosh at '+at+' seconds, at 10% volume. This is the measured '+((footage.length||originals.length)>1?'first clip join':'opening')+'; do not move it to another time.':'Do not add sound effects.';
 return 'Build a clean edit from my footage. '+sequence+' Keep original framing and speech. Generate real captions for all main footage only if captions do not already exist, using the clean-sub template. '+sound+' Do not add effects, transitions, music or B-roll.';
}
