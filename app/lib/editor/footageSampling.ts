import type {FootageFrame} from './footageContext';

export interface FootageProbe {frame:FootageFrame;pixels:ArrayLike<number>}
function difference(a:ArrayLike<number>,b:ArrayLike<number>){
 if(!a.length||a.length!==b.length)return 0;
 let sum=0;for(let i=0;i<a.length;i++)sum+=Math.abs(a[i]-b[i]);return sum/(a.length*255);
}
/** Pixel changes choose observation coverage only, never cuts or edit decisions.
 * Six time strata prevent a rapid montage consuming the whole vision budget.
 */
export function selectFallbackFootage(input:FootageProbe[],limit=6):FootageFrame[]{
 const samples=input.filter((s,i,a)=>a.findIndex(other=>other.frame.clipId===s.frame.clipId&&Math.abs(other.frame.sourceTime-s.frame.sourceTime)<.00001)===i).sort((a,b)=>a.frame.timelineTime-b.frame.timelineTime||a.frame.clipId.localeCompare(b.frame.clipId));
 const count=Math.min(samples.length,Math.max(1,Math.min(6,Math.floor(limit)||6)));if(!samples.length)return [];
 const scores=samples.map((sample,i)=>{
  const previous=samples[i-1],next=samples[i+1];if(!previous)return 0;
  if(previous.frame.clipId!==sample.frame.clipId)return 1;
  const change=difference(previous.pixels,sample.pixels);
  // A single-frame flash that immediately returns is poor scene evidence.
  if(next?.frame.clipId===sample.frame.clipId&&change>.08&&difference(sample.pixels,next.pixels)>.08&&difference(previous.pixels,next.pixels)<.04)return 0;
  const earlier=samples[i-2];if(earlier?.frame.clipId===sample.frame.clipId&&difference(earlier.pixels,previous.pixels)>.08&&difference(earlier.pixels,sample.pixels)<.04)return 0;
  return change>.08?change:0;
 });
 const selected:number[]=[];
 for(let slot=0;slot<count;slot++){
  const lo=Math.floor(slot*samples.length/count),hi=Math.floor((slot+1)*samples.length/count),middle=(lo+hi-1)/2;
  let best=lo;for(let i=lo;i<hi;i++)if(scores[i]>scores[best]||scores[i]===scores[best]&&Math.abs(i-middle)<Math.abs(best-middle))best=i;
  selected.push(best);
 }
 // Give short source clips a voice even if long footage dominates time strata.
 const clipIds=[...new Set(samples.map(s=>s.frame.clipId))];
 if(clipIds.length<=count)for(const clipId of clipIds){
  if(selected.some(i=>samples[i].frame.clipId===clipId))continue;
  const candidates=samples.map((s,i)=>s.frame.clipId===clipId?i:-1).filter(i=>i>=0),replacement=candidates[Math.floor(candidates.length/2)];
  const removable=selected.map((i,slot)=>({i,slot})).filter(({i})=>selected.filter(j=>samples[j].frame.clipId===samples[i].frame.clipId).length>1).sort((a,b)=>scores[a.i]-scores[b.i])[0];
  if(removable)selected[removable.slot]=replacement;
 }
 return selected.sort((a,b)=>a-b).map(i=>samples[i].frame);
}
