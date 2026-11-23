import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();

test("Task 1: editor.css and editor-layout.css implement CapCut Desktop Dark Studio theme", () => {
  const editorCss = fs.readFileSync(path.join(ROOT, "app/components/editor/workspace/editor.css"), "utf-8");
  const layoutCss = fs.readFileSync(path.join(ROOT, "app/components/editor/workspace/editor-layout.css"), "utf-8");

  // Check dark color scheme
  assert.ok(editorCss.includes("#121214"), "editor.css must include background #121214");
  assert.ok(editorCss.includes("#18181C"), "editor.css must include panel #18181C");
  assert.ok(editorCss.includes("#222226"), "editor.css must include cards/headers #222226");
  assert.ok(editorCss.includes("#2E2E33"), "editor.css must include borders #2E2E33");
  assert.ok(editorCss.includes("#FFFFFF"), "editor.css must include text #FFFFFF");
  assert.ok(editorCss.includes("#A0A0A8"), "editor.css must include secondary text #A0A0A8");
  assert.ok(editorCss.includes("#00E5FF"), "editor.css must include CapCut Cyan #00E5FF");
  assert.ok(editorCss.includes("#33EAFF"), "editor.css must include CapCut Cyan hover #33EAFF");

  // Check editor-layout.css has dark studio overrides
  assert.ok(layoutCss.includes("#121214"), "editor-layout.css must include background #121214");
  assert.ok(layoutCss.includes("#18181C"), "editor-layout.css must include panel #18181C");
  assert.ok(layoutCss.includes("#222226"), "editor-layout.css must include cards #222226");
  assert.ok(layoutCss.includes("#2E2E33"), "editor-layout.css must include border #2E2E33");
  assert.ok(layoutCss.includes("#00E5FF"), "editor-layout.css must include cyan #00E5FF");
});

test("Task 2: EditorLayout.tsx Top Bar matches CapCut Studio specs", () => {
  const layoutTsx = fs.readFileSync(path.join(ROOT, "app/components/editor/EditorLayout.tsx"), "utf-8");

  // Check Top Bar container
  assert.ok(layoutTsx.includes("bg-[#18181C]"), "Top bar must have dark background #18181C");
  assert.ok(layoutTsx.includes("border-[#2E2E33]"), "Top bar must have border #2E2E33");

  // Check Project title input
  assert.ok(layoutTsx.includes("project.title"), "Top bar must include project title");
  assert.ok(layoutTsx.includes("bg-[#121214]"), "Title input must have dark background #121214");
  assert.ok(layoutTsx.includes("focus:border-[#00E5FF]"), "Title input must focus with CapCut cyan border");

  // Check Auto-save status indicator
  assert.ok(layoutTsx.includes("persistenceState"), "Top bar must include persistence auto-save state");
  assert.ok(layoutTsx.includes("text-[#00E5FF]"), "Saved indicator check must be CapCut cyan #00E5FF");

  // Check Aspect ratio selector
  assert.ok(layoutTsx.includes("9:16"), "Aspect ratio must include 9:16");
  assert.ok(layoutTsx.includes("16:9"), "Aspect ratio must include 16:9");
  assert.ok(layoutTsx.includes("1:1"), "Aspect ratio must include 1:1");
  assert.ok(layoutTsx.includes("4:5"), "Aspect ratio must include 4:5");
  assert.ok(layoutTsx.includes("4:3"), "Aspect ratio must include 4:3");

  // Check AI Copilot quick button with sparkles
  assert.ok(layoutTsx.includes("AI Copilot"), "Top bar must have AI Copilot quick button");
  assert.ok(layoutTsx.includes("Sparkles"), "AI Copilot button must include Sparkles icon");
  assert.ok(layoutTsx.includes("text-[#00E5FF]"), "AI Copilot button must use CapCut cyan text");

  // Check Undo/Redo
  assert.ok(layoutTsx.includes("Undo2"), "Top bar must have Undo button");
  assert.ok(layoutTsx.includes("Redo2"), "Top bar must have Redo button");

  // Check prominent CapCut Cyan Export button
  assert.ok(layoutTsx.includes("bg-[#00E5FF]"), "Export button must have bg-[#00E5FF]");
  assert.ok(layoutTsx.includes("text-black"), "Export button must have text-black");
  assert.ok(layoutTsx.includes("font-bold"), "Export button must have font-bold");
  assert.ok(layoutTsx.includes("hover:bg-[#33EAFF]"), "Export button must have hover:bg-[#33EAFF]");
  assert.ok(layoutTsx.includes("px-4 py-1.5 rounded-lg"), "Export button must have px-4 py-1.5 rounded-lg");
});

test("Task 3: ToolSidebar.tsx & Library (AssetDrawer) Left Media Hub", () => {
  const toolSidebar = fs.readFileSync(path.join(ROOT, "app/components/editor/ToolSidebar.tsx"), "utf-8");
  const assetDrawer = fs.readFileSync(path.join(ROOT, "app/components/editor/AssetDrawer.tsx"), "utf-8");

  // Check Category tabs in ToolSidebar
  const expectedTabs = ["Media", "Audio", "Text", "Captions", "B-Roll", "Transitions", "Filters"];
  for (const tab of expectedTabs) {
    assert.ok(toolSidebar.includes(`"${tab}"`) || toolSidebar.includes(`'${tab}'`) || toolSidebar.includes(`label: "${tab}"`), `ToolSidebar must include category tab "${tab}"`);
  }

  // Check Dark Studio styling in ToolSidebar
  assert.ok(toolSidebar.includes("bg-[#18181C]"), "ToolSidebar must have dark background #18181C");
  assert.ok(toolSidebar.includes("border-[#2E2E33]"), "ToolSidebar must have border #2E2E33");
  assert.ok(toolSidebar.includes("#00E5FF"), "ToolSidebar active states must use CapCut cyan #00E5FF");

  // Check Dark media grid with clean thumbnails and '+' button in AssetDrawer
  assert.ok(assetDrawer.includes("grid grid-cols-2"), "AssetDrawer must render 2-column media grid");
  assert.ok(assetDrawer.includes("bg-[#222226]"), "Media card must have dark background #222226");
  assert.ok(assetDrawer.includes("border-[#2E2E33]"), "Media card must have border #2E2E33");
  assert.ok(assetDrawer.includes("handlePlaceMedia"), "Media grid '+' button must insert clip at playhead");
  assert.ok(assetDrawer.includes("bg-[#00E5FF]"), "'+' insert button must use CapCut cyan bg #00E5FF");
});

test("Task 4: TimelinePanel.tsx Action Strip, Track Controls, Waveforms, Selection Rings & Cyan Playhead", () => {
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

  // Check Clip Selection Rings
  assert.ok(timelinePanel.includes("ring-2 ring-[#00E5FF]"), "Selected clips must have CapCut Cyan ring-2 ring-[#00E5FF]");
  assert.ok(timelinePanel.includes("border-[#00E5FF]"), "Selected clips must have border-[#00E5FF]");

  // Check Cyan Playhead (#00E5FF)
  assert.ok(timelinePanel.includes('color="#00E5FF"'), "TimelinePanel must pass color='#00E5FF' to Scrubber");
  assert.ok(scrubber.includes("#00E5FF"), "Scrubber must support CapCut Cyan #00E5FF playhead");
});
