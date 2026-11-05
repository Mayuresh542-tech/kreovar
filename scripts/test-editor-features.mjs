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
    // Existing Radox mocks explicitly exercise the legacy adapter; default Groq routing has dedicated real-boundary tests.
    const moduleProcess=key==="app/lib/server/editorProvider.ts"&&mocks["app/lib/server/radoxService.ts"]?{env:{...process.env,EDITOR_AI_PRIMARY_PROVIDER:"radox"}}:process;
    new vm.Script(`(function(require,module,exports,process){${source}\n})`, { filename }).runInThisContext()(localRequire, loadedModule, loadedModule.exports,moduleProcess);
    return loadedModule.exports;
  }
  return load;
}
const load = loader(), model = load("app/lib/editor/model.ts"), operations = load("app/lib/editor/operations.ts");
const { aiProjectSnapshot, validateAiPlan } = load("app/lib/editor/aiValidation.ts");
const { applyEditDecisionList } = load("app/lib/editor/ai.ts");
const { EditorStore } = load("app/lib/editor/store.ts");
const {RadoxEditorError}=load("app/lib/server/radoxService.ts");
const { mediaFilename, mediaType, attachmentHeader, downloadMedia } = load("app/lib/media/download.ts");
const { allowedDownloadUrl, fetchBrollDownload } = load("app/lib/server/brollDownload.ts");
function fixture() {
  let p = model.createProject("test-project", "Test edit");
  p = operations.addAsset(p, { id: "asset-1", name: "Footage.mp4", kind: "video", mime: "video/mp4", size: 123, duration: 10, width: 1920, height: 1080, url: "https://private.example/signed?token=secret", localKey: "private-cache", thumbnail: "secret-thumb" });
  return operations.addClip(p, "asset-1", "track-video", 0, { id: "clip-1" });
}
test("AI metadata excludes private URLs, media bytes and cache keys", () => {
  const snapshot = aiProjectSnapshot(fixture()), text = JSON.stringify(snapshot);
  for (const secret of ["secret", "private", "thumbnail", "localKey", "url"]) assert.equal(text.includes(secret), false);
  assert.equal(snapshot.clips["clip-1"].sourceEnd, 10);
});
test("real AI decisions apply to existing operations in one undo/redo transaction", () => {
  const p = fixture(), store = new EditorStore(p);
  const plan = validateAiPlan({ summary: "Faster portrait video", decisions: [{ op: "changeClipProperty", clipId: "clip-1", changes: { speed: 2, volume: .5 } }, { op: "setAspectRatio", aspectRatio: "9:16" }, { op: "addText", text: "Hello", startTime: 0 }] }, p);
  store.execute(project => applyEditDecisionList(project, plan.list));
  assert.equal(store.getSnapshot().clips["clip-1"].duration, 5);
  assert.equal(store.getSnapshot().settings.aspectRatio, "9:16");
  assert.equal(Object.keys(store.getSnapshot().textLayers).length, 1);
  assert.equal(store.getSnapshot().revision, 1);
  store.undo(); assert.deepEqual(store.getSnapshot().clips, p.clips); assert.equal(store.getSnapshot().settings.aspectRatio, "16:9");
  store.redo(); assert.equal(store.getSnapshot().clips["clip-1"].speed, 2);
});
test("stale revisions, unsupported decisions and unsafe properties fail without mutation", () => {
  const p = fixture(), store = new EditorStore(p);
  const bad = [{ op: "removeClip", clipId: "clip-1" }, { op: "removeClip", clipId: "missing" }];
  assert.throws(() => store.execute(project => applyEditDecisionList(project, { version: 1, projectId: p.id, baseRevision: p.revision, decisions: bad })));
  assert.strictEqual(store.getSnapshot(), p); assert.equal(store.canUndo, false);
  for (const changes of [{ speed: NaN }, { speed: 99 }, { assetId: "external" }, { transform: { scale: 2 } }]) assert.throws(() => validateAiPlan({ summary: "Bad", decisions: [{ op: "changeClipProperty", clipId: "clip-1", changes }] }, p));
  assert.throws(() => validateAiPlan({ summary: "Bad", decisions: [{ op: "runCode", code: "anything" }] }, p));
  assert.throws(() => applyEditDecisionList(p, { version: 1, projectId: p.id, baseRevision: 1, decisions: [] }));
});
test("locked tracks, invalid transitions and oversized plans are rejected", () => {
  const p = fixture(); p.tracks["track-video"].locked = true;
  assert.throws(() => validateAiPlan({ summary: "Bad", decisions: [{ op: "removeClip", clipId: "clip-1" }] }, p), /Unlock/);
  assert.throws(() => validateAiPlan({ summary: "Bad", decisions: Array.from({ length: 101 }, () => ({ op: "setAspectRatio", aspectRatio: "9:16" })) }, p));
  assert.throws(() => validateAiPlan({ summary: "Bad", decisions: [{ op: "addTransition", fromClipId: "clip-1", toClipId: "missing", kind: "zoom", duration: .5 }] }, fixture()));
});
test("filename and MIME handling matches actual file type, handles Unicode and unsafe names", () => {
  assert.equal(mediaFilename("Clip.mp4", "video/webm"), "Clip.webm");
  assert.equal(mediaFilename("CON.mp4", "video/mp4"), "veelox-CON.mp4");
  assert.equal(mediaFilename("../../hello\r\n.mp4", "video/mp4").includes("/"), false);
  assert.match(attachmentHeader(mediaFilename("भारत.mp4", "video/mp4")), /filename\*=UTF-8''%/);
  assert.equal(mediaType("video/quicktime; charset=binary", "https://videos.pexels.com/test.mp4"), "video/quicktime");
  assert.throws(() => mediaType("text/html", "https://videos.pexels.com/test.mp4"));
});
test("download URL policy rejects private hosts, credentials and unsupported buckets", () => {
  assert.equal(allowedDownloadUrl("https://videos.pexels.com/video-files/a.mp4").hostname, "videos.pexels.com");
  assert.equal(allowedDownloadUrl("https://example.supabase.co/storage/v1/object/public/videos/a.mov", "https://example.supabase.co").hostname, "example.supabase.co");
  for (const url of ["http://videos.pexels.com/a.mp4", "https://127.0.0.1/a.mp4", "https://videos.pexels.com.evil.test/a.mp4", "https://user:pass@videos.pexels.com/a.mp4", "https://videos.pexels.com:443/a.mp4#x", "https://example.supabase.co/storage/v1/object/public/private/a.mp4"]) assert.throws(() => allowedDownloadUrl(url, "https://example.supabase.co"));
});
test("proxy streams real bytes with correct MIME/attachment and refuses unsafe redirects", async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async () => new Response(new Uint8Array([1, 2, 3]), { headers: { "content-type": "video/webm", "content-length": "3" } });
    const response = await fetchBrollDownload("https://videos.pexels.com/clip.mp4", "Clip.mp4", new AbortController().signal);
    assert.equal(response.headers.get("content-type"), "video/webm"); assert.match(response.headers.get("content-disposition"), /Clip.webm/);
    assert.deepEqual([...new Uint8Array(await response.arrayBuffer())], [1, 2, 3]);
    globalThis.fetch = async () => new Response(null, { status: 302, headers: { location: "https://127.0.0.1/private" } });
    await assert.rejects(fetchBrollDownload("https://videos.pexels.com/clip.mp4", "Clip", new AbortController().signal));
  } finally { globalThis.fetch = original; }
});
test("proxy rejects expired, empty, truncated, non-video and oversized files", async () => {
  const original = globalThis.fetch;
  try {
    for (const factory of [() => new Response(null, { status: 404 }), () => new Response("html", { headers: { "content-type": "text/html" } }), () => new Response("large", { headers: { "content-type": "video/mp4", "content-length": String(101 * 1024 * 1024) } })]) {
      globalThis.fetch = async () => factory();
      await assert.rejects(fetchBrollDownload("https://videos.pexels.com/clip.mp4", "Clip", new AbortController().signal));
    }
    for (const [bytes, length] of [[new Uint8Array(0), "0"], [new Uint8Array([1]), "3"]]) {
      globalThis.fetch = async () => new Response(bytes, { headers: { "content-type": "video/mp4", "content-length": length } });
      const response = await fetchBrollDownload("https://videos.pexels.com/clip.mp4", "Clip", new AbortController().signal);
      await assert.rejects(response.arrayBuffer());
    }
  } finally { globalThis.fetch = original; }
});
test("authenticated AI route uses real validation, Opus provider boundary and revision metadata", async () => {
  const { NextRequest } = require("next/server");
  let providerCalls = 0;
  const routeLoad = loader({ "app/lib/server/adminAuth.ts": { getAdminClient: () => ({ auth: { getUser: async token => ({ data: { user: token === "test-session" ? { id: "user-1" } : null }, error: null }) } }) }, "app/lib/server/radoxService.ts": { RadoxEditorError, generateEditorJson: async options => { providerCalls++; assert.equal(options.maxTokens, 8192); assert.equal(options.userId, "user-1"); assert.equal(options.prompt.includes("private-cache"), false); return { summary: "Portrait", decisions: [{ op: "setAspectRatio", aspectRatio: "9:16" }] }; } } });
  const route = routeLoad("app/api/editor/ai-edit/route.ts");
  const request = token => new NextRequest("http://localhost/api/editor/ai-edit", { method: "POST", headers: token ? { Authorization: `Bearer ${token}` } : {}, body: JSON.stringify({ instruction: "Make portrait", project: fixture(), selectedClipIds: ["clip-1"] }) });
  assert.equal((await route.POST(request())).status, 401); assert.equal((await route.POST(request("bad"))).status, 401); assert.equal(providerCalls, 0);
  const response = await route.POST(request("test-session")); assert.equal(response.status, 200);
  const plan = await response.json(); assert.equal(plan.list.baseRevision, 0); assert.equal(plan.list.projectId, "test-project"); assert.equal(plan.list.decisions[0].aspectRatio, "9:16");
  assert.equal(providerCalls, 1);
});
test("AI route reports missing editing-provider configuration and rejects invalid input before calling provider", async () => {
  const { NextRequest } = require("next/server");
  let calls = 0;
  const route = loader({ "app/lib/server/adminAuth.ts": { getAdminClient: () => ({ auth: { getUser: async () => ({ data: { user: { id: "user-2" } }, error: null }) } }) }, "app/lib/server/radoxService.ts": { RadoxEditorError, generateEditorJson: async () => { calls++; throw new RadoxEditorError("RADOX_NOT_CONFIGURED"); } } })("app/api/editor/ai-edit/route.ts");
  const request = body => new NextRequest("http://localhost/api/editor/ai-edit", { method: "POST", headers: { Authorization: "Bearer test-session" }, body: JSON.stringify(body) });
  const bad = await route.POST(request({ instruction: "", project: fixture(), selectedClipIds: [] })); assert.equal(bad.status, 400); assert.equal(calls, 0);
  const oversized = await route.POST(request({ instruction: "x".repeat(1100000) })); assert.equal(oversized.status, 413);
  const missing = await route.POST(request({ instruction: "Make portrait", project: fixture(), selectedClipIds: [] })); assert.equal(missing.status, 503); const missingData=await missing.json(); assert.equal(missingData.code,'AI_NOT_CONFIGURED'); assert.match(missingData.error, /AI editing is temporarily unavailable/); assert.equal(calls,1);
});
test("client download hands correct filename to the browser and releases temporary resources", async () => {
  const originals = { fetch: globalThis.fetch, document: globalThis.document, create: URL.createObjectURL, revoke: URL.revokeObjectURL, timer: globalThis.setTimeout };
  let clicked = false, removed = false, released = false, appended = false;
  const link = { remove: () => { removed = true; }, click: () => { clicked = true; } };
  try {
    globalThis.document = { createElement: () => link, body: { appendChild: () => { appended = true; } } };
    URL.createObjectURL = blob => { assert.equal(blob.size, 3); return "blob:test"; };
    URL.revokeObjectURL = url => { assert.equal(url, "blob:test"); released = true; };
    globalThis.setTimeout = callback => { callback(); return 1; };
    globalThis.fetch = async (url, options) => { assert.match(url, /^\/api\/broll\/download\?/); assert.equal(options.headers.Authorization, "Bearer test-session"); return new Response(new Uint8Array([1, 2, 3]), { headers: { "content-type": "video/webm" } }); };
    await downloadMedia("https://videos.pexels.com/clip.mp4", "My clip.mp4", "test-session", new AbortController().signal);
    assert.equal(link.download, "My clip.webm"); assert.ok(clicked && removed && released && appended);
    globalThis.fetch = async () => Response.json({ error: "Expired link" }, { status: 404 });
    await assert.rejects(downloadMedia("https://videos.pexels.com/clip.mp4", "Clip", "test-session", new AbortController().signal), /Expired link/);
  } finally { globalThis.fetch = originals.fetch; globalThis.document = originals.document; URL.createObjectURL = originals.create; URL.revokeObjectURL = originals.revoke; globalThis.setTimeout = originals.timer; }
});
test("existing Gemini service ignores thought parts and stops retries when cancelled", async () => {
  const original = globalThis.fetch, previousKey = process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY = "test-provider-key";
  const { generateGeminiJson } = loader({ "app/lib/server/providerRegistry.ts": { getProviderCredential: async () => "test-provider-key", recordProviderUsage: async () => {} } })("app/lib/server/geminiService.ts");
  try {
    globalThis.fetch = async () => Response.json({ candidates: [{ content: { parts: [{ thought: true, text: "Hidden thought" }, { text: '{"value":' }, { text: '1}' }] } }] });
    assert.deepEqual(await generateGeminiJson({ prompt: "Check", operation: "test" }), { value: 1 });
    const controller = new AbortController(); let calls = 0;
    globalThis.fetch = async () => { calls++; controller.abort(); throw new DOMException("Cancelled", "AbortError"); };
    await assert.rejects(generateGeminiJson({ prompt: "Check", signal: controller.signal })); assert.equal(calls, 1);
  } finally { globalThis.fetch = original; if (previousKey === undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = previousKey; }
});
test("download endpoint enforces authentication and URL policy before fetching bytes", async () => {
  const { NextRequest } = require("next/server");
  let calls = 0;
  const route = loader({ "app/lib/server/adminAuth.ts": { getAdminClient: () => ({ auth: { getUser: async token => ({ data: { user: token === "test-session" ? { id: "user-3" } : null }, error: null }) } }) } })("app/api/broll/download/route.ts");
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async () => { calls++; return new Response(new Uint8Array([1]), { headers: { "content-type": "video/mp4" } }); };
    const request = (url, token) => new NextRequest(`http://localhost/api/broll/download?url=${encodeURIComponent(url)}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
    assert.equal((await route.GET(request("https://videos.pexels.com/a.mp4"))).status, 401);
    assert.equal((await route.GET(request("https://videos.pexels.com/a.mp4", "bad"))).status, 401);
    assert.equal((await route.GET(request("https://127.0.0.1/a.mp4", "test-session"))).status, 400); assert.equal(calls, 0);
    const response = await route.GET(request("https://videos.pexels.com/a.mp4", "test-session")); assert.equal(response.status, 200); assert.equal((await response.arrayBuffer()).byteLength, 1);
  } finally { globalThis.fetch = original; }
});

test("trim, speed and split preserve the original source range", () => {
 let p=fixture();p=operations.trimClip(p,"clip-1","left",2);p=operations.trimClip(p,"clip-1","right",8);p=operations.changeClipProperty(p,"clip-1",{speed:2});
 assert.equal(p.clips["clip-1"].duration,3);assert.equal(p.clips["clip-1"].sourceStart,2);assert.equal(p.clips["clip-1"].sourceEnd,8);
 p=operations.splitClip(p,"clip-1",3);const clips=Object.values(p.clips).sort((a,b)=>a.startTime-b.startTime);assert.equal(clips.length,2);assert.equal(clips[0].sourceEnd,4);assert.equal(clips[1].sourceStart,4);assert.equal(clips[1].duration,2);
});
test("timeline movement cleans invalid transitions and rejects incompatible or locked destinations", () => {
 let p=fixture();p=operations.addClip(p,"asset-1","track-video",10,{id:"clip-2"});p=operations.addTransition(p,"clip-1","clip-2","dissolve",.5);assert.equal(Object.keys(p.transitions).length,1);
 assert.throws(()=>operations.moveClip(p,"clip-1",0,"track-audio"),/Incompatible/);p.tracks["track-overlay"].locked=true;assert.throws(()=>operations.moveClip(p,"clip-1",0,"track-overlay"),/locked/);
 p=operations.moveClip(p,"clip-2",12);assert.equal(Object.keys(p.transitions).length,0);
});
test("multi-clip editing is one undoable transaction and cancelled gestures leave no history", () => {
 const p=operations.addText(fixture(),"Title",0),store=new EditorStore(p);store.begin();store.preview(project=>operations.moveClip(project,"clip-1",2));store.cancel();assert.strictEqual(store.getSnapshot(),p);assert.equal(store.canUndo,false);
 store.execute(project=>Object.keys(project.clips).reduce((next,id)=>operations.moveClip(next,id,2),project));assert.ok(Object.values(store.getSnapshot().clips).every(c=>c.startTime===2));store.undo();assert.deepEqual(store.getSnapshot().clips,p.clips);
});
test("text and captions are immediately ready for playback and browser export", () => {
 const compositorLoad=loader({"app/lib/editor/media.ts":{}}),{Compositor,visibleLayers}=compositorLoad("app/lib/editor/compositor.ts");let p=model.createProject("text-only");p=operations.addText(p,"Visible title",0,{},false,2);p=operations.addCaption(p,"Visible caption",0,2);
 const engine=new Compositor({});assert.equal(engine.sync(p,.5,true),true);assert.equal(visibleLayers(p,.5).length,2);p.tracks["track-caption"].hidden=true;assert.equal(engine.sync(p,.5,true),true);assert.equal(visibleLayers(p,.5).length,1);engine.dispose();
});
test("automatic captions map source words through trimming, speed and timeline movement", () => {
 const {captionsForClip}=load("app/lib/editor/captionTiming.ts");const clip={...fixture().clips["clip-1"],startTime:10,sourceStart:2,sourceEnd:6,duration:2,speed:2};
 const captions=captionsForClip(clip,[{word:"outside",start:0,end:1},{word:"one",start:1.8,end:2.5},{word:"two",start:2.5,end:3},{word:"three",start:3,end:3.5},{word:"four",start:3.5,end:4},{word:"last",start:5,end:7},{word:"invalid",start:NaN,end:6}]);assert.equal(captions.length,2);assert.deepEqual(captions[0],{text:"one two three four",start:10,duration:1,words:[{word:"one",start:0,end:.25},{word:"two",start:.25,end:.5},{word:"three",start:.5,end:.75},{word:"four",start:.75,end:1}]});assert.deepEqual(captions[1],{text:"last",start:11.5,duration:.5,words:[{word:"last",start:0,end:.5}]});
});
test("SRT export orders visible captions and carries time across minute boundaries", () => {
 const {captionsSrt}=load("app/lib/editor/captionTiming.ts");let p=model.createProject("subs");p=operations.addCaption(p,"Second",61.001,2);p=operations.addCaption(p,"First",59.9996,1);const srt=captionsSrt(p);assert.match(srt,/1\n00:01:00,000 --> 00:01:01,000\nFirst/);assert.ok(srt.indexOf("First")<srt.indexOf("Second"));p.tracks["track-caption"].hidden=true;assert.equal(captionsSrt(p),"");
});
test("AI media route authenticates, validates and returns actual image bytes", async () => {
 const oldImageFlag=process.env.IMAGE_GENERATION_ENABLED;process.env.IMAGE_GENERATION_ENABLED="true";const oldFetch=globalThis.fetch;let calls=0;const route=loader({"app/lib/server/assetStore.ts":{saveStudioAsset:async(user,bytes,mime)=>{assert.equal(user,"image-qa");assert.equal(bytes.length,4);assert.equal(mime,"image/png");return {id:"saved-image"};}},"app/lib/server/adminAuth.ts":{getAdminClient:()=>({auth:{getUser:async()=>({data:{user:{id:"image-qa"}},error:null})}})},"app/lib/server/geminiService.ts":{getGeminiApiKey:async()=>"fake-key"}})("app/api/editor/generate-image/route.ts");
 try{globalThis.fetch=async()=>{calls++;return Response.json({candidates:[{content:{parts:[{inlineData:{mimeType:"image/png",data:Buffer.from([137,80,78,71]).toString("base64")}}]}}]});};
 assert.equal((await route.POST(new Request("https://local/api/editor/generate-image",{method:"POST",body:JSON.stringify({prompt:"test"})}))).status,401);assert.equal(calls,0);
 assert.equal((await route.POST(new Request("https://local/api/editor/generate-image",{method:"POST",headers:{Authorization:"Bearer fake"},body:JSON.stringify({prompt:""})}))).status,400);assert.equal(calls,0);
 const response=await route.POST(new Request("https://local/api/editor/generate-image",{method:"POST",headers:{Authorization:"Bearer fake"},body:JSON.stringify({prompt:"A blue landscape"})}));assert.equal(response.status,200);assert.equal(response.headers.get("X-Veelox-Asset-Id"),"saved-image");assert.equal(response.headers.get("content-type"),"image/png");assert.equal((await response.arrayBuffer()).byteLength,4);assert.equal(calls,1);
 }finally{globalThis.fetch=oldFetch;if(oldImageFlag===undefined)delete process.env.IMAGE_GENERATION_ENABLED;else process.env.IMAGE_GENERATION_ENABLED=oldImageFlag;}
});
test("AI media reports exhausted provider quota and blocks oversized prompts", async () => {
 const oldImageFlag=process.env.IMAGE_GENERATION_ENABLED;process.env.IMAGE_GENERATION_ENABLED="true";const oldFetch=globalThis.fetch;let calls=0;const route=loader({"app/lib/server/adminAuth.ts":{getAdminClient:()=>({auth:{getUser:async()=>({data:{user:{id:"image-error-qa"}},error:null})}})},"app/lib/server/geminiService.ts":{getGeminiApiKey:async()=>"fake-key"}})("app/api/editor/generate-image/route.ts");
 try{globalThis.fetch=async()=>{calls++;return new Response("",{status:429});};const make=prompt=>new Request("https://local/api/editor/generate-image",{method:"POST",headers:{Authorization:"Bearer fake"},body:JSON.stringify({prompt})});assert.equal((await route.POST(make("x".repeat(13000)))).status,413);assert.equal(calls,0);const response=await route.POST(make("Landscape"));assert.equal(response.status,429);assert.match((await response.json()).error,/quota/);
 }finally{globalThis.fetch=oldFetch;if(oldImageFlag===undefined)delete process.env.IMAGE_GENERATION_ENABLED;else process.env.IMAGE_GENERATION_ENABLED=oldImageFlag;}
});


test("browser WebM exports receive a finite duration without altering encoded media", async () => {
 const {finalizeWebm}=load("app/lib/editor/webm.ts");const header=Buffer.from("1a45dfa39f4286810142f7810142f2810442f381084282847765626d42878104428581021853806701ffffffffffffff1549a966992ad7b1830f42404d80864368726f6d655741864368726f6d65","hex"),frames=Buffer.from([0x1f,0x43,0xb6,0x75,0x80]);const original=new Blob([header,frames],{type:"video/webm"});const fixed=await finalizeWebm(original,2.25),bytes=Buffer.from(await fixed.arrayBuffer());const duration=bytes.indexOf(Buffer.from([0x44,0x89,0x88]));assert.ok(duration>0);assert.equal(bytes.readDoubleBE(duration+3),2250);assert.deepEqual(bytes.subarray(bytes.length-frames.length),frames);assert.equal(fixed.size,original.size+11);
 const again=await finalizeWebm(fixed,3);assert.equal(again.size,fixed.size);assert.equal(Buffer.from(await again.arrayBuffer()).readDoubleBE(duration+3),3000);const mp4=new Blob(["mp4"],{type:"video/mp4"});assert.strictEqual(await finalizeWebm(mp4,2),mp4);await assert.rejects(()=>finalizeWebm(original,NaN));
});


test("clipboard paste retains media, clones text IDs and rejects locked tracks atomically",()=>{const source=operations.addText(fixture(),"Copied title",2),text=Object.values(source.clips).find(c=>c.contentId);const destination=model.createProject("paste");const pasted=operations.pasteClips(destination,source,["clip-1",text.id],5);const clips=Object.values(pasted.clips).sort((a,b)=>a.startTime-b.startTime);assert.equal(clips[0].startTime,5);assert.equal(clips[1].startTime,7);assert.notEqual(clips[1].contentId,text.contentId);assert.equal(pasted.textLayers[clips[1].contentId].text,"Copied title");assert.equal(pasted.assets["asset-1"].duration,10);destination.tracks["track-text"].locked=true;const store=new EditorStore(destination);assert.throws(()=>store.execute(p=>operations.pasteClips(p,source,["clip-1",text.id],0)),/Unlock/);assert.equal(Object.keys(store.getSnapshot().clips).length,0);});

test("relinking cancels stale cache reads without replacing the new original or pending task",async()=>{let resolveOld,resolveNew;const oldRead=new Promise(resolve=>{resolveOld=resolve}),newRead=new Promise(resolve=>{resolveNew=resolve});const {MediaRepository}=loader({"app/lib/editor/cache.ts":{cacheRead:async(_store,key)=>key==="old"?oldRead:newRead,cacheWrite:async()=>{}}})("app/lib/editor/media.ts");const repository=new MediaRepository(),asset={id:"relink",name:"file",localKey:"old"};const old=repository.resolve(asset);repository.invalidate(asset.id);const fresh=repository.resolve({...asset,localKey:"new"});resolveOld(new Blob(["old"]));await assert.rejects(()=>old,/relinked/);assert.strictEqual(repository.resolve({...asset,localKey:"new"}),fresh);resolveNew(new Blob(["new"]));const url=await fresh;assert.equal(await repository.resolve({...asset,localKey:"new"}),url);repository.dispose();});

test("project workspace assets and timed captions reach the editor without duplicates", () => {
 const {projectFromRecord,mergeProjectAssets,toLegacy}=load("app/lib/editor/bridge.ts");
 const record={id:"workspace",title:"My workspace",aspect_ratio:"9:16",raw_footage:[{id:"raw",name:"Raw",url:"https://example.com/raw.mp4",duration:8}],broll_assets:[{id:"broll",title:"B-roll",url:"https://example.com/broll.mp4",duration:4}],voiceovers:[{id:"voice",title:"Voice",url:"https://example.com/voice.mp3",duration:7}],thumbnails:[{id:"thumb",title:"Cover",url:"https://example.com/cover.png"}],captions:[{id:"caption",text:"A caption",startTime:1,endTime:3,words:[]}]};
 let p=projectFromRecord(record);assert.equal(Object.keys(p.assets).length,4);assert.equal(p.assets.thumb.kind,"image");assert.equal(Object.keys(p.captions).length,1);assert.equal(p.settings.aspectRatio,"9:16");
 p=mergeProjectAssets(p,record);assert.equal(Object.keys(p.captions).length,1);
 const clipId=Object.keys(p.clips)[0];p=operations.removeClip(p,clipId);
 p=projectFromRecord({...record,timeline:toLegacy(p)});assert.equal(Object.keys(p.captions).length,0,"a caption deleted by the editor is not recreated on reload");
});
test("new project assets merge into recovered edits without replacing the timeline", () => {
 const {mergeProjectAssets}=load("app/lib/editor/bridge.ts");let p=fixture();const original=p.clips["clip-1"];
 p=mergeProjectAssets(p,{thumbnails:[{id:"new-thumbnail",url:"https://example.com/new.png",title:"New cover"}],captions:[{id:"invalid",text:"Bad",startTime:5,endTime:2}]});
 assert.deepEqual(p.clips["clip-1"],original);assert.equal(p.assets["new-thumbnail"].kind,"image");assert.equal(Object.keys(p.captions).length,0);
});

test('offline export requires WebCodecs and offers MP4 without MediaRecorder',()=>{
 const saved={VideoEncoder:globalThis.VideoEncoder,AudioEncoder:globalThis.AudioEncoder};
 try{globalThis.VideoEncoder=class{};globalThis.AudioEncoder=class{};const {exportFormats}=load('app/lib/editor/export.ts');assert.equal(exportFormats()[0].mime,'video/mp4');assert.equal(exportFormats().length,3);globalThis.AudioEncoder=undefined;assert.deepEqual(exportFormats(),[]);}finally{Object.assign(globalThis,saved);}
});

test('MP4 finishing rejects unauthenticated requests before reading files or launching rendering',async()=>{
 let rendered=false;const route=loader({'app/lib/server/adminAuth.ts':{getAuthenticatedUserId:async()=>null},'app/lib/server/render/editorAudio.ts':{finalizeEditorMp4:()=>{rendered=true;}}})('app/api/editor/export-mp4/route.ts');const {NextRequest}=require('next/server');const r=await route.POST(new NextRequest('http://localhost/api/editor/export-mp4',{method:'POST'}));assert.equal(r.status,401);assert.equal(rendered,false);
});
test('MP4 finishing rejects foreign projects before resolving private originals',async()=>{
 let rendered=false;const route=loader({'app/lib/server/adminAuth.ts':{getAuthenticatedUserId:async()=> 'owner',getAdminClient:()=>({})},'app/lib/server/projectAccess.ts':{requireOwnedProject:async()=>{throw Error('foreign');}},'app/lib/server/render/editorAudio.ts':{finalizeEditorMp4:()=>{rendered=true;}}})('app/api/editor/export-mp4/route.ts');const {NextRequest}=require('next/server');const form=new FormData();form.set('recording',new File([new Uint8Array([1])],'video.mp4',{type:'video/mp4'}));form.set('project',JSON.stringify({id:'foreign'}));const r=await route.POST(new NextRequest('http://localhost/api/editor/export-mp4',{method:'POST',body:form}));assert.equal(r.status,404);assert.equal(rendered,false);
});
test('MP4 finishing refuses unknown private originals instead of silently omitting sound',async()=>{
 const renderer=loader({'app/lib/server/assetStore.ts':{getStudioAsset:async()=>null}})('app/lib/server/render/editorAudio.ts');let p=fixture();p.assets['asset-1'].libraryId='22222222-2222-4222-8222-222222222222';await assert.rejects(()=>renderer.finalizeEditorMp4('owner',p,Buffer.from('0000ftyp00000000'),new AbortController().signal),/original is unavailable/);
});
test('MP4 finishing applies trims, speed, volume, fades and absolute audio placement',()=>{
 const {audioClipFilter}=load('app/lib/server/render/editorAudio.ts'),p=fixture(),clip={...p.clips['clip-1'],sourceStart:2,sourceEnd:6,duration:8,speed:.5,startTime:3,volume:.4,fadeIn:1,fadeOut:2};const filter=audioClipFilter(clip,1,'a');assert(filter.includes('atrim=start=2:end=6'));assert(filter.includes('atempo=0.5'));assert(filter.includes('volume=0.4'));assert(filter.includes('afade=t=out:st=6:d=2'));assert(filter.includes('adelay=3000:all=1'));assert(filter.endsWith('[a]'));
});

test("compositor waits for in-flight seeks and primes trimmed upcoming clips",()=>{
 const saved=globalThis.HTMLMediaElement;
 class FakeMedia {duration=10;seeking=true;readyState=4;paused=true;playbackRate=1;seeks=0;time=0;get currentTime(){return this.time;}set currentTime(t){this.time=t;this.seeks++;}pause(){this.paused=true;}play(){this.paused=false;return Promise.resolve();}}
 globalThis.HTMLMediaElement=FakeMedia;
 try {
  const {Compositor}=loader({"app/lib/editor/media.ts":{}})("app/lib/editor/compositor.ts");
  const engine=new Compositor({}),p=fixture(),media=new FakeMedia();
  engine.ensure=async()=>{};engine.entries.set("clip-1",{element:media,ready:true});
  assert.equal(engine.sync(p,1,true),false);assert.equal(media.seeks,0);
  media.seeking=false;engine.sync(p,1,true);assert.equal(media.seeks,1);
  p.clips["clip-1"].startTime=2;p.clips["clip-1"].sourceStart=3;
  engine.sync(p,1.5,true);assert.equal(media.currentTime,3);assert.equal(media.paused,true);
  const count=media.seeks;engine.sync(p,1.6,true);assert.equal(media.seeks,count);
 } finally {if(saved===undefined)delete globalThis.HTMLMediaElement;else globalThis.HTMLMediaElement=saved;}
});

test("project SFX merges into editor media without changing clips or duplicating originals",()=>{
 const {mergeProjectAssets}=load("app/lib/editor/bridge.ts"),p=fixture(),original=JSON.stringify(p.clips);
 const record={sfx_assets:[{id:"sound-1",name:"Impact",duration:.4,url:"/api/assets/11111111-1111-4111-8111-111111111111/file"}]};
 const next=mergeProjectAssets(p,record);assert.equal(next.assets["sound-1"].kind,"audio");assert.equal(next.assets["sound-1"].duration,.4);assert.equal(next.assets["sound-1"].libraryId,"11111111-1111-4111-8111-111111111111");assert.equal(JSON.stringify(next.clips),original);
 assert.equal(Object.keys(mergeProjectAssets(next,record).assets).length,2);
});

test("offline export schedules every frame and preserves trim/speed audio alignment",()=>{
 const {frameSchedule,clipAudioSlice}=loader({"mediabunny":{}})("app/lib/editor/offlineExport.ts");
 const frames=frameSchedule(8,30);assert.equal(frames.length,240);assert.equal(frames[239].time,239/30);assert.ok(Math.abs(frames.reduce((n,f)=>n+f.duration,0)-8)<1e-9);
 assert.equal(frameSchedule(.105,30).length,4);assert.throws(()=>frameSchedule(61,30));assert.throws(()=>frameSchedule(8,25));
 const clip={sourceStart:2,sourceEnd:4,startTime:3,speed:2};
 assert.deepEqual(clipAudioSlice(clip,1.9,.2),{offset:2-1.9,length:.2-(2-1.9),when:3});
 const end=clipAudioSlice(clip,3.95,.1);assert.ok(Math.abs(end.length-.05)<1e-9);assert.equal(end.when,3+(3.95-2)/2);
});
test("offline exporter encodes all frames without relying on animation callbacks",async()=>{
 const originals={document:globalThis.document,OfflineAudioContext:globalThis.OfflineAudioContext};
 const encoded=[],decoded=[];let cancelled=false,disposed=false,audioAdded=false;
 class Input {async getPrimaryVideoTrack(){return{canDecode:async()=>true};}async getPrimaryAudioTrack(){return null;}dispose(){disposed=true;}}
 class CanvasSink {async *canvasesAtTimestamps(times){for(const t of times){decoded.push(t);yield{canvas:{width:10,height:10}};}}}
 class Output {constructor(o){this.target=o.target;}addVideoTrack(){}addAudioTrack(){}async start(){}async finalize(){this.target.buffer=new Uint8Array([1,2,3]).buffer;}async cancel(){cancelled=true;}}
 class CanvasSource {async add(t,d){encoded.push({t,d});}close(){}}
 class AudioBufferSource {async add(){audioAdded=true;}close(){}}
 const bun={Input,CanvasSink,Output,CanvasSource,AudioBufferSource,BlobSource:class{},BufferTarget:class{},WebMOutputFormat:class{},Mp4OutputFormat:class{},Quality:class{},ALL_FORMATS:[],canEncodeVideo:async()=>true,canEncodeAudio:async()=>true};
 globalThis.document={createElement:()=>({width:0,height:0}),fonts:{ready:Promise.resolve(),load:async()=>[]}};
 globalThis.OfflineAudioContext=class{async startRendering(){return {};}};
 try{
  const p=fixture();p.clips["clip-1"]={...p.clips["clip-1"],duration:1,sourceStart:2,sourceEnd:4,speed:2};p.assets["asset-1"].size=1;
  const render=loader({"app/lib/editor/original.ts":{readOriginal:async()=>new Blob(["x"])},"mediabunny":bun,"app/lib/editor/compositor.ts":{Compositor:class{setFrame(){}render(){}dispose(){}},visibleLayers:(p,t)=>Object.values(p.clips).filter(c=>t>=c.startTime&&t<c.startTime+c.duration).map(clip=>({clip}))}})("app/lib/editor/offlineExport.ts").renderOffline;
  const priorFetch=globalThis.fetch;globalThis.fetch=async()=>new Response(new Uint8Array([1]));
  try{for(const mime of ["video/webm;codecs=vp8,opus","video/mp4"]){encoded.length=0;decoded.length=0;const result=await render(p,{resolution:720,fps:30,mime,quality:"high"},{resolve:async()=>"blob:test"},()=>{},new AbortController().signal);assert.equal(result.size,3);assert.equal(result.type,mime.startsWith("video/mp4")?"video/mp4":"video/webm");assert.equal(encoded.length,30);assert.equal(decoded[0],2);assert.ok(Math.abs(decoded[29]-(2+29/30*2))<1e-9);assert.equal(audioAdded,true);assert.equal(disposed,true);assert.equal(cancelled,false);}}finally{globalThis.fetch=priorFetch;}
 }finally{for(const [key,value] of Object.entries(originals))if(value===undefined)delete globalThis[key];else globalThis[key]=value;}
});

test("preview clock stays aligned across slow frames and pauses while buffering",()=>{
 const {playbackTime}=load("app/lib/editor/playbackClock.ts");
 let time=0;for(let frame=0;frame<20;frame++)time=playbackTime(time,true,false,.25,8);assert.equal(time,5);
 assert.equal(playbackTime(5,true,true,.5,8),5);assert.equal(playbackTime(5,false,false,.5,8),5);assert.equal(playbackTime(7.8,true,false,.5,8),8);
});

test("fit and fill keep visual clips centered and share undoable transforms",()=>{let p=fixture();p.settings.aspectRatio="9:16";const clip=p.clips["clip-1"],asset=p.assets[clip.assetId];asset.width=1920;asset.height=1080;const fitted=operations.frameClip(p,clip.id,"fit"),filled=operations.frameClip(p,clip.id,"fill");assert.equal(fitted.clips[clip.id].transform.scale,1);assert.ok(filled.clips[clip.id].transform.scale>3);assert.equal(filled.clips[clip.id].transform.x,0);assert.equal(filled.clips[clip.id].transform.y,0);assert.equal(p.clips[clip.id].transform.scale,1);p.tracks[clip.trackId].locked=true;assert.throws(()=>operations.frameClip(p,clip.id,"fill"),/unlock/i);});
test("playback no-op updates do not trigger unnecessary subscribers; invalid seeks remain safe",()=>{const {PlaybackStore}=load("app/lib/editor/store.ts"),clock=new PlaybackStore();let updates=0;clock.subscribe(()=>updates++);clock.set(0,false);assert.equal(updates,0);clock.set(2,true);clock.set(2,true);assert.equal(updates,1);clock.set(NaN,true);assert.equal(clock.getSnapshot().time,2);assert.equal(updates,1);clock.set(-10,false);assert.equal(clock.getSnapshot().time,0);assert.equal(updates,2);});
test("cached originals are used first; missing local bytes use the shared authenticated loader",async()=>{for(const present of [true,false]){let loads=0;const {MediaRepository}=loader({"app/lib/editor/cache.ts":{cacheRead:async()=>present?new Blob(["cached"]):undefined,cacheWrite:async()=>{}},"app/lib/editor/original.ts":{readOriginal:async()=>{loads++;return new Blob(["remote"]);}}})("app/lib/editor/media.ts"),repository=new MediaRepository();const url=await repository.resolve({id:'local',localKey:'cached',libraryId:'private-library',name:'Video'});assert.ok(url.startsWith('blob:'));assert.equal(loads,present?0:1);assert.equal(await repository.resolve({id:'local'}),url);repository.dispose();}});


test("legacy video dimensions are read from the original and decoding resources released",async()=>{const previous=globalThis.document;let paused=false,released=false;class Video extends EventTarget{videoWidth=640;videoHeight=360;set src(value){assert.equal(value,'blob:test');queueMicrotask(()=>this.dispatchEvent(new Event('loadedmetadata')));}pause(){paused=true;}removeAttribute(name){assert.equal(name,'src');released=true;}load(){}}globalThis.document={createElement:()=>new Video()};try{const {visualDimensions}=load('app/lib/editor/media.ts');assert.deepEqual(await visualDimensions({kind:'video',width:0,height:0},{resolve:async()=> 'blob:test'}),{width:640,height:360});assert.equal(paused,true);assert.equal(released,true);}finally{globalThis.document=previous;}});

test("caption templates preserve speech and timing and apply as one undoable edit",()=>{let p=model.createProject('templates');p=operations.addCaption(p,'Keep Original Speech',1,2);p=operations.addCaption(p,'Second caption',4,2);const ids=Object.keys(p.clips),original=JSON.stringify(p),store=new EditorStore(p),{DEFAULT_CAPTION_TEMPLATES}=load('app/lib/captions/templates.ts'),{applyCaptionTemplate}=load('app/lib/editor/captionTemplates.ts');store.execute(p=>applyCaptionTemplate(p,ids,DEFAULT_CAPTION_TEMPLATES[0]));for(const id of ids){assert.equal(store.getSnapshot().clips[id].startTime,p.clips[id].startTime);assert.equal(store.getSnapshot().clips[id].duration,p.clips[id].duration);const content=p.clips[id].contentId;assert.equal(store.getSnapshot().captions[content].text,p.captions[content].text);}assert.equal(JSON.stringify(p),original);store.undo();assert.deepEqual(store.getSnapshot().captions,p.captions);store.redo();assert.notDeepEqual(store.getSnapshot().captions,p.captions);});
test("caption template selection is scoped and locked tracks remain protected",()=>{let p=model.createProject('templates');p=operations.addCaption(p,'One',0,1);p=operations.addCaption(p,'Two',2,1);const ids=Object.keys(p.clips),{DEFAULT_CAPTION_TEMPLATES}=load('app/lib/captions/templates.ts'),{applyCaptionTemplate}=load('app/lib/editor/captionTemplates.ts'),result=applyCaptionTemplate(p,[ids[0]],DEFAULT_CAPTION_TEMPLATES[0]);assert.deepEqual(result.captions[p.clips[ids[1]].contentId],p.captions[p.clips[ids[1]].contentId]);p.tracks[p.clips[ids[0]].trackId].locked=true;assert.throws(()=>applyCaptionTemplate(p,ids,DEFAULT_CAPTION_TEMPLATES[0]),/unlock/i);});

test("caption template casing renders without overwriting transcript text",()=>{let p=model.createProject('casing');p=operations.addCaption(p,'Original Speech',0,2);const id=Object.keys(p.clips)[0];p=operations.changeText(p,id,'Original Speech',{casing:'uppercase'});const drawn=[],context=new Proxy({measureText:text=>({width:text.length*10}),fillText:text=>drawn.push(text)},{get:(target,key)=>key in target?target[key]:(()=>{}),set:(target,key,value)=>{target[key]=value;return true;}});const {Compositor}=loader({'app/lib/editor/media.ts':{}})('app/lib/editor/compositor.ts'),renderer=new Compositor({});renderer.render({width:960,height:540,getContext:()=>context},p,1);assert.equal(drawn.join(' '),'ORIGINAL SPEECH');assert.equal(p.captions[p.clips[id].contentId].text,'Original Speech');renderer.dispose();});

test('replacement preserves edit properties, other clips and undo; rejects short or locked media',()=>{
 let p=fixture();p=operations.trimClip(p,'clip-1','right',2);p=operations.duplicateClip(p,'clip-1',3);
 const other=Object.values(p.clips).find(c=>c.id!=='clip-1');
 p=operations.addAsset(p,{...p.assets['asset-1'],id:'new',name:'Replacement',duration:4});
 const store=new EditorStore(p);store.execute(q=>operations.replaceClipAsset(q,'clip-1','new',1));const next=store.getSnapshot().clips['clip-1'];
 for(const key of ['id','trackId','startTime','duration','transform','volume','speed','fadeIn','fadeOut','effects'])assert.deepEqual(next[key],p.clips['clip-1'][key]);
 assert.equal(next.sourceStart,1);assert.equal(next.sourceEnd,3);assert.deepEqual(store.getSnapshot().clips[other.id],other);assert.equal(p.assets['asset-1'].name,'Footage.mp4');
 store.undo();assert.equal(store.getSnapshot().clips['clip-1'].assetId,'asset-1');store.redo();assert.equal(store.getSnapshot().clips['clip-1'].assetId,'new');
 assert.throws(()=>operations.replaceClipAsset(p,'clip-1','new',3),/too short/);assert.throws(()=>operations.replaceClipAsset(p,'clip-1','new',NaN),/valid time/);
 p.tracks['track-video'].locked=true;assert.throws(()=>operations.replaceClipAsset(p,'clip-1','new'),/Unlock/);
});
test('original reader uses cached bytes without fetch and private route with authenticated headers',async()=>{
 const prior=globalThis.fetch;let fetched=false;
 try{
  globalThis.fetch=async()=>{fetched=true;throw Error('Blob fetch must not happen');};
  const blob=new Blob(['original']);const cached=loader({'app/lib/editor/cache.ts':{cacheRead:async()=>blob}})('app/lib/editor/original.ts');
  assert.strictEqual(await cached.readOriginal({localKey:'cached',name:'Original',size:8},new AbortController().signal),blob);assert.equal(fetched,false);
  let requested;globalThis.fetch=async(url,options)=>{requested={url,options};return new Response('original');};
  const remote=loader({'app/lib/editor/cache.ts':{cacheRead:async()=>undefined},'app/lib/assets/client.ts':{assetHeaders:async()=>({Authorization:'Bearer test'})}})('app/lib/editor/original.ts');
  await remote.readOriginal({libraryId:'owned-id',url:'https://external.example',name:'Original',size:8},new AbortController().signal);
  assert.equal(requested.url,'/api/assets/owned-id/file');assert.equal(requested.options.headers.Authorization,'Bearer test');
  await assert.rejects(()=>remote.readOriginal({url:'blob:missing',name:'Missing'},new AbortController().signal),/Relink/);
 }finally{globalThis.fetch=prior;}
});
test('speech context uses sorted visible caption timing and excludes uncaptained media',()=>{
 const {speechContext}=load('app/lib/editor/speechContext.ts');let p=fixture();p=operations.addCaption(p,'Later speech',5,1);p=operations.addCaption(p,'Earlier speech',2,2);
 const context=speechContext(p);assert.equal(context.length,2);assert.equal(context[0].text,'Earlier speech');assert.equal(context[0].start,2);assert.equal(context[0].end,4);
 p.tracks['track-caption'].hidden=true;assert.deepEqual(speechContext(p),[]);
});

test('ducking uses real caption cues, soft ramps and manual gain in preview/export shared mixer',()=>{
 const {clipGain,speechWindows}=load('app/lib/editor/audioMix.ts');let p=fixture();p=operations.addAsset(p,{...p.assets['asset-1'],id:'music',kind:'audio'});p=operations.addClip(p,'music','track-audio',0,{id:'music-clip',audioRole:'background',volume:.4});p=operations.addCaption(p,'Actual speech',2,1);const music=p.clips['music-clip'];
 assert.equal(clipGain(p,music,2.5),.4);p.settings.audioDucking=true;assert.equal(clipGain(p,music,2.5),.1);assert.equal(clipGain(p,music,1),.4);assert.equal(clipGain(p,music,3.3),.4);
 assert.ok(Math.abs(clipGain(p,music,1.96)-.25)<1e-8);assert.ok(Math.abs(clipGain(p,music,3.11)-.25)<1e-8);assert.equal(clipGain(p,p.clips['clip-1'],2.5),1);
 assert.equal(clipGain(p,{...music,ducking:false},2.5),.4);assert.equal(music.volume,.4);
 p.tracks['track-video'].muted=true;assert.deepEqual(speechWindows(p),[]);assert.equal(clipGain(p,music,2.5),.4);
 p.tracks['track-audio'].muted=true;assert.equal(clipGain(p,music,2.5),0);
});
test('untranscribed speech ducks across the voice clip; no speech or out-of-range audio stays safe',()=>{
 const {clipGain,speechWindows}=load('app/lib/editor/audioMix.ts');let p=fixture();p.settings.audioDucking=true;
 p=operations.addAsset(p,{...p.assets['asset-1'],id:'sfx',kind:'audio'});p=operations.addClip(p,'sfx','track-audio',0,{id:'sfx-c',audioRole:'sfx',volume:.2,fadeIn:1});
 assert.deepEqual(speechWindows(p),[{start:0,end:10}]);assert.equal(clipGain(p,p.clips['sfx-c'],2),.05);assert.equal(clipGain(p,p.clips['sfx-c'],-1),0);assert.equal(clipGain(p,p.clips['sfx-c'],11),0);
 const snapshot=aiProjectSnapshot(p);assert.equal(snapshot.settings.audioDucking,true);assert.equal(snapshot.clips['sfx-c'].audioRole,'sfx');
 const edited=validateAiPlan({summary:'Mark voice',decisions:[{op:'changeClipProperty',clipId:'sfx-c',changes:{audioRole:'speech',ducking:false}}]},p);const next=applyEditDecisionList(p,edited.list);assert.equal(next.clips['sfx-c'].audioRole,'speech');assert.equal(next.clips['sfx-c'].ducking,false);
 assert.throws(()=>validateAiPlan({summary:'Bad',decisions:[{op:'changeClipProperty',clipId:'sfx-c',changes:{audioRole:'invented'}}]},p));
});
test('caption correction preserves style, validates range, supports Undo and protects locked tracks',()=>{
 const {editCaption}=load('app/lib/editor/captionEditing.ts');let p=model.createProject('correction');p=operations.addCaption(p,'Speling',1,2,{color:'#abcdef'});const id=Object.keys(p.clips)[0],store=new EditorStore(p),style=p.captions[p.clips[id].contentId].style;
 store.execute(q=>editCaption(q,id,'Spelling',1.5,3));const next=store.getSnapshot();assert.equal(next.captions[next.clips[id].contentId].text,'Spelling');assert.equal(next.clips[id].duration,1.5);assert.deepEqual(next.captions[next.clips[id].contentId].style,style);store.undo();assert.equal(store.getSnapshot().captions[p.clips[id].contentId].text,'Speling');
 for(const [start,end]of [[NaN,2],[-1,2],[3,2],[1,61],[1,1.001]])assert.throws(()=>editCaption(p,id,'Text',start,end));p.tracks['track-caption'].locked=true;assert.throws(()=>editCaption(p,id,'Text',1,2),/Unlock/);
});
test('stock choice skips previous and same-batch footage, short originals and oversized downloads',()=>{
 const {stockKeys,chooseStock}=load('app/lib/editor/stockSelection.ts');let p=fixture();p.assets.old={...p.assets['asset-1'],id:'old',name:'AI-broll-10.mp4'};const used=stockKeys(p),videos=[{id:10,videoUrl:'a',duration:10},{id:11,videoUrl:'b',duration:1},{id:12,videoUrl:'c',duration:10,size:101*1048576},{id:13,videoUrl:'d',duration:10},{id:14,videoUrl:'e',duration:10}];
 assert.equal(chooseStock(videos,'broll',used,2).id,13);used.add('broll:13');assert.equal(chooseStock(videos,'broll',used,2).id,14);used.add('broll:14');assert.throws(()=>chooseStock(videos,'broll',used,2),/avoid repeating/);assert.equal(chooseStock(videos,'motion',used,2).id,10);
});
test('recovery rejects malformed/foreign data while preserving original references and newer revisions',()=>{
 const {validRecovery,chooseRecovery}=load('app/lib/editor/recovery.ts'),p=fixture(),cloud={...p,revision:2},local={...p,revision:3};
 assert.strictEqual(validRecovery(local,p.id),local);assert.strictEqual(chooseRecovery(local,cloud,p.id).project,local);assert.equal(chooseRecovery(local,cloud,p.id).restored,true);
 assert.strictEqual(chooseRecovery({...local,revision:1,updatedAt:'2099-01-01T00:00:00Z'},cloud,p.id).project,cloud);assert.equal(validRecovery(p,'foreign'),undefined);assert.equal(validRecovery({...p,updatedAt:'invalid'},p.id),undefined);
 assert.equal(validRecovery({...p,assets:{}},p.id),undefined);assert.equal(chooseRecovery({...p,assets:{}},cloud,p.id).invalid,true);assert.throws(()=>chooseRecovery(local,{...cloud,assets:{}},p.id),/Autosave is paused/);
 assert.equal(validRecovery(local,p.id).assets['asset-1'].localKey,'private-cache');
});
test('checkpoint queue prevents stale overwrites and retains one atomic previous checkpoint',async()=>{
 const values=new Map(),batches=[];const mocks={'app/lib/editor/cache.ts':{cacheRead:async(_store,key)=>values.get(key),cacheWriteBatch:async(_store,entries)=>{batches.push(entries);for(const [key,value]of entries)values.set(key,value);}}};const {saveCheckpoint}=loader(mocks)('app/lib/editor/recovery.ts'),p=fixture();
 await Promise.all([saveCheckpoint('owner:project',{...p,revision:3}),saveCheckpoint('owner:project',{...p,revision:4}),saveCheckpoint('owner:project',{...p,revision:2})]);
 assert.equal(values.get('owner:project').revision,4);assert.equal(values.get('owner:project:previous').revision,3);assert.equal(batches[1].length,2);
 await assert.rejects(()=>saveCheckpoint('owner:project',{...p,revision:5,assets:{}}),/invalid/);assert.equal(values.get('owner:project').revision,4);
 await saveCheckpoint('owner:project',{...p,revision:5});assert.equal(values.get('owner:project').revision,5);
});
test('timeline zoom preserves visible playhead and group nudges retain spacing and locked-track atomicity',()=>{
 const {zoomAnchor,nudgeClips}=load('app/lib/editor/timelineNavigation.ts');assert.equal(zoomAnchor(60,120,0,600,5),300);assert.equal(zoomAnchor(60,120,0,600,20),300);assert.equal(zoomAnchor(60,8,0,600,5),0);
 let p=fixture();p=operations.moveClip(p,'clip-1',1);p=operations.duplicateClip(p,'clip-1',3);const ids=Object.keys(p.clips),moved=nudgeClips(p,ids,3);assert.equal(moved.clips['clip-1'].startTime,1.1);assert.equal(moved.clips[ids[1]].startTime,3.1);
 const clamped=nudgeClips(p,ids,-100);assert.equal(clamped.clips[ids[0]].startTime,0);assert.equal(clamped.clips[ids[1]].startTime,2);p.tracks['track-video'].locked=true;const store=new EditorStore(p);assert.throws(()=>store.execute(q=>nudgeClips(q,ids,1)),/Unlock/);assert.strictEqual(store.getSnapshot(),p);
});

test('sequence insertion preserves the chosen order, original source bounds, exact joins and one-step Undo',()=>{
 const {appendSequence}=load('app/lib/editor/sequence.ts');let p=model.createProject('sequence');p=operations.addAsset(p,{id:'one',name:'1st clip.MOV',kind:'video',mime:'video/quicktime',size:41544784,duration:13.955,width:1080,height:1920});p=operations.addAsset(p,{...p.assets.one,id:'two',name:'2nd clip.MOV',duration:12.638333,size:37548669});const store=new EditorStore(p);
 store.execute(q=>appendSequence(q,['one','two']).project);const clips=Object.values(store.getSnapshot().clips);assert.equal(clips.length,2);assert.equal(clips[0].startTime,0);assert.equal(clips[1].startTime,13.955);assert.equal(clips[1].startTime,clips[0].startTime+clips[0].duration);assert.ok(Math.abs(model.projectDuration(store.getSnapshot())-26.593333)<1e-8);for(const c of clips){assert.equal(c.sourceStart,0);assert.equal(c.sourceEnd,p.assets[c.assetId].duration);assert.equal(c.volume,1);assert.equal(c.audioRole,'speech');}
 store.undo();assert.equal(Object.keys(store.getSnapshot().clips).length,0);store.redo();assert.equal(Object.keys(store.getSnapshot().clips).length,2);
 const reversed=Object.values(appendSequence(p,['two','one']).project.clips);assert.equal(reversed[0].assetId,'two');assert.equal(reversed[1].startTime,12.638333);
});
test('sequence appends to the target video track and rejects incompatible, locked or oversized batches atomically',()=>{
 const {appendSequence}=load('app/lib/editor/sequence.ts');const p=fixture();p.assets.second={...p.assets['asset-1'],id:'second',duration:12.5};const next=appendSequence(p,['second']).project;assert.equal(Object.values(next.clips).find(c=>c.assetId==='second').startTime,10);assert.equal(Object.keys(p.clips).length,1);
 assert.throws(()=>appendSequence(p,[]));assert.throws(()=>appendSequence(p,['missing']));assert.throws(()=>appendSequence(p,['second','second']));assert.throws(()=>appendSequence(p,['second'],'track-audio'));
 p.assets.long={...p.assets.second,id:'long',duration:55};const store=new EditorStore(p);assert.throws(()=>store.execute(q=>appendSequence(q,['long']).project));assert.strictEqual(store.getSnapshot(),p);p.tracks['track-video'].locked=true;assert.throws(()=>appendSequence(p,['second']));
});
test('multi-clip transcription applies actual source timestamps with the second clip timeline offset',()=>{
 const {appendSequence}=load('app/lib/editor/sequence.ts'),{captionSourceSignature,applyCaptionBatch}=load('app/lib/editor/captionBatch.ts'),{captionsForClip}=load('app/lib/editor/captionTiming.ts');let p=model.createProject('captions-sequence');
 for(const [id,duration]of [['one',13.955],['two',12.638333]])p=operations.addAsset(p,{id,name:id,kind:'video',mime:'video/mp4',size:1,duration,width:1080,height:1920});p=appendSequence(p,['one','two']).project;const clips=Object.values(p.clips),words=[{word:'Actual',start:.3,end:.7},{word:'speech',start:.8,end:1.2}];
 const batches=clips.map(c=>({clipId:c.id,signature:captionSourceSignature(p,c.id),captions:captionsForClip(c,words)})),store=new EditorStore(p);store.execute(q=>applyCaptionBatch(q,batches));const caps=Object.values(store.getSnapshot().clips).filter(c=>c.contentId);assert.equal(caps.length,2);assert.equal(caps[0].startTime,.3);assert.ok(Math.abs(caps[1].startTime-14.255)<1e-9);assert.equal(store.getSnapshot().captions[caps[1].contentId].text,'Actual speech');
 assert.throws(()=>applyCaptionBatch(store.getSnapshot(),batches),/already overlap/);store.undo();assert.equal(Object.keys(store.getSnapshot().captions).length,0);assert.equal(Object.keys(store.getSnapshot().clips).length,2);
});
test('batch captions fail atomically on a changed source or locked track, and short tokens stay inside the cut',()=>{
 const {captionSourceSignature,applyCaptionBatch,checkCaptionSources}=load('app/lib/editor/captionBatch.ts');let p=fixture();const batch={clipId:'clip-1',signature:captionSourceSignature(p,'clip-1'),captions:[{text:'Last token',start:9.999,duration:.001}]};
 const result=applyCaptionBatch(p,[batch]),caption=Object.values(result.clips).find(c=>c.contentId);assert.ok(caption.startTime+caption.duration<=10+1e-8);assert.ok(caption.duration>=1/p.settings.fps-1e-8);
 const moved=operations.moveClip(p,'clip-1',1),store=new EditorStore(moved);assert.throws(()=>store.execute(q=>applyCaptionBatch(q,[batch])),/changed/);assert.strictEqual(store.getSnapshot(),moved);assert.equal(store.canUndo,false);
 p.tracks['track-caption'].locked=true;assert.throws(()=>checkCaptionSources(p,['clip-1']),/caption track/);p.tracks['track-caption'].locked=false;assert.throws(()=>applyCaptionBatch(p,[{...batch,captions:[{text:'Out of bounds',start:9,duration:2}]}]),/outside/);
});

test('new studio caption presets apply at every ratio and survive undo without changing speech',()=>{
 const {STUDIO_CAPTION_TEMPLATES,DEFAULT_CAPTION_TEMPLATES}=load('app/lib/captions/templates.ts');
 const {applyCaptionTemplate}=load('app/lib/editor/captionTemplates.ts');
 for(const id of ['studio-lime','studio-cobalt','studio-ivory','studio-ink','studio-amber','studio-mono','studio-rose','studio-podcast','signature-poppins','dancing-poppins','editorial-serif','handwritten-outfit'])assert.ok(STUDIO_CAPTION_TEMPLATES.some(t=>t.id===id),id);
 assert.equal(new Set(DEFAULT_CAPTION_TEMPLATES.map(t=>t.id)).size,DEFAULT_CAPTION_TEMPLATES.length);
 for(const template of STUDIO_CAPTION_TEMPLATES)for(const ratio of model.aspectRatios){
  let p=model.createProject('new-presets');p.settings.aspectRatio=ratio;
  p=operations.addCaption(p,'Keep my original speech',1,2);
  const id=Object.keys(p.clips)[0],store=new EditorStore(p);
  store.execute(project=>applyCaptionTemplate(project,[id],template));
  const result=store.getSnapshot(),caption=result.captions[result.clips[id].contentId];
  assert.equal(caption.text,'Keep my original speech');assert.equal(result.clips[id].startTime,1);assert.equal(result.clips[id].duration,2);
  assert.ok(Number.isFinite(caption.style.size)&&caption.style.size>=8&&caption.style.size<=400);
  assert.equal(caption.style.color,template.style.highlightingMode==='full-line'?template.style.highlightColor:template.style.textColor);
  store.undo();assert.deepEqual(store.getSnapshot().captions,p.captions);
  store.redo();assert.deepEqual(store.getSnapshot().captions,result.captions);
 }
});

test("word animations use source timings through move, split, trim and speed",()=>{
 const {captionMotionFrame,setCaptionMotion}=load('app/lib/editor/captionMotion.ts');
 let p=model.createProject('words');p=operations.addCaption(p,'Hello world',2,2,{},[{word:'Hello',start:0,end:.8},{word:'world',start:1,end:2}]);
 const id=Object.keys(p.clips)[0];p=setCaptionMotion(p,[id],'word-reveal');const layer=()=>p.captions[p.clips[id].contentId];
 assert.equal(captionMotionFrame(layer(),p.clips[id],2.5).text,'Hello');
 p=operations.moveClip(p,id,4);assert.equal(captionMotionFrame(layer(),p.clips[id],5.2).text,'Hello world');
 p=operations.changeClipProperty(p,id,{speed:2});assert.equal(captionMotionFrame(layer(),p.clips[id],4.6).text,'Hello world');
 p=operations.splitClip(p,id,4.5);const right=Object.values(p.clips).find(c=>c.id!==id);assert.equal(captionMotionFrame(p.captions[right.contentId],right,4.6).text,'Hello world');
 p=setCaptionMotion(p,[right.id],'karaoke');assert.equal(captionMotionFrame(p.captions[right.contentId],right,4.6).active,1);
});
test("manual captions and changed transcripts never invent word timestamps",()=>{
 const {captionMotionFrame,setCaptionMotion}=load('app/lib/editor/captionMotion.ts');let p=model.createProject('manual');p=operations.addCaption(p,'Hello world',0,2);
 const id=Object.keys(p.clips)[0];p=setCaptionMotion(p,[id],'word-reveal');assert.equal(captionMotionFrame(p.captions[p.clips[id].contentId],p.clips[id],.1).text,'Hello world');
 let timed=operations.addCaption(model.createProject('timed'),'Real speech',0,2,{},[{word:'Real',start:0,end:.5},{word:'speech',start:1,end:2}]);const tid=Object.keys(timed.clips)[0];timed=operations.changeText(timed,tid,'Edited words');assert.equal(timed.captions[timed.clips[tid].contentId].words,undefined);
 assert.throws(()=>operations.addCaption(model.createProject('bad'),'Different text',0,2,{},[{word:'fake',start:0,end:2}]),/timing/);
});
test("caption motion is undoable and persists in the authoritative legacy bridge",()=>{
 const {setCaptionMotion}=load('app/lib/editor/captionMotion.ts'),{toLegacy,fromLegacy}=load('app/lib/editor/bridge.ts');let p=model.createProject('save-motion');p=operations.addCaption(p,'Real speech',0,2,{},[{word:'Real',start:0,end:1},{word:'speech',start:1,end:2}]);const id=Object.keys(p.clips)[0],store=new EditorStore(p);store.execute(p=>setCaptionMotion(p,[id],'karaoke','#ff0000'));const after=store.getSnapshot();assert.deepEqual(fromLegacy(JSON.parse(JSON.stringify(toLegacy(after)))).captions,after.captions);store.undo();assert.deepEqual(store.getSnapshot().captions,p.captions);store.redo();assert.deepEqual(store.getSnapshot().captions,after.captions);
 p.tracks['track-caption'].locked=true;assert.throws(()=>setCaptionMotion(p,[id],'pop'),/unlocked/);
});
test("AI prepared captions retain validated real word intervals",()=>{
 const p=model.createProject('ai-words'),plan=validateAiPlan({summary:'Timed speech',decisions:[{op:'addCaption',text:'Real speech',startTime:0,duration:2,words:[{word:'Real',start:0,end:1},{word:'speech',start:1,end:2}],templateId:'clean-sub'}]},p);const result=applyEditDecisionList(p,plan.list);assert.equal(Object.values(result.captions)[0].words[1].start,1);
 assert.throws(()=>validateAiPlan({summary:'Bad timing',decisions:[{op:'addCaption',text:'Real',startTime:0,duration:1,words:[{word:'Real',start:0,end:5}]}]},p),/timing/);
});
test("editor compositor draws timed highlight and reveal with the same export renderer",()=>{
 const {setCaptionMotion}=load('app/lib/editor/captionMotion.ts'),{Compositor}=loader({'app/lib/editor/media.ts':{}})('app/lib/editor/compositor.ts');let p=model.createProject('draw');p=operations.addCaption(p,'Hello world',0,2,{},[{word:'Hello',start:0,end:1},{word:'world',start:1,end:2}]);const id=Object.keys(p.clips)[0],drawn=[],ctx=new Proxy({measureText:text=>({width:text.length*10}),fillText:text=>drawn.push(text)},{get:(t,k)=>k in t?t[k]:(()=>{}),set:(t,k,v)=>{t[k]=v;return true;}}),canvas={width:960,height:540,getContext:()=>ctx},renderer=new Compositor({});
 p=setCaptionMotion(p,[id],'word-reveal');renderer.render(canvas,p,.5);assert.deepEqual(drawn,['Hello']);drawn.length=0;p=setCaptionMotion(p,[id],'karaoke');renderer.render(canvas,p,1.5);assert.deepEqual(drawn,['Hello world','world']);renderer.dispose();
});
test("AI review reports removals, framing changes, speed and main-footage gaps",()=>{
 const {reviewEdit}=load('app/lib/editor/aiReview.ts');let p=fixture();p=operations.addCaption(p,'Keep',0,2);let after=operations.removeClip(p,Object.values(p.clips).find(c=>c.contentId).id);after=operations.changeClipProperty(after,'clip-1',{speed:2});after=operations.moveClip(after,'clip-1',1);after={...after,settings:{...after.settings,aspectRatio:'9:16'}};const result=reviewEdit(p,after);assert.equal(result.removed,1);assert.equal(result.changed,1);assert.equal(result.warnings.length,5);assert.ok(result.warnings.some(w=>w.includes('gap')));
});
test("compositor does not start any source while a second active source is buffering",async()=>{
 const previous={HTMLMediaElement:globalThis.HTMLMediaElement,HTMLVideoElement:globalThis.HTMLVideoElement,document:globalThis.document};
 class Media{currentTime=0;duration=10;readyState=2;seeking=false;paused=true;starts=0;playbackRate=1;play(){this.starts++;this.paused=false;return Promise.resolve();}pause(){this.paused=true;}removeAttribute(){}load(){}}
 globalThis.HTMLMediaElement=Media;globalThis.HTMLVideoElement=class extends Media{};
 try{const {Compositor}=loader({'app/lib/editor/media.ts':{waitMedia:async()=>{}}})('app/lib/editor/compositor.ts');let p=fixture();p=operations.addClip(p,'asset-1','track-overlay',0,{id:'second'});const renderer=new Compositor({});const a=new Media(),b=new Media();b.readyState=1;
 renderer.entries.set('clip-1',{assetKey:'asset-1:private-cache',element:a,ready:true});renderer.entries.set('second',{assetKey:'asset-1:private-cache',element:b,ready:true});
 assert.equal(renderer.sync(p,0,true),false);assert.equal(a.starts,0);assert.equal(b.starts,0);b.readyState=2;assert.equal(renderer.sync(p,0,true),true);assert.equal(a.starts,1);assert.equal(b.starts,1);renderer.sync(p,0,true);assert.equal(a.starts,1);await Promise.resolve();renderer.dispose();
 }finally{Object.assign(globalThis,previous);}
});

test('reviewed AI document is committed exactly and restored with one undo and redo',()=>{
 const {commitReviewedEdit}=load('app/lib/editor/reviewedEdit.ts');const p=fixture(),store=new EditorStore(p);
 const draft=operations.addText(operations.changeClipProperty(p,'clip-1',{volume:.3}),'Reviewed title',1);
 commitReviewedEdit(store,p,draft);assert.deepEqual(store.getSnapshot().clips,draft.clips);assert.deepEqual(store.getSnapshot().textLayers,draft.textLayers);
 store.undo();assert.deepEqual(store.getSnapshot().clips,p.clips);assert.equal(store.canUndo,false);
 store.redo();assert.deepEqual(store.getSnapshot().clips,draft.clips);assert.deepEqual(store.getSnapshot().textLayers,draft.textLayers);
});
test('reviewed AI edit refuses stale, foreign and in-progress edits without touching history',()=>{
 const {commitReviewedEdit}=load('app/lib/editor/reviewedEdit.ts');const p=fixture(),store=new EditorStore(p),draft=operations.addText(p,'Review',0);
 assert.throws(()=>commitReviewedEdit(store,p,{...draft,id:'foreign'}),/different/);assert.equal(store.canUndo,false);
 store.begin();store.preview(q=>operations.moveClip(q,'clip-1',1));const pending=store.getSnapshot();assert.throws(()=>commitReviewedEdit(store,p,draft),/changed/);assert.strictEqual(store.getSnapshot(),pending);store.cancel();
 store.execute(q=>operations.moveClip(q,'clip-1',2));const current=store.getSnapshot();assert.throws(()=>commitReviewedEdit(store,p,draft),/changed/);assert.strictEqual(store.getSnapshot(),current);store.undo();assert.deepEqual(store.getSnapshot().clips,p.clips);assert.equal(store.canUndo,false);
});

test('AI intent retains Hinglish negation and literal constraints and exposes clarification',()=>{
 const {readEditingIntent}=load('app/lib/editor/editingIntent.ts');const intent=readEditingIntent({intent:{goal:'Sirf captions add karo, framing mat badlo',preserve:['Original framing','SFX nahi'],questions:['Which caption language?']}});
 assert.ok(intent.summary.includes('framing mat badlo'));assert.ok(intent.summary.includes('SFX nahi'));assert.equal(intent.questions.length,1);
 for(const intent of [null,{goal:'x',preserve:'bad',questions:[]},{goal:'x',preserve:[],questions:[123]}])assert.throws(()=>readEditingIntent({intent}));
});

test('planner clarification suppresses every proposed operation and tool without provider retry',async()=>{
 let calls=0;const run=loader({'app/lib/server/radoxService.ts':{generateEditorJson:async()=>{calls++;return {intent:{goal:'Improve this edit',preserve:['Original footage'],questions:['What editing style do you want?']},summary:'Will remove footage',decisions:[{op:'removeClip',clipId:'clip-1'}],toolRequests:[{type:'image',prompt:'unrequested'}]};}}});
 const result=await run('app/lib/server/editorAi.ts').planAiEdit(fixture(),'better bana',[], 'owner',new AbortController().signal);
 assert.equal(calls,1);assert.equal(result.list.decisions.length,0);assert.equal(result.toolRequests.length,0);assert.match(result.summary,/What editing style/);
});

test('AI planning uses one call for valid edits and at most two for invalid edits',async()=>{
 for(const mode of ['valid','repair','invalid','quota']){
  let calls=0;const run=loader({'app/lib/server/radoxService.ts':{generateEditorJson:async()=>{calls++;if(mode==='quota')throw new Error('Groq rate limit');return {summary:'Requested volume',decisions:(mode==='valid'||mode==='repair'&&calls===2)?[{op:'changeClipProperty',clipId:'clip-1',changes:{volume:.5}}]:[{op:'removeClip',clipId:'missing'}],toolRequests:[]};}}});
  const request=run('app/lib/server/editorAi.ts').planAiEdit(fixture(),'volume 50%',[],'owner',new AbortController().signal);
  if(mode==='invalid'||mode==='quota')await assert.rejects(request);else {const result=await request;assert.equal(result.modelRequests,mode==='valid'?1:2);}
  assert.equal(calls,mode==='valid'||mode==='quota'?1:2);
 }
});

test('AI placement presets work at every ratio and preserve text, words, timing, audio and undo',()=>{
 const {TEXT_PLACEMENTS,applyTextPlacement}=load('app/lib/editor/textPlacement.ts');
 for(const ratio of model.aspectRatios){for(const preset of TEXT_PLACEMENTS){let p=fixture();p={...p,settings:{...p.settings,aspectRatio:ratio}};p=operations.addCaption(p,'Original speech words',1,2,{},[{word:'Original',start:0,end:.6},{word:'speech',start:.6,end:1.2},{word:'words',start:1.2,end:2}]);const id=Object.keys(p.clips).find(id=>p.clips[id].contentId),store=new EditorStore(p),content=p.clips[id].contentId;
 const validated=validateAiPlan({summary:'Place captions',decisions:[{op:'applyTextPlacement',clipIds:[id],placementId:preset.id}]},p);store.execute(q=>applyEditDecisionList(q,validated.list));const after=store.getSnapshot();assert.equal(after.clips[id].transform.y,preset.y);assert.equal(after.captions[content].style.align,preset.align);assert.equal(after.captions[content].text,p.captions[content].text);assert.deepEqual(after.captions[content].words,p.captions[content].words);assert.equal(after.clips[id].startTime,1);assert.equal(after.clips[id].duration,2);assert.deepEqual(after.clips['clip-1'],p.clips['clip-1']);store.undo();assert.deepEqual(store.getSnapshot().clips,p.clips);
 }}
 const p=fixture();assert.throws(()=>applyTextPlacement(p,['clip-1'],'title-center'),/only/);assert.throws(()=>validateAiPlan({summary:'Bad',decisions:[{op:'addText',text:'Title',startTime:0,placementId:'invented'}]},p),/Unknown/);
 const plan=validateAiPlan({summary:'Title',decisions:[{op:'addText',text:'Exact title',startTime:0,placementId:'hook-top'}]},p);const after=applyEditDecisionList(p,plan.list),clip=Object.values(after.clips).find(c=>c.contentId);assert.equal(clip.transform.y,-.28);assert.equal(after.textLayers[clip.contentId].text,'Exact title');
});
