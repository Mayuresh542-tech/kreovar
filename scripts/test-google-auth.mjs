import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),require=createRequire(root+'/package.json'),ts=require('typescript');
function fixture({enabled=true,status=200,oauthError=null,networkError=false}={}){
  const calls=[];
  const context=vm.createContext({URL,URLSearchParams,Error,AbortSignal,process:{env:{NEXT_PUBLIC_SUPABASE_URL:'https://project.supabase.co',NEXT_PUBLIC_SUPABASE_ANON_KEY:'public-test-key'}},fetch:async(url,options)=>{
    calls.push({kind:'settings',url,options});if(networkError)throw new Error('Offline');return {ok:status===200,json:async()=>({external:{google:enabled}})};
  }});
  const supabase={auth:{signInWithOAuth:async(input)=>{calls.push({kind:'oauth',input});return{error:oauthError};}}},exports={};
  const source=ts.transpileModule(fs.readFileSync(root+'/app/lib/auth/googleAuth.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  new vm.Script(`(function(require,module,exports){${source}\n})`).runInContext(context)(()=>({supabase}),{exports},exports);
  return{auth:exports,calls};
}
test('Google redirects return to the current origin and fixed callback route',()=>{
 const {auth}=fixture();assert.equal(auth.googleCallbackUrl('https://veelox.example/ignored?next=https://evil.test'),'https://veelox.example/auth/callback');assert.equal(auth.googleCallbackUrl('http://localhost:3087'),'http://localhost:3087/auth/callback');
});
test('insecure nonlocal origins and unsupported protocols are refused',()=>{
 const {auth}=fixture();for(const origin of ['http://evil.test','javascript:alert(1)','file:///tmp'])assert.throws(()=>auth.googleCallbackUrl(origin));
});
test('enabled provider starts Google using the existing SDK with account selection',async()=>{
 const f=fixture();await f.auth.startGoogleSignIn('https://veelox.example');const call=f.calls.find(c=>c.kind==='oauth');assert.equal(call.input.provider,'google');assert.equal(call.input.options.redirectTo,'https://veelox.example/auth/callback');assert.equal(call.input.options.queryParams.prompt,'select_account');assert.equal(call.input.options.scopes,undefined);assert.equal(f.calls[0].options.cache,'no-store');
});
test('disabled provider fails clearly before any OAuth navigation',async()=>{
 const f=fixture({enabled:false});await assert.rejects(f.auth.startGoogleSignIn('http://localhost:3087'),/not available yet/);assert.equal(f.calls.some(c=>c.kind==='oauth'),false);
});
test('settings failures and offline errors do not start Google auth',async()=>{
 for(const options of [{status:503},{networkError:true}]){const f=fixture(options);await assert.rejects(f.auth.startGoogleSignIn('https://veelox.example'));assert.equal(f.calls.some(c=>c.kind==='oauth'),false);}
});
test('OAuth SDK error is safe for display and retry',async()=>{
 const f=fixture({oauthError:{message:'private provider internals'}});await assert.rejects(f.auth.startGoogleSignIn('https://veelox.example'),/Could not start Google sign-in/);
});
test('provider cancellation is understood in query and implicit-flow fragment',()=>{
 const {auth}=fixture();for(const suffix of ['?error=access_denied','#error=access_denied'])assert.match(auth.googleReturnError('https://veelox.example/auth/callback'+suffix),/cancelled/);
});
test('callback errors never reflect raw descriptions or tokens',()=>{
 const {auth}=fixture();assert.equal(auth.googleReturnError('https://veelox.example/auth/callback#access_token=private'),undefined);const error=auth.googleReturnError('https://veelox.example/auth/callback?error_description=private-token');assert.match(error,/could not be completed/);assert.equal(error.includes('private-token'),false);
});
