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
const {createCanvas,loadImage}=require('C:/Users/Admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/@napi-rs/canvas');
const {Compositor}=loader({'app/lib/editor/media.ts':{}})('app/lib/editor/compositor.ts');
const {TEXT_GRADIENTS,readTextGradient}=load('app/lib/editor/textGradient.ts');
const {applyTextPlacement}=load('app/lib/editor/textPlacement.ts');
const output='C:/Users/Admin/OneDrive/Documents/ChatGPT/kreovar/outputs/ai-editor/text-gradient-placement-preview.png';
const background=await loadImage('C:/Users/Admin/OneDrive/Documents/ChatGPT/kreovar/outputs/ai-editor/text-layout-background.jpg');
let p=model.createProject('layout-preview');p.settings.aspectRatio='9:16';
p=operations.addAsset(p,{id:'background',name:'Local test frame',kind:'image',mime:'image/jpeg',size:1,duration:5,width:1080,height:1920});
p=operations.addClip(p,'background','track-video',0,{id:'background-clip',duration:5});
p=operations.addText(p,'GRADIENT TEXT',0,{gradient:readTextGradient(TEXT_GRADIENTS[1]),strokeWidth:2,shadow:8});
const title=Object.values(p.clips).find(c=>c.contentId).id;p=applyTextPlacement(p,[title],'hook-top');
p=operations.addCaption(p,'Safe placement. Clear alignment.',0,3,{gradient:readTextGradient(TEXT_GRADIENTS[3]),strokeWidth:3,shadow:8});
const cap=Object.values(p.clips).find(c=>c.contentId&&p.captions[c.contentId]).id;p=applyTextPlacement(p,[cap],'caption-safe');
const canvas=createCanvas(540,960),compositor=new Compositor({});compositor.setFrame('background-clip',background,540,960);
const bounds=compositor.render(canvas,p,1);
fs.writeFileSync(output,canvas.toBuffer('image/png'));
console.log(JSON.stringify({output,textBounds:bounds.filter(b=>b.id!=='background-clip')}));
