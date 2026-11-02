import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require=createRequire(path.join(root,'package.json')),ts=require('typescript');
const id='12345678-1234-4234-8234-123456789012',foreignId='12345678-1234-4234-8234-123456789013';
const row=(owner='alice',projectId=id)=>({id:projectId,user_id:owner,title:'Test',updated_at:'2026-10-08T00:00:00Z',revision:3});
function fixture({user='alice',local=[],cloud=[],quota=false,dbError,zeroWrite=false,denyDelete=false,throwQuery=false}={}) {
  let value=JSON.stringify(local);const events=[],calls=[],links=[];
  const storage={getItem:()=>value,setItem:(_key,v)=>{if(quota)throw new Error('Storage full');value=v;}};
  const supabase={auth:{getSession:async()=>({data:{session:user?{user:{id:user}}:null},error:null})},from:()=>{
    let action='select',payload,filters=[];
    const q={select(){return q;},eq(k,v){filters.push([k,v]);return q;},order(){return q;},maybeSingle(){return run(true);},single(){return run(true);},upsert(p){action='upsert';payload=p;return q;},delete(){action='delete';return q;},then(resolve,reject){return run(false).then(resolve,reject);}};
    async function run(single){
      calls.push({action,filters,payload});if(throwQuery)throw new Error('Offline');if(dbError)return{data:null,error:{message:dbError}};
      const matches=p=>filters.every(([k,v])=>p[k]===v);
      if(action==='upsert') {if(zeroWrite)return{data:null,error:null};cloud=cloud.filter(p=>p.id!==payload.id);cloud.push(payload);return{data:payload,error:null};}
      if(action==='delete'){if(!denyDelete)cloud=cloud.filter(p=>!matches(p));return{data:null,error:null};}
      const data=cloud.filter(matches);return{data:single?data[0]||null:data,error:null};
    }
    return q;
  }};
  const context=vm.createContext({Error,console:{warn(){},error(){}},localStorage:storage,window:{dispatchEvent:e=>events.push(e)},CustomEvent:class{constructor(type,init){this.type=type;this.detail=init.detail;}},crypto:globalThis.crypto});
  const exports={};const source=ts.transpileModule(fs.readFileSync(path.join(root,'app/lib/services/projectService.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  new vm.Script(`(function(require,module,exports){${source}\n})`).runInContext(context)(specifier=>specifier.includes("assets/client")?{linkAsset:async(...args)=>{links.push(args);}}:{supabase},{exports},exports);
  return {service:exports,local:()=>JSON.parse(value),cloud:()=>cloud,events,calls,links};
}
test('signed-in project list excludes other accounts on cloud success',async()=>{
  const f=fixture({local:[row(),row('bob',foreignId)],cloud:[row()]});assert.deepEqual(Array.from(await f.service.getProjects('alice'),p=>p.id),[id]);
});
test('offline project list still excludes other accounts',async()=>{
  const f=fixture({local:[row(),row('bob',foreignId)],throwQuery:true});assert.equal((await f.service.getProjects('alice')).length,1);
});
test('guest list excludes signed-in accounts',async()=>{
  const f=fixture({user:null,local:[row(),row(undefined,foreignId)]}); // Explicitly unowned legacy guest.
  const g=fixture({user:null,local:[row(),{...row(),id:foreignId,user_id:undefined}]});assert.deepEqual(Array.from(await g.service.getProjects(),p=>p.id),[foreignId]);assert.equal(f.calls.length,0);
});
test('foreign cached project cannot be reopened when RLS returns no row',async()=>{
  const f=fixture({local:[row('bob')]});assert.equal(await f.service.getProject(id),null);
});
test('signed-out getProject never queries authenticated cloud',async()=>{
  const f=fixture({user:null,local:[row()]});assert.equal(await f.service.getProject(id),null);assert.equal(f.calls.length,0);
});
test('new local save records ownership before serialization',async()=>{
  const f=fixture();const result=await f.service.saveProjectWithResult({id,title:'New'});assert.equal(result.persistedToDb,true);assert.equal(f.local()[0].user_id,'alice');
});
test('foreign cached ID rejects writes without replacing original',async()=>{
  const f=fixture({local:[row('bob')]});const result=await f.service.saveProjectWithResult({id,title:'Changed'});assert.equal(result.success,false);assert.equal(result.persistedLocally,false);assert.equal(f.local()[0].title,'Test');assert.equal(f.calls.some(c=>c.action==='upsert'),false);
});
test('storage quota cannot produce a false guest save success',async()=>{
  const f=fixture({user:null,quota:true});const result=await f.service.saveProjectWithResult({id,title:'New'});assert.equal(result.success,false);assert.equal(result.persistedLocally,false);assert.match(result.error,/Storage full/);assert.equal(f.events.length,0);
});
test('cloud can save when localStorage is full',async()=>{
  const f=fixture({quota:true});const result=await f.service.saveProjectWithResult({id,title:'New'});assert.equal(result.success,true);assert.equal(result.persistedToDb,true);assert.equal(result.persistedLocally,false);
});
test('cloud error keeps account-owned recovery and reports failure',async()=>{
  const f=fixture({dbError:'RLS denied'});const result=await f.service.saveProjectWithResult({id,title:'Offline'});assert.equal(result.success,false);assert.equal(result.persistedLocally,true);assert.equal(result.persistedToDb,false);assert.equal(result.error,'RLS denied');assert.equal(f.local()[0].user_id,'alice');
});
test('unconfirmed zero-row cloud write cannot show cloud saved',async()=>{
  const f=fixture({zeroWrite:true});const result=await f.service.saveProjectWithResult({id,title:'New'});assert.equal(result.persistedToDb,false);assert.match(result.error,/confirmed/);
});
test('timeline editor model, revisions and upstream assets survive save and reopen',async()=>{
  const f=fixture();const model={schemaVersion:1,clips:{text:{duration:4}},settings:{aspectRatio:'9:16'}};
  await f.service.saveProjectWithResult({id,title:'Edit',revision:8,timeline:{tracks:[],editorModel:model},broll_assets:[{id:'broll',url:'https://example.test/file.mp4'}]});
  const restored=await f.service.getProject(id);assert.equal(restored.revision,8);assert.equal(restored.timeline.editorModel.clips.text.duration,4);assert.equal(restored.broll_assets[0].id,'broll');
});
test('newer offline metadata stays visible beside stale cloud record',async()=>{
  const newer={...row(),title:'Offline edit',updated_at:'2026-10-08T01:00:00Z'};
  const f=fixture({local:[newer],cloud:[row()]});assert.equal((await f.service.getProjects('alice'))[0].title,'Offline edit');
});
test('failed cloud delete keeps recovery and throws',async()=>{
  const f=fixture({local:[row()],cloud:[row()],dbError:'Offline'});await assert.rejects(f.service.deleteProject(id),/Offline/);assert.equal(f.local().length,1);assert.equal(f.events.length,0);
});
test('RLS zero-row delete is verified before discarding recovery',async()=>{
  const f=fixture({local:[row()],cloud:[row()],denyDelete:true});await assert.rejects(f.service.deleteProject(id),/confirmed/);assert.equal(f.local().length,1);
});
test('confirmed own deletion clears cache and emits event',async()=>{
  const f=fixture({local:[row()],cloud:[row()]});assert.equal(await f.service.deleteProject(id),true);assert.equal(f.local().length,0);assert.equal(f.cloud().length,0);assert.equal(f.events[0].type,'veelox_project_deleted');
});
test('foreign cached project deletion is denied',async()=>{
  const f=fixture({local:[row('bob')]});await assert.rejects(f.service.deleteProject(id),/own/);assert.equal(f.local().length,1);assert.equal(f.calls.length,0);
});

test('device fallback is never identified as a confirmed cloud load',async()=>{
  const f=fixture({local:[row()],dbError:'Offline'});const loaded=await f.service.getProjectWithSource(id);assert.equal(loaded.source,'device');assert.equal(loaded.project.id,id);
});
test('successful cloud load identifies its confirmed source',async()=>{
  const f=fixture({cloud:[row()]});assert.equal((await f.service.getProjectWithSource(id)).source,'cloud');
});

test('both caption aliases link private SRT assets to the caption role and preserve timing',async()=>{
  for(const alias of ['caption','captions']){const f=fixture({cloud:[row()]});const saved=await f.service.addAssetToProject(id,alias,{id:'srt',libraryId:'owned-srt',segments:[{text:'Imported caption',start:1,end:2}]});assert.deepEqual(f.links[0],[id,'captions','owned-srt']);assert.equal(saved.captions[0].startTime,1);assert.equal(saved.captions[0].endTime,2);}
});

test('reusing a library original does not duplicate a project asset and the same ID can be linked to another owned project',async()=>{
 const f=fixture({cloud:[row(),row('alice',foreignId)]}),asset={id:'one-original',libraryId:'one-original',name:'Clip',url:'/api/assets/one-original/file'};
 await f.service.addAssetToProject(id,'raw_footage',asset);const same=await f.service.addAssetToProject(id,'raw_footage',asset);assert.equal(same.raw_footage.length,1);
 const another=await f.service.addAssetToProject(foreignId,'raw_footage',asset);assert.equal(another.raw_footage[0].libraryId,'one-original');assert.equal(same.raw_footage[0].libraryId,another.raw_footage[0].libraryId);
});
