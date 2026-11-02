import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {createRequire} from 'node:module';
const root=process.cwd(),require=createRequire(root+'/package.json'),ts=require('typescript'),{NextRequest}=require('next/server');
const id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',other='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const user={id,email:'disposable@example.invalid',app_metadata:{}};
function load(mocks,extra={}){
 const context=vm.createContext({URL,Headers,Response,Buffer,Date,Map,Set,Error,console,process:{env:{NEXT_PUBLIC_SUPABASE_URL:'https://test.supabase.co',NEXT_PUBLIC_SUPABASE_ANON_KEY:'public',WHOP_ACCOUNT_ID:'biz_test'}},...extra});
 const code=ts.transpileModule(fs.readFileSync(path.join(root,'app/lib/server/accountDeletion.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const module={exports:{}};new vm.Script(`(function(require,module,exports){${code}\n})`).runInContext(context)(s=>mocks[s]||require(s),module,module.exports);return module.exports;
}
function fixture(options={}){
 const calls=[],queryErrors=options.queryErrors||{},pages=options.pages?[...options.pages]:[[{bucket_id:'studio-assets',name:id+'/voice/file.mp3',owner_id:null}],[]];
 function query(table){const q={select(){return q;},eq(column,value){calls.push(['scope',table,column,value]);return q;},in(){return q;},gt(){return q;},limit:async()=>({data:options.pending?[{id:'pending'}]:[],error:queryErrors[table]}),maybeSingle:async()=>({data:table==='subscriptions'?options.sub||null:null,error:queryErrors[table]}),delete(){calls.push(['delete',table]);return q;},then(resolve){resolve({error:queryErrors[table]});}};return q;}
 const db={from:query,rpc:async()=>{calls.push(['files']);return {data:pages.length?pages.shift():[],error:options.fileLookupError?{}:null};},storage:{from:bucket=>({remove:async paths=>{calls.push(['remove',bucket,[...paths]]);return {error:options.storageError?{}:null};}})},auth:{admin:{getUserById:async()=>({data:{user},error:null}),updateUserById:async(uid,values)=>{calls.push(['lock',uid,values.app_metadata.account_deletion_pending]);return{error:options.lockError?{}:null};},signOut:async()=>{calls.push(['revoke']);return{error:options.revokeError?{}:null};},deleteUser:async(...args)=>{calls.push(['auth-delete',...args]);return{error:options.authError?{}:null};}}}};
 const api=load({
  '@supabase/supabase-js':{createClient:()=>({auth:{signInWithPassword:async()=>{calls.push(['password']);return{data:{user:options.badPassword?null:user,session:options.badPassword?null:{}},error:options.badPassword?{}:null};},signOut:async()=>{calls.push(['dispose-verification']);return {error:null};}}})},
  './adminAuth':{getAuthenticatedUser:async()=>options.signedOut?null:options.user||user,getAccessToken:()=>options.token||'token',getAdminClient:()=>db},
  './requestSecurity':{isSafeMutation:req=>req.headers.get('origin')==='https://kreovar.online'},
  './whopCheckout':{whopClient:()=>({memberships:{retrieve:async()=>{calls.push(['billing']);if(options.billingError)throw Error('Private provider detail');return options.membership||{account:{id:'biz_test'},plan_id:'plan_test',status:'active',cancel_at_period_end:false};}}}),whopCycle:plan=>plan==='plan_test'?'monthly':null},
 });
 const request=(body={confirmation:'DELETE',password:'test-only-password'},origin='https://kreovar.online')=>new NextRequest('https://kreovar.online/api/account',{method:'DELETE',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify(body)});
 return {api,db,calls,request};
}
test('account deletion rejects signed-out and cross-site requests without side effects',async()=>{
 for(const opts of [{signedOut:true},{}]){const f=fixture(opts);const r=await f.api.deleteOwnAccount(f.request(undefined,opts.signedOut?'https://kreovar.online':'https://evil.test'));assert.equal(r.status,opts.signedOut?401:403);assert.deepEqual(f.calls,[]);}
});
test('account deletion requires explicit confirmation and refuses client-supplied user identity',async()=>{
 for(const body of [{confirmation:'delete',password:'x'},{confirmation:'DELETE',password:''},{confirmation:'DELETE',password:'x',userId:other}]){const f=fixture();assert.equal((await f.api.deleteOwnAccount(f.request(body))).status,400);assert.deepEqual(f.calls,[]);}
});
test('incorrect password cannot reach billing, storage or deletion',async()=>{const f=fixture({badPassword:true});assert.equal((await f.api.deleteOwnAccount(f.request())).status,403);assert.deepEqual(f.calls,[['password']]);});
test('enrolled MFA cannot be bypassed using an aal1 session and a password',async()=>{const f=fixture({user:{...user,factors:[{status:'verified'}]},token:'h.'+Buffer.from(JSON.stringify({aal:'aal1'})).toString('base64url')+'.s'});assert.equal((await f.api.deleteOwnAccount(f.request())).status,403);assert.deepEqual(f.calls,[]);});
test('renewing Whop subscriptions block deletion and preserve data',async()=>{const f=fixture({sub:{source:'whop',plan:'pro',status:'active',external_subscription_id:'mem_test'}});assert.equal((await f.api.deleteOwnAccount(f.request())).status,409);assert.ok(f.calls.some(c=>c[0]==='billing'));assert.equal(f.calls.some(c=>['remove','lock','delete'].includes(c[0])),false);});
test('billing outages or foreign memberships cannot permit deletion',async()=>{for(const options of [{billingError:true},{membership:{account:{id:'foreign'},plan_id:'plan_test',status:'canceled'}}]){const f=fixture({...options,sub:{source:'whop',external_subscription_id:'mem_test'}});assert.equal((await f.api.deleteOwnAccount(f.request())).status,503);assert.equal(f.calls.some(c=>c[0]==='lock'),false);}});
test('canceled-at-period-end membership permits account cleanup without canceling or refunding payments',async()=>{const f=fixture({sub:{source:'whop',external_subscription_id:'mem_test'},membership:{account:{id:'biz_test'},plan_id:'plan_test',status:'active',cancel_at_period_end:true}});assert.equal((await f.api.deleteOwnAccount(f.request())).status,200);assert.ok(f.calls.some(c=>c[0]==='auth-delete'));});
test('unfinished generation and storage lookup outages block cleanup before revocation',async()=>{for(const options of [{pending:true},{fileLookupError:true}]){const f=fixture(options);assert.equal((await f.api.deleteOwnAccount(f.request())).status,options.pending?409:503);assert.equal(f.calls.some(c=>c[0]==='lock'),false);}});
test('cleanup locks account and revokes sessions before files, and deletes Auth only after cleanup',async()=>{const f=fixture();await f.api.removeAccountData(f.db,id,'token');assert.equal(f.calls[0][0],'lock');assert.equal(f.calls[1][0],'revoke');assert.ok(f.calls.findIndex(c=>c[0]==='remove')<f.calls.findIndex(c=>c[0]==='delete'));assert.deepEqual(f.calls.at(-1),['auth-delete',id,false]);for(const c of f.calls.filter(c=>c[0]==='scope'))assert.equal(c[3],id);});
test('foreign storage paths are rejected before any file or Auth removal',async()=>{const f=fixture({pages:[[{bucket_id:'studio-assets',name:other+'/file.mp4',owner_id:other}]]});await assert.rejects(f.api.removeAccountData(f.db,id,'token'),/ownership/);assert.equal(f.calls.some(c=>c[0]==='remove'||c[0]==='auth-delete'),false);});
test('storage and session revocation failures never delete the Auth user',async()=>{for(const options of [{storageError:true},{revokeError:true},{lockError:true}]){const f=fixture(options);await assert.rejects(f.api.removeAccountData(f.db,id,'token'));assert.equal(f.calls.some(c=>c[0]==='auth-delete'),false);}});
test('failed legacy row cleanup keeps Auth intact and permits a scoped retry',async()=>{const f=fixture({queryErrors:{profiles:{}}});await assert.rejects(f.api.removeAccountData(f.db,id,'token'));assert.equal(f.calls.some(c=>c[0]==='auth-delete'),false);});
test('retry with no remaining files still removes legacy rows and Auth',async()=>{const f=fixture({pages:[[]]});await f.api.removeAccountData(f.db,id,'token');assert.deepEqual(f.calls.at(-1),['auth-delete',id,false]);assert.equal(f.calls.filter(c=>c[0]==='delete').length,4);});
test('legacy user-prefixed videos and storage-owner records are cleaned only in approved buckets',async()=>{const f=fixture({pages:[[{bucket_id:'videos',name:id+'_clip.mp4',owner_id:null},{bucket_id:'voiceovers',name:'legacy.mp3',owner_id:id}],[]]});await f.api.removeAccountData(f.db,id,'token');assert.equal(f.calls.filter(c=>c[0]==='remove').length,2);});
test('Auth deletion failure is an error, never a false success',async()=>{const f=fixture({authError:true});assert.equal((await f.api.deleteOwnAccount(f.request())).status,503);});
test('proxy blocks new work for pending deletion while permitting the deletion retry',async()=>{
 const text=fs.readFileSync(path.join(root,'proxy.ts'),'utf8');assert.match(text,/user\.app_metadata\?\.account_deletion_pending && path !== "\/api\/account"/);
 const sql=fs.readFileSync(path.join(root,'supabase/migrations/20261020104748_account_self_deletion_storage.sql'),'utf8');assert.match(sql,/security invoker/);assert.match(sql,/from public,anon,authenticated/);assert.match(sql,/to service_role/);
});

test('device cleanup removes only the deleted user namespace and preserves other accounts and guest drafts',async()=>{
 const stores={media:new Map([[id+':p:clip','owned'],[other+':q:clip','foreign'],['guest:p:clip','guest']]),projects:new Map([[id+':p',{}],[id+':p:previous',{}],[other+':q',{}],['guest:p',{}]])};
 const db={transaction(){let finished=0;const tx={objectStore(name){const store=stores[name],keys=[...store.keys()];let at=0;return{openCursor(){const request={};function next(){queueMicrotask(()=>{if(at===keys.length){request.result=null;request.onsuccess();if(++finished===2)queueMicrotask(()=>tx.oncomplete());return;}const key=keys[at++];request.result={key,delete:()=>store.delete(key),continue:next};request.onsuccess();});}next();return request;}};}};return tx;}};
 const context=vm.createContext({Map,Set,Promise,Error,queueMicrotask,indexedDB:{open(){const request={result:db};queueMicrotask(()=>request.onsuccess());return request;}}});
 const code=ts.transpileModule(fs.readFileSync(path.join(root,'app/lib/editor/cache.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const module={exports:{}};new vm.Script(`(function(module,exports){${code}\n})`).runInContext(context)(module,module.exports);
 assert.deepEqual([...await module.exports.clearAccountCache(id)],['p']);
 for(const store of Object.values(stores)){assert.ok([...store.keys()].every(k=>!k.startsWith(id+':')));assert.ok([...store.keys()].some(k=>k.startsWith(other+':')));assert.ok([...store.keys()].some(k=>k.startsWith('guest:')));}
});

