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
const {spawn}=await import('node:child_process');
const {once}=await import('node:events');
const {createCanvas,ImageData}=require('C:/Users/Admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/@napi-rs/canvas');
const input='C:/Users/Admin/OneDrive/Desktop/my projects/vedios/1st clip.MOV';
const output='C:/Users/Admin/OneDrive/Documents/ChatGPT/kreovar/outputs/ai-editor/Kreovar-AI-Zoom-Cut-Check.mp4';
fs.mkdirSync(path.dirname(output),{recursive:true});
const provider=JSON.parse(fs.readFileSync(path.join(root,'work-ai-motion-provider.json'),'utf8'))[0];
if(provider.error)throw Error('No verified provider plan.');
let project=model.createProject('zoom-cut-provider-check');project.settings.aspectRatio='9:16';
project=operations.addAsset(project,{id:'video',name:'1st clip.MOV',kind:'video',mime:'video/quicktime',size:1,duration:10,width:1080,height:1920});
project=operations.addClip(project,'video','track-video',0,{id:'v'});
const plan=validateAiPlan({summary:provider.summary,decisions:provider.decisions},project);
project=applyEditDecisionList(project,plan.list);
const {Compositor}=loader({'app/lib/editor/media.ts':{}})('app/lib/editor/compositor.ts');
const width=540,height=960,bytes=width*height*4,canvas=createCanvas(width,height),source=createCanvas(width,height),sourceCtx=source.getContext('2d'),compositor=new Compositor({});
const decoder=spawn('ffmpeg',['-v','error','-i',input,'-t','10','-vf','fps=30,scale=540:960','-f','rawvideo','-pix_fmt','rgba','pipe:1'],{windowsHide:true,stdio:['ignore','pipe','pipe']});
const encoder=spawn('ffmpeg',['-v','error','-y','-f','rawvideo','-pixel_format','rgba','-video_size','540x960','-framerate','30','-i','pipe:0','-i',input,'-filter_complex','[1:a:0]atrim=0:5,asetpts=PTS-STARTPTS[a0];[1:a:0]atrim=6:10,asetpts=PTS-STARTPTS[a1];[a0][a1]concat=n=2:v=0:a=1[a]','-map','0:v:0','-map','[a]','-c:v','libx264','-preset','fast','-crf','20','-pix_fmt','yuv420p','-c:a','aac','-b:a','128k','-movflags','+faststart',output],{windowsHide:true,stdio:['pipe','ignore','pipe']});
const decoderExit=once(decoder,'exit'),encoderExit=once(encoder,'exit');
let diagnostics='';decoder.stderr.on('data',b=>diagnostics+=b.toString());encoder.stderr.on('data',b=>diagnostics+=b.toString());
let pending=Buffer.alloc(0),index=0,frames=0;
for await(const chunk of decoder.stdout){
 pending=Buffer.concat([pending,chunk]);
 while(pending.length>=bytes){
  const frame=pending.subarray(0,bytes);pending=pending.subarray(bytes);
  const sourceTime=index++/30;
  const clip=Object.values(project.clips).find(c=>c.assetId==='video'&&sourceTime>=c.sourceStart-1e-7&&sourceTime<c.sourceEnd-1e-7);
  if(!clip)continue;
  const time=clip.startTime+(sourceTime-clip.sourceStart)/clip.speed;
  sourceCtx.putImageData(new ImageData(new Uint8ClampedArray(frame),width,height),0,0);
  compositor.setFrame(clip.id,source,width,height);
  compositor.render(canvas,project,time);
  const pixels=canvas.getContext('2d').getImageData(0,0,width,height).data;
  if(!encoder.stdin.write(Buffer.from(pixels)))await once(encoder.stdin,'drain');
  frames++;
 }
}
encoder.stdin.end();
const [dc]=await decoderExit,[ec]=await encoderExit;
if(dc!==0||ec!==0)throw Error('Render check failed: '+diagnostics.slice(0,600));
fs.writeFileSync(output.replace('.mp4','.json'),JSON.stringify({purpose:'Visual renderer smoke test using actual AI-produced decisions on first 10 seconds of the provided clip. Video frames rendered by the production Compositor; audio concatenated with FFmpeg, not a browser-export end-to-end test.',decisions:provider.decisions,frames,fps:30,duration:model.projectDuration(project),output},null,2));
console.log(JSON.stringify({output,frames,seconds:frames/30,aspectRatio:'9:16'}));
