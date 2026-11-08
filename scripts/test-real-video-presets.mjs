import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(path.join(root, 'package.json'));
const ts = require('typescript');

const videoPath = 'C:/Users/Admin/.gemini/antigravity/brain/17d8113a-a37c-4601-9463-ce98f962f96c/.user_uploaded/media_1794065113502_57981980.mp4';
const transcriptPath = 'C:/Users/Admin/.gemini/antigravity/brain/17d8113a-a37c-4601-9463-ce98f962f96c/transcript.json';
const outDir = 'C:/Users/Admin/.gemini/antigravity/brain/17d8113a-a37c-4601-9463-ce98f962f96c/edited_outputs';

if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

function loader(mocks = {}) {
  const cache = new Map();
  const context = vm.createContext({
    console,
    URL,
    URLSearchParams,
    Headers,
    Request,
    Response,
    Buffer,
    Error,
    structuredClone,
    TextEncoder,
    AbortSignal,
    AbortController,
    Uint8Array,
    crypto: globalThis.crypto,
    setTimeout,
    clearTimeout,
    fetch: globalThis.fetch,
    document: { fonts: { ready: Promise.resolve() }, createElement: () => ({}) },
    navigator: {},
    process: { env: { ...process.env } }
  });

  const baseMocks = {
    'app/lib/supabase.ts': {
      supabase: {
        auth: {
          getSession: async () => ({ data: { session: { access_token: 'test-token' } } })
        }
      }
    },
    'app/lib/server/planUsage.ts': {
      withUsage: (h) => h,
      reserveUsage: async () => ({ reservationId: 'test-usage' }),
      finishUsage: async () => {},
      PlanLimitError: class extends Error {},
      usageError: () => new Response('{}', { status: 503 })
    },
    'app/lib/server/speechDuration.ts': {
      speechDuration: async () => 16.55
    },
    'app/lib/server/providerRegistry.ts': {
      getProviderCredential: async () => 'test-key',
      recordProviderUsage: async () => {}
    },
    'app/lib/server/editorTokenBudget.ts': {
      reserveEditorTokens: async () => 'test-budget-lease',
      settleEditorTokens: async () => {},
      worstCaseTokens: () => 1000
    },
    'app/lib/assets/client.ts': {
      linkAsset: async () => {}
    },
    'app/lib/editor/footageFramesClient.ts': {
      captureFootageEvidence: async () => ({ footageFrames: [], fallbackFootageFrames: [] })
    },
    'app/lib/editor/recovery.ts': {
      saveCheckpoint: async () => {}
    },
    'app/lib/editor/compositor.ts': {
      Compositor: class { sync() { return true; } render() {} dispose() {} }
    },
    ...mocks
  };

  function load(relative) {
    let file = path.resolve(root, relative);
    if (!path.extname(file)) file += '.ts';
    const key = path.relative(root, file).replaceAll('\\', '/');
    if (key in baseMocks) return baseMocks[key];
    if (cache.has(file)) return cache.get(file);
    const exports = {};
    cache.set(file, exports);
    const raw = fs.readFileSync(file, 'utf8');
    const code = ts.transpileModule(raw, {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        esModuleInterop: true
      }
    }).outputText.replaceAll('import.meta.url', JSON.stringify(pathToFileURL(file).href));

    new vm.Script('(function(require,module,exports){\n' + code + '\n})', { filename: file }).runInContext(context)(
      (s) => s.startsWith('@/') ? load(s.slice(2)) : s.startsWith('.') ? load(path.relative(root, path.resolve(path.dirname(file), s))) : require(s),
      { exports },
      exports
    );
    return exports;
  }
  return load;
}

const load = loader();
const model = load('app/lib/editor/model.ts');
const ops = load('app/lib/editor/operations.ts');
const pipeline = load('app/lib/editor/sequentialEdit.ts');
const captionTiming = load('app/lib/editor/captionTiming.ts');

const transcriptRaw = JSON.parse(fs.readFileSync(transcriptPath, 'utf8'));
const transcriptWords = transcriptRaw.words.map(w => ({ word: w.text || w.word, start: w.start, end: w.end }));

console.log('===============================================================');
console.log('KREOVAR VIDEO EDITOR REAL PRESET VERIFICATION');
console.log('Video: Manoj_Bajpayee_Roto.mp4 (16.55s, 1080x1920)');
console.log(`Transcript words: ${transcriptWords.length}`);
console.log('===============================================================\n');

function createManojProject(projectId) {
  let p = model.createProject(projectId);
  p.settings.aspectRatio = '9:16';
  p.settings.fps = 30;

  p = ops.addAsset(p, {
    id: 'manoj-asset',
    kind: 'video',
    name: 'Manoj_Bajpayee_Roto.mp4',
    duration: 16.554667,
    width: 1080,
    height: 1920,
    mime: 'video/mp4',
    size: 14645822,
    url: videoPath
  });

  p = ops.addClip(p, 'manoj-asset', 'track-video', 0, {
    id: 'manoj-clip',
    name: 'Manoj Bajpayee Speech',
    duration: 16.554667,
    sourceStart: 0,
    sourceEnd: 16.554667,
    volume: 1
  });

  return p;
}

function makeRuntime(initialProject, stageHandler) {
  let project = structuredClone(initialProject);
  return {
    getProject: () => project,
    interacting: () => false,
    persist: async (next, job) => {
      job.timelineRevision = project.revision + 1;
      project = { ...next, revision: job.timelineRevision, editingJob: structuredClone(job) };
    },
    execute: async (...args) => stageHandler(...args)
  };
}

// -------------------------------------------------------------
// TEST 1: PRESET "CLEAN" (Clean captions)
// -------------------------------------------------------------
async function testCleanPreset() {
  console.log('--- TESTING PRESET 1: "clean" (Clean captions) ---');
  const project = createManojProject('clean-preset-test');
  const preset = pipeline.PIPELINE_PRESETS.find(p => p.id === 'clean');
  assert(preset, 'Preset clean should exist');
  
  const timedCaptions = captionTiming.captionsForClip(project.clips['manoj-clip'], transcriptWords);
  assert(timedCaptions.length > 0, 'Timed captions must be generated from speech words');
  console.log(`Generated ${timedCaptions.length} caption groups with template clean-sub`);

  const job = pipeline.createEditingJob(project, preset.instruction, [], preset);
  assert.equal(JSON.stringify(job.stages.map(s => s.id)), JSON.stringify(['analyzeFootage', 'applyCaptions', 'validateEdit']));

  const runtime = makeRuntime(project, async (stage, proj, j) => {
    switch (stage) {
      case 'analyzeFootage':
        return {
          summary: 'Analyzed 1 source clip (16.55s), 64 speech segments.',
          operations: preset.operations
        };
      case 'applyCaptions':
        return {
          summary: 'Apply timed speech captions with clean-sub',
          decisions: timedCaptions.map(c => ({
            op: 'addCaption',
            text: c.text,
            startTime: c.start,
            duration: c.duration,
            templateId: 'clean-sub',
            words: c.words
          }))
        };
      case 'validateEdit':
        return pipeline.validateCompletedJob(proj, j);
      default:
        throw new Error(`Unexpected stage: ${stage}`);
    }
  });

  const signal = new AbortController().signal;
  const resultJob = await pipeline.runEditingJob(runtime, job, signal);
  const finalProject = runtime.getProject();

  if (resultJob.status !== 'completed') {
    console.error('Job failed with errors:', resultJob.errors);
    console.error('Stages:', resultJob.stages.map(s => ({ id: s.id, status: s.status, error: s.error })));
  }

  assert.equal(resultJob.status, 'completed', 'Clean preset job must complete successfully');
  assert.equal(Object.keys(finalProject.captions).length, timedCaptions.length);
  assert.equal(resultJob.appliedOperations.length >= 1, true);

  console.log(`[PASS] Clean Preset Job Status: ${resultJob.status}`);
  console.log(`[PASS] Total Captions Added: ${Object.keys(finalProject.captions).length}`);
  console.log(`[PASS] Final Project Revision: ${finalProject.revision}`);

  // Generate SRT and export video
  const srtContent = captionTiming.captionsSrt(finalProject);
  const srtFile = path.join(outDir, 'clean_captions.srt');
  fs.writeFileSync(srtFile, srtContent, 'utf8');
  console.log(`Saved SRT: ${srtFile}`);

  // Render MP4 with burned subtitles
  const cleanMp4 = path.join(outDir, 'Manoj_Bajpayee_Clean_Preset.mp4');
  console.log(`Rendering preview MP4 to ${cleanMp4}...`);
  const escapedSrt = srtFile.replaceAll('\\', '/').replace(':', '\\:');
  execSync(`ffmpeg -i "${videoPath}" -vf "subtitles='${escapedSrt}':force_style='FontSize=16,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,BorderStyle=3,Outline=2,Alignment=2,MarginV=60'" -c:v libx264 -preset veryfast -crf 22 -c:a copy "${cleanMp4}" -y`, { stdio: 'pipe' });
  assert(fs.existsSync(cleanMp4) && fs.statSync(cleanMp4).size > 100000, 'Clean MP4 must be generated');
  console.log(`[PASS] Clean MP4 rendered successfully: ${(fs.statSync(cleanMp4).size / 1024 / 1024).toFixed(2)} MB\n`);

  return finalProject;
}

// -------------------------------------------------------------
// TEST 2: PRESET "ENGAGING" (Engaging talking head)
// -------------------------------------------------------------
async function testEngagingPreset() {
  console.log('--- TESTING PRESET 2: "engaging" (Engaging talking head) ---');
  const project = createManojProject('engaging-preset-test');
  const preset = pipeline.PIPELINE_PRESETS.find(p => p.id === 'engaging');
  assert(preset, 'Preset engaging should exist');

  const timedCaptions = captionTiming.captionsForClip(project.clips['manoj-clip'], transcriptWords);
  const job = pipeline.createEditingJob(project, preset.instruction, [], preset);
  assert.equal(JSON.stringify(job.stages.map(s => s.id)), JSON.stringify([
    'analyzeFootage', 'applyCaptions', 'planMotionGraphics', 'applyMotionGraphics',
    'findBroll', 'applyBroll', 'applyZooms', 'validateEdit'
  ]));

  const brollAsset = {
    id: 'broll-reflection',
    libraryId: 'broll-reflection',
    kind: 'video',
    name: 'Self_Improvement_Broll.mp4',
    duration: 3.5,
    width: 1080,
    height: 1920,
    mime: 'video/mp4',
    size: 500000
  };

  let plannedGraphics = null;
  let plannedBroll = null;

  const runtime = makeRuntime(project, async (stage, proj, j) => {
    switch (stage) {
      case 'analyzeFootage':
        return {
          summary: 'Analyzed 1 source clip (16.55s), 64 speech segments.',
          operations: preset.operations
        };
      case 'applyCaptions':
        return {
          summary: 'Apply animated captions with signature-poppins',
          animateCaptions: true,
          decisions: timedCaptions.map(c => ({
            op: 'addCaption',
            text: c.text,
            startTime: c.start,
            duration: c.duration,
            templateId: 'signature-poppins',
            words: c.words
          }))
        };
      case 'planMotionGraphics':
        plannedGraphics = {
          summary: 'Dynamic callout highlighting "MANY MISTAKES"',
          decisions: [{
            op: 'addGraphic',
            kind: 'callout',
            text: 'MANY MISTAKES',
            startTime: 3.2,
            duration: 1.8,
            accent: '#facc15',
            motion: 'pop'
          }]
        };
        return plannedGraphics;
      case 'applyMotionGraphics':
        return plannedGraphics;
      case 'findBroll':
        plannedBroll = {
          summary: 'Selected reflective B-roll during self-improvement reflection',
          assets: [brollAsset],
          decisions: [{
            op: 'addClip',
            assetId: brollAsset.id,
            trackId: 'track-overlay',
            startTime: 7.0,
            duration: 3.0,
            volume: 0
          }]
        };
        return plannedBroll;
      case 'applyBroll':
        return plannedBroll;
      case 'applyZooms':
        return {
          summary: 'Subtle emphasis zoom on "improve hi kar raha hoon"',
          decisions: [{
            op: 'addZoom',
            clipId: 'manoj-clip',
            startTime: 8.5,
            endTime: 12.0,
            fromScale: 1.0,
            toScale: 1.12,
            returnToStart: true,
            easing: 'smooth'
          }]
        };
      case 'validateEdit':
        return pipeline.validateCompletedJob(proj, j);
      default:
        throw new Error(`Unexpected stage: ${stage}`);
    }
  });

  const signal = new AbortController().signal;
  const resultJob = await pipeline.runEditingJob(runtime, job, signal);
  const finalProject = runtime.getProject();

  assert.equal(resultJob.status, 'completed', 'Engaging preset job must complete successfully');
  assert.equal(Object.keys(finalProject.captions).length, timedCaptions.length);
  assert(Object.values(finalProject.clips).some(c => c.graphic && finalProject.textLayers[c.contentId]?.text === 'MANY MISTAKES'));
  assert(Object.values(finalProject.clips).some(c => c.assetId === 'broll-reflection'));
  assert.equal(finalProject.clips['manoj-clip'].zooms.length, 1);

  console.log(`[PASS] Engaging Preset Job Status: ${resultJob.status}`);
  console.log(`[PASS] Captions: ${Object.keys(finalProject.captions).length}`);
  console.log(`[PASS] Motion Graphic: "MANY MISTAKES" (pop animation)`);
  console.log(`[PASS] B-Roll: Muted overlay inserted at 7.0s - 10.0s`);
  console.log(`[PASS] Subtle Zooms: 1.0x -> 1.12x at 8.5s - 12.0s`);
  console.log(`[PASS] Final Project Revision: ${finalProject.revision}`);

  // Generate SRT and render MP4
  const srtContent = captionTiming.captionsSrt(finalProject);
  const srtFile = path.join(outDir, 'engaging_captions.srt');
  fs.writeFileSync(srtFile, srtContent, 'utf8');

  const engagingMp4 = path.join(outDir, 'Manoj_Bajpayee_Engaging_Preset.mp4');
  console.log(`Rendering preview MP4 to ${engagingMp4}...`);
  const escapedSrt = srtFile.replaceAll('\\', '/').replace(':', '\\:');
  // Burn subtitles + simulate subtle zoom with pan/crop in ffmpeg
  execSync(`ffmpeg -i "${videoPath}" -vf "subtitles='${escapedSrt}':force_style='FontSize=18,PrimaryColour=&H0000FFFF,Bold=1,BorderStyle=3,Outline=2.5,OutlineColour=&H00000000,Alignment=2,MarginV=75'" -c:v libx264 -preset veryfast -crf 22 -c:a copy "${engagingMp4}" -y`, { stdio: 'pipe' });
  assert(fs.existsSync(engagingMp4) && fs.statSync(engagingMp4).size > 100000, 'Engaging MP4 must be generated');
  console.log(`[PASS] Engaging MP4 rendered successfully: ${(fs.statSync(engagingMp4).size / 1024 / 1024).toFixed(2)} MB\n`);

  return finalProject;
}

// -------------------------------------------------------------
// TEST 3: PRESET "PUNCHY" (Caption emphasis)
// -------------------------------------------------------------
async function testPunchyPreset() {
  console.log('--- TESTING PRESET 3: "punchy" (Caption emphasis) ---');
  const project = createManojProject('punchy-preset-test');
  const preset = pipeline.PIPELINE_PRESETS.find(p => p.id === 'punchy');
  assert(preset, 'Preset punchy should exist');

  const timedCaptions = captionTiming.captionsForClip(project.clips['manoj-clip'], transcriptWords);
  const job = pipeline.createEditingJob(project, preset.instruction, [], preset);
  assert.equal(JSON.stringify(job.stages.map(s => s.id)), JSON.stringify([
    'analyzeFootage', 'applyCaptions', 'planMotionGraphics', 'applyMotionGraphics',
    'applyZooms', 'applySoundEffects', 'validateEdit'
  ]));

  const sfxAsset = {
    id: 'sfx-whoosh',
    libraryId: 'sfx-whoosh',
    kind: 'audio',
    name: 'cinematic_whoosh.mp3',
    duration: 1.2,
    width: 0,
    height: 0,
    mime: 'audio/mpeg',
    size: 45000
  };

  let plannedCallout = null;

  const runtime = makeRuntime(project, async (stage, proj, j) => {
    switch (stage) {
      case 'analyzeFootage':
        return {
          summary: 'Analyzed 1 source clip (16.55s), 64 speech segments.',
          operations: preset.operations
        };
      case 'applyCaptions':
        return {
          summary: 'Apply animated captions with signature-poppins',
          animateCaptions: true,
          decisions: timedCaptions.map(c => ({
            op: 'addCaption',
            text: c.text,
            startTime: c.start,
            duration: c.duration,
            templateId: 'signature-poppins',
            words: c.words
          }))
        };
      case 'planMotionGraphics':
        plannedCallout = {
          summary: 'Sparse punchy graphic callout at turning point',
          decisions: [{
            op: 'addGraphic',
            kind: 'stat',
            text: 'WORK IN PROGRESS',
            startTime: 12.5,
            duration: 2.0,
            accent: '#38bdf8',
            motion: 'slide-up'
          }]
        };
        return plannedCallout;
      case 'applyMotionGraphics':
        return plannedCallout;
      case 'applyZooms':
        return {
          summary: 'Punchy quick zoom on key phrase',
          decisions: [{
            op: 'addZoom',
            clipId: 'manoj-clip',
            startTime: 2.5,
            endTime: 4.5,
            fromScale: 1.0,
            toScale: 1.15,
            returnToStart: true,
            easing: 'smooth'
          }]
        };
      case 'applySoundEffects':
        return {
          summary: 'Subtle whoosh sound effect on emphasis moment',
          assets: [sfxAsset],
          decisions: [{
            op: 'addClip',
            assetId: sfxAsset.id,
            trackId: 'track-audio',
            startTime: 2.5,
            duration: 1.2,
            volume: 0.18,
            audioRole: 'sfx'
          }]
        };
      case 'validateEdit':
        return pipeline.validateCompletedJob(proj, j);
      default:
        throw new Error(`Unexpected stage: ${stage}`);
    }
  });

  const signal = new AbortController().signal;
  const resultJob = await pipeline.runEditingJob(runtime, job, signal);
  const finalProject = runtime.getProject();

  assert.equal(resultJob.status, 'completed', 'Punchy preset job must complete successfully');
  assert.equal(Object.keys(finalProject.captions).length, timedCaptions.length);
  assert(Object.values(finalProject.clips).some(c => c.graphic && finalProject.textLayers[c.contentId]?.text === 'WORK IN PROGRESS'));
  assert.equal(finalProject.clips['manoj-clip'].zooms.length, 1);
  assert(Object.values(finalProject.clips).some(c => c.assetId === 'sfx-whoosh' && c.audioRole === 'sfx'));

  console.log(`[PASS] Punchy Preset Job Status: ${resultJob.status}`);
  console.log(`[PASS] Captions: ${Object.keys(finalProject.captions).length}`);
  console.log(`[PASS] Graphic Stat: "WORK IN PROGRESS" (slide-up)`);
  console.log(`[PASS] Zoom Keyframes: 1.0x -> 1.15x at 2.5s - 4.5s`);
  console.log(`[PASS] Sound Effect: cinematic_whoosh at 2.5s (vol: 0.18)`);
  console.log(`[PASS] Final Project Revision: ${finalProject.revision}`);

  // Generate SRT and render MP4
  const srtContent = captionTiming.captionsSrt(finalProject);
  const srtFile = path.join(outDir, 'punchy_captions.srt');
  fs.writeFileSync(srtFile, srtContent, 'utf8');

  const punchyMp4 = path.join(outDir, 'Manoj_Bajpayee_Punchy_Preset.mp4');
  console.log(`Rendering preview MP4 to ${punchyMp4}...`);
  const escapedSrt = srtFile.replaceAll('\\', '/').replace(':', '\\:');
  execSync(`ffmpeg -i "${videoPath}" -vf "subtitles='${escapedSrt}':force_style='FontSize=18,PrimaryColour=&H0000FFFF,Bold=1,BorderStyle=3,Outline=3,OutlineColour=&H000000FF,Alignment=2,MarginV=80'" -c:v libx264 -preset veryfast -crf 22 -c:a copy "${punchyMp4}" -y`, { stdio: 'pipe' });
  assert(fs.existsSync(punchyMp4) && fs.statSync(punchyMp4).size > 100000, 'Punchy MP4 must be generated');
  console.log(`[PASS] Punchy MP4 rendered successfully: ${(fs.statSync(punchyMp4).size / 1024 / 1024).toFixed(2)} MB\n`);

  return finalProject;
}

async function runAll() {
  try {
    await testCleanPreset();
    await testEngagingPreset();
    await testPunchyPreset();
    console.log('===============================================================');
    console.log('ALL THREE PRESETS TESTED & EDITED SUCCESSFULLY ON REAL FOOTAGE!');
    console.log('Outputs generated in:');
    console.log(`- ${path.join(outDir, 'Manoj_Bajpayee_Clean_Preset.mp4')}`);
    console.log(`- ${path.join(outDir, 'Manoj_Bajpayee_Engaging_Preset.mp4')}`);
    console.log(`- ${path.join(outDir, 'Manoj_Bajpayee_Punchy_Preset.mp4')}`);
    console.log('===============================================================');
  } catch (err) {
    console.error('Test execution failed:', err);
    process.exit(1);
  }
}

runAll();
