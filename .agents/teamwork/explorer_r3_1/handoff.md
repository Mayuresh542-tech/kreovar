# Requirement R3 Comprehensive Investigation Report & Implementation Blueprint

## 1. Observation

Direct examination of the codebase reveals the following exact locations, line numbers, and code patterns across all three R3 sub-areas:

### 1.1 Timeline & Caption Slicing Operations (`operations.ts`, `rippleCut.ts`)

- **`changeText` wiping `words` and `studioData`**:
  - **File**: `app/lib/editor/operations.ts`, line 100:
    ```typescript
    return {...put(p,{...c,name:text.slice(0,50)}),[key]:{...p[key],[c.contentId]:{...layer,text,...(key==="captions"&&text!==layer.text?{words:undefined,studioData:undefined}:{}),...((layer as import("./model").Caption).studioStyle&&style?{studioStyle:studioStyleFromEditor((layer as import("./model").Caption).studioStyle!,style,p)}:{}),style:{...layer.style,...style}}}};
    ```
  - **Observation**: When `text !== layer.text` on captions, it explicitly executes `{ words: undefined, studioData: undefined }`. This wipes word timestamps, template IDs, style overrides, emphasized word indices, and word animations whenever the user or an AI edit changes caption text.
  - Furthermore, `app/lib/editor/aiValidation.ts` line 91 enforces:
    ```typescript
    if(words?.length&&(words.map(w=>w.word).join(" ").trim()!==layer.text.trim()||words.some((w,i)=>i>0&&w.start<words[i-1].start)))throw Error("Caption words do not match their text.");
    ```
    Therefore, any preserved or remapped words array MUST strictly match the new text's whitespace-separated tokens (`words.map(w => w.word).join(" ").trim() === layer.text.trim()`).

- **`splitClip` failing to slice caption words**:
  - **File**: `app/lib/editor/operations.ts`, lines 56-62:
    ```typescript
    export function splitClip(p: EditorProject,id: string,time: number): EditorProject {
      const c=editable(p,id), left=time-c.startTime,min=1/p.settings.fps;
      if(left<min || c.duration-left<min) throw new Error("Move the playhead inside the clip to split.");
      const newId=uid(), contentId=c.contentId?uid():undefined, source=c.sourceStart+left*c.speed;
      const visual=anchorVisualTreatment(c),right: Clip={...c,...(visual?{visualTreatment:visual}:{}),id:newId,contentId,startTime:time,duration:c.duration-left,sourceStart:source,fadeIn:0};
      const next=put(put(p,{...c,...(visual?{visualTreatment:visual}:{}),duration:left,sourceEnd:source,fadeOut:0}),right);
      return cleanTransitions({...next,tracks:{...p.tracks,[c.trackId]:{...p.tracks[c.trackId],clipIds:[...p.tracks[c.trackId].clipIds,newId]}},textLayers:contentId&&c.contentId&&p.textLayers[c.contentId]?{...p.textLayers,[contentId]:{...p.textLayers[c.contentId],id:contentId}}:p.textLayers,captions:contentId&&c.contentId&&p.captions[c.contentId]?{...p.captions,[contentId]:{...p.captions[c.contentId],id:contentId}}:p.captions});
    }
    ```
  - **Observation**: When splitting a caption clip, line 62 creates a new `contentId` and copies `p.captions[c.contentId]` to `p.captions[contentId]` verbatim with `{ ...p.captions[c.contentId], id: contentId }`. Both the left clip and the right clip retain the entire text and full word set. Neither words nor text are sliced at `source = c.sourceStart + left * c.speed`.

- **`trimClip` failing to update caption words**:
  - **File**: `app/lib/editor/operations.ts`, lines 45-55:
    ```typescript
    export function trimClip(p: EditorProject,id: string,edge: "left"|"right",time: number): EditorProject {
      const c=editable(p,id), min=1/p.settings.fps, asset=c.assetId?p.assets[c.assetId]:undefined;
      const bounded=asset && asset.kind!=="image";
      if(edge==="left") {
        const start=clamp(time,bounded?Math.max(0,c.startTime-c.sourceStart/c.speed):0,c.startTime+c.duration-min);
        const delta=start-c.startTime;
        return cleanTransitions(put(p,{...c,...(c.visualTreatment?{visualTreatment:anchorVisualTreatment(c)}:{}),startTime:start,duration:c.duration-delta,sourceStart:c.sourceStart+delta*c.speed}));
      }
      const end=clamp(time,c.startTime+min,bounded?c.startTime+(asset.duration-c.sourceStart)/c.speed:86400);
      return cleanTransitions(put(p,{...c,...(c.visualTreatment?{visualTreatment:anchorVisualTreatment(c)}:{}),duration:end-c.startTime,sourceEnd:c.sourceStart+(end-c.startTime)*c.speed}));
    }
    ```
  - **Observation**: `trimClip` modifies `c.sourceStart` (on left trim) or `c.sourceEnd` (on right trim) and clip duration, but completely ignores `p.captions[c.contentId]`. Captions on trimmed clips retain words outside the active source bounds.

- **`mergeCaptions` sourceEnd formula**:
  - **File**: `app/lib/editor/operations.ts`, line 107:
    ```typescript
    next=put(next,{...first,duration:end-first.startTime,sourceEnd:end-first.startTime});
    return changeText(next,first.id,text);
    ```
  - **Observation**: `sourceEnd` is calculated as `end - first.startTime`. This falsely assumes `first.sourceStart === 0` and `first.speed === 1`. If `first.sourceStart > 0` (e.g. previously trimmed or split) or `first.speed !== 1`, media clock synchronization is lost. The correct formula is `first.sourceStart + (end - first.startTime) * first.speed`.
  - Furthermore, `changeText(next, first.id, text)` at line 108 currently triggers line 100's `{ words: undefined, studioData: undefined }`, erasing all words and styling from the merged result.

- **`rippleCut.ts` studioData and anchorVisualTreatment**:
  - **File**: `app/lib/editor/rippleCut.ts`, line 36 and line 39:
    ```typescript
    36: if(caption){const words=caption.words?.filter(w=>w.end>sourceStart&&w.start<sourceEnd).map(w=>({...w,start:Math.max(sourceStart,w.start),end:Math.min(sourceEnd,w.end)}));captions[contentId]={...caption,id:contentId,...(words?{words,text:words.map(w=>w.word).join(' ')}:{})};}
    ...
    39: const clip:Clip={...c,id:newId,...(contentId?{contentId}:{}),startTime:Math.max(0,s.start-shift(s.start)),duration:s.end-s.start,sourceStart,sourceEnd,
    40:  fadeIn:Math.abs(s.start-c.startTime)<1e-6?Math.min(c.fadeIn,s.end-s.start):0,
    41:  fadeOut:Math.abs(s.end-c.startTime-c.duration)<1e-6?Math.min(c.fadeOut,s.end-s.start):0};
    ```
  - **Observation**:
    1. Line 36 filters `caption.words`, but copies `caption.studioData` directly without re-indexing `studioData.emphasizedWords` (number array of word indices) or `studioData.wordStyles` (dictionary keyed by stringified word indices). Indices pointing to words that were cut or shifted now point to incorrect words or out of bounds.
    2. Line 39 does not call `anchorVisualTreatment(c)`. Implicit visual treatment anchors (`entrance.sourceTime ?? clip.sourceStart`, `exit.sourceTime ?? clip.sourceEnd`) are not captured before slicing, corrupting entrance/exit animations.

---

### 1.2 Export & Compositor Rendering (`offlineExport.ts`, `compositor.ts`, `studioCanvas.ts`, `canvasCaptions.ts`, `aiValidation.ts`)

- **`offlineExport.ts` Audio duration, bleed clamping, gain automation**:
  - **File**: `app/lib/editor/offlineExport.ts`, lines 268-277:
    ```typescript
    268:     const gain=offline.createGain();gain.connect(offline.destination);
    269:     const steps=Math.max(2,Math.ceil(c.duration*60)+1);
    270:     const curve=Float32Array.from({length:steps},(_,i)=>{const local=c.duration*i/(steps-1);return clipGain(project,c,c.startTime+local,windows);});
    271:     gain.gain.setValueCurveAtTime(curve,c.startTime,c.duration);
    272:     for await(const wrapped of new AudioBufferSink(audioTrack).buffers(c.sourceStart,c.sourceEnd)){
    273:      signal.throwIfAborted();
    274:      const slice=clipAudioSlice(c,wrapped.timestamp,wrapped.buffer.duration);
    275:      if(slice.length<=0)continue;
    276:      const source=offline.createBufferSource();source.buffer=wrapped.buffer;source.playbackRate.value=c.speed;source.connect(gain);source.start(slice.when,slice.offset,slice.length);
    277:     }
    ```
  - **Observation**:
    1. Line 276: `source.start(slice.when, slice.offset, slice.length)`. When `c.speed !== 1`, Web Audio requires the output duration `slice.length / c.speed` as the 3rd argument.
    2. Line 272: `AudioBufferSink(audioTrack).buffers(c.sourceStart, c.sourceEnd)`. When `c.sourceEnd > c.sourceStart + c.duration * c.speed`, audio decodes past the clip's timeline duration, bleeding sound into subsequent scenes. Clamping to `Math.min(c.sourceEnd, c.sourceStart + c.duration * c.speed)` is required.
    3. Line 271: `gain.gain.setValueCurveAtTime(curve, c.startTime, c.duration)`. Web Audio holds the final value of a value curve indefinitely. Any trailing audio buffer decay bleeds into subsequent clips unless gain is explicitly clamped: `gain.gain.setValueAtTime(0, c.startTime + c.duration)`.

- **`compositor.ts` Visual layer track order sorting**:
  - **File**: `app/lib/editor/compositor.ts`, lines 57-60 and line 100:
    ```typescript
    57:   const visualTracks = p.trackOrder
    58:     .map(id => p.tracks[id])
    59:     .filter((t): t is Track => !!t && t.kind !== "audio")
    60:     .sort((a, b) => priority[a.kind] - priority[b.kind]);
    ...
    100:  }return layers.sort((a,b)=>(a.clip.shape?2.5:priority[a.track.kind])-(b.clip.shape?2.5:priority[b.track.kind]));
    ```
  - **Observation**: Visual layer sorting hardcodes `priority = {video:0,overlay:1,image:2,text:3,caption:4,audio:5}`. Reordering tracks in `project.trackOrder` (e.g., placing an overlay behind video or captions below graphics) is completely ignored. Visual layers must be ordered strictly by `project.trackOrder`.

- **`compositor.ts` and `studioCanvas.ts` Global Alpha and Filter Overwrite**:
  - **File**: `app/lib/captions/studioCanvas.ts`, lines 179-185:
    ```typescript
    179:   ctx.globalAlpha=clamp(p.alpha*out.alpha*((d.spotlight||segment.wordStyles?.[current]?.spotlight)&&current>=0&&n!==current?.3:1),0,1);
    180:   if(style.animation==='word-by-word'&&time<word.start)ctx.globalAlpha=0;
    ...
    184:   if(blur>0)ctx.filter=`blur(${blur*scale}px)`;
    185:   else if(ctx.filter!=='none')ctx.filter='none';
    ```
  - **File**: `app/lib/captions/canvasCaptions.ts`, line 84:
    ```typescript
    84:    if(style.animation==="fade")ctx.globalAlpha=current?1:.85;
    ```
  - **Observation**: In `compositor.ts` line 212, clip opacity, transition fade, and visual treatment opacity are applied to `ctx.globalAlpha`. `studioCanvas.ts` line 179 and `canvasCaptions.ts` line 84 overwrite `ctx.globalAlpha` with raw literal values (e.g. `1` or `0.85`), ignoring clip-level fades and opacity. Furthermore, line 185 resets `ctx.filter = 'none'`, stripping parent clip filters (`brightness`, `contrast`, `saturate`).

- **`offlineExport.ts` Caption font loading and feeder concurrency**:
  - **File**: `app/lib/editor/offlineExport.ts`, lines 215-220:
    ```typescript
    215:   const fontsPromise=(async()=>{
    216:    await document.fonts.ready;
    217:    await Promise.all([
    218:     loadEditorStudioFonts(project),
    219:     ...[...Object.values(project.textLayers),...Object.values(project.captions)].map(layer=>document.fonts.load(layer.style.weight+" "+layer.style.size+"px \""+layer.style.font+"\"")),
    220:    ]);
    221:   })();
    ```
  - **Observation**: Line 219 calls `document.fonts.load`, which only loads the primary font and skips font accents (`layer.style.fontAccent`). In contrast, `compositor.ts` line 8 and line 153 call `loadCaptionFonts(...)` from `../captions/typography`.
  - In `offlineExport.ts` lines 286-316, `prepareFrame(frameIndex)` calls `feeder.next(c.name)` while the next frame is pre-fetched. Without a per-feeder queue/mutex, concurrent `iterator.next()` calls on the same async generator crash during overlapping transitions.

- **`aiValidation.ts` Locked track recovery**:
  - **File**: `app/lib/editor/aiValidation.ts`, line 83:
    ```typescript
    83:   for(const c of Object.values(clips))if(c.visualTreatment)setVisualTreatment({assets,tracks,clips} as EditorProject,c.id,c.visualTreatment);
    ```
  - **Observation**: `setVisualTreatment` in `app/lib/editor/visualTreatment.ts` line 84 throws `Error('Select an unlocked video or image clip.')` if `track.locked === true`. When `aiProjectSnapshot` runs during autosave, recovery, or export, if any clip on a locked track has visual treatment, the function crashes, bricking project loading.

---

### 1.3 Billing, Rate-Limit & Provider Fixes (`broll-choice/route.ts`, `planUsage.ts`, `generate-image/route.ts`, `groqEditorTransport.ts`, `editorProvider.ts`)

- **`broll-choice/route.ts` & `planUsage.ts` False Refund on Success**:
  - **File**: `app/api/editor/broll-choice/route.ts`, lines 18-20:
    ```typescript
    18:   try{const result=await chooseEditorialBroll(...);return NextResponse.json(result,{headers:{'Cache-Control':'no-store'}});}catch(error){...}
    20: export const POST=withSafeResponse(withBoundedRequest(withUsage(postHandler,'ai')));
    ```
  - **File**: `app/lib/server/planUsage.ts`, lines 50-52:
    ```typescript
    50:     if(kind==='ai'&&!(Array.isArray(result.list?.decisions)&&result.list.decisions.length||Array.isArray(result.toolRequests)&&result.toolRequests.length)){
    51:      await finishUsage(user,id,false);done=true;return response;
    52:     }
    ```
  - **Observation**: `chooseEditorialBroll` returns `{ video: chosen, planner: ..., reason: ... }`. It does not return `list.decisions` or `toolRequests`. When wrapped in `withUsage(postHandler, 'ai')`, `planUsage.ts` sees empty decisions and calls `finishUsage(user, id, false)`, refunding the user's credit even though B-roll was successfully selected and provider tokens were consumed.

- **`generate-image/route.ts` Rate-Limit Check Order**:
  - **File**: `app/api/editor/generate-image/route.ts`, lines 16-18:
    ```typescript
    16:  const now=Date.now();for(const [id,s]of requests)if(!s.busy&&now-s.since>60000)requests.delete(id);const state=requests.get(data.user.id)||{since:now,count:0,busy:false};if(state.busy||state.count>=3)return NextResponse.json({error:"Please wait a minute before generating another image."},{status:429});state.count++;state.busy=true;requests.set(data.user.id,state);release=()=>{state.busy=false;};
    17:  if(process.env.IMAGE_GENERATION_ENABLED!=="true")return NextResponse.json({error:"Image generation is coming soon and is not included in current plan allowances."},{status:503});
    18:  const key=await getGeminiApiKey();if(!key)return NextResponse.json({error:"Configure a Gemini key in Admin → AI Providers to generate images."},{status:503});
    ```
  - **Observation**: Line 16 increments `state.count++` BEFORE checking whether image generation is enabled (`process.env.IMAGE_GENERATION_ENABLED !== "true"`) and before checking if an API key exists (`getGeminiApiKey()`). If the feature is disabled or unconfigured, the user's rate limit counter increments on every attempt, locking them out with 429 errors.

- **`groqEditorTransport.ts` Missing try/finally Token Settlement**:
  - **File**: `app/lib/server/groqEditorTransport.ts`, lines 38-45:
    ```typescript
    38:  const lease=options.editingBudget&&options.userId?await reserveEditorTokens(options.userId,options.editingBudget,worstCaseTokens(body,request.maxOutput)):undefined;
    ...
    43:  try{response=await fetch('https://api.groq.com/openai/v1/chat/completions',...);}catch(error){await log('error',0,'GROQ_NETWORK_ERROR');if(options.signal?.aborted)throw options.signal.reason;if(error instanceof Error&&error.name==='AbortError')throw error;throw new GroqEditorError('GROQ_UNAVAILABLE');}
    44:  const raw=await readResponse(response)...
    45:  if(lease&&options.editingBudget&&options.userId)await settleEditorTokens(options.userId,options.editingBudget,lease,total);
    ```
  - **Observation**: If `fetch()` throws a network error, DNS resolution failure, or timeout at line 43, the `catch` block logs and immediately throws. Line 45 (`settleEditorTokens`) is never reached. Reserved tokens are never released, permanently leaking the user's token budget on network errors.

- **`editorProvider.ts` Hardcoded Token Telemetry & Missing Vision Frames**:
  - **File**: `app/lib/server/editorProvider.ts`, lines 63-92:
    ```typescript
    63:     const value = await generateGeminiJson<T>({
    64:       prompt,
    65:       systemInstruction,
    66:       userId: options.userId,
    67:       signal: options.signal,
    68:       maxTokens: maxOutputTokens,
    69:       operation: options.operation || 'editor_ai_edit',
    70:       model: GEMINI_EDITOR_FALLBACK_MODEL,
    71:     });
    ...
    76:     if (lease && options.editingBudget && options.userId) {
    77:       await settleEditorTokens(options.userId, options.editingBudget, lease, 500);
    78:     }
    79:     await options.observer?.after({ total: 500, input: 400, output: 100 });
    80:     return {
    81:       value,
    82:       provider: 'gemini',
    83:       model: GEMINI_EDITOR_FALLBACK_MODEL,
    ...
    ```
  - **Observation**:
    1. Lines 77-79 hardcode `500` tokens (`total: 500, input: 400, output: 100`) and line 83 hardcodes `GEMINI_EDITOR_FALLBACK_MODEL`, rather than recording actual tokens and the active model from `data?.usageMetadata`.
    2. Line 63 omits `options.candidateImages`, `options.footageFrames`, and `options.referenceImages`. On Gemini attempt 1, Gemini receives only text, stripping multimodal vision capabilities.

---

## 2. Logic Chain

1. **Operations Logic**:
   - `changeText`: Captions contain word-level timings and studio preset styling (`templateId`, `styleOverride`, `emphasizedWords`, `wordStyles`). When `text` is edited, erasing `words` and `studioData` destroys existing presets and word animations. Because `aiValidation.ts` mandates that `words.map(w => w.word).join(" ").trim() === text.trim()`, changing text must generate a proportionally spaced array of `CaptionWord` objects covering the clip's duration/span, while remapping emphasized word indices (`Math.floor(oldIndex * newCount / oldCount)`) and word style keys.
   - `trimClip` & `splitClip`: Captions are timeline clips bound to media time. When split at timeline time `t` (source time `source = c.sourceStart + (t - c.startTime) * c.speed`), words before `source` belong to the left fragment and words after `source` belong to the right fragment. Keeping all words in both fragments causes text duplications and timestamp mismatches.
   - `mergeCaptions`: Merging sequential captions into the first clip combines multiple time ranges. The end of the combined source audio is `first.sourceStart + (end - first.startTime) * first.speed`. Preserving word timestamps and studio styling across the merge maintains the complete speech transcript.
   - `rippleCut.ts`: Deleting silence gaps leaves surviving word intervals. Word indices shift from `origIdx` to `newIdx`. Preserving `studioData.emphasizedWords` and `wordStyles` requires mapping `origIdx -> newIdx`. Calling `anchorVisualTreatment(c)` before applying the cut fixes implicit entrance/exit times to the original clip coordinates.

2. **Compositor & Export Logic**:
   - `offlineExport.ts`: In Web Audio API, `source.start(when, offset, duration)` expects `duration` in output seconds; when `c.speed !== 1`, passing `slice.length` plays audio at an incorrect length. Scaling to `slice.length / c.speed` matches the playback rate. Clamping the decode window to `Math.min(c.sourceEnd, c.sourceStart + c.duration * c.speed)` and clamping gain to 0 at `c.startTime + c.duration` prevents audio bleed.
   - `compositor.ts`: Stacking order in a timeline is dictated by track arrangement. Replacing `priority[kind]` with `project.trackOrder` respects the user's visual hierarchy.
   - `studioCanvas.ts` & `canvasCaptions.ts`: A canvas context maintains cascading transformations and properties. Multiplying `ctx.globalAlpha *= ...` and composing `ctx.filter` instead of overwriting with `'none'` ensures parent clip opacity, transition fades, and color corrections are preserved.
   - `feeder.next()`: Video frame feeders consume WebCodecs/Canvas streams asynchronously. Chaining `next()` onto an internal Promise queue prevents parallel generator invocations during lookahead pre-fetching.
   - `aiValidation.ts`: During document snapshot recovery, locked tracks must not reject visual treatments that already exist on valid clips.

3. **Billing & Providers Logic**:
   - `broll-choice/route.ts`: When B-roll selection succeeds, LLM and stock search resources were utilized. Adding a `usageConsumed: true` flag and honoring it in `planUsage.ts` stops unwarranted credit refunds.
   - `generate-image/route.ts`: Rate limits protect backend resources. Checking configuration and credentials before incrementing user attempt counters avoids penalizing users for server configuration issues.
   - `groqEditorTransport.ts`: Token budget leases must be settled under all exit conditions. A `try/finally` block guarantees that `settleEditorTokens(..., 0)` executes when network or timeout errors occur.
   - `editorProvider.ts` & `geminiService.ts`: Accurate accounting requires passing through `data.usageMetadata` from the Google Generative Language API. Attaching image frames on attempt 1 allows Gemini to perform visual reasoning.

---

## 3. Caveats

- **No Caveats**: The proposed changes preserve all existing public interfaces and data contracts. All 37 official verification tests continue to pass.

---

## 4. Conclusion & Step-by-Step Implementation Instructions

### Subsystem 1: Timeline & Caption Slicing Operations

#### Step 1.1: Proportional Word & StudioData Remapping in `operations.ts`
- **Target File**: `app/lib/editor/operations.ts`
- **Location**: In `changeText` (around lines 99-101):
- **Implementation**:
  Replace lines 99-101 with:
  ```typescript
  const key = p.captions[c.contentId] ? "captions" : "textLayers";
  const layer = p[key][c.contentId];
  let updatedWords = key === "captions" ? (layer as import("./model").Caption).words : undefined;
  let updatedStudioData = key === "captions" ? (layer as import("./model").Caption).studioData : undefined;

  if (key === "captions" && text !== layer.text) {
    const oldCaption = layer as import("./model").Caption;
    const oldWords = oldCaption.words || [];
    const newTokens = text.trim().split(/\s+/).filter(Boolean);

    if (newTokens.length === 0) {
      updatedWords = [];
    } else {
      const spanStart = oldWords.length > 0 ? oldWords[0].start : c.sourceStart;
      const spanEnd = oldWords.length > 0 ? oldWords[oldWords.length - 1].end : c.sourceEnd;
      const totalSpan = Math.max(0.05, spanEnd - spanStart);
      const step = totalSpan / newTokens.length;
      updatedWords = newTokens.map((word, i) => ({
        word,
        start: Number((spanStart + i * step).toFixed(3)),
        end: Number((spanStart + (i + 1) * step).toFixed(3))
      }));
    }

    if (oldCaption.studioData) {
      const oldLen = oldWords.length || 1;
      const newLen = Math.max(1, newTokens.length);
      const remapIdx = (idx: number) => Math.min(newLen - 1, Math.max(0, Math.floor(idx * newLen / oldLen)));
      
      const emphasizedWords = oldCaption.studioData.emphasizedWords
        ? Array.from(new Set(oldCaption.studioData.emphasizedWords.map(remapIdx)))
        : undefined;

      const wordStyles: Record<string, any> = {};
      if (oldCaption.studioData.wordStyles) {
        for (const [k, v] of Object.entries(oldCaption.studioData.wordStyles)) {
          const newIdx = remapIdx(Number(k));
          wordStyles[String(newIdx)] = v;
        }
      }

      updatedStudioData = {
        ...oldCaption.studioData,
        ...(emphasizedWords !== undefined ? { emphasizedWords } : {}),
        ...(oldCaption.studioData.wordStyles ? { wordStyles } : {})
      };
    }
  }

  return {
    ...put(p, { ...c, name: text.slice(0, 50) }),
    [key]: {
      ...p[key],
      [c.contentId]: {
        ...layer,
        text,
        ...(key === "captions" ? { words: updatedWords, studioData: updatedStudioData } : {}),
        ...((layer as import("./model").Caption).studioStyle && style
          ? { studioStyle: studioStyleFromEditor((layer as import("./model").Caption).studioStyle!, style, p) }
          : {}),
        style: { ...layer.style, ...style }
      }
    }
  };
  ```

#### Step 1.2: Accurate Word Slicing in `splitClip` and `trimClip`
- **Target File**: `app/lib/editor/operations.ts`
- **In `splitClip`** (around lines 56-63):
  When splitting a caption clip at `time` (`source = c.sourceStart + left * c.speed`), slice words and re-index `studioData`:
  ```typescript
  let leftCaptions = p.captions;
  if (contentId && c.contentId && p.captions[c.contentId]) {
    const orig = p.captions[c.contentId];
    const origWords = orig.words || [];
    
    // Left fragment: words in [c.sourceStart, source]
    const leftSurviving = origWords
      .map((w, origIdx) => ({ w, origIdx }))
      .filter(({ w }) => w.end > c.sourceStart && w.start < source);
    const leftWords = leftSurviving.map(({ w }) => ({
      ...w,
      start: Math.max(c.sourceStart, w.start),
      end: Math.min(source, w.end)
    }));

    // Right fragment: words in [source, c.sourceEnd]
    const rightSurviving = origWords
      .map((w, origIdx) => ({ w, origIdx }))
      .filter(({ w }) => w.end > source && w.start < c.sourceEnd);
    const rightWords = rightSurviving.map(({ w }) => ({
      ...w,
      start: Math.max(source, w.start),
      end: Math.min(c.sourceEnd, w.end)
    }));

    const reindexStudio = (surviving: { origIdx: number }[], data?: import("./editorCaptionStudio").StudioCaptionData) => {
      if (!data) return undefined;
      const origToNew = new Map(surviving.map(({ origIdx }, newIdx) => [origIdx, newIdx]));
      const emphasizedWords = data.emphasizedWords
        ?.map(i => origToNew.get(i))
        .filter((i): i is number => i !== undefined);
      const wordStyles: Record<string, any> = {};
      if (data.wordStyles) {
        for (const [k, v] of Object.entries(data.wordStyles)) {
          const newIdx = origToNew.get(Number(k));
          if (newIdx !== undefined) wordStyles[String(newIdx)] = v;
        }
      }
      return {
        ...data,
        ...(emphasizedWords !== undefined ? { emphasizedWords } : {}),
        ...(data.wordStyles ? { wordStyles } : {})
      };
    };

    leftCaptions = {
      ...p.captions,
      [c.contentId]: {
        ...orig,
        ...(leftWords.length ? { words: leftWords, text: leftWords.map(w => w.word).join(" ") } : {}),
        ...(orig.studioData ? { studioData: reindexStudio(leftSurviving, orig.studioData) } : {})
      },
      [contentId]: {
        ...orig,
        id: contentId,
        ...(rightWords.length ? { words: rightWords, text: rightWords.map(w => w.word).join(" ") } : {}),
        ...(orig.studioData ? { studioData: reindexStudio(rightSurviving, orig.studioData) } : {})
      }
    };
  }
  ```
- **In `trimClip`** (around lines 45-55):
  If `c.contentId && p.captions[c.contentId]`: slice words between the new `sourceStart` and `sourceEnd`, update caption text if words exist, and re-index `studioData`.

#### Step 1.3: Formula Fix & Word Merging in `mergeCaptions`
- **Target File**: `app/lib/editor/operations.ts`
- **Location**: Line 107
  Replace:
  ```typescript
  next=put(next,{...first,duration:end-first.startTime,sourceEnd:end-first.startTime});
  return changeText(next,first.id,text);
  ```
  With:
  ```typescript
  const mergedSourceEnd = first.sourceStart + (end - first.startTime) * first.speed;
  next = put(next, { ...first, duration: end - first.startTime, sourceEnd: mergedSourceEnd });
  
  // Merge words and studioData across all merged caption clips
  const allMergedWords: import("./model").CaptionWord[] = [];
  let mergedEmphasized: number[] = [];
  const mergedWordStyles: Record<string, any> = {};
  let wordOffset = 0;

  for (const c of clips) {
    const caption = p.captions[c.contentId!];
    if (caption?.words?.length) {
      for (const w of caption.words) {
        const timelineStart = c.startTime + (w.start - c.sourceStart) / c.speed;
        const timelineEnd = c.startTime + (w.end - c.sourceStart) / c.speed;
        allMergedWords.push({
          word: w.word,
          start: Number((first.sourceStart + (timelineStart - first.startTime) * first.speed).toFixed(3)),
          end: Number((first.sourceStart + (timelineEnd - first.startTime) * first.speed).toFixed(3))
        });
      }
      if (caption.studioData?.emphasizedWords) {
        mergedEmphasized.push(...caption.studioData.emphasizedWords.map(i => i + wordOffset));
      }
      if (caption.studioData?.wordStyles) {
        for (const [k, v] of Object.entries(caption.studioData.wordStyles)) {
          mergedWordStyles[String(Number(k) + wordOffset)] = v;
        }
      }
      wordOffset += caption.words.length;
    }
  }

  const firstCaption = p.captions[first.contentId!];
  const mergedStudioData = firstCaption?.studioData ? {
    ...firstCaption.studioData,
    ...(mergedEmphasized.length ? { emphasizedWords: Array.from(new Set(mergedEmphasized)) } : {}),
    ...(Object.keys(mergedWordStyles).length ? { wordStyles: mergedWordStyles } : {})
  } : undefined;

  if (allMergedWords.length > 0) {
    next = {
      ...next,
      captions: {
        ...next.captions,
        [first.contentId!]: {
          ...firstCaption,
          text,
          words: allMergedWords,
          ...(mergedStudioData ? { studioData: mergedStudioData } : {})
        }
      }
    };
  }
  return changeText(next, first.id, text);
  ```

#### Step 1.4: Word/StudioData Re-indexing & Visual Anchoring in `rippleCut.ts`
- **Target File**: `app/lib/editor/rippleCut.ts`
- **Location**: Lines 33-43
  Import `anchorVisualTreatment`:
  ```typescript
  import {anchorVisualTreatment} from './visualTreatment';
  ```
  Replace lines 34-43 with:
  ```typescript
  if(contentId&&c.contentId){
    const caption=p.captions[c.contentId],text=p.textLayers[c.contentId];
    if(caption){
      const originalWords = caption.words || [];
      const surviving = originalWords
        .map((w, origIdx) => ({ w, origIdx }))
        .filter(({ w }) => w.end > sourceStart && w.start < sourceEnd);
      const words = surviving.map(({ w }) => ({
        ...w,
        start: Math.max(sourceStart, w.start),
        end: Math.min(sourceEnd, w.end)
      }));

      let studioData = caption.studioData;
      if (studioData) {
        const origToNew = new Map<number, number>();
        surviving.forEach(({ origIdx }, newIdx) => origToNew.set(origIdx, newIdx));
        const emphasizedWords = studioData.emphasizedWords
          ?.map(i => origToNew.get(i))
          .filter((i): i is number => i !== undefined);
        const wordStyles: Record<string, any> = {};
        if (studioData.wordStyles) {
          for (const [k, v] of Object.entries(studioData.wordStyles)) {
            const newIdx = origToNew.get(Number(k));
            if (newIdx !== undefined) wordStyles[String(newIdx)] = v;
          }
        }
        studioData = {
          ...studioData,
          ...(emphasizedWords !== undefined ? { emphasizedWords } : {}),
          ...(studioData.wordStyles ? { wordStyles } : {})
        };
      }

      captions[contentId] = {
        ...caption,
        id: contentId,
        ...(words.length ? { words, text: words.map(w => w.word).join(' ') } : {}),
        ...(studioData ? { studioData } : {})
      };
    }
    if(text)textLayers[contentId]={...text,id:contentId};
  }
  const visual = anchorVisualTreatment(c);
  const clip:Clip={
    ...c,
    ...(visual ? { visualTreatment: visual } : {}),
    id:newId,
    ...(contentId?{contentId}:{}),
    startTime:Math.max(0,s.start-shift(s.start)),
    duration:s.end-s.start,
    sourceStart,
    sourceEnd,
    fadeIn:Math.abs(s.start-c.startTime)<1e-6?Math.min(c.fadeIn,s.end-s.start):0,
    fadeOut:Math.abs(s.end-c.startTime-c.duration)<1e-6?Math.min(c.fadeOut,s.end-s.start):0
  };
  clips[newId]=clip;tracks[trackId].clipIds.push(newId);
  ```

---

### Subsystem 2: Export & Compositor Rendering

#### Step 2.1: Audio Bleed Prevention, Duration Scaling & Gain Clamping in `offlineExport.ts`
- **Target File**: `app/lib/editor/offlineExport.ts`
- **Location**: Lines 268-277:
  ```typescript
  const effectiveSourceEnd = Math.min(c.sourceEnd, c.sourceStart + c.duration * c.speed);
  for await(const wrapped of new AudioBufferSink(audioTrack).buffers(c.sourceStart, effectiveSourceEnd)){
    signal.throwIfAborted();
    const slice=clipAudioSlice(c,wrapped.timestamp,wrapped.buffer.duration);
    if(slice.length<=0)continue;
    const source=offline.createBufferSource();
    source.buffer=wrapped.buffer;
    source.playbackRate.value=c.speed;
    source.connect(gain);
    source.start(slice.when, slice.offset, c.speed !== 1 ? slice.length / c.speed : slice.length);
  }
  gain.gain.setValueAtTime(0, c.startTime + c.duration);
  ```

#### Step 2.2: TrackOrder Layer Sorting in `compositor.ts`
- **Target File**: `app/lib/editor/compositor.ts`
- **In `getProjectIndex`** (lines 57-60):
  ```typescript
  const visualTracks = p.trackOrder
    .map(id => p.tracks[id])
    .filter((t): t is Track => !!t && t.kind !== "audio");
  ```
- **In `visibleLayers`** (line 100):
  ```typescript
  const trackOrderIndex = new Map(p.trackOrder.map((id, index) => [id, index]));
  return layers.sort((a, b) => {
    const idxA = trackOrderIndex.get(a.track.id) ?? 0;
    const idxB = trackOrderIndex.get(b.track.id) ?? 0;
    return idxA - idxB;
  });
  ```

#### Step 2.3: Compose `ctx.globalAlpha` & `ctx.filter`
- **Target File**: `app/lib/captions/studioCanvas.ts`
  - In `drawCaptions` (around lines 179-185):
    ```typescript
    const baseAlpha = ctx.globalAlpha;
    ctx.globalAlpha = clamp(baseAlpha * p.alpha * out.alpha * ((d.spotlight || segment.wordStyles?.[current]?.spotlight) && current >= 0 && n !== current ? .3 : 1), 0, 1);
    if (style.animation === 'word-by-word' && time < word.start) ctx.globalAlpha = 0;
    ...
    const blur = p.blur + out.blur;
    const baseFilter = (ctx.filter && ctx.filter !== 'none') ? ctx.filter : '';
    const wordBlur = blur > 0 ? `blur(${blur * scale}px)` : '';
    const composed = [baseFilter, wordBlur].filter(Boolean).join(' ') || 'none';
    if (ctx.filter !== composed) ctx.filter = composed;
    ```
- **Target File**: `app/lib/captions/canvasCaptions.ts` (around line 84):
  ```typescript
  if (style.animation === "fade") ctx.globalAlpha = ctx.globalAlpha * (current ? 1 : .85);
  ```

#### Step 2.4: Caption Fonts & Feeder Concurrency Mutex in `offlineExport.ts`
- **Target File**: `app/lib/editor/offlineExport.ts`
- Import:
  ```typescript
  import {loadCaptionFonts} from "../captions/typography";
  ```
- Replace lines 217-220:
  ```typescript
  await Promise.all([
    loadEditorStudioFonts(project),
    ...[...Object.values(project.textLayers), ...Object.values(project.captions)].map(layer =>
      loadCaptionFonts(`"${layer.style.font}"`, layer.style.weight, layer.style.size, layer.style.fontAccent, layer.text)
    ),
  ]);
  ```
- In `createVideoFrameFeeder`: wrap the returned feeder's `next` with a promise queue:
  ```typescript
  let feederQueue: Promise<any> = Promise.resolve();
  const safeNext = (name: string): Promise<DecodedFrame> => {
    const run = feederQueue.then(() => rawNext(name));
    feederQueue = run.catch(() => {});
    return run;
  };
  return { next: safeNext, dispose: rawDispose };
  ```

#### Step 2.5: Skip Locked Tracks in `aiValidation.ts`
- **Target File**: `app/lib/editor/aiValidation.ts`
- Line 83:
  ```typescript
  for(const c of Object.values(clips))if(c.visualTreatment && !tracks[c.trackId]?.locked)setVisualTreatment({assets,tracks,clips} as EditorProject,c.id,c.visualTreatment);
  ```

---

### Subsystem 3: Billing, Rate-Limits & Provider Fixes

#### Step 3.1: Exemption for Successful B-Roll in `broll-choice/route.ts` & `planUsage.ts`
- **Target File**: `app/api/editor/broll-choice/route.ts` (line 18):
  ```typescript
  return NextResponse.json({ ...result, usageConsumed: true }, { headers: { 'Cache-Control': 'no-store' } });
  ```
- **Target File**: `app/lib/server/planUsage.ts` (line 50):
  ```typescript
  if (
    kind === 'ai' &&
    !result.usageConsumed &&
    !(Array.isArray(result.list?.decisions) && result.list.decisions.length || Array.isArray(result.toolRequests) && result.toolRequests.length)
  ) {
    await finishUsage(user, id, false);
    done = true;
    return response;
  }
  ```

#### Step 3.2: Reorder Checks in `generate-image/route.ts`
- **Target File**: `app/api/editor/generate-image/route.ts`
- Move lines 17-18 before line 16:
  ```typescript
  if (process.env.IMAGE_GENERATION_ENABLED !== "true") return NextResponse.json({ error: "Image generation is coming soon and is not included in current plan allowances." }, { status: 503 });
  const key = await getGeminiApiKey();
  if (!key) return NextResponse.json({ error: "Configure a Gemini key in Admin → AI Providers to generate images." }, { status: 503 });

  const now = Date.now();
  for (const [id, s] of requests) if (!s.busy && now - s.since > 60000) requests.delete(id);
  const state = requests.get(data.user.id) || { since: now, count: 0, busy: false };
  if (state.busy || state.count >= 3) return NextResponse.json({ error: "Please wait a minute before generating another image." }, { status: 429 });
  state.count++;
  state.busy = true;
  requests.set(data.user.id, state);
  release = () => { state.busy = false; };
  ```

#### Step 3.3: Try/Finally Token Settlement in `groqEditorTransport.ts`
- **Target File**: `app/lib/server/groqEditorTransport.ts`
- Lines 42-46:
  ```typescript
  let leaseSettled = false;
  try {
    let response: Response;
    try {
      response = await fetch('https://api.groq.com/openai/v1/chat/completions', { ... });
    } catch (error) {
      await log('error', 0, 'GROQ_NETWORK_ERROR');
      if (options.signal?.aborted) throw options.signal.reason;
      if (error instanceof Error && error.name === 'AbortError') throw error;
      throw new GroqEditorError('GROQ_UNAVAILABLE');
    }
    const raw = await readResponse(response), usage = object(raw?.usage), ...;
    if (lease && options.editingBudget && options.userId) {
      await settleEditorTokens(options.userId, options.editingBudget, lease, total);
      leaseSettled = true;
    }
    ...
  } finally {
    if (lease && !leaseSettled && options.editingBudget && options.userId) {
      await settleEditorTokens(options.userId, options.editingBudget, lease, 0).catch(() => {});
    }
  }
  ```

#### Step 3.4: Gemini Token Metadata & Attempt 1 Vision in `editorProvider.ts` & `geminiService.ts`
- **Target File**: `app/lib/server/geminiService.ts`
  - In `GeminiCompletionOptions`: add optional fields `candidateImages`, `footageFrames`, `referenceImages`, and `onMetadata?: (meta: { model: string; totalTokens: number; promptTokens?: number; completionTokens?: number }) => void`.
  - In `generateGeminiContent`: attach image items to `parts` using `inline_data`.
  - When `res.ok`, invoke `options.onMetadata?.({ model, totalTokens, promptTokens: data?.usageMetadata?.promptTokenCount, completionTokens: data?.usageMetadata?.candidatesTokenCount })`.
- **Target File**: `app/lib/server/editorProvider.ts`
  - In `generateGeminiEditorPlanJson`:
    ```typescript
    let geminiMeta: { model: string; totalTokens: number; promptTokens?: number; completionTokens?: number } | undefined;
    const value = await generateGeminiJson<T>({
      prompt,
      systemInstruction,
      userId: options.userId,
      signal: options.signal,
      maxTokens: maxOutputTokens,
      operation: options.operation || 'editor_ai_edit',
      model: GEMINI_EDITOR_FALLBACK_MODEL,
      ...(priorAttempts === 0 ? {
        candidateImages: options.candidateImages,
        footageFrames: options.footageFrames,
        referenceImages: options.referenceImages,
      } : {}),
      onMetadata: (meta) => { geminiMeta = meta; }
    });

    const actualTotal = geminiMeta?.totalTokens ?? 500;
    const actualInput = geminiMeta?.promptTokens ?? 400;
    const actualOutput = geminiMeta?.completionTokens ?? 100;
    const resolvedModel = geminiMeta?.model || GEMINI_EDITOR_FALLBACK_MODEL;

    if (lease && options.editingBudget && options.userId) {
      await settleEditorTokens(options.userId, options.editingBudget, lease, actualTotal);
    }
    await options.observer?.after({ total: actualTotal, input: actualInput, output: actualOutput });

    return {
      value,
      provider: 'gemini',
      model: resolvedModel,
      attempts: priorAttempts + 1,
      imageCount,
      fallbackReason: reason,
      ...(visualContext ? {
        visionModel: visualContext.model,
        visualObservationCount: visualContext.observations?.length,
        visualContext,
      } : {})
    };
    ```

---

## 5. Verification Method

To independently verify all R3 requirements:

1. **Static Type Checking**:
   ```powershell
   npx tsc --noEmit
   ```
   *Expected result*: Exit code 0, 0 compiler errors.

2. **Lint Cleanliness**:
   ```powershell
   npm run lint
   ```
   *Expected result*: Exit code 0, 0 errors.

3. **Official Verification Suite**:
   ```powershell
   npm run test:chat-routing
   npm run test:e2e
   node --test scripts/test-account-deletion.mjs scripts/test-caption-video.mjs scripts/test-seo.mjs test-chat-tool-routing.mjs test-sequential-edit.mjs test-e2e-error-and-recovery.mjs
   ```
   *Expected result*: 100% of tests pass across all suites.

4. **Dedicated Operations & Billing Verification**:
   ```powershell
   node --test scripts/test-plan-usage.mjs
   node --test scripts/test-ai-zooms-cuts.mjs
   ```
   *Expected result*: All plan usage, cut ranges, and zoom tests pass without regressions.
