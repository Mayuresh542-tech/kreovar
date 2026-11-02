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
let p=model.createProject('zoom-cut-provider-check');
p=operations.addAsset(p,{id:'video',name:'Synthetic test footage',kind:'video',mime:'video/mp4',size:1,duration:10,width:1920,height:1080});
p=operations.addClip(p,'video','track-video',0,{id:'v'});
const scenarios=[
 'On clip v add a smooth zoom from 1x to 1.12x between 0 and 2 seconds. Remove exactly 5 to 6 seconds with ripple gap closure. Preserve audio levels and aspect ratio. Do not add captions, SFX, stock footage or any other edits.',
 'Sirf 3 se 4 second hata aur gap close kar. Zoom bilkul mat lagana. Audio ka volume aur framing same rakh. Koi captions ya naye assets mat add kar.'
];
const results=[];
for(const instruction of scenarios){
 try{
  const result=await load('app/lib/server/editorAi.ts').planAiEdit(p,instruction,[],'bc2460e7-35b3-466a-945d-247ad299f0e0',AbortSignal.timeout(85000));
  const edited=applyEditDecisionList(p,result.list);
  results.push({instruction,requests:result.modelRequests,summary:result.summary,decisions:result.list.decisions,toolCount:result.toolRequests.length,duration:model.projectDuration(edited)});
 }catch(error){results.push({instruction,error:error instanceof Error?error.message:'Provider request failed'});break;}
}
fs.writeFileSync(path.join(root,'work-ai-motion-provider.json'),JSON.stringify(results,null,2));
console.log(JSON.stringify(results,null,2));
