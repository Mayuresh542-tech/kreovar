import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();

test("Task 1: editor-layout.css implements CapCut Clean White Studio layout", () => {
  const layoutCss = fs.readFileSync(path.join(ROOT, "app/components/editor/workspace/editor-layout.css"), "utf-8");

  // Check clean white layout scheme
  assert.ok(layoutCss.includes("#FFFFFF"), "editor-layout.css must include background #FFFFFF");
  assert.ok(layoutCss.includes("#E2E8F0"), "editor-layout.css must include border #E2E8F0");
  assert.ok(layoutCss.includes("#0F172A"), "editor-layout.css must include text #0F172A");
  assert.ok(layoutCss.includes("#64748B"), "editor-layout.css must include secondary text #64748B");
  assert.ok(layoutCss.includes("#0284C7"), "editor-layout.css must include clean light blue accent #0284C7");
});

test("Task 2: EditorLayout.tsx Top Bar matches Clean White CapCut Specs with Upper-Left Light Blue Export", () => {
  const layoutTsx = fs.readFileSync(path.join(ROOT, "app/components/editor/EditorLayout.tsx"), "utf-8");

  // Check Top Bar container has clean white background
  assert.ok(layoutTsx.includes("bg-white"), "Top bar must have white background");
  assert.ok(layoutTsx.includes("border-slate-200"), "Top bar must have border border-slate-200");

  // Check prominent Light Blue Export button positioned in upper left corner
  assert.ok(layoutTsx.includes("bg-sky-500"), "Export button must have clean light blue bg-sky-500");
  assert.ok(layoutTsx.includes("text-white"), "Export button must have text-white");
  assert.ok(layoutTsx.includes("font-bold"), "Export button must have font-bold");
  assert.ok(layoutTsx.includes("hover:bg-sky-600"), "Export button must have hover:bg-sky-600");

  // Check Project title input
  assert.ok(layoutTsx.includes("project.title"), "Top bar must include project title");

  // Check Auto-save status indicator
  assert.ok(layoutTsx.includes("persistenceState"), "Top bar must include persistence auto-save state");

  // Check Aspect ratio selector (consolidated single ratio control)
  assert.ok(layoutTsx.includes("9:16"), "Aspect ratio must include 9:16");
  assert.ok(layoutTsx.includes("16:9"), "Aspect ratio must include 16:9");
  assert.ok(layoutTsx.includes("1:1"), "Aspect ratio must include 1:1");

  // Check Undo/Redo
  assert.ok(layoutTsx.includes("Undo2"), "Top bar must have Undo button");
  assert.ok(layoutTsx.includes("Redo2"), "Top bar must have Redo button");
});

test("Task 3: ToolSidebar.tsx & Library (AssetDrawer) Clean White Left Media Hub", () => {
  const toolSidebar = fs.readFileSync(path.join(ROOT, "app/components/editor/ToolSidebar.tsx"), "utf-8");
  const assetDrawer = fs.readFileSync(path.join(ROOT, "app/components/editor/AssetDrawer.tsx"), "utf-8");

  // Check Category tabs in ToolSidebar
  const expectedTabs = ["Media", "Audio", "Text", "Captions", "B-Roll", "Transitions", "Filters"];
  for (const tab of expectedTabs) {
    assert.ok(toolSidebar.includes(`"${tab}"`) || toolSidebar.includes(`'${tab}'`) || toolSidebar.includes(`label: "${tab}"`), `ToolSidebar must include category tab "${tab}"`);
  }

  // Check Clean White styling in ToolSidebar
  assert.ok(toolSidebar.includes("bg-white"), "ToolSidebar must have white background");
  assert.ok(toolSidebar.includes("border-slate-200"), "ToolSidebar must have border border-slate-200");

  // Check Clean Media Hub in AssetDrawer
  assert.ok(assetDrawer.includes("grid grid-cols-2"), "AssetDrawer must render 2-column media grid");
  assert.ok(assetDrawer.includes("bg-white"), "AssetDrawer must have clean white background");
  assert.ok(assetDrawer.includes("border-slate-200"), "AssetDrawer cards must have border-slate-200");
  assert.ok(assetDrawer.includes("handlePlaceMedia"), "Media grid '+' button must insert clip at playhead");
});

test("Task 4: TimelinePanel.tsx Action Strip, Track Controls, Uniform Styling & Waveforms", () => {
  const timelinePanel = fs.readFileSync(path.join(ROOT, "app/components/editor/TimelinePanel.tsx"), "utf-8");
  const scrubber = fs.readFileSync(path.join(ROOT, "app/components/editor/Scrubber.tsx"), "utf-8");

  // Check Action Strip
  assert.ok(timelinePanel.includes("handleSplit"), "Timeline toolbar must have Split handler");
  assert.ok(timelinePanel.includes("Scissors"), "Split must use Scissors icon");
  assert.ok(timelinePanel.includes("handleDelete"), "Timeline toolbar must have Delete handler");
  assert.ok(timelinePanel.includes("Trash2"), "Delete must use Trash2 icon");
  assert.ok(timelinePanel.includes("handleDuplicate"), "Timeline toolbar must have Duplicate handler");
  assert.ok(timelinePanel.includes("Copy"), "Duplicate must use Copy icon");
  assert.ok(timelinePanel.includes("handleToggleMarker"), "Timeline toolbar must have Marker handler");
  assert.ok(timelinePanel.includes("Bookmark"), "Marker must use Bookmark/Marker icon");
  assert.ok(timelinePanel.includes("isMagnetEnabled"), "Timeline toolbar must have Main Storyline Magnet toggle");
  assert.ok(timelinePanel.includes("Magnet"), "Magnet toggle must use Magnet icon");
  assert.ok(timelinePanel.includes("snapping"), "Timeline toolbar must have Auto-Snapping toggle (N)");
  assert.ok(timelinePanel.includes("zoom"), "Timeline toolbar must have Zoom controls");
  assert.ok(timelinePanel.includes("fitTimeline"), "Timeline toolbar must have Fit to Screen (Shift+Z / F)");

  // Check Track Controls
  assert.ok(timelinePanel.includes("hidden"), "Track headers must support Hide toggle");
  assert.ok(timelinePanel.includes("Eye"), "Track headers must include Eye icon");
  assert.ok(timelinePanel.includes("muted"), "Track headers must support Mute toggle");
  assert.ok(timelinePanel.includes("Volume2"), "Track headers must include Volume2 icon");
  assert.ok(timelinePanel.includes("locked"), "Track headers must support Lock toggle");
  assert.ok(timelinePanel.includes("Lock"), "Track headers must include Lock icon");

  // Check Real Waveform Rendering
  assert.ok(timelinePanel.includes("sliceWaveformPeaks"), "TimelinePanel must use sliceWaveformPeaks for real waveforms");
  assert.ok(timelinePanel.includes("waveformCache"), "TimelinePanel must use waveformCache");
  assert.ok(timelinePanel.includes("extractAudioPeaks"), "TimelinePanel must support extractAudioPeaks");

  // Check Uniform Neutral Track Badges (no rainbow)
  assert.ok(timelinePanel.includes("bg-slate-100"), "Track badges must use uniform neutral bg-slate-100");
  assert.ok(timelinePanel.includes("border-slate-200"), "Track badges must use uniform border-slate-200");

  // Check Playhead
  assert.ok(timelinePanel.includes('color="#0284c7"'), "TimelinePanel must pass clean light blue playhead color to Scrubber");
  assert.ok(scrubber.includes("#0284c7"), "Scrubber must support clean light blue playhead");
});

test("Task 5: EditorPropertiesInspector.tsx Parity with CapCut Audio & Speed Tabs", () => {
  const inspector = fs.readFileSync(path.join(ROOT, "app/components/editor/EditorPropertiesInspector.tsx"), "utf-8");

  // Check dedicated tabs
  assert.ok(inspector.includes('"video"'), "Inspector must have Video tab");
  assert.ok(inspector.includes('"audio"'), "Inspector must have Audio tab");
  assert.ok(inspector.includes('"speed"'), "Inspector must have dedicated Speed tab");

  // Check Audio controls matching Image 3 Basic Section
  assert.ok(inspector.includes("renderBasicAudioControls"), "Inspector must render basic audio controls");
  assert.ok(inspector.includes("Volume"), "Audio controls must include Volume");
  assert.ok(inspector.includes("Fade in"), "Audio controls must include Fade in");
  assert.ok(inspector.includes("Fade out"), "Audio controls must include Fade out");
  assert.ok(inspector.includes("KeyframeDiamond"), "Audio controls must include Keyframe Diamond <>");
  assert.ok(inspector.includes("StepperBox"), "Audio controls must include StepperBox");

  // Check Speed controls matching Image 4 & 5
  assert.ok(inspector.includes("renderSpeedControls"), "Inspector must render speed controls");
  assert.ok(inspector.includes("Standard"), "Speed controls must support Standard mode");
  assert.ok(inspector.includes("Curve"), "Speed controls must support Curve mode");
  assert.ok(inspector.includes("Change audio pitch"), "Speed controls must include Change audio pitch toggle");
  assert.ok(inspector.includes("Smooth slow-mo"), "Speed controls must include Smooth slow-mo note");
  assert.ok(inspector.includes("calculateTimelineDurationFromSource"), "Speed controls must compute dynamic duration");
});

test("Task 6: CanvasStage.tsx implements thin preview outline (border border-slate-200)", () => {
  const canvasStage = fs.readFileSync(path.join(ROOT, "app/components/editor/CanvasStage.tsx"), "utf-8");
  assert.ok(canvasStage.includes("border border-slate-200"), "Preview canvas stage container must have thin border border-slate-200 outline");
});

test("Task 7: Project Hub (app/projects/[id]/page.tsx) banner 'CapCut-Grade Video Editor 3.0' is removed", () => {
  const projectPage = fs.readFileSync(path.join(ROOT, "app/projects/[id]/page.tsx"), "utf-8");
  assert.ok(!projectPage.includes("CapCut-Grade Video Editor 3.0"), "Banner 'CapCut-Grade Video Editor 3.0' must be removed from Project Hub");
});

test("Task 8: Video preview section eliminates horizontal scrollbars across styles and markup", () => {
  const editorCss = fs.readFileSync(path.join(ROOT, "app/components/editor/workspace/editor.css"), "utf-8");
  const layoutCss = fs.readFileSync(path.join(ROOT, "app/components/editor/workspace/editor-layout.css"), "utf-8");
  const canvasStage = fs.readFileSync(path.join(ROOT, "app/components/editor/CanvasStage.tsx"), "utf-8");

  assert.ok(editorCss.includes(".vx-stage { flex:1;min-height:0;min-width:0;display:flex;align-items:center;justify-content:center;overflow:hidden;background:#F1F5F9; }"), "editor.css .vx-stage must have overflow:hidden");
  assert.ok(layoutCss.includes(".vx-editor .vx-stage { min-height:0; background:#F1F5F9; overflow:hidden; }"), "editor-layout.css .vx-stage must have overflow:hidden");
  assert.ok(canvasStage.includes("!overflow-hidden overflow-x-hidden"), "CanvasStage section must enforce overflow-x-hidden");
});

test("Task 9: AI Editor prompts (both Groq Qwen and Gemini) enforce instant execution and forbid chat plans", () => {
  const geminiAi = fs.readFileSync(path.join(ROOT, "app/lib/server/editorAi.ts"), "utf-8");
  const fallbackPrompt = fs.readFileSync(path.join(ROOT, "app/lib/server/editorFallbackPrompt.ts"), "utf-8");

  assert.ok(geminiAi.includes("IMMEDIATE TIMELINE EDITING REQUIRED (NO CONVERSATIONAL DELAYS OR PLANS IN CHAT)"), "Gemini prompt must enforce immediate timeline editing");
  assert.ok(geminiAi.includes("NO CHAT DELAYS OR CONFIRMATION QUESTIONS"), "Gemini prompt must forbid asking questions or confirmation in chat");
  assert.ok(fallbackPrompt.includes("IMMEDIATE TIMELINE EDITING REQUIRED"), "Groq Qwen fallback prompt must enforce immediate timeline editing");
});

test("Task 10: Editorial plans are never colored in error red and client fail-open guarantees completed edits", () => {
  const bubble = fs.readFileSync(path.join(ROOT, "app/components/editor/AiResponseBubble.tsx"), "utf-8");
  const client = fs.readFileSync(path.join(ROOT, "app/lib/editor/sequentialEditClient.ts"), "utf-8");

  assert.ok(bubble.includes("isActualError"), "AiResponseBubble must distinguish genuine errors from editorial plans");
  assert.ok(client.includes("reconcileEditingDecisions"), "sequentialEditClient must synthesize edits through inPlaceReconciler if server stage fails");
});

test("Task 11: Intermediate Project Hub is bypassed and opens editor directly", () => {
  const projectDetail = fs.readFileSync(path.join(ROOT, "app/projects/[id]/page.tsx"), "utf-8");
  const createModal = fs.readFileSync(path.join(ROOT, "app/components/projects/CreateProjectModal.tsx"), "utf-8");
  const dashboard = fs.readFileSync(path.join(ROOT, "app/dashboard/page.tsx"), "utf-8");
  const editorPage = fs.readFileSync(path.join(ROOT, "app/editor/page.tsx"), "utf-8");
  const projectsPage = fs.readFileSync(path.join(ROOT, "app/projects/page.tsx"), "utf-8");

  assert.ok(projectDetail.includes("router.replace(`/editor?projectId="), "Project detail route must redirect directly to editor");
  assert.ok(!projectDetail.includes("Loading Project Hub"), "Project Hub screen must be removed");
  assert.ok(createModal.includes("router.push(`/editor?projectId="), "CreateProjectModal must open editor directly");
  assert.ok(!dashboard.includes("/projects/${project.id}"), "Dashboard cards must open editor directly");
  assert.ok(!editorPage.includes("/projects/${activeProjectId}"), "Editor exit must return to /projects without Project Hub");
  assert.ok(!projectsPage.includes("Asset Files & Hub"), "Projects menu must not link to Asset Files & Hub");
});

test("Task 12: Preview Maximize button & reachable editor controls across all panels", () => {
  const canvasStage = fs.readFileSync(path.join(ROOT, "app/components/editor/CanvasStage.tsx"), "utf-8");
  const layoutTsx = fs.readFileSync(path.join(ROOT, "app/components/editor/EditorLayout.tsx"), "utf-8");
  const toolSidebar = fs.readFileSync(path.join(ROOT, "app/components/editor/ToolSidebar.tsx"), "utf-8");
  const timelinePanel = fs.readFileSync(path.join(ROOT, "app/components/editor/TimelinePanel.tsx"), "utf-8");
  const mobileStage = fs.readFileSync(path.join(ROOT, "app/components/editor/mobile/MobileCanvasStage.tsx"), "utf-8");

  // Preview Maximize & full-player Fullscreen controls must exist and be reachable
  assert.ok(canvasStage.includes('data-testid="preview-maximize-btn"'), "CanvasStage must expose a dedicated Maximize Preview button in the stage header");
  assert.ok(canvasStage.includes("toggleMaximizePreview"), "CanvasStage must toggle maximized theater preview");
  assert.ok(canvasStage.includes("toggleBrowserFullscreen"), "CanvasStage must support fullscreen on the full preview section with transport controls");
  assert.ok(!canvasStage.includes("overflow-x-hidden min-w-0 flex-wrap sm:flex-nowrap"), "Transport bar must wrap cleanly instead of clipping right-side buttons at narrow preview widths");

  // ToolSidebar must scroll vertically on shorter laptop screens so bottom buttons remain reachable
  assert.ok(toolSidebar.includes("overflow-y-auto"), "ToolSidebar nav must scroll vertically so bottom tools never clip on shorter screens");

  // EditorLayout must wire Inspector collapse/expand & multi-clip / keyframe seek / caption sync handlers
  assert.ok(layoutTsx.includes("isInspectorOpen"), "EditorLayout must support collapsing and expanding the Properties Inspector");
  assert.ok(layoutTsx.includes("onUpdateMultipleClips={handleUpdateMultipleClips}"), "EditorLayout must wire batch multi-clip edits to Inspector");
  assert.ok(layoutTsx.includes("onDeleteMultipleClips={handleDeleteMultipleClips}"), "EditorLayout must wire batch multi-clip deletion to Inspector");
  assert.ok(layoutTsx.includes("onSeek="), "EditorLayout must wire keyframe seek handler to Inspector");
  assert.ok(layoutTsx.includes("handleApplyStyleToAllCaptions"), "EditorLayout must wire Apply Style to All Captions to Inspector");

  // Timeline toolbar & mobile fullscreen controls must remain reachable without overlap
  assert.ok(timelinePanel.includes("overflow-x-auto overflow-y-hidden"), "TimelinePanel toolbar must allow scrolling on narrow desktop widths instead of clipping Zoom/Fit controls");
  assert.ok(timelinePanel.includes("deleteOrRippleDeleteClips"), "TimelinePanel Delete button must honor Magnetic Ripple state");
  assert.ok(mobileStage.includes("Exit Maximize"), "MobileCanvasStage must render non-overlapping Exit Maximize control when maximized");
});

test("Task 13: Canvas object movement through full-frame outline & clean AssetDrawer layout", () => {
  const canvasStage = fs.readFileSync(path.join(ROOT, "app/components/editor/CanvasStage.tsx"), "utf-8");
  const assetDrawer = fs.readFileSync(path.join(ROOT, "app/components/editor/AssetDrawer.tsx"), "utf-8");
  const compositor = fs.readFileSync(path.join(ROOT, "app/lib/editor/compositor.ts"), "utf-8");

  // Outline overlay must let user pick & move topmost motion graphic, caption, or text over selected video
  assert.ok(canvasStage.includes("pickLayerAtPoint"), "CanvasStage must share topmost hit-test across canvas and selection outline");
  assert.ok(canvasStage.includes("topmost && topmost.id !== selection[0]"), "Outline pointerdown must switch to topmost overlay under cursor");

  // Studio caption bounds must align cleanly with transform coordinates
  assert.ok(compositor.includes("dx*Math.cos(rad)-dy*Math.sin(rad)"), "Compositor must project Studio caption bounds accurately under rotation/scale");

  // AssetDrawer search and category pills must not clip or overlap
  assert.ok(!assetDrawer.includes('right-1.5 top-1/2 -translate-y-1/2 px-2 py-1 bg-cyan-600'), "B-Roll Search button must not overlap input text");
  assert.ok(assetDrawer.includes("flex-wrap items-center gap-1.5"), "Category niche pills must wrap cleanly instead of showing clipped horizontal scrollbar");

  // 18 Motion Graphics templates paired in UI & legacy GraphicControls panel removed
  const toolSidebar = fs.readFileSync(path.join(ROOT, "app/components/editor/ToolSidebar.tsx"), "utf-8");
  const inspector = fs.readFileSync(path.join(ROOT, "app/components/editor/EditorPropertiesInspector.tsx"), "utf-8");
  assert.ok(toolSidebar.includes('"graphics"'), "ToolSidebar must include Graphics tab");
  assert.ok(assetDrawer.includes("KREOVAR_MOTION_TEMPLATES"), "AssetDrawer must render Kreovar motion graphic templates");
  assert.ok(!inspector.includes("GraphicControls"), "Legacy GraphicControls import must be removed from Inspector");
});




