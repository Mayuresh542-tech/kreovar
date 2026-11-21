# Handoff Report: Requirement R2 — Desktop & Mobile Editor UI Integration

## 1. Observation

Direct code examination across the codebase revealed the following specific findings for Requirement R2:

### Item 1: `AssetDrawer.tsx` Inspector Tab vs `workspace/Inspector.tsx`
- **Location**: `app/components/editor/AssetDrawer.tsx:800-896`
- **Current Content**: Lines 800–896 only contain clip name, track kind badge, read-only start/duration text, scale (%) input, rotation (°) input, volume slider (0–200%), and a single Delete button.
- **Legacy Inspector Comparison (`app/components/editor/workspace/Inspector.tsx:25-54`)**:
  1. **Transform & Layout**:
     - Lacks `Position X (%)` (`transform.x * 100`) and `Position Y (%)` (`transform.y * 100`).
     - Lacks `Opacity (%)` (`transform.opacity * 100`).
     - Lacks `Fit frame` and `Fill frame` quick actions using `visualDimensions(asset, repository)` and `frameClip(...)`.
  2. **Timing & Playback**:
     - Start time is read-only text; lacks editable `Start (s)` input calling `moveClip(project, clip.id, value)`.
     - Duration is read-only text; lacks editable `Duration (s)` input calling `trimClip(project, clip.id, "right", clip.startTime + value)`.
     - Lacks playback `Speed (×)` (0.25x–4x) input calling `changeClipProperty(project, clip.id, { speed: value })`.
     - Lacks `Fade In (s)` and `Fade Out (s)` inputs calling `changeClipProperty(project, clip.id, { fadeIn, fadeOut })`.
     - Lacks `Replace clip media` dropdown calling `replaceClipAsset(project, clip.id, assetId)`.
     - Lacks Source time display (`sourceStart` / `sourceEnd`).
  3. **Visual Effects & Adjustments**:
     - Lacks `brightness` (-100 to 100), `contrast` (-100 to 100), `saturation` (-100 to 100), and `blur` (0 to 20) adjustment sliders calling `changeClipProperty(project, clip.id, { effects: { ...clip.effects, [key]: value } })`.
     - Lacks chromatic `rgbOffset` adjustment via `setVisualTreatment` (`app/lib/editor/visualTreatment.ts:83`).
     - Lacks Entrance, Exit, and Loop motion controls (`MediaAnimationControls` or `setMediaAnimation` / `clearMediaAnimation` in `app/lib/editor/mediaAnimation.ts:17,22`).
  4. **Caption & Text Editing**:
     - When a caption or text clip is selected (`c.contentId` present in `project.captions` or `project.textLayers`), `AssetDrawer.tsx` displays none of the text fields!
     - Lacks text content textarea calling `changeText(project, clip.id, text)` or `editCaption(project, clip.id, text, start, end)`.
     - Lacks font family dropdown (`Inter`, `Montserrat`, `Outfit`, `Oswald`, `Poppins`, `JetBrains Mono`).
     - Lacks font size input, font weight dropdown, text alignment (left/center/right), text color, stroke color, stroke width, and shadow controls.
     - Lacks `studioData` preset switcher for caption clips calling `applyCaptionTemplate(project, [clip.id], template)`.
  5. **Audio Controls**:
     - Lacks `audioRole` dropdown (`"speech" | "background" | "sfx"`).
     - Lacks `ducking` toggle ("Soften under speech (when Audio balance is on)").
     - Lacks Mute / Unmute quick toggle button.

---

### Item 2: Tools & Track Caps
1. **B-Roll Search in `AssetDrawer.tsx:614-666`**:
   - Currently, lines 635–663 render 4 static mock items with an `onClick` that only invokes `notify("Searching B-roll...")`.
   - `/api/editor/broll-choice/route.ts` requires `{ projectId, query, speech, duration, orientation, exclude }`. It returns `{ video: StockVideo, reason, ... }`.
   - Currently, `AssetDrawer.tsx` never calls `/api/editor/broll-choice` and never inserts selected footage into the `overlay` track via `addClip`.
2. **Transitions Tab in `AssetDrawer.tsx:708-725`**:
   - Lines 712–723 render `["Dissolve", "Fade to Black", "Whip Slide", "Zoom Cross"]` with `notify("Selected ... transition")`.
   - In `app/lib/editor/model.ts:48`, `TransitionKind` is strictly `"fade" | "dissolve" | "slide" | "zoom"`.
   - `addTransition(project, fromClipId, toClipId, kind, duration)` in `operations.ts:110` requires two adjacent visual clips on the same track.
3. **Media Cards DND & Local File Upload in `AssetDrawer.tsx`**:
   - In `AssetDrawer.tsx:563-602`, the asset elements are not `draggable` and have no `onDragStart`.
   - In `TimelinePanel.tsx:408,700`, track lanes already listen for `application/veelox-asset` on drop and dragover.
   - In `AssetDrawer.tsx:145-168`, `handleFileUpload` only runs `importMedia(file, scope)`. Unlike legacy `Library.tsx:42-56`, it does not upload via `uploadAssetFile` or link via `linkAsset(project.id, role, saved.id)`.
4. **Caption Studio Preset Count & Hinglish Bidirectional Revert**:
   - In `AssetDrawer.tsx:303-352`, only 6 presets are hardcoded. `ALL_CAPTION_TEMPLATES` in `app/lib/captions/referenceTemplates.ts:62` contains all registered templates.
   - In `AssetDrawer.tsx:263-278`, the Hinglish toggle switches to `"viral-hinglish-pop"` when enabled, but when toggled off (`!isHinglishMode`), it does not revert to the previously active template.
5. **Timeline Track Header Row Sizing (`TimelinePanel.tsx:589`)**:
   - Line 589: `<div key={id} className="h-[56px] px-2.5 flex items-center justify-between bg-white hover:bg-slate-50 transition-colors">`.
   - It lacks `shrink-0`. In multi-track projects with flex wrapping/compression, headers shrink below 56px while timeline lanes stay at 56px, causing vertical misalignment.
6. **30-Track Maximum Cap (`operations.ts:116-119`)**:
   - `addTrack` in `app/lib/editor/operations.ts:116` does not check the track count, but `aiValidation.ts:94` enforces `array(p.trackOrder, 30)`. Adding a 31st track breaks subsequent validation.

---

### Item 3: Canvas & Keyboard Shortcuts
1. **Compositor Loop Effect in `CanvasStage.tsx:92-209`**:
   - Line 209: `}, [store, playback, repository, notify, isLooping]);`.
   - `isLooping` is in the dependency array. Toggling loop on line 550 causes the entire effect to re-run, destroying the `Compositor` instance (`compositor.destroy()`) and dropping all media element buffers.
2. **Scale & Rotate Handle Math in `CanvasStage.tsx:300-308`**:
   - Lines 300–308:
     ```typescript
     : mode === "scale"
     ? { scale: clamp(t.scale * (1 + (e.clientX - startX) / Math.max(30, rect.width * 0.3)), 0.05, 10) }
     : { rotation: t.rotation + (e.clientX - startX) * 0.6 }
     ```
   - Both scale and rotate only use horizontal mouse movement `(e.clientX - startX)`! They do not compute 2D Euclidean distance or `atan2` relative to the clip center and rotation.
3. **Safe Area Guides & Zoom Container in `CanvasStage.tsx:416, 441-449`**:
   - Line 441: `{showSafeAreas && aspectRatio === "9:16" && ...}`. Safe area guides only exist for `9:16`. Ratios `4:5`, `1:1`, and `16:9` render nothing.
   - Line 416: `<div ref={stageRef} className="flex-1 w-full flex items-center justify-center relative min-h-0 overflow-hidden">`. When `zoom > 1` (>100%), `overflow-hidden` clips the frame with no scroll/pan capability.
4. **Keyboard Shortcuts in `EditorLayout.tsx:96-194`**:
   - Lines 515–517 list `Toggle Snapping (N)`, `Fit Timeline (F)`, and `Timeline Zoom (+ / -)` in the shortcuts dialog, but `handleKeyDown` has no handlers for `N`, `F`, `+`, `-`, or `Cmd/Ctrl+C` + `Cmd/Ctrl+V` (`pasteClips`).

---

### Item 4: Mobile UI Polish
1. **Empty Project Duration Playback Loop (`MobileCanvasStage.tsx:182-184`, `MobileEditorLayout.tsx:60-68`)**:
   - When `projectDuration(project) === 0`, `MobileCanvasStage.tsx:183` unconditionally executes `playback.set(next, true)`.
   - `MobileEditorLayout.tsx:66` does not check `curDuration <= 0` in `handleTogglePlay`.
2. **"Hidden Tracks" and Mobile Trim Handles (`MobileTimeline.tsx`)**:
   - Line 135: `if (!track || track.hidden) continue;`. When a track is hidden, mobile users have no UI to see that it is hidden or unhide it.
   - Lines 443–460: Trim handles are only rendered for `trackGroups.mainVideo`. `captionsAndText`, `overlays`, and `audioClips` have no trim handles when selected.

---

## 2. Logic Chain

### For Item 1: Porting Inspector into `AssetDrawer.tsx`
1. When a clip is selected (`c = project.clips[selection[0]]`), identify whether it is visual (`track.kind !== "audio"`), audio, text (`textForClip(project, c)`), or caption (`project.captions[c.contentId]`).
2. Wire Transform & Layout:
   - For visual clips, expose Position X and Y as percentage inputs modifying `transform.x` and `transform.y`.
   - Expose Opacity slider (0–100%) modifying `transform.opacity`.
   - Add Fit Frame and Fill Frame buttons: measure dimensions with `visualDimensions(asset, repository)` and execute `frameClip(addAsset(project, { ...asset, ...size }), c.id, mode)`.
3. Wire Timing & Playback:
   - Replace static text with number fields for Start time (`moveClip`) and Duration (`trimClip`).
   - Add Speed multiplier input (`0.25x` to `4.0x`) modifying `c.speed`.
   - Add Fade In and Fade Out inputs modifying `c.fadeIn` and `c.fadeOut`.
   - For clips with assets, add Replace Media dropdown populated with assets matching `canPlace(track.kind, asset.kind)` calling `replaceClipAsset(project, c.id, selectedAssetId)`.
4. Wire Visual Adjustments & Media Animations:
   - Provide range sliders for `brightness` (-100 to 100), `contrast` (-100 to 100), `saturation` (-100 to 100), and `blur` (0 to 20).
   - Port `MediaAnimationControls` into the drawer to allow Entrance, Exit, and Loop motions with `setMediaAnimation(project, c.id, animation)` and `clearMediaAnimation(project, c.id)`.
5. Wire Caption & Text Editing:
   - If `c.contentId` exists, display Text/Caption controls: textarea for text content calling `changeText(project, c.id, newText)` or `editCaption(project, c.id, newText, start, end)`.
   - Provide font family, font size, font weight, alignment, font color, stroke, and shadow controls.
   - Provide template preset selector calling `applyCaptionTemplate(project, [c.id], template)`.
6. Wire Audio Controls:
   - Provide Audio Role dropdown (`speech`, `background`, `sfx`) modifying `c.audioRole`.
   - If role is not `speech`, show `c.ducking` checkbox ("Soften under speech").
   - Add Mute/Unmute button toggling `volume === 0 ? 1 : 0`.

### For Item 2: Tools & Track Caps
1. B-Roll Tab:
   - Provide search bar and quick suggestion pills. When clicked or searched, invoke `fetch("/api/editor/broll-choice", ...)` with auth bearer token.
   - Upon receiving chosen `StockVideo`, create `MediaAsset` record, ensure an unlocked `overlay` track exists (or call `addTrack(project, "overlay")`), call `addAsset`, and call `addClip(project, asset.id, overlayTrack.id, currentTime, { duration: Math.min(video.duration, 4) })`.
2. Transitions Tab:
   - Replace mock button names with `TransitionKind` options: `"fade"` (Fade to Black), `"dissolve"` (Cross Dissolve), `"slide"` (Whip Slide), `"zoom"` (Zoom Cross).
   - On click, if `selection.length === 2`: sort clips by `startTime` and execute `run(p => addTransition(p, sorted[0].id, sorted[1].id, kind, 0.5))`. If selection is not 2 clips, notify with clear instructions.
3. Media Cards DND & Upload:
   - Add `draggable` and `onDragStart={(e) => { e.dataTransfer.setData("application/veelox-asset", asset.id); e.dataTransfer.effectAllowed = "copy"; }}` to asset cards in `AssetDrawer.tsx`.
   - In `handleFileUpload`, invoke `uploadAssetFile(file, { duration, width, height })` followed by `linkAsset(...)`, matching `Library.tsx`.
4. Caption Presets & Hinglish Revert:
   - Replace the 6 hardcoded presets with the full list from `ALL_CAPTION_TEMPLATES`.
   - In Hinglish toggle: remember `previousTemplateId` in state/ref. When turning on: apply `"viral-hinglish-pop"`. When turning off: restore `previousTemplateId`.
5. Timeline Header Row Alignment:
   - Add `shrink-0` to `TimelinePanel.tsx:589` so track header row height strictly matches track lane height (56px).
6. 30-Track Maximum:
   - In `operations.ts:116`, check `if (p.trackOrder.length >= 30) throw new Error("A project can have up to 30 tracks.");`.

### For Item 3: Canvas & Shortcuts
1. Compositor Loop Effect:
   - Use `const isLoopingRef = useRef(isLooping); useEffect(() => { isLoopingRef.current = isLooping; }, [isLooping]);`.
   - In the Compositor loop, read `isLoopingRef.current`.
   - Remove `isLooping` from the `useEffect` dependencies, preventing unnecessary Compositor teardowns.
2. 2D Euclidean Distance & Atan2 Handle Math:
   - Locate clip center on canvas:
     `centerX = rect.left + (box ? (box.x / w) * rect.width : (0.5 + t.x) * rect.width);`
     `centerY = rect.top + (box ? (box.y / h) * rect.height : (0.5 + t.y) * rect.height);`
   - Initial distance: `startDist = Math.hypot(startX - centerX, startY - centerY)`.
   - Initial angle: `startAngle = Math.atan2(startY - centerY, startX - centerX) * (180 / Math.PI)`.
   - Current distance: `curDist = Math.hypot(e.clientX - centerX, e.clientY - centerY)`.
   - Current angle: `curAngle = Math.atan2(e.clientY - centerY, e.clientX - centerX) * (180 / Math.PI)`.
   - For scale: `scale = clamp(t.scale * (curDist / Math.max(2, startDist)), 0.05, 10)`.
   - For rotate: `rotation = Math.round(t.rotation + (curAngle - startAngle))`.
3. Safe Area Guides & Zoom:
   - Render overlay tailored to `project.settings.aspectRatio`:
     - `9:16`: Top 12%, Bottom 20%, Right 16%.
     - `4:5`: 5% horizontal margin, 10% vertical margin.
     - `1:1`: 10% action safe margin.
     - `16:9`: 5% action safe margin (90%), 10% title safe margin (80%).
   - When `zoom > 1`, set `overflow-auto scrollbar-thin` on the stage container.
4. Shortcuts in `EditorLayout.tsx`:
   - Implement `N` (Toggle Snapping), `F` (Fit Timeline), and `+`/`-` (Timeline Zoom) via custom events dispatched to `window` and handled in `TimelinePanel.tsx`.
   - Implement `Cmd/Ctrl+C` and `Cmd/Ctrl+V` (`pasteClips`) using a clipboard ref:
     `run(p => pasteClips(p, clipboard.project, clipboard.ids, currentTime))`.

### For Item 4: Mobile UI Polish
1. Playback Loop Guard:
   - In `MobileEditorLayout.tsx`: In `handleTogglePlay`, if `curDuration <= 0`, return early.
   - In `MobileCanvasStage.tsx`: In `onTogglePlayEvent`, if `curDuration <= 0`, return early. In `loop()`, if `curDuration <= 0`, call `playback.set(0, false)` and pause compositor.
2. Hidden Tracks & Trim Handles in `MobileTimeline.tsx`:
   - Compute `hiddenTracks = project.trackOrder.map(id => project.tracks[id]).filter(t => t?.hidden)`.
   - If `hiddenTracks.length > 0`, display an unhide pill bar with buttons to unhide individual tracks or all tracks.
   - Render trim handles when `isSelected` on `captionsAndText`, `overlays`, and `audioClips` lanes, calling `handleTrimClip(e, clip, "left" | "right")`.

---

## 3. Caveats

1. **Audio Context Autoplay Policies**: When previewing audio or B-Roll sound, mobile Safari/Chrome requires user interaction before audio plays. `activateAudio()` must be called inside click/tap event handlers.
2. **Stock B-Roll API Dependencies**: `/api/editor/broll-choice` depends on `PEXELS_API_KEY` and user session token. If the user is unauthenticated or the API key is not configured, graceful fallback notification must be presented to the user without crashing the drawer.
3. **Clip Replacement Bounds**: When replacing clip media (`replaceClipAsset`), the replacement asset must have sufficient duration (`asset.duration >= clip.duration * clip.speed`) or the clip duration should be clamped to avoid source-end bleed.
4. **Custom Events Scope**: When using window events for shortcuts between `EditorLayout.tsx` and `TimelinePanel.tsx`, event listeners should clean up on unmount to prevent leaks during hot module reloads.

---

## 4. Concrete Line-by-Line Diff Proposals

### Item 1: `AssetDrawer.tsx` Inspector Tab Expansion

```diff
--- a/app/components/editor/AssetDrawer.tsx
+++ b/app/components/editor/AssetDrawer.tsx
@@ -43,6 +43,10 @@ import {
   replaceClipAsset,
   splitClip,
+  moveClip,
+  trimClip,
+  frameClip,
+  changeText,
 } from "@/app/lib/editor/operations";
+import { visualDimensions } from "@/app/lib/editor/media";
+import { audioRole } from "@/app/lib/editor/audioMix";
+import { textForClip, TextStyle } from "@/app/lib/editor/model";
+import { applyCaptionTemplate } from "@/app/lib/editor/captionTemplates";
+import MediaAnimationControls from "./workspace/MediaAnimationControls";
@@ -801,96 +805,250 @@ export default function AssetDrawer({ activeTab, onClose }: AssetDrawerProps) {
         {activeTab === "inspector" && (
           <div className="space-y-4 text-xs">
             {selectedClip ? (
               <div className="space-y-4">
                 <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-1">
                   <div className="flex items-center justify-between">
                     <strong className="text-slate-900 truncate">{selectedClip.name}</strong>
                     <span className="text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded font-mono font-medium">
                       {selectedTrack?.kind || "clip"}
                     </span>
                   </div>
                   <p className="text-[10px] text-slate-500 font-mono">
                     Start: {selectedClip.startTime.toFixed(2)}s · Dur: {selectedClip.duration.toFixed(2)}s
                   </p>
                 </div>
 
+                {/* Quick Framing (Fit / Fill) for visual assets */}
+                {selectedTrack?.kind !== "audio" && selectedClip.assetId && project.assets[selectedClip.assetId] && (
+                  <div className="space-y-1.5">
+                    <span className="text-[11px] font-semibold text-slate-500 uppercase">Frame Fitting</span>
+                    <div className="grid grid-cols-2 gap-2">
+                      <button
+                        type="button"
+                        onClick={async () => {
+                          const asset = project.assets[selectedClip.assetId!];
+                          const size = await visualDimensions(asset, repository);
+                          run((p) => frameClip(addAsset(p, { ...asset, ...size }), selectedClip.id, "fit"));
+                        }}
+                        className="py-1.5 px-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-medium"
+                      >
+                        Fit Frame
+                      </button>
+                      <button
+                        type="button"
+                        onClick={async () => {
+                          const asset = project.assets[selectedClip.assetId!];
+                          const size = await visualDimensions(asset, repository);
+                          run((p) => frameClip(addAsset(p, { ...asset, ...size }), selectedClip.id, "fill"));
+                        }}
+                        className="py-1.5 px-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-medium"
+                      >
+                        Fill Frame
+                      </button>
+                    </div>
+                  </div>
+                )}
+
                 {/* Transform Controls */}
+                {selectedTrack?.kind !== "audio" && (
                   <div className="space-y-2">
                     <span className="text-[11px] font-semibold text-slate-500 uppercase">
                       Transform & Layout
                     </span>
                     <div className="grid grid-cols-2 gap-2">
                       <label className="flex flex-col gap-1 text-[11px] text-slate-600">
+                        Position X (%)
+                        <input
+                          type="number"
+                          value={Math.round(selectedClip.transform.x * 100)}
+                          onChange={(e) =>
+                            run((p) =>
+                              changeClipProperty(p, selectedClip.id, {
+                                transform: { ...selectedClip.transform, x: Number(e.target.value) / 100 },
+                              })
+                            )
+                          }
+                          className="bg-slate-50 border border-slate-200 rounded px-2 py-1 text-slate-900 focus:outline-none focus:border-blue-600 focus:bg-white"
+                        />
+                      </label>
+                      <label className="flex flex-col gap-1 text-[11px] text-slate-600">
+                        Position Y (%)
+                        <input
+                          type="number"
+                          value={Math.round(selectedClip.transform.y * 100)}
+                          onChange={(e) =>
+                            run((p) =>
+                              changeClipProperty(p, selectedClip.id, {
+                                transform: { ...selectedClip.transform, y: Number(e.target.value) / 100 },
+                              })
+                            )
+                          }
+                          className="bg-slate-50 border border-slate-200 rounded px-2 py-1 text-slate-900 focus:outline-none focus:border-blue-600 focus:bg-white"
+                        />
+                      </label>
                       <label className="flex flex-col gap-1 text-[11px] text-slate-600">
                         Scale (%)
                         <input
                           type="number"
                           value={Math.round(selectedClip.transform.scale * 100)}
                           onChange={(e) =>
                             run((p) =>
                               changeClipProperty(p, selectedClip.id, {
-                                transform: {
-                                  ...selectedClip.transform,
-                                  scale: Number(e.target.value) / 100,
-                                },
+                                transform: { ...selectedClip.transform, scale: Number(e.target.value) / 100 },
                               })
                             )
                           }
                           className="bg-slate-50 border border-slate-200 rounded px-2 py-1 text-slate-900 focus:outline-none focus:border-blue-600 focus:bg-white"
                         />
                       </label>
                       <label className="flex flex-col gap-1 text-[11px] text-slate-600">
                         Rotation (°)
                         <input
                           type="number"
                           value={Math.round(selectedClip.transform.rotation)}
                           onChange={(e) =>
                             run((p) =>
                               changeClipProperty(p, selectedClip.id, {
-                                transform: {
-                                  ...selectedClip.transform,
-                                  rotation: Number(e.target.value),
-                                },
+                                transform: { ...selectedClip.transform, rotation: Number(e.target.value) },
                               })
                             )
                           }
                           className="bg-slate-50 border border-slate-200 rounded px-2 py-1 text-slate-900 focus:outline-none focus:border-blue-600 focus:bg-white"
                         />
                       </label>
                     </div>
+                    <div className="space-y-1">
+                      <div className="flex justify-between text-slate-600 text-[11px]">
+                        <span>Opacity</span>
+                        <span>{Math.round((selectedClip.transform.opacity ?? 1) * 100)}%</span>
+                      </div>
+                      <input
+                        type="range"
+                        min={0}
+                        max={100}
+                        value={Math.round((selectedClip.transform.opacity ?? 1) * 100)}
+                        onChange={(e) =>
+                          run((p) =>
+                            changeClipProperty(p, selectedClip.id, {
+                              transform: { ...selectedClip.transform, opacity: Number(e.target.value) / 100 },
+                            })
+                          )
+                        }
+                        className="w-full h-1.5 bg-slate-200 rounded accent-blue-600 cursor-pointer"
+                      />
+                    </div>
                   </div>
+                )}
+
+                {/* Timing & Playback Controls */}
+                <div className="space-y-2">
+                  <span className="text-[11px] font-semibold text-slate-500 uppercase">Timing & Speed</span>
+                  <div className="grid grid-cols-2 gap-2">
+                    <label className="flex flex-col gap-1 text-[11px] text-slate-600">
+                      Start (s)
+                      <input
+                        type="number"
+                        step={0.1}
+                        min={0}
+                        value={Number(selectedClip.startTime.toFixed(2))}
+                        onChange={(e) => run((p) => moveClip(p, selectedClip.id, Math.max(0, Number(e.target.value))))}
+                        className="bg-slate-50 border border-slate-200 rounded px-2 py-1 text-slate-900"
+                      />
+                    </label>
+                    <label className="flex flex-col gap-1 text-[11px] text-slate-600">
+                      Duration (s)
+                      <input
+                        type="number"
+                        step={0.1}
+                        min={0.1}
+                        value={Number(selectedClip.duration.toFixed(2))}
+                        onChange={(e) => run((p) => trimClip(p, selectedClip.id, "right", selectedClip.startTime + Math.max(0.1, Number(e.target.value))))}
+                        className="bg-slate-50 border border-slate-200 rounded px-2 py-1 text-slate-900"
+                      />
+                    </label>
+                  </div>
+                  <div className="grid grid-cols-3 gap-2">
+                    <label className="flex flex-col gap-1 text-[11px] text-slate-600">
+                      Speed (×)
+                      <input
+                        type="number"
+                        step={0.05}
+                        min={0.25}
+                        max={4}
+                        value={selectedClip.speed}
+                        onChange={(e) => run((p) => changeClipProperty(p, selectedClip.id, { speed: Math.max(0.25, Math.min(4, Number(e.target.value))) }))}
+                        className="bg-slate-50 border border-slate-200 rounded px-2 py-1 text-slate-900"
+                      />
+                    </label>
+                    <label className="flex flex-col gap-1 text-[11px] text-slate-600">
+                      Fade In (s)
+                      <input
+                        type="number"
+                        step={0.1}
+                        min={0}
+                        max={selectedClip.duration}
+                        value={selectedClip.fadeIn}
+                        onChange={(e) => run((p) => changeClipProperty(p, selectedClip.id, { fadeIn: Number(e.target.value) }))}
+                        className="bg-slate-50 border border-slate-200 rounded px-2 py-1 text-slate-900"
+                      />
+                    </label>
+                    <label className="flex flex-col gap-1 text-[11px] text-slate-600">
+                      Fade Out (s)
+                      <input
+                        type="number"
+                        step={0.1}
+                        min={0}
+                        max={selectedClip.duration}
+                        value={selectedClip.fadeOut}
+                        onChange={(e) => run((p) => changeClipProperty(p, selectedClip.id, { fadeOut: Number(e.target.value) }))}
+                        className="bg-slate-50 border border-slate-200 rounded px-2 py-1 text-slate-900"
+                      />
+                    </label>
+                  </div>
+                </div>
+
+                {/* Visual Adjustments & Media Animations */}
+                {selectedTrack?.kind !== "audio" && (
+                  <div className="space-y-2.5">
+                    <span className="text-[11px] font-semibold text-slate-500 uppercase">Visual Adjustments</span>
+                    {(["brightness", "contrast", "saturation"] as const).map((key) => (
+                      <div key={key} className="space-y-1">
+                        <div className="flex justify-between text-slate-600 text-[11px] capitalize">
+                          <span>{key}</span>
+                          <span>{selectedClip.effects[key]}</span>
+                        </div>
+                        <input
+                          type="range"
+                          min={-100}
+                          max={100}
+                          value={selectedClip.effects[key]}
+                          onChange={(e) => run((p) => changeClipProperty(p, selectedClip.id, { effects: { ...selectedClip.effects, [key]: Number(e.target.value) } }))}
+                          className="w-full h-1.5 bg-slate-200 rounded accent-blue-600 cursor-pointer"
+                        />
+                      </div>
+                    ))}
+                    <div className="space-y-1">
+                      <div className="flex justify-between text-slate-600 text-[11px]">
+                        <span>Blur</span>
+                        <span>{selectedClip.effects.blur.toFixed(1)}</span>
+                      </div>
+                      <input
+                        type="range"
+                        min={0}
+                        max={20}
+                        step={0.5}
+                        value={selectedClip.effects.blur}
+                        onChange={(e) => run((p) => changeClipProperty(p, selectedClip.id, { effects: { ...selectedClip.effects, blur: Number(e.target.value) } }))}
+                        className="w-full h-1.5 bg-slate-200 rounded accent-blue-600 cursor-pointer"
+                      />
+                    </div>
+                    <MediaAnimationControls clipId={selectedClip.id} />
+                  </div>
+                )}
```

---

### Item 2: Tools & Track Caps Diff Proposals

#### B-Roll Integration & Transitions in `AssetDrawer.tsx`:
```diff
--- a/app/components/editor/AssetDrawer.tsx
+++ b/app/components/editor/AssetDrawer.tsx
@@ -45,6 +45,7 @@ import {
   replaceClipAsset,
   splitClip,
+  addTrack,
+  addTransition,
 } from "@/app/lib/editor/operations";
@@ -620,38 +625,65 @@ export default function AssetDrawer({ activeTab, onClose }: AssetDrawerProps) {
+  const handleSearchBroll = async (queryText: string) => {
+    if (!queryText.trim() || isSearchingBroll) return;
+    setIsSearchingBroll(true);
+    try {
+      const res = await fetch("/api/editor/broll-choice", {
+        method: "POST",
+        headers: {
+          "Content-Type": "application/json",
+          Authorization: `Bearer ${authToken || ""}`,
+        },
+        body: JSON.stringify({
+          projectId: project.id,
+          query: queryText.trim(),
+          speech: "",
+          duration: 4,
+          orientation: project.settings.aspectRatio === "16:9" ? "landscape" : "portrait",
+          exclude: [],
+        }),
+      });
+      const data = await res.json();
+      if (!res.ok || !data.video) throw new Error(data.error || "Failed to find B-roll.");
+      const v = data.video;
+      const assetId = crypto.randomUUID();
+      const clipId = crypto.randomUUID();
+      const time = playback.getSnapshot().time;
+      run((p) => {
+        let overlayTrack = p.trackOrder.map((id) => p.tracks[id]).find((t) => t.kind === "overlay" && !t.locked);
+        let next = p;
+        if (!overlayTrack) {
+          next = addTrack(next, "overlay");
+          overlayTrack = next.tracks[next.trackOrder[next.trackOrder.length - 1]];
+        }
+        const asset: MediaAsset = {
+          id: assetId,
+          kind: "video",
+          name: v.title,
+          duration: v.duration,
+          width: v.width,
+          height: v.height,
+          url: v.videoUrl,
+          thumbnail: v.thumbnail,
+          size: 0,
+          mime: "video/mp4",
+        };
+        next = addAsset(next, asset);
+        return addClip(next, assetId, overlayTrack.id, time, { id: clipId, duration: Math.min(v.duration, 4) });
+      });
+      select([clipId]);
+      notify(`Added "${v.title}" B-roll to overlay track.`);
+    } catch (e) {
+      notify(e instanceof Error ? e.message : "B-roll search failed.");
+    } finally {
+      setIsSearchingBroll(false);
+    }
+  };
```

#### Media Cards Drag-and-Drop:
```diff
--- a/app/components/editor/AssetDrawer.tsx
+++ b/app/components/editor/AssetDrawer.tsx
@@ -563,6 +563,11 @@ export default function AssetDrawer({ activeTab, onClose }: AssetDrawerProps) {
                   <div
                     key={asset.id}
+                    draggable
+                    onDragStart={(e) => {
+                      e.dataTransfer.setData("application/veelox-asset", asset.id);
+                      e.dataTransfer.effectAllowed = "copy";
+                    }}
                     className="p-2 rounded-xl bg-white border border-slate-200 flex items-center justify-between group hover:border-slate-300 transition-colors cursor-grab active:cursor-grabbing"
                   >
```

#### Track Cap inside `operations.ts:addTrack`:
```diff
--- a/app/lib/editor/operations.ts
+++ b/app/lib/editor/operations.ts
@@ -116,6 +116,7 @@ export function addTransition(p:EditorProject,fromClipId:string,toClipId:string,
 export function addTrack(p:EditorProject,kind:TrackKind):EditorProject {
+  if (p.trackOrder.length >= 30) throw new Error("A project can have up to 30 tracks.");
   const id=uid(),num=Object.values(p.tracks).filter(t=>t.kind===kind).length+1;
   return {...p,trackOrder:[...p.trackOrder,id],tracks:{...p.tracks,[id]:{id,name:`${kind[0].toUpperCase()+kind.slice(1)} ${num}`,kind,clipIds:[],hidden:false,muted:false,locked:false}}};
 }
```

#### Track Header Row `shrink-0` in `TimelinePanel.tsx`:
```diff
--- a/app/components/editor/TimelinePanel.tsx
+++ b/app/components/editor/TimelinePanel.tsx
@@ -588,3 +588,3 @@ export default function TimelinePanel({ height = 280 }: TimelinePanelProps) {
                 <div
                   key={id}
-                  className="h-[56px] px-2.5 flex items-center justify-between bg-white hover:bg-slate-50 transition-colors"
+                  className="h-[56px] shrink-0 px-2.5 flex items-center justify-between bg-white hover:bg-slate-50 transition-colors"
                 >
```

---

### Item 3: CanvasStage & EditorLayout Shortcuts Diff Proposals

#### `CanvasStage.tsx` Loop Dependency & 2D Euclidean/Atan2 Math:
```diff
--- a/app/components/editor/CanvasStage.tsx
+++ b/app/components/editor/CanvasStage.tsx
@@ -60,4 +60,6 @@ export default function CanvasStage({ readOnly = false }: CanvasStageProps) {
   const [isLooping, setIsLooping] = useState(true);
+  const isLoopingRef = useRef(isLooping);
+  useEffect(() => { isLoopingRef.current = isLooping; }, [isLooping]);
@@ -122,3 +124,3 @@ export default function CanvasStage({ readOnly = false }: CanvasStageProps) {
         // Loop handling
-        if (state.playing && isLooping && curDuration > 0 && next >= curDuration) {
+        if (state.playing && isLoopingRef.current && curDuration > 0 && next >= curDuration) {
           next = 0;
@@ -182,3 +184,3 @@ export default function CanvasStage({ readOnly = false }: CanvasStageProps) {
         if (state.playing && ready) {
-          playback.set(next, isLooping || next < curDuration);
+          playback.set(next, isLoopingRef.current || next < curDuration);
         } else if (!ready) {
@@ -209,3 +211,3 @@ export default function CanvasStage({ readOnly = false }: CanvasStageProps) {
     };
-  }, [store, playback, repository, notify, isLooping]);
+  }, [store, playback, repository, notify]);
@@ -282,10 +284,18 @@ export default function CanvasStage({ readOnly = false }: CanvasStageProps) {
     playback.set(playback.getSnapshot().time, false);
     const rect = canvasRef.current?.getBoundingClientRect();
     if (!rect) return;
+    const [w, h] = dimensions[store.getSnapshot().settings.aspectRatio];
+    const box = boundsRef.current.find((b) => b.id === id);
+    const centerX = rect.left + (box ? (box.x / w) * rect.width : (0.5 + t.x) * rect.width);
+    const centerY = rect.top + (box ? (box.y / h) * rect.height : (0.5 + t.y) * rect.height);
     const startX = event.clientX;
     const startY = event.clientY;
+    const startDist = Math.hypot(startX - centerX, startY - centerY);
+    const startAngle = Math.atan2(startY - centerY, startX - centerX) * (180 / Math.PI);
     const t = clip.transform;
 
     pointerEdit(
       store,
       (e) => (p) => {
+        const curDist = Math.hypot(e.clientX - centerX, e.clientY - centerY);
+        const curAngle = Math.atan2(e.clientY - centerY, e.clientX - centerX) * (180 / Math.PI);
         return changeClipProperty(p, id, {
           transform: {
             ...t,
             ...(mode === "move"
               ? {
                   x: t.x + (e.clientX - startX) / rect.width,
                   y: t.y + (e.clientY - startY) / rect.height,
                 }
               : mode === "scale"
               ? {
                   scale: clamp(
-                    t.scale * (1 + (e.clientX - startX) / Math.max(30, rect.width * 0.3)),
+                    t.scale * (startDist > 2 ? curDist / startDist : 1),
                     0.05,
                     10
                   ),
                 }
-              : { rotation: t.rotation + (e.clientX - startX) * 0.6 }),
+              : { rotation: Math.round(t.rotation + (curAngle - startAngle)) }),
           },
         });
       },
       notify
     );
```

#### Safe Area Overlays for All Ratios in `CanvasStage.tsx`:
```diff
--- a/app/components/editor/CanvasStage.tsx
+++ b/app/components/editor/CanvasStage.tsx
@@ -440,11 +440,32 @@ export default function CanvasStage({ readOnly = false }: CanvasStageProps) {
-          {/* Safe Area Overlay for 9:16 Short-Form Videos */}
-          {showSafeAreas && aspectRatio === "9:16" && (
-            <div className="absolute inset-0 pointer-events-none border-2 border-dashed border-amber-400/50 m-8 rounded-lg flex flex-col justify-between p-3 text-[10px] text-amber-300 font-mono">
-              <span className="opacity-80">Top Header Safe Zone</span>
-              <span className="opacity-80 self-end text-right">
-                Right Action Sidebar (Likes/Share)
-              </span>
-              <span className="opacity-80">Bottom Caption & Audio Safe Zone</span>
-            </div>
-          )}
+          {/* Dynamic Safe Area Overlays */}
+          {showSafeAreas && (
+            <div className="absolute inset-0 pointer-events-none">
+              {aspectRatio === "9:16" && (
+                <div className="absolute inset-x-[16%] top-[12%] bottom-[20%] border-2 border-dashed border-amber-400/60 rounded-md flex flex-col justify-between p-2 text-[10px] text-amber-300 font-mono">
+                  <span className="opacity-80">Top Header Safe</span>
+                  <span className="opacity-80 text-right">Action Sidebar</span>
+                  <span className="opacity-80">Bottom Caption Safe</span>
+                </div>
+              )}
+              {aspectRatio === "4:5" && (
+                <div className="absolute inset-x-[5%] inset-y-[10%] border-2 border-dashed border-amber-400/60 rounded-md flex items-end p-2 text-[10px] text-amber-300 font-mono">
+                  <span className="opacity-80">4:5 Feed Safe Area</span>
+                </div>
+              )}
+              {aspectRatio === "1:1" && (
+                <div className="absolute inset-[10%] border-2 border-dashed border-amber-400/60 rounded-md flex items-end p-2 text-[10px] text-amber-300 font-mono">
+                  <span className="opacity-80">1:1 Square Safe Area</span>
+                </div>
+              )}
+              {aspectRatio === "16:9" && (
+                <>
+                  <div className="absolute inset-[5%] border border-dashed border-amber-400/60 rounded flex items-start p-1.5 text-[9px] text-amber-300 font-mono">
+                    <span className="opacity-80">Action Safe (90%)</span>
+                  </div>
+                  <div className="absolute inset-[10%] border border-dashed border-cyan-400/60 rounded flex items-end p-1.5 text-[9px] text-cyan-300 font-mono">
+                    <span className="opacity-80">Title Safe (80%)</span>
+                  </div>
+                </>
+              )}
+            </div>
+          )}
```

#### Shortcuts `N`, `F`, `+`/`-`, `Cmd/Ctrl+C` + `Cmd/Ctrl+V` in `EditorLayout.tsx`:
```diff
--- a/app/components/editor/EditorLayout.tsx
+++ b/app/components/editor/EditorLayout.tsx
@@ -45,4 +45,5 @@ import {
   removeClip,
   splitClip,
+  pasteClips,
 } from "@/app/lib/editor/operations";
@@ -75,4 +76,5 @@ export default function EditorLayout({
   const [shortcutsOpen, setShortcutsOpen] = useState(false);
+  const clipboardRef = useRef<{ project: EditorProject; ids: string[] } | null>(null);
@@ -174,3 +176,33 @@ export default function EditorLayout({
       }
+      // Copy Clips (Cmd/Ctrl + C)
+      else if (modifier && key === "c" && selection.length) {
+        event.preventDefault();
+        clipboardRef.current = { project: curProject, ids: [...selection] };
+        notify(`Copied ${selection.length} clip(s).`);
+      }
+      // Paste Clips (Cmd/Ctrl + V)
+      else if (modifier && key === "v" && clipboardRef.current?.ids.length) {
+        event.preventDefault();
+        try {
+          run((p) => pasteClips(p, clipboardRef.current!.project, clipboardRef.current!.ids, time));
+          notify(`Pasted ${clipboardRef.current.ids.length} clip(s).`);
+        } catch (err) {
+          notify(err instanceof Error ? err.message : "Paste failed.");
+        }
+      }
+      // Toggle Snapping (N)
+      else if (key === "n" && !modifier) {
+        event.preventDefault();
+        window.dispatchEvent(new CustomEvent("veelox:toggle-snapping"));
+      }
+      // Fit Timeline (F)
+      else if (key === "f" && !modifier) {
+        event.preventDefault();
+        window.dispatchEvent(new CustomEvent("veelox:fit-timeline"));
+      }
+      // Zoom In (+) / Zoom Out (-)
+      else if ((event.key === "+" || event.key === "=") && !modifier) {
+        event.preventDefault();
+        window.dispatchEvent(new CustomEvent("veelox:timeline-zoom", { detail: "in" }));
+      } else if (event.key === "-" && !modifier) {
+        event.preventDefault();
+        window.dispatchEvent(new CustomEvent("veelox:timeline-zoom", { detail: "out" }));
+      }
```

---

### Item 4: Mobile UI Polish Diff Proposals

#### `MobileCanvasStage.tsx` / `MobileEditorLayout.tsx` Duration === 0 Loop Guard:
```diff
--- a/app/components/editor/mobile/MobileCanvasStage.tsx
+++ b/app/components/editor/mobile/MobileCanvasStage.tsx
@@ -182,3 +182,7 @@ export default function MobileCanvasStage({
         if (state.playing && ready) {
-          playback.set(next, true);
+          if (curDuration <= 0) {
+            playback.set(0, false);
+          } else {
+            playback.set(next, true);
+          }
         } else if (!ready) {
@@ -207,2 +211,3 @@ export default function MobileCanvasStage({
       const state = playback.getSnapshot();
+      if (projectDuration(store.getSnapshot()) <= 0) return;
       if (state.playing) {
--- a/app/components/editor/mobile/MobileEditorLayout.tsx
+++ b/app/components/editor/mobile/MobileEditorLayout.tsx
@@ -62,2 +62,3 @@ export default function MobileEditorLayout() {
     const curDuration = projectDuration(store.getSnapshot());
+    if (curDuration <= 0) return;
     if (!state.playing && curDuration > 0 && state.time >= curDuration) {
```

#### `MobileTimeline.tsx` Hidden Tracks Bar & Trim Handles:
```diff
--- a/app/components/editor/mobile/MobileTimeline.tsx
+++ b/app/components/editor/mobile/MobileTimeline.tsx
@@ -4,3 +4,4 @@ import React, {
   useRef,
   useState,
   useCallback,
+  useMemo,
 } from "react";
+import { EyeOff } from "lucide-react";
+import { changeTrack } from "@/app/lib/editor/operations";
@@ -134,3 +135,5 @@ export default function MobileTimeline() {
+  const hiddenTracks = useMemo(() => {
+    return project.trackOrder.map((id) => project.tracks[id]).filter((t) => t?.hidden);
+  }, [project.trackOrder, project.tracks]);
@@ -310,2 +313,22 @@ export default function MobileTimeline() {
       {/* Ruler & Track Stack */}
+      {hiddenTracks.length > 0 && (
+        <div className="flex items-center justify-between px-3 py-1 bg-amber-50 border-b border-amber-200 text-[10px] text-amber-800 shrink-0">
+          <div className="flex items-center gap-1.5 font-medium">
+            <EyeOff size={11} className="text-amber-600" />
+            <span>{hiddenTracks.length} hidden {hiddenTracks.length === 1 ? "track" : "tracks"}</span>
+          </div>
+          <div className="flex items-center gap-1.5">
+            {hiddenTracks.map((t) => (
+              <button
+                key={t.id}
+                type="button"
+                onClick={() => run((p) => changeTrack(p, t.id, { hidden: false }))}
+                className="bg-white border border-amber-300 rounded px-1.5 py-0.5 text-amber-900 font-semibold shadow-2xs hover:bg-amber-100"
+              >
+                Unhide {t.name}
+              </button>
+            ))}
+          </div>
+        </div>
+      )}
```

---

## 5. Verification Method

To verify these changes upon implementation:

1. **TypeScript Typecheck**:
   ```bash
   npx tsc --noEmit
   ```
   Must pass with 0 errors.

2. **ESLint**:
   ```bash
   npm run lint
   ```
   Must report 0 errors across all affected files.

3. **Core Test Suites**:
   ```bash
   npm run test:chat-routing
   npm run test:e2e
   node --test scripts/test-creator-presets.mjs
   node --test scripts/test-hinglish-and-fallback.mjs
   node --test scripts/test-visual-masks-rgb.mjs
   ```
   Must pass 100% of test cases.

4. **Interactive Component Verification Checklist**:
   - **Inspector**: Select a video clip -> verify Transform (X, Y, Scale, Rotation, Opacity), Timing (Start, Dur, Speed, Fades), Visual Effects (sliders and animations), and Audio controls update correctly and reflect immediately in canvas.
   - **Transitions**: Shift-select 2 adjacent visual clips -> click Dissolve/Fade/Slide/Zoom -> verify transition marker appears in timeline and transitions property renders in project state.
   - **B-Roll & DND**: Drag an asset card into timeline -> asset places at drop time. Search B-roll -> verify footage inserts into overlay track.
   - **Hinglish Revert**: Toggle Hinglish on -> preset switches to Viral Hinglish Pop; toggle off -> reverts cleanly to previous preset.
   - **Canvas Loop**: Toggle loop button -> confirm preview playback continues without media reloading/stutter.
   - **Mobile Polish**: Open empty project -> confirm play button does not run infinite loop. Hide a track -> confirm "Hidden Tracks" pill appears and unhiding works smoothly. Selected overlay/audio/caption clips show trim handles on mobile.
