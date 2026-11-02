import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {test} from 'node:test';
const root=process.cwd(),require=createRequire(path.join(root,'package.json')),ts=require('typescript'),cache=new Map();
function load(relative){let file=path.resolve(root,relative);if(!path.extname(file))file+='.ts';if(cache.has(file))return cache.get(file).exports;const loaded={exports:{}};cache.set(file,loaded);if(file.endsWith('.json')){loaded.exports=JSON.parse(fs.readFileSync(file,'utf8'));return loaded.exports;}const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;new vm.Script('(function(require,module,exports){'+code+'\n})',{filename:file}).runInThisContext()(name=>name.startsWith('.')?load(path.relative(root,path.resolve(path.dirname(file),name))):require(name),loaded,loaded.exports);return loaded.exports;}
test('FAQ schema contains the exact published answers and links to one real product identity',()=>{
 const {faqEntries}=load('app/lib/productAnswers'),{faqSchema,homeSchema,featureSchema}=load('app/lib/publicSchema'),{FEATURE_PAGES}=load('app/lib/featurePages'),schema=faqSchema(),faq=schema['@graph'].find(n=>n['@type']==='FAQPage'),entries=faqEntries();
 assert.ok(entries.length>=12);assert.equal(new Set(entries.map(e=>e.id)).size,entries.length);assert.deepEqual(faq.mainEntity.map(q=>[q.name,q.acceptedAnswer.text]),entries.map(e=>[e.q,e.a]));assert.equal(faq.url,'https://kreovar.online/faq');
 for(const graph of [schema,homeSchema(),...FEATURE_PAGES.map(featureSchema)]){const app=graph['@graph'].find(n=>n['@type']==='WebApplication');assert.equal(app['@id'],'https://kreovar.online/#software');assert.equal(app.publisher['@id'],'https://kreovar.online/#organization');assert.ok(graph['@graph'].some(n=>n['@id']===app.publisher['@id']));assert.ok(!JSON.stringify(graph).match(/aggregateRating|reviewCount|foundingDate|priceValidUntil/));}
});
test('public plan answers use the same configured prices and state allowances rather than unlimited AI',()=>{
 const {COMMON_QUESTIONS}=load('app/lib/productAnswers'),{getPlan}=load('app/config/plans'),answer=COMMON_QUESTIONS.find(q=>q.id==='plans-and-pricing').a,pro=getPlan('pro');assert.ok(answer.includes(pro.displayPrice));assert.ok(answer.includes(pro.yearlyDisplayPrice));assert.match(answer,/USD/);assert.match(answer,/allowance|limit/i);assert.match(answer,/monthly/i);
});
test('editor explanations describe staged undo and sampled vision without obsolete one-call guarantees',()=>{
 const {PRODUCT_ANSWERS}=load('app/lib/productAnswers'),answer=PRODUCT_ANSWERS['/ai-video-editor'];assert.doesNotMatch(answer.limits,/one model request|up to two|visual scene understanding.*not connected/i);assert.match(answer.limits,/sampled|samples/i);assert.match(answer.answer,/stage|step/i);assert.match(answer.answer,/undo/i);
});
test('serialized structured data cannot break out of its script element',()=>{
 const {serializeSchema}=load('app/lib/publicSchema'),input={text:'</script><script>alert(1)</script>\u2028\u2029&'},serialized=serializeSchema(input);assert.ok(!serialized.includes('<'));assert.ok(!serialized.includes('\u2028'));assert.ok(!serialized.includes('\u2029'));assert.deepEqual(JSON.parse(serialized),input);
});
test('FAQ is public and discoverable while llms guide contains canonical public pages only',async()=>{
 const seo=load('app/lib/seo'),{llmsGuide}=load('app/lib/publicSchema');assert.equal(seo.publicMetadata('/faq').alternates.canonical,'https://kreovar.online/faq');assert.ok(load('app/sitemap').default().some(u=>u.url==='https://kreovar.online/faq'));const guide=llmsGuide(),urls=[...guide.matchAll(/\]\((https:\/\/[^)]+)\)/g)].map(m=>m[1]);assert.ok(urls.length>=8);for(const url of urls){const parsed=new URL(url);assert.equal(parsed.origin,seo.SITE_URL);assert.equal(parsed.search,'');assert.ok(seo.PUBLIC_PAGES.some(p=>p.path===parsed.pathname));assert.equal(seo.isPrivateRoute(parsed.pathname),false);}assert.ok(!guide.match(/api\/|projectId=|localhost|127\.0\.0\.1|sk-/));const response=load('app/llms.txt/route').GET();assert.equal(response.status,200);assert.match(response.headers.get('content-type'),/text\/plain/);assert.equal(await response.text(),guide);
});
test('crawler policy keeps API exclusions and private pages noindex',()=>{
 const seo=load('app/lib/seo'),robots=load('app/robots').default();assert.equal(robots.rules.allow,'/');assert.equal(robots.rules.disallow,'/api/');for(const title of Object.values(seo.PRIVATE_PAGES))assert.deepEqual(seo.privateMetadata(title).robots,{index:false,follow:false});
});

