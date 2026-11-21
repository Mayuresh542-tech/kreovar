import assert from "node:assert/strict";
import { extractEditingConstraints } from "../app/lib/editor/editingIntent";
import { validateAiPlan } from "../app/lib/editor/aiValidation";
import { reconcileEditingDecisions } from "../app/lib/editor/inPlaceReconciler";
import { applyEditDecisionList } from "../app/lib/editor/ai";
import { createDemoProject } from "../app/lib/editor/demoProject";

console.log("=== Testing AI Editor Knowledge & Capability for CapCut Operations ===\n");

// 1. Natural Language Intent Parsing
console.log("1. Testing Intent Parsing for Speed, Volume, Transform, Trim, Split...");

const speedIntent = extractEditingConstraints("make the video 1.5x faster with natural pitch");
assert.equal(speedIntent.requestedSpeed?.multiplier, 1.5);
assert.equal(speedIntent.requestedSpeed?.preservePitch, true);

const slowIntent = extractEditingConstraints("slow down by 0.5x on the punchline");
assert.equal(slowIntent.requestedSpeed?.multiplier, 0.5);
assert.equal(slowIntent.requestedSpeed?.preservePitch, true);

const volIntent = extractEditingConstraints("set music volume to 40% and fade in for 2 seconds");
assert.equal(volIntent.requestedVolume?.level, 0.4);
assert.equal(volIntent.requestedVolume?.fadeIn, 2);

const muteIntent = extractEditingConstraints("mute background music");
assert.equal(muteIntent.requestedVolume?.mute, true);
assert.equal(muteIntent.requestedVolume?.level, 0);

const transformIntent = extractEditingConstraints("scale to 130% and move to top right");
assert.equal(transformIntent.requestedTransform?.scale, 1.3);
assert.equal(transformIntent.requestedTransform?.x, 0.35);
assert.equal(transformIntent.requestedTransform?.y, -0.32);

const resetIntent = extractEditingConstraints("reset transform to default framing");
assert.equal(resetIntent.requestedTransform?.reset, true);

const trimIntent = extractEditingConstraints("trim the first 1.5s of the clip");
assert.equal(trimIntent.requestedTrim?.edge, "left");
assert.equal(trimIntent.requestedTrim?.seconds, 1.5);

const splitIntent = extractEditingConstraints("split clip at 4.2 seconds");
assert.equal(splitIntent.requestedSplit?.time, 4.2);

console.log("✓ Intent parsing passes all natural language test cases.\n");

// 2. AI Plan Validation for New CapCut Operations
console.log("2. Testing AI Plan Validation for preservePitch, Speed 0.1..10, Volume & Transforms...");

const project = createDemoProject();
const clipId = Object.keys(project.clips)[0];
assert(clipId, "Demo project must have at least one clip");

const testPlan = {
  summary: "Apply speed and audio adjustments",
  decisions: [
    {
      op: "changeClipProperty",
      clipId,
      changes: {
        speed: 2.5,
        preservePitch: true,
        volume: 1.2,
        fadeIn: 0.8,
        fadeOut: 1.5,
        transform: { x: 0.1, y: -0.2, scale: 1.25, rotation: 15, opacity: 0.95 }
      }
    },
    {
      op: "splitClip",
      clipId,
      time: 2.0
    }
  ]
};

const validated = validateAiPlan(testPlan, project);
assert.equal(validated.list.decisions.length, 2);
const d0 = validated.list.decisions[0];
assert.equal(d0.op, "changeClipProperty");
assert.equal(d0.changes.speed, 2.5);
assert.equal(d0.changes.preservePitch, true);
assert.equal(d0.changes.volume, 1.2);
assert.equal(d0.changes.fadeIn, 0.8);
assert.equal(d0.changes.fadeOut, 1.5);
assert.equal(d0.changes.transform?.scale, 1.25);

console.log("✓ AI Plan Validation passes with preservePitch, extended speed & transform parameters.\n");

// 3. In-Place Reconciler with Speed, Volume and Transform Directives
console.log("3. Testing In-Place Reconciler Directives...");

const reconciled = reconcileEditingDecisions(
  project,
  [],
  [],
  speedIntent
);

assert(reconciled.decisions.some(d => d.op === "changeClipProperty" && d.changes.speed === 1.5 && d.changes.preservePitch === true));
console.log("✓ In-place reconciler generates correct changeClipProperty for speed and pitch.\n");

const reconciledVol = reconcileEditingDecisions(
  project,
  [],
  [],
  volIntent
);

assert(reconciledVol.decisions.some(d => d.op === "changeClipProperty" && d.changes.volume === 0.4 && d.changes.fadeIn === 2));
console.log("✓ In-place reconciler generates correct changeClipProperty for volume and fading.\n");

// 4. Execution of Decision List on Project Model
console.log("4. Testing Execution of EDL on Editor Project Model...");

const nextProject = applyEditDecisionList(project, validated.list);
assert(Object.keys(nextProject.clips).length > Object.keys(project.clips).length);
// Verify that the split created 2 clips and property changes took effect
const modifiedClip = nextProject.clips[clipId];
assert(modifiedClip, "Modified clip should exist");
assert.equal(modifiedClip.speed, 2.5);
assert.equal(modifiedClip.preservePitch, true);
assert.equal(modifiedClip.volume, 1.2);

console.log("✓ ApplyEditDecisionList successfully executed speed, pitch, volume, transform, and split operations.\n");

console.log("=== ALL CAPCUT AI EDITING CAPABILITY TESTS PASSED (100%) ===\n");
