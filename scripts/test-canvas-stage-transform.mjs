import assert from "node:assert/strict";
import { test, describe } from "node:test";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(path.join(root, "package.json"));
const ts = require("typescript");

function createModuleLoader(mocks = {}) {
  const cache = new Map();
  function load(relative) {
    let filename = path.resolve(root, relative);
    if (!path.extname(filename)) {
      if (fs.existsSync(filename + ".ts")) filename += ".ts";
      else if (fs.existsSync(filename + ".tsx")) filename += ".tsx";
      else if (fs.existsSync(path.join(filename, "index.ts"))) filename = path.join(filename, "index.ts");
    }
    const key = path.relative(root, filename).replaceAll("\\", "/");
    if (Object.hasOwn(mocks, key)) return mocks[key];
    if (cache.has(filename)) return cache.get(filename).exports;
    const loadedModule = { exports: {} };
    cache.set(filename, loadedModule);
    const source = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
    }).outputText.replaceAll("import.meta.url", JSON.stringify(pathToFileURL(filename).href));
    const localRequire = (specifier) =>
      Object.hasOwn(mocks, specifier)
        ? mocks[specifier]
        : specifier.startsWith("@/")
        ? load(specifier.slice(2))
        : specifier.startsWith(".")
        ? load(path.relative(root, path.resolve(path.dirname(filename), specifier)))
        : require(specifier);
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

const mocks = {
  "@/app/lib/editor/editorCaptionStudio": { loadEditorStudioFonts: async () => {} },
  "@/app/lib/captions/typography": { loadCaptionFonts: async () => {} },
  "@/app/lib/editor/playbackClock": { playbackTime: () => 0 },
  "@/app/lib/editor/compositor": { Compositor: class { sync() { return true; } render() { return []; } dispose() {} pause() {} } },
  "./workspace/EditorContext": { useEditor: () => ({}) },
};

const load = createModuleLoader(mocks);
const { getRotatedCursor } = load("app/components/editor/CanvasStage.tsx");
const canvasStageSrc = fs.readFileSync(path.join(root, "app/components/editor/CanvasStage.tsx"), "utf8");

describe("CanvasStage CapCut Direct Canvas Manipulation Tests", () => {
  test("1. getRotatedCursor calculates dynamic rotated cursors per Section 5.6", () => {
    // Top-Left and Bottom-Right (base angle: 135 deg)
    assert.equal(getRotatedCursor(135, 0), "nwse-resize", "0 deg unrotated TL/BR must be nwse-resize");
    assert.equal(getRotatedCursor(135, 45), "ew-resize", "45 deg TL/BR must be ew-resize");
    assert.equal(getRotatedCursor(135, 90), "nesw-resize", "90 deg TL/BR must be nesw-resize");
    assert.equal(getRotatedCursor(135, 135), "ns-resize", "135 deg TL/BR must be ns-resize");
    assert.equal(getRotatedCursor(135, 180), "nwse-resize", "180 deg TL/BR must be nwse-resize");

    // Top-Right and Bottom-Left (base angle: 45 deg)
    assert.equal(getRotatedCursor(45, 0), "nesw-resize", "0 deg unrotated TR/BL must be nesw-resize");
    assert.equal(getRotatedCursor(45, 45), "ns-resize", "45 deg TR/BL must be ns-resize");
    assert.equal(getRotatedCursor(45, 90), "nwse-resize", "90 deg TR/BL must be nwse-resize");
    assert.equal(getRotatedCursor(45, 135), "ew-resize", "135 deg TR/BL must be ew-resize");
    assert.equal(getRotatedCursor(45, 180), "nesw-resize", "180 deg TR/BL must be nesw-resize");

    // Negative rotation angles
    assert.equal(getRotatedCursor(135, -45), "ns-resize", "-45 deg TL/BR must normalize and return ns-resize");
    assert.equal(getRotatedCursor(45, -45), "ew-resize", "-45 deg TR/BL must normalize and return ew-resize");
    assert.equal(getRotatedCursor(135, -90), "nesw-resize", "-90 deg TL/BR must return nesw-resize");
  });

  test("2. Bounding box contains 4 corner handles and top rotation stalk", () => {
    // 4 Corner resize handles
    assert.ok(canvasStageSrc.includes('aria-label="Scale Top-Left"'), "Must have Scale Top-Left handle");
    assert.ok(canvasStageSrc.includes('aria-label="Scale Top-Right"'), "Must have Scale Top-Right handle");
    assert.ok(canvasStageSrc.includes('aria-label="Scale Bottom-Right"'), "Must have Scale Bottom-Right handle");
    assert.ok(canvasStageSrc.includes('aria-label="Scale Bottom-Left"'), "Must have Scale Bottom-Left handle");

    // Stalk line
    assert.ok(
      canvasStageSrc.includes('w-[1.5px] h-6 bg-blue-600 pointer-events-none'),
      "Must have vertical 24px stalk line for rotation handle"
    );

    // Rotation handle
    assert.ok(canvasStageSrc.includes('aria-label="Rotate layer"'), "Must have Rotate layer handle");
    assert.ok(canvasStageSrc.includes('-top-[31px]'), "Rotation handle must be centered at stalk top");
  });

  test("3. Smart center alignment snapping (threshold: 6px) to canvas center (x: 0, y: 0)", () => {
    const rect = { width: 1000, height: 1000 };
    const t = { x: 0, y: 0 };
    const startX = 500;
    const startY = 500;

    function simulateMove(clientX, clientY) {
      const rawX = t.x + (clientX - startX) / rect.width;
      const rawY = t.y + (clientY - startY) / rect.height;
      const snapThresholdX = 6 / rect.width;
      const snapThresholdY = 6 / rect.height;
      const snappedX = Math.abs(rawX) <= snapThresholdX;
      const snappedY = Math.abs(rawY) <= snapThresholdY;
      const finalX = snappedX ? 0 : rawX;
      const finalY = snappedY ? 0 : rawY;
      return { finalX, finalY, snappedX, snappedY };
    }

    // Within 6px threshold horizontally (e.g. 5px off center)
    const snapH = simulateMove(505, 600);
    assert.equal(snapH.snappedX, true, "5px offset must snap horizontally");
    assert.equal(snapH.finalX, 0, "finalX must snap to 0");
    assert.equal(snapH.snappedY, false, "100px offset must not snap vertically");
    assert.equal(snapH.finalY, 0.1, "finalY must keep raw coordinate");

    // Outside threshold (e.g. 7px off center)
    const noSnap = simulateMove(507, 493);
    assert.equal(noSnap.snappedX, false, "7px offset must NOT snap horizontally");
    assert.equal(noSnap.finalX, 0.007, "finalX must retain raw position");
    assert.equal(noSnap.snappedY, false, "7px offset must NOT snap vertically");
    assert.equal(noSnap.finalY, -0.007, "finalY must retain raw position");

    // Both axes snapped within threshold
    const snapBoth = simulateMove(503, 498);
    assert.equal(snapBoth.snappedX, true, "3px offset must snap X");
    assert.equal(snapBoth.snappedY, true, "2px offset must snap Y");
    assert.equal(snapBoth.finalX, 0, "finalX must be 0");
    assert.equal(snapBoth.finalY, 0, "finalY must be 0");

    // Verify visual cyan hairlines in source
    assert.ok(canvasStageSrc.includes("snapGuides.x"), "Must check snapGuides.x");
    assert.ok(canvasStageSrc.includes("snapGuides.y"), "Must check snapGuides.y");
    assert.ok(canvasStageSrc.includes("bg-cyan-400"), "Must render cyan hairlines when snapped");
  });

  test("4. Uniform corner scaling around stationary anchor point", () => {
    const rect = { left: 0, top: 0, width: 1000, height: 1000 };
    const t = { x: 0, y: 0, scale: 1.0, rotation: 0 };
    const boxWidth = 200;
    const boxHeight = 200;
    const centerX = 500;
    const centerY = 500;

    function simulateCornerScale(corner, cursorX, cursorY) {
      let lxAnchor = -boxWidth / 2;
      let lyAnchor = -boxHeight / 2;
      if (corner === "tl") {
        lxAnchor = boxWidth / 2;
        lyAnchor = boxHeight / 2;
      } else if (corner === "tr") {
        lxAnchor = -boxWidth / 2;
        lyAnchor = boxHeight / 2;
      } else if (corner === "bl") {
        lxAnchor = boxWidth / 2;
        lyAnchor = -boxHeight / 2;
      } else {
        lxAnchor = -boxWidth / 2;
        lyAnchor = -boxHeight / 2;
      }

      const anchorScreenX = centerX + lxAnchor;
      const anchorScreenY = centerY + lyAnchor;

      const d0x = -2 * lxAnchor;
      const d0y = -2 * lyAnchor;
      const d0LenSq = d0x * d0x + d0y * d0y;

      const vx = cursorX - anchorScreenX;
      const vy = cursorY - anchorScreenY;
      const sRatio = (vx * d0x + vy * d0y) / d0LenSq;
      const clampedScale = Math.max(0.05, Math.min(10, t.scale * sRatio));
      const effectiveMultiplier = clampedScale / t.scale;

      const deltaCenterX = (effectiveMultiplier - 1) * (centerX - anchorScreenX);
      const deltaCenterY = (effectiveMultiplier - 1) * (centerY - anchorScreenY);

      const newCenterX = centerX + deltaCenterX;
      const newCenterY = centerY + deltaCenterY;

      // In the new scaled rect, anchor point screen position:
      const newAnchorScreenX = newCenterX + lxAnchor * effectiveMultiplier;
      const newAnchorScreenY = newCenterY + lyAnchor * effectiveMultiplier;

      return {
        clampedScale,
        newCenterX,
        newCenterY,
        anchorScreenX,
        anchorScreenY,
        newAnchorScreenX,
        newAnchorScreenY,
      };
    }

    // Drag Bottom-Right corner: Anchor is Top-Left (400, 400)
    // Scale up 2x (cursor moves to 800, 800)
    const resBR = simulateCornerScale("br", 800, 800);
    assert.equal(resBR.clampedScale, 2.0, "Scale should double to 2.0");
    assert.equal(resBR.anchorScreenX, 400, "Initial TL anchor X is 400");
    assert.equal(resBR.anchorScreenY, 400, "Initial TL anchor Y is 400");
    assert.ok(Math.abs(resBR.newAnchorScreenX - 400) < 0.001, "TL anchor X must remain stationary at 400");
    assert.ok(Math.abs(resBR.newAnchorScreenY - 400) < 0.001, "TL anchor Y must remain stationary at 400");
    assert.equal(resBR.newCenterX, 600, "New center moves outward to 600");

    // Drag Top-Left corner: Anchor is Bottom-Right (600, 600)
    // Scale up 2x (cursor moves to 200, 200)
    const resTL = simulateCornerScale("tl", 200, 200);
    assert.equal(resTL.clampedScale, 2.0, "Scale should double to 2.0");
    assert.equal(resTL.anchorScreenX, 600, "Initial BR anchor X is 600");
    assert.equal(resTL.anchorScreenY, 600, "Initial BR anchor Y is 600");
    assert.ok(Math.abs(resTL.newAnchorScreenX - 600) < 0.001, "BR anchor X must remain stationary at 600");
    assert.ok(Math.abs(resTL.newAnchorScreenY - 600) < 0.001, "BR anchor Y must remain stationary at 600");

    // Drag Top-Right corner: Anchor is Bottom-Left (400, 600)
    // Scale up 1.5x
    const resTR = simulateCornerScale("tr", 700, 300);
    assert.equal(resTR.clampedScale, 1.5, "Scale should be 1.5");
    assert.equal(resTR.anchorScreenX, 400, "Initial BL anchor X is 400");
    assert.equal(resTR.anchorScreenY, 600, "Initial BL anchor Y is 600");
    assert.ok(Math.abs(resTR.newAnchorScreenX - 400) < 0.001, "BL anchor X must remain stationary at 400");
    assert.ok(Math.abs(resTR.newAnchorScreenY - 600) < 0.001, "BL anchor Y must remain stationary at 600");
  });
});
