import {saveStudioAsset} from "@/app/lib/server/assetStore";
import { withSafeResponse } from "@/app/lib/server/safeResponse";
import { withBoundedRequest } from "@/app/lib/server/boundedRequest";
import { NextRequest, NextResponse } from "next/server";
import { getAdminClient } from "@/app/lib/server/adminAuth";
import { getGeminiApiKey } from "@/app/lib/server/geminiService";
export const dynamic="force-dynamic";
export const maxDuration=90;
const requests=new Map<string,{since:number;count:number;busy:boolean}>();
async function postHandler(req:NextRequest){let release:(()=>void)|undefined;try{
 const token=req.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];if(!token)return NextResponse.json({error:"Sign in to generate AI media."},{status:401});
 const {data,error}=await getAdminClient().auth.getUser(token);if(error||!data.user)return NextResponse.json({error:"Your session expired. Sign in again."},{status:401});
 const reader=req.body?.getReader();if(!reader)return NextResponse.json({error:"Missing image prompt."},{status:400});const chunks:Uint8Array[]=[];let size=0;while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>12000){await reader.cancel();return NextResponse.json({error:"Image prompt is too long."},{status:413});}chunks.push(value);}
 let prompt:unknown,aspectRatio="16:9";try{const body=JSON.parse(Buffer.concat(chunks).toString("utf8"));prompt=body.prompt;aspectRatio=body.aspectRatio||"16:9";}catch{return NextResponse.json({error:"Invalid image request."},{status:400});}if(typeof prompt!=="string"||!prompt.trim()||prompt.length>2000)return NextResponse.json({error:"Describe the image in 1–2000 characters."},{status:400});
 if(!["16:9","9:16","1:1","4:5"].includes(aspectRatio))return NextResponse.json({error:"Choose a supported aspect ratio."},{status:400});
 const now=Date.now();for(const [id,s]of requests)if(!s.busy&&now-s.since>60000)requests.delete(id);const state=requests.get(data.user.id)||{since:now,count:0,busy:false};if(state.busy||state.count>=3)return NextResponse.json({error:"Please wait a minute before generating another image."},{status:429});state.count++;state.busy=true;requests.set(data.user.id,state);release=()=>{state.busy=false;};
 if(process.env.IMAGE_GENERATION_ENABLED!=="true")return NextResponse.json({error:"Image generation is coming soon and is not included in current plan allowances."},{status:503});
 const key=await getGeminiApiKey();if(!key)return NextResponse.json({error:"Configure a Gemini key in Admin → AI Providers to generate images."},{status:503});
 const model=process.env.GEMINI_IMAGE_MODEL||"gemini-2.5-flash-image";
 const response=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,{method:"POST",headers:{"Content-Type":"application/json","x-goog-api-key":key},body:JSON.stringify({contents:[{parts:[{text:prompt.trim()}]}],generationConfig:{responseModalities:["TEXT","IMAGE"],imageConfig:{aspectRatio}}}),signal:AbortSignal.any([req.signal,AbortSignal.timeout(80000)])});
 if(!response.ok)return NextResponse.json({error:response.status===429?"The AI provider’s image quota is exhausted. Retry later or enable billing for its key.":"Image generation is unavailable for the configured key or model. Check the AI provider settings."},{status:response.status===429?429:502});
 const result=await response.json(),parts=result.candidates?.[0]?.content?.parts||[];const image=parts.find((p:{inlineData?:{mimeType?:string;data?:string}})=>p.inlineData?.data)?.inlineData;
 if(!image||!["image/png","image/jpeg","image/webp"].includes(image.mimeType)||typeof image.data!=="string"||image.data.length>28*1024*1024)return NextResponse.json({error:"The provider did not return a usable image. Try a different prompt."},{status:502});
 const bytes=Buffer.from(image.data,"base64");if(!bytes.length)return NextResponse.json({error:"The provider returned an empty image."},{status:502});const asset=await saveStudioAsset(data.user.id,bytes,image.mimeType,"AI-image","gemini",{prompt,aspectRatio});return new Response(bytes,{headers:{"X-Veelox-Asset-Id":asset.id,"Content-Type":image.mimeType,"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"}});
 }catch(error){const timeout=error instanceof Error&&["TimeoutError","AbortError"].includes(error.name);return NextResponse.json({error:timeout?"Image generation timed out. Try again.":"Image generation failed. Please retry."},{status:timeout?504:502});}finally{release?.();}}

export const POST = withSafeResponse(withBoundedRequest(postHandler));
