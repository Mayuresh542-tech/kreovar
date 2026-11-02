import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';import vm from 'node:vm';import {createRequire} from 'node:module';import {test} from 'node:test';import assert from 'node:assert/strict';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),require=createRequire(root+'/package.json'),ts=require('typescript');
function fixture(route='/trends',reduced=false,nestedCard=false){
 const observed=[],animations=[],observers=[];
 class Node {constructor(parent=null,target=true){this.parentElement=parent;this.target=target;this.style={};this.dataset={};this.isConnected=true;this.children=[];if(parent)parent.children.push(this);}matches(selector){if(selector==='.grid > [class*="rounded"]')return !!this.gridChild;return selector==='dialog[open], [role="dialog"]'?false:this.target;}closest(){return null;}querySelector(){return null;}querySelectorAll(){return this.children.flatMap(child=>[child,...child.querySelectorAll()]);}getAnimations(){return [];}animate(frames,options){const animation={cancel(){}};animations.push({frames,options});return animation;}contains(node){return this.querySelectorAll().includes(node);}}
 const body=new Node(null,false),card=new Node(body),heading=new Node(card),form=new Node(body);
 heading.gridChild=nestedCard;
 const preference={matches:reduced,addEventListener(name,fn){this.listener=fn;},removeEventListener(){}};
 class Observer{constructor(callback){this.callback=callback;observers.push(this);}observe(node){observed.push(node);}unobserve(){}disconnect(){}}
 let cleanup;
 const context={exports:{},require:name=>({'react':{useEffect:effect=>{cleanup=effect();}},'next/navigation':{usePathname:()=>route},'next/dynamic':{default:()=>()=>null},'react/jsx-runtime':{jsx:()=>null}}[name]),window:{IntersectionObserver:Observer,MutationObserver:Observer,matchMedia:()=>preference},IntersectionObserver:Observer,MutationObserver:Observer,HTMLElement:Node,Element:Node,document:{body},getComputedStyle:()=>({opacity:'1'}),requestAnimationFrame:()=>1,cancelAnimationFrame(){}};
 const source=ts.transpileModule(fs.readFileSync(root+'/app/components/UiMotion.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;vm.runInNewContext(source,context);context.exports.default({children:null});return {observed,animations,observers,card,heading,form,cleanup,preference};
}
test('containers animate once without animating nested headings',()=>{const f=fixture();assert.ok(f.observed.includes(f.card));assert.ok(f.observed.includes(f.form));assert.ok(!f.observed.includes(f.heading));f.observers[0].callback([{isIntersecting:true,target:f.card}]);assert.equal(f.animations.length,1);assert.equal(f.animations[0].options.duration,420);assert.equal(f.animations[0].options.delay,0);f.cleanup();});
test('global animation observers do not attach to editor timelines',()=>{const f=fixture('/editor');assert.equal(f.observers.length,0);assert.equal(f.animations.length,0);});

test('sibling entries have bounded stagger delays',()=>{const f=fixture();f.observers[0].callback([{isIntersecting:true,target:f.form}]);assert.equal(f.animations[0].options.delay,35);f.cleanup();});
test('grid cards remain eligible inside animated sections',()=>{const f=fixture('/projects',false,true);assert.ok(f.observed.includes(f.heading));f.cleanup();});
test('reduced motion starts without animation and can be toggled back on',()=>{const f=fixture('/settings',true);assert.ok(!f.observed.includes(f.card));assert.equal(f.animations.length,0);f.preference.matches=false;f.preference.listener();assert.ok(f.observed.includes(f.card));f.observers[0].callback([{isIntersecting:true,target:f.card}]);assert.equal(f.animations.length,1);f.cleanup();});
