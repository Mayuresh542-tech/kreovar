import type {EditorProject,MediaAsset} from './model';
export function stockKeys(p:EditorProject){return new Set(Object.values(p.assets).flatMap(a=>{const match=a.name.match(/^AI-(broll|motion)-(\d+)\.mp4$/);return a.stockKey?[a.stockKey]:match?[match[1]+':'+match[2]]:[];}));}
export function chooseStock<T extends {id:string|number;videoUrl:string;duration:number;size?:number;sourcePage?:string;creatorUrl?:string}>(videos:T[],type:'broll'|'motion',used:Set<string>,duration?:number){
 const match=videos.find(v=>v.videoUrl&&Number.isFinite(v.duration)&&v.duration>0&&(!v.size||v.size<=100*1048576)&&(!duration||v.duration>=duration)&&!used.has(type+':'+v.id));
 if(!match)throw new Error('No new usable footage matched this request. Change the search to avoid repeating footage.');
 return match;
}
export function withStockKey(asset:MediaAsset,key:string):MediaAsset{return {...asset,stockKey:key};}
