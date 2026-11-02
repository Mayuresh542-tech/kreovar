export interface StockVideo {id:string;title:string;thumbnail:string;videoUrl:string;duration:number;width:number;height:number;creatorName:string;creatorUrl:string;sourcePage:string;source:'pexels'}
export class StockSearchError extends Error {}
export async function searchStockVideos(query:string,orientation:'portrait'|'landscape',signal:AbortSignal,perPage=8,page=1):Promise<StockVideo[]>{
 const key=process.env.PEXELS_API_KEY;if(!key)throw new StockSearchError('Stock search is not configured. The owner needs to connect the existing stock provider.');
 const url='https://api.pexels.com/videos/search?'+new URLSearchParams({query,orientation,per_page:String(Math.min(12,perPage)),page:String(page)});
 const response=await fetch(url,{headers:{Authorization:key},signal,redirect:'error',cache:'no-store'});if(!response.ok)throw new StockSearchError('Stock search could not complete (HTTP '+response.status+').');
 const data=await response.json();if(!Array.isArray(data?.videos))throw new StockSearchError('Stock search returned invalid results.');
 return data.videos.flatMap((raw:Record<string,unknown>)=>{
  const v=raw as {id:number;url:string;image:string;duration:number;width:number;height:number;video_files:{link:string;width:number;height:number;file_type?:string}[];user?:{name:string;url:string}};
  const files=(v.video_files||[]).filter(f=>f.link&&(!f.file_type||f.file_type==='video/mp4')).sort((a,b)=>Math.abs(a.width*a.height-720*1280)-Math.abs(b.width*b.height-720*1280)),matched=files.find(f=>orientation==='landscape'?f.width>f.height:f.width<f.height)||files[0];
  if(!matched||!Number.isFinite(v.duration)||v.duration<=0)return [];
  const slug=typeof v.url==='string'?new URL(v.url).pathname.split('/').filter(Boolean).pop()||'':'';
  return [{id:String(v.id),title:slug.replace(/-\d+$/,'').replaceAll('-',' ').slice(0,160),thumbnail:v.image,videoUrl:matched.link,duration:v.duration,width:matched.width,height:matched.height,creatorName:v.user?.name||'Stock creator',creatorUrl:v.user?.url||'https://www.pexels.com',sourcePage:v.url||v.user?.url||'https://www.pexels.com',source:'pexels' as const}];
 });
}
