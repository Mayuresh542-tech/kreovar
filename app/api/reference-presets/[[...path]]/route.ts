import {NextRequest,NextResponse} from 'next/server';
import {getAuthenticatedUserId,getAccessToken,getAdminClient} from '@/app/lib/server/adminAuth';
import {getStudioAsset} from '@/app/lib/server/assetStore';
import {STUDIO_BUCKET} from '@/app/lib/server/assetPolicy';
import {referenceStore,mutate} from '@/app/lib/server/referencePresets/store';
import {createPreset,analyzePreset} from '@/app/lib/server/referencePresets/registry';
import {createReferenceJob,cancelJob,claimJob,completeRender,compositionHash,failStep} from '@/app/lib/server/referencePresets/jobs';
import {advanceReferenceJob} from '@/app/lib/server/referencePresets/execute';
import {budgetStatus} from '@/app/lib/server/referencePresets/provider';
import {uuid} from '@/app/lib/referencePresets/validation';
import type {ReferenceJob,ReferencePreset} from '@/app/lib/referencePresets/model';
export const runtime='nodejs';export const dynamic='force-dynamic';export const maxDuration=300;
type Context={params:Promise<{path?:string[]}>};
const json=(value:unknown,status=200)=>NextResponse.json(value,{status,headers:{'Cache-Control':'private, no-store'}});
async function handle(req:NextRequest,context:Context){
 if(process.env.REFERENCE_PRESETS_ENABLED!=='true')return json({error:'Reference presets are not enabled.'},404);
 const owner=await getAuthenticatedUserId(req),token=getAccessToken(req);if(!owner||!token)return json({error:'Sign in to use reference presets.'},401);
 const signal=AbortSignal.any([req.signal,AbortSignal.timeout(180000)]);
 const store=referenceStore(),parts=(await context.params).path||[],method=req.method;
 const readJob=async(id:string)=>{const job=(await store.get<ReferenceJob>(owner,'job',uuid(id)))?.value;if(!job)throw Error('Preset job unavailable.');return job;};
 const jobResponse=async(job:ReferenceJob)=>{const usage=await budgetStatus({store,owner,budgetKey:job.id,scope:'production',limit:job.tokenLimit,signal});const {frameSamples,...safe}=job;void frameSamples;return {job:safe,usage:{limit:usage.limit,used:usage.used,reserved:usage.reserved,estimatedCost:usage.estimatedCost,pricingSource:usage.pricingSource},compositionHash:compositionHash(job.project)};};
 try{
  if(method==='GET'&&!parts.length)return json({presets:(await store.list<ReferencePreset>(owner,'preset')).sort((a,b)=>a.name.localeCompare(b.name)),storage:process.env.NODE_ENV==='development'&&process.env.REFERENCE_PRESET_LOCAL_STORE==='true'?'development':'database'});
  if(method==='GET'&&parts[0]==='jobs'&&parts.length===1)return json({jobs:(await store.list<ReferenceJob>(owner,'job')).sort((a,b)=>b.createdAt.localeCompare(a.createdAt)).slice(0,20).map(j=>({id:j.id,presetId:j.presetId,projectId:j.projectId,status:j.status,title:j.project.title,createdAt:j.createdAt}))});
  if(method==='GET'&&parts[0]==='jobs'&&parts.length===2)return json(await jobResponse(await readJob(parts[1])));
  if(method==='GET'&&parts[0]==='presets'&&parts[2]==='media'){
   const preset=(await store.get<ReferencePreset>(owner,'preset',uuid(parts[1])))?.value;if(!preset)return json({error:'Reference unavailable.'},404);const id=req.nextUrl.searchParams.get('kind')==='thumbnail'?preset.thumbnailAssetId:preset.referenceAssetId;if(!id)return json({error:'Preview is not available yet.'},404);
   const asset=await getStudioAsset(owner,id);if(!asset)return json({error:'Reference media unavailable.'},404);const signed=await getAdminClient().storage.from(STUDIO_BUCKET).createSignedUrl(asset.storage_path,120);if(signed.error||!signed.data?.signedUrl)throw Error('Reference preview could not be loaded.');return json({url:signed.data.signedUrl});
  }
  if(method!=='POST')return json({error:'Unknown reference operation.'},404);
  if(Number(req.headers.get('content-length'))>65536)return json({error:'Reference request is too large.'},413);
  const reader=req.body?.getReader(),chunks:Uint8Array[]=[];let size=0;if(reader)while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>65536){await reader.cancel();return json({error:'Reference request is too large.'},413);}chunks.push(value);}const body=JSON.parse(Buffer.concat(chunks).toString('utf8')||'{}');if(!body||typeof body!=='object'||Array.isArray(body))return json({error:'Invalid reference request.'},400);
  if(parts[0]==='presets'&&parts.length===1)return json({preset:await createPreset(store,owner,body,signal)});
  if(parts[0]==='presets'&&parts[2]==='analyze')return json(await analyzePreset(store,owner,uuid(parts[1]),token,signal,body.force===true));
  if(parts[0]==='jobs'&&parts.length===1)return json(await jobResponse(await createReferenceJob(store,owner,body)));
  if(parts[0]==='jobs'&&parts[2]==='advance')return json(await jobResponse(await advanceReferenceJob(store,owner,uuid(parts[1]),token,signal)));
  if(parts[0]==='jobs'&&parts[2]==='cancel')return json(await jobResponse(await cancelJob(store,owner,uuid(parts[1]))));
  if(parts[0]==='jobs'&&parts[2]==='render'&&parts[3]==='start'){const job=await claimJob(store,owner,uuid(parts[1]),true);return json(await jobResponse(job));}
  if(parts[0]==='jobs'&&parts[2]==='render'&&parts[3]==='progress'){
   if(typeof body.progress!=='number'||!Number.isFinite(body.progress)||body.progress<0||body.progress>99)throw Error('Invalid render progress.');
   const job=await mutate<ReferenceJob>(store,owner,'job',uuid(parts[1]),j=>{if(!j||j.status!=='running'||j.lease!==body.lease||j.stages[j.cursor]?.id!=='render')throw Error('The render was stopped.');return {...j,updatedAt:new Date().toISOString(),renderProgress:body.progress,leaseUntil:Date.now()+240000};});return json({progress:job.renderProgress});
  }
  if(parts[0]==='jobs'&&parts[2]==='render'&&parts[3]==='fail'){const claimed=await readJob(parts[1]);if(claimed.lease!==body.lease||claimed.stages[claimed.cursor]?.id!=='render')throw Error('The render was stopped.');return json(await jobResponse(await failStep(store,claimed,Error(typeof body.error==='string'?body.error.slice(0,500):'Video rendering failed. Saved stages are preserved.'))));}
  if(parts[0]==='jobs'&&parts[2]==='render'&&parts[3]==='complete')return json(await jobResponse(await completeRender(store,owner,uuid(parts[1]),body,signal)));
  return json({error:'Unknown reference operation.'},404);
 }catch(error){return json({error:error instanceof Error?error.message:'The reference step could not complete. Saved edits are preserved.'},409);}
}
async function safeHandle(req:NextRequest,context:Context){try{return await handle(req,context);}catch{return json({error:'The preset authentication or persistence service is temporarily unavailable. Saved edits are preserved.'},503);}}
export const GET=safeHandle;export const POST=safeHandle;
