import assert from "node:assert/strict";
import { test } from "node:test";
import path from "node:path";
import fs from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(path.join(root, "package.json"));
const ts = require("typescript");

function loader(mocks = {}) {
  const cache = new Map();
  function load(relative) {
    let filename = path.resolve(root, relative);
    if (!path.extname(filename)) {
      if (fs.existsSync(filename + ".ts")) filename += ".ts";
      else if (fs.existsSync(filename + ".tsx")) filename += ".tsx";
      else if (fs.existsSync(filename + ".js")) filename += ".js";
    }
    const key = path.relative(root, filename).replaceAll("\\", "/");
    if (Object.hasOwn(mocks, key)) return mocks[key];
    if (cache.has(filename)) return cache.get(filename).exports;
    const loadedModule = { exports: {} };
    cache.set(filename, loadedModule);
    const source = ts
      .transpileModule(fs.readFileSync(filename, "utf8"), {
        compilerOptions: {
          module: ts.ModuleKind.CommonJS,
          target: ts.ScriptTarget.ES2022,
          jsx: ts.JsxEmit.React,
        },
      })
      .outputText.replaceAll("import.meta.url", JSON.stringify(pathToFileURL(filename).href));
    const localRequire = (specifier) => {
      if (Object.hasOwn(mocks, specifier)) return mocks[specifier];
      if (specifier.startsWith("@/")) return load(specifier.slice(2));
      if (specifier.startsWith(".")) {
        return load(path.relative(root, path.resolve(path.dirname(filename), specifier)));
      }
      return require(specifier);
    };
    new vm.Script(`(function(require,module,exports,process){${source}\n})`, { filename }).runInThisContext()(
      localRequire,
      loadedModule,
      loadedModule.exports,
      process
    );
    return loadedModule.exports;
  }
  return load;
}

const load = loader();

const {
  waveformCache,
  getWaveformCache,
  setWaveformCache,
  clearWaveformCache,
  extractPeaksFromAudioBuffer,
  sliceWaveformPeaks,
  extractAudioPeaks,
} = load("app/lib/editor/audioWaveform.ts");

const { findSnapTime } = load("app/lib/timeline/operations.ts");

test("Task 1: audioWaveform cache and peak extraction", async () => {
  clearWaveformCache();
  assert.equal(getWaveformCache().size, 0, "Cache should be empty initially");

  // Test setWaveformCache and getWaveformCache
  const mockPeaks = new Float32Array([0.1, 0.5, 0.9, 0.3, 0.0]);
  setWaveformCache("track-1-url", mockPeaks);
  assert.equal(waveformCache.has("track-1-url"), true);
  assert.deepEqual(waveformCache.get("track-1-url"), mockPeaks);

  // Test extractPeaksFromAudioBuffer
  const fakeAudioBuffer = {
    numberOfChannels: 2,
    length: 1000,
    getChannelData(c) {
      const arr = new Float32Array(1000);
      for (let i = 0; i < 1000; i++) {
        arr[i] = c === 0 ? (i % 100) / 100 : -(i % 50) / 50;
      }
      return arr;
    },
  };

  const extracted = extractPeaksFromAudioBuffer(fakeAudioBuffer, 10);
  assert.equal(extracted.length, 10, "Should generate exactly 10 samples");
  assert.ok(extracted.every((p) => p >= 0 && p <= 1), "All peaks must be normalized between 0 and 1");

  // Test extractAudioPeaks using cache hit
  const cachedResult = await extractAudioPeaks("track-1-url");
  assert.deepEqual(cachedResult, mockPeaks, "extractAudioPeaks should retrieve from cache when present");
});

test("Task 2: Waveform slicing by sourceStartTime and sourceEndTime", () => {
  // Peak array representing 10 seconds of audio with distinct peaks
  const fullPeaks = new Float32Array([
    0.1, 0.2, // 0..2s
    0.3, 0.4, // 2..4s
    0.9, 0.8, // 4..6s (loud segment)
    0.5, 0.3, // 6..8s
    0.1, 0.0, // 8..10s
  ]);

  // Slice from 4s to 6s (loud segment)
  const sliced = sliceWaveformPeaks(fullPeaks, 4.0, 6.0, 10.0, 4);
  assert.equal(sliced.length, 4, "Should downsample into 4 target bars");
  assert.ok(sliced[0] >= 0.8, "First sliced bars should reflect the 4..6s loud segment");

  // Slice start section 0s to 2s
  const startSlice = sliceWaveformPeaks(fullPeaks, 0.0, 2.0, 10.0, 2);
  assert.equal(startSlice.length, 2);
  assert.ok(startSlice[0] <= 0.3, "Start slice should reflect initial quiet segment");
});

test("Task 3: findSnapTime - bi-directional evaluation, ghost clip exclusion & CapCut hysteresis", () => {
  // Setup timeline with clips on video track
  const mockTimeline = {
    id: "proj-1",
    name: "Test Timeline",
    duration: 30,
    tracks: [
      {
        id: "tr-video",
        type: "video",
        name: "Video 1",
        items: [
          { id: "clip-1", track: "video", startTime: 0, endTime: 5.0, duration: 5.0, source: "", type: "raw", volume: 1, transition: "cut", animation: "none" },
          { id: "clip-2", track: "video", startTime: 5.0, endTime: 9.0, duration: 4.0, source: "", type: "raw", volume: 1, transition: "cut", animation: "none" },
        ],
      },
    ],
    settings: {
      audioDucking: false,
      duckingFactor: 0.15,
      musicVolume: 0.2,
      voiceVolume: 1.0,
      captionPreset: "default",
      captionPosition: "bottom",
      markers: [{ id: "m1", time: 15.0, label: "Chapter", color: "#FF0000" }],
    },
  };

  const pps = 60; // 60 px per second => 10px snap = 0.1667s, 16px break = 0.2667s

  // 1. Ghost clip exclusion: dragging clip-2 should NOT snap to its own start (5.0s) or end (9.0s)
  const selfSnap = findSnapTime(8.95, mockTimeline, 0, null, null, {
    excludeClipIds: ["clip-2"],
    clipDuration: 4.0,
    pixelsPerSecond: pps,
  });
  // Since clip-1 ends at 5.0 and marker is at 15.0, candidateTime 8.95 has no nearby targets (dist to 5.0 is 3.95s >> 10px)
  assert.equal(selfSnap.snapped, false, "Dragged clip must not snap to its own ghost boundaries");

  // 2. Start-edge snapping: near clip-1 end at 5.0s (e.g. at 4.88s -> diff = 0.12s * 60 = 7.2px <= 10px)
  const snapStart = findSnapTime(4.88, mockTimeline, 0, null, null, {
    excludeClipIds: ["clip-moving"],
    clipDuration: 3.0,
    currentlySnapped: false,
    pixelsPerSecond: pps,
  });
  assert.equal(snapStart.snapped, true, "Should snap start edge when within 10px detent");
  assert.equal(snapStart.time, 5.0, "Start edge snaps to 5.0s");
  assert.equal(snapStart.snapLineTime, 5.0, "Guide line must be at target boundary 5.0s");

  // 3. CapCut hysteresis resistance: while currently snapped, moving away to 4.80s (diff = 12px > 10px but < 16px)
  const hysteresisHold = findSnapTime(4.80, mockTimeline, 0, null, null, {
    excludeClipIds: ["clip-moving"],
    clipDuration: 3.0,
    currentlySnapped: true,
    pixelsPerSecond: pps,
  });
  assert.equal(hysteresisHold.snapped, true, "Hysteresis must hold snap detent until 16px break threshold");
  assert.equal(hysteresisHold.time, 5.0, "Time remains locked to target edge during hysteresis");

  // 4. Detent break: moving to 4.65s (diff = 21px > 16px break threshold)
  const hysteresisBreak = findSnapTime(4.65, mockTimeline, 0, null, null, {
    excludeClipIds: ["clip-moving"],
    clipDuration: 3.0,
    currentlySnapped: true,
    pixelsPerSecond: pps,
  });
  assert.equal(hysteresisBreak.snapped, false, "Must release snap when breaking distance exceeds 16px");
  assert.equal(hysteresisBreak.snapLineTime, null, "Guide line must be null when not snapped");

  // 5. Trailing-edge snapping: clip duration 3.0s, candidate start 2.05s => trailing edge 5.05s (dist = 3px from 5.0s)
  const snapTrail = findSnapTime(2.05, mockTimeline, 0, null, null, {
    excludeClipIds: ["clip-moving"],
    clipDuration: 3.0,
    currentlySnapped: false,
    pixelsPerSecond: pps,
  });
  assert.equal(snapTrail.snapped, true, "Trailing edge should snap to target edge at 5.0s");
  assert.equal(snapTrail.time, 2.0, "Start time should adjust so trailing edge hits 5.0s (5.0 - 3.0 = 2.0)");
  assert.equal(snapTrail.snapLineTime, 5.0, "Active snapped boundary line must be at 5.0s");

  // 6. Playhead magnetic snapping
  const snapPlayheadRes = findSnapTime(4.90, mockTimeline, 0, null, null, {
    clipDuration: 0,
    pixelsPerSecond: pps,
  });
  assert.equal(snapPlayheadRes.snapped, true, "Playhead scrubber snaps to clip boundary");
  assert.equal(snapPlayheadRes.time, 5.0);
  assert.equal(snapPlayheadRes.snapLineTime, 5.0);
});

test("Task 4: EditorMultiTrackTimeline loads and exports correctly", () => {
  const React = require("react");
  const comp = load("app/components/editor/EditorMultiTrackTimeline.tsx");
  const Component = comp.default || comp.EditorMultiTrackTimeline;
  assert.ok(Component, "EditorMultiTrackTimeline component should be exported");
  assert.equal(typeof Component, "function");
});
