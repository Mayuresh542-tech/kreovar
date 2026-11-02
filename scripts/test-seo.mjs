import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {test} from 'node:test';
const root=process.cwd(),require=createRequire(path.join(root,'package.json')),ts=require('typescript'),cache=new Map();
function load(relative){let file=path.resolve(root,relative);if(!path.extname(file))file+='.ts';if(cache.has(file))return cache.get(file).exports;const module={exports:{}};cache.set(file,module);if(file.endsWith(".json")){module.exports=JSON.parse(fs.readFileSync(file,"utf8"));return module.exports;}const source=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;new vm.Script(`(function(require,module,exports){${source}})`,{filename:file}).runInThisContext()(name=>name.startsWith('.')?load(path.relative(root,path.resolve(path.dirname(file),name))):require(name),module,module.exports);return module.exports;}
const seo={...load('app/lib/seo.ts'),...load('app/lib/brandSchema.ts')};
test('canonicals use only the approved HTTPS domain and exclude query parameters',()=>{
 for(const p of seo.PUBLIC_PAGES){const m=seo.publicMetadata(p.path);assert.equal(m.alternates.canonical,new URL(p.path,'https://kreovar.online').href);assert.deepEqual(m.robots,{index:true,follow:true});assert.equal(m.openGraph.url,m.alternates.canonical);assert.equal(m.twitter.card,'summary_large_image');assert.ok(m.description.length>40);}
 for(const bad of ['/editor','/pricing?cycle=yearly','//evil.example','https://evil.example'])assert.throws(()=>seo.publicMetadata(bad));
});
test('private metadata never advertises a public canonical or permits indexing',()=>{
 for(const [url,title] of Object.entries(seo.PRIVATE_PAGES)){assert.deepEqual(seo.privateMetadata(title).robots,{index:false,follow:false});assert.equal(seo.privateMetadata(title).alternates,undefined);assert.equal(seo.isPrivateRoute(url),true);assert.equal(seo.isPrivateRoute(url+'/private-id'),true);}
 for(const url of ['/','/pricing','/terms','/privacy','/refund','/how-to-use','/opengraph-image','/projects-about','/administrator'])assert.equal(seo.isPrivateRoute(url),false);
 assert.equal(seo.isPrivateRoute('/api/admin/user-usage'),true);
});
test('sitemap contains only public canonical routes with no invented freshness dates',()=>{
 const urls=load('app/sitemap.ts').default();assert.deepEqual(urls.map(x=>x.url),seo.PUBLIC_PAGES.map(x=>new URL(x.path,seo.SITE_URL).href));assert.equal(new Set(urls.map(x=>x.url)).size,urls.length);assert.ok(urls.every(x=>!('lastModified'in x)&&!seo.isPrivateRoute(new URL(x.url).pathname)));
});
test('robots allows HTML crawling to read noindex and excludes authenticated APIs',()=>{
 const r=load('app/robots.ts').default();assert.equal(r.sitemap,'https://kreovar.online/sitemap.xml');assert.equal(r.rules.allow,'/');assert.equal(r.rules.disallow,'/api/');
});
test('brand schema has real organization and website identities without fabricated ratings',()=>{
 assert.equal(seo.BRAND_SCHEMA['@context'],'https://schema.org');assert.deepEqual(seo.BRAND_SCHEMA['@graph'].map(x=>x['@type']),['Organization','WebSite']);assert.equal(seo.BRAND_SCHEMA['@graph'][1].publisher['@id'],seo.BRAND_SCHEMA['@graph'][0]['@id']);assert.equal(JSON.stringify(seo.BRAND_SCHEMA).includes('aggregateRating'),false);
});
