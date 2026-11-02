import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(path.join(root, "package.json")), ts = require("typescript");
// Compile the real source in memory; mock only external auth/provider calls.
function loader(mocks = {}) {
 mocks={"app/lib/server/planUsage.ts":{withUsage:h=>h},...mocks};
  mocks = { "app/lib/server/projectAccess.ts":{requireOwnedProject:async()=>{}},"app/lib/server/editorAiCatalog.ts":{loadAiCatalog:async()=>[]}, "app/lib/supabase.ts": { supabase: { auth: { getSession: async () => ({ data: { session: null } }) } } }, ...mocks };
  const cache = new Map();
  function load(relative) {
    let filename = path.resolve(root, relative);
    if (!path.extname(filename)) filename += ".ts";
    const key = path.relative(root, filename).replaceAll("\\", "/");
    if (Object.hasOwn(mocks, key)) return mocks[key];
    if (cache.has(filename)) return cache.get(filename).exports;
    const loadedModule = { exports: {} }; cache.set(filename, loadedModule);
    const source = ts.transpileModule(fs.readFileSync(filename, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText.replaceAll("import.meta.url",JSON.stringify(pathToFileURL(filename).href));
    const localRequire = specifier => Object.hasOwn(mocks,specifier)?mocks[specifier]:specifier.startsWith("@/") ? load(specifier.slice(2)) : specifier.startsWith(".") ? load(path.relative(root, path.resolve(path.dirname(filename), specifier))) : require(specifier);
    new vm.Script(`(function(require,module,exports){${source}\n})`, { filename }).runInThisContext()(localRequire, loadedModule, loadedModule.exports);
    return loadedModule.exports;
  }
  return load;
}
const load = loader(), model = load("app/lib/editor/model.ts"), operations = load("app/lib/editor/operations.ts");
const { aiProjectSnapshot, validateAiPlan } = load("app/lib/editor/aiValidation.ts");
const { applyEditDecisionList } = load("app/lib/editor/ai.ts");
const { EditorStore } = load("app/lib/editor/store.ts");
const { mediaFilename, mediaType, attachmentHeader, downloadMedia } = load("app/lib/media/download.ts");
const { allowedDownloadUrl, fetchBrollDownload } = load("app/lib/server/brollDownload.ts");
require('@next/env').loadEnvConfig(root);
let p=model.createProject('text-placement-provider-check');
p.settings.aspectRatio='9:16';p=operations.addText(p,'Existing headline',0);
const headline=Object.keys(p.clips)[0];p.tracks['track-text'].locked=true;
p=operations.addCaption(p,'Exact caption words',0,3,{},[{word:'Exact',start:0,end:1},{word:'caption',start:1,end:2},{word:'words',start:2,end:3}]);
const caption=Object.keys(p.clips).find(id=>id!==headline);
try{
 const result=await load('app/lib/server/editorAi.ts').planAiEdit(p,'Only reposition the existing caption to safe lower captions, away from the existing headline, and change its fill to a left-to-right purple #a78bfa to cyan #22d3ee gradient. Preserve the exact caption wording, word timings, audio and duration. Keep the existing headline fixed. Do not add any new content.',[caption],'bc2460e7-35b3-466a-945d-247ad299f0e0',AbortSignal.timeout(85000));
 const next=applyEditDecisionList(p,result.list),layer=next.captions[next.clips[caption].contentId];
 assert.deepEqual(next.clips[headline],p.clips[headline]);assert.equal(layer.text,'Exact caption words');assert.deepEqual(layer.words,p.captions[p.clips[caption].contentId].words);assert.ok(layer.style.gradient);assert.equal(result.toolRequests.length,0);
 const output={requests:result.modelRequests,summary:result.summary,operations:result.list.decisions,position:next.clips[caption].transform,gradient:layer.style.gradient,headlinePreserved:true,wordsPreserved:true};
 fs.writeFileSync(path.join(root,'work-text-placement-provider.json'),JSON.stringify(output,null,2));
 console.log(JSON.stringify(output,null,2));
}catch(error){console.log(JSON.stringify({error:error instanceof Error?error.message:'Provider check failed'}));process.exitCode=1;}
