import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const require=createRequire(root+'/package.json');const ts=require('typescript');
function handler(user,records=[],assets=[]){
 const calls=[];const db={from(table){let query={};for(const method of ['select','eq','order','range','in'])query[method]=(...args)=>{calls.push([table,method,...args]);return query;};query.then=(resolve)=>Promise.resolve({data:table==='voice_generations'?records:assets,error:null}).then(resolve);return query;}};
 const mocks={'next/server':{NextResponse:{json:(body,options={})=>({body,status:options.status||200})}},'@/app/lib/server/adminAuth':{getAdminClient:()=>db,getAuthenticatedUserId:async()=>user},'@/app/lib/server/safeResponse':{withSafeResponse:fn=>fn},'@/app/lib/server/voiceFile':{voiceFileAsset:()=>null},'@/app/lib/server/assetStore':{assetView:row=>({id:row.id,url:'/api/assets/'+row.id+'/file'})}};
 const legacyExports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(root+'/app/lib/media/legacyStorage.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{exports:legacyExports,URL,process:{env:{NEXT_PUBLIC_SUPABASE_URL:'https://project.supabase.co'}}});mocks['@/app/lib/media/legacyStorage']=legacyExports;
 const code=ts.transpileModule(fs.readFileSync(root+'/app/api/voice/history/route.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
 const context={exports:{},require:name=>{assert.ok(mocks[name],name);return mocks[name];}};vm.runInNewContext(code,context);return {get:context.exports.GET,calls};
}
const request=offset=>({nextUrl:{searchParams:new URLSearchParams({offset:String(offset)})}});
test('history requires sign-in before any database access',async()=>{const {get,calls}=handler(null);assert.equal((await get(request(0))).status,401);assert.equal(calls.length,0);});
test('history rejects invalid pagination',async()=>{for(const value of [-1,1.5,10001,'bad']){const {get,calls}=handler('owner');assert.equal((await get(request(value))).status,400);assert.equal(calls.length,0);}});
test('history reads completed generations and ready files for the same owner',async()=>{const {get,calls}=handler('owner',[{id:'generation',audio_url:'/api/assets/abcd-1234/file'}],[{id:'abcd-1234'}]);const result=await get(request(20));assert.equal(result.body.generations[0].asset.id,'abcd-1234');for(const table of ['voice_generations','studio_assets'])assert.ok(calls.some(call=>call[0]===table&&call[1]==='eq'&&call[2]==='user_id'&&call[3]==='owner'));assert.ok(calls.some(call=>call[1]==='range'&&call[2]===20&&call[3]===39));});
test('legacy or missing files remain in history without exposing arbitrary media URLs',async()=>{const {get}=handler('owner',[{id:'old',audio_url:'https://example.com/old.mp3'}]);const result=await get(request(0));assert.equal(result.body.generations[0].asset,null);assert.equal(result.body.nextOffset,null);});
