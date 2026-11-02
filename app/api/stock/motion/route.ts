import {NextRequest,NextResponse} from "next/server";
import {getAuthenticatedUserId} from "@/app/lib/server/adminAuth";
import {withSafeResponse} from "@/app/lib/server/safeResponse";
export const GET=withSafeResponse(async(req:NextRequest)=>{
 if(!await getAuthenticatedUserId(req))return NextResponse.json({error:"Sign in to search motion graphics."},{status:401});
 const query=(req.nextUrl.searchParams.get("query")||"abstract").trim(),page=Number(req.nextUrl.searchParams.get("page")||1);
 if(!query||query.length>100||!Number.isInteger(page)||page<1||page>25)return NextResponse.json({error:"Use a search up to 100 characters."},{status:400});
 const key=process.env.PIXABAY_API_KEY;if(!key)return NextResponse.json({error:"Motion graphics search is temporarily unavailable.",code:"PROVIDER_NOT_CONFIGURED"},{status:503});
 const params=new URLSearchParams({key,q:query,video_type:"animation",safesearch:"true",per_page:"12",page:String(page)});
 const upstream=await fetch("https://pixabay.com/api/videos/?"+params,{next:{revalidate:86400},signal:AbortSignal.timeout(20000)});
 if(!upstream.ok)return NextResponse.json({error:upstream.status===429?"Motion graphics search is busy. Please retry later.":"Motion graphics search is unavailable. Please retry later."},{status:upstream.status===429?429:502});
 const result=await upstream.json();
 const videos=(Array.isArray(result.hits)?result.hits:[]).flatMap((hit:{id:number;duration:number;pageURL:string;user:string;videos:Record<string,{url:string;size:number;width:number;height:number;thumbnail?:string}>})=>{
 const file=hit.videos?.medium||hit.videos?.small||hit.videos?.tiny;if(!file)return [];
 let url:URL;try{url=new URL(file.url);}catch{return [];}
 if(url.protocol!=="https:"||url.hostname!=="cdn.pixabay.com"||!url.pathname.startsWith("/video/"))return [];
 return [{id:String(hit.id),videoUrl:file.url,duration:hit.duration,size:file.size,width:file.width,height:file.height,thumbnail:file.thumbnail||hit.videos?.tiny?.thumbnail||"",creatorName:hit.user,sourcePage:hit.pageURL}];
 });
 return NextResponse.json({videos,totalResults:result.totalHits||0,page});
});

