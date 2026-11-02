import { withSafeResponse } from "@/app/lib/server/safeResponse";
import { withBoundedRequest } from "@/app/lib/server/boundedRequest";
import { NextRequest, NextResponse } from "next/server";
import { getAdminClient } from "@/app/lib/server/adminAuth";
import { EDITOR_BUCKET, MAX_PROJECT_MEDIA, editorMediaPath, ownedEditorMediaPath, validateEditorFile } from "@/app/lib/server/editorMediaPolicy";

export const dynamic = "force-dynamic";
export const maxDuration = 30;
const json = (data: unknown, status=200) => NextResponse.json(data,{status,headers:{"Cache-Control":"no-store"}});

async function authorize(req: NextRequest, projectId: string) {
  const token=req.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  if(!token)return {error:json({error:"Sign in to sync project media."},401)};
  const db=getAdminClient();
  const {data,error}=await db.auth.getUser(token);
  if(error||!data.user)return {error:json({error:"Your session expired. Sign in again."},401)};
  const result=await db.from("projects").select("id").eq("id",projectId).eq("user_id",data.user.id).maybeSingle();
  if(result.error)return {error:json({error:"Project access could not be verified. Please retry."},503)};
  if(!result.data)return {error:json({error:"Project not found or you do not own it."},403)};
  const bucket=await db.storage.getBucket(EDITOR_BUCKET);
  if(bucket.error||!bucket.data||bucket.data.public)return {error:json({error:"Private media storage is unavailable."},503)};
  return {db,userId:data.user.id};
}

async function postHandler(req: NextRequest) {
  try {
    if(!req.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i))return json({error:"Sign in to sync project media."},401);
    const reader=req.body?.getReader();if(!reader)return json({error:"Missing media request."},400);
    let bytes=0;const chunks:Uint8Array[]=[];
    while(true){const {done,value}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>4096){await reader.cancel();return json({error:"Media request is too large."},413);}chunks.push(value);}
    const text=Buffer.concat(chunks).toString("utf8");
    let body;
    try{body=JSON.parse(text);validateEditorFile(body.size,body.mime);editorMediaPath("check",body.projectId,body.assetId,body.version,body.mime);}catch{return json({error:"Invalid media upload request. Use supported files up to 50 MB."},400);}
    const access=await authorize(req,body.projectId);if(access.error)return access.error;
    const path=editorMediaPath(access.userId!,body.projectId,body.assetId,body.version,body.mime);
    const storage=access.db!.storage.from(EDITOR_BUCKET);
    const existing=await storage.info(path);
    if(existing.data){
      if(existing.data.size!==body.size || existing.data.contentType!==body.mime)return json({error:"Stored media size does not match the original."},409);
      return json({exists:true,path,bucket:EDITOR_BUCKET});
    }
    if(body.complete)return json({error:"Original upload was not confirmed. Please retry."},409);
    if(existing.error&&!['404','400'].includes(String(existing.error.statusCode)))return json({error:"Media storage could not be checked."},503);
    const files=await storage.list(`${access.userId}/${body.projectId}`,{limit:1000});
    if(files.error)return json({error:"Media storage could not be checked."},503);
    const storedBytes=(files.data||[]).reduce((total,file)=>total+(Number(file.metadata?.size)||0),0);
    if((files.data?.length||0)>=1000||storedBytes+body.size>MAX_PROJECT_MEDIA)return json({error:"This project reached its 500 MB cloud media limit. Keep larger originals on your device."},413);
    const signed=await storage.createSignedUploadUrl(path,{upsert:false});
    if(signed.error||!signed.data)return json({error:"Could not start original upload. Please retry."},503);
    return json({path,bucket:EDITOR_BUCKET,signedUrl:signed.data.signedUrl});
  }catch{return json({error:"Media sync is unavailable. Your originals remain on this device."},503);}
}

async function getHandler(req: NextRequest) {
  try {
    const projectId=req.nextUrl.searchParams.get("projectId")||"",path=req.nextUrl.searchParams.get("path");
    const access=await authorize(req,projectId);if(access.error)return access.error;
    if(!ownedEditorMediaPath(path,access.userId!,projectId))return json({error:"Invalid original media path."},403);
    const signed=await access.db!.storage.from(EDITOR_BUCKET).createSignedUrl(path,120);
    if(signed.error||!signed.data)return json({error:"Cloud original is missing. Relink it in Media."},404);
    return json({url:signed.data.signedUrl});
  }catch{return json({error:"Cloud original could not be loaded. Please retry or relink it."},503);}
}

export const POST = withSafeResponse(withBoundedRequest(postHandler));

export const GET = withSafeResponse(getHandler);
