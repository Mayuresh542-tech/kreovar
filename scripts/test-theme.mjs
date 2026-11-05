import assert from 'node:assert/strict';
import {test} from 'node:test';
import fs from 'node:fs';import vm from 'node:vm';import {createRequire} from 'node:module';
const require=createRequire(process.cwd()+'/package.json'),ts=require('typescript');
function fixture(saved,blocked=false){
 const root={dataset:{},style:{}},events=new EventTarget(),values=new Map(saved===undefined?[]:[['kreovar-theme',saved]]);
 const window={addEventListener:events.addEventListener.bind(events),removeEventListener:events.removeEventListener.bind(events),dispatchEvent:events.dispatchEvent.bind(events),localStorage:{getItem:k=>{if(blocked)throw Error('blocked');return values.get(k)??null;},setItem:(k,v)=>{if(blocked)throw Error('blocked');values.set(k,v);}}};
 const context={exports:{},window,document:{documentElement:root},Event};
 vm.runInNewContext(ts.transpileModule(fs.readFileSync('app/lib/theme.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,context);
 return {...context,root,values,api:context.exports};
}
test('bootstrap restores valid preference before hydration and safely defaults to light',()=>{
 for(const [saved,want] of [[undefined,'light'],['dark','dark'],['light','light'],['invalid','light']]){const f=fixture(saved);vm.runInNewContext(f.api.THEME_BOOTSTRAP,f);assert.equal(f.root.dataset.theme,want);assert.equal(f.root.style.colorScheme,want);}
 const f=fixture('dark',true);vm.runInNewContext(f.api.THEME_BOOTSTRAP,f);assert.equal(f.root.dataset.theme,'light');
});
test('switching themes updates current UI, persists preference and notifies subscribers',()=>{
 const f=fixture(),changes=[];const stop=f.api.subscribeTheme(()=>changes.push(f.api.getTheme()));
 f.api.setTheme('dark');assert.equal(f.api.getTheme(),'dark');assert.equal(f.values.get('kreovar-theme'),'dark');
 f.api.setTheme('light');assert.equal(f.root.style.colorScheme,'light');assert.deepEqual(changes,['dark','light']);stop();f.api.setTheme('dark');assert.equal(changes.length,2);
});
test('blocked persistence does not prevent switching the current page',()=>{const f=fixture(undefined,true);assert.doesNotThrow(()=>f.api.setTheme('dark'));assert.equal(f.api.getTheme(),'dark');});
test('cross-tab preference updates stay in sync and invalid/cleared values restore light',()=>{
 const f=fixture();let count=0;const stop=f.api.subscribeTheme(()=>count++);
 for(const [value,want] of [['dark','dark'],['bad','light'],[null,'light']]){const event=new Event('storage');Object.assign(event,{key:'kreovar-theme',newValue:value});f.window.dispatchEvent(event);assert.equal(f.api.getTheme(),want);}
 assert.equal(count,3);stop();
});
