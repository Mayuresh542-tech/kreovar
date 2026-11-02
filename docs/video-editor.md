# VeeloX manual editor

The existing App Router `/editor` and `/editor/[id]` routes and studio editor entry point use the same workspace. Inter typography, blue brand accent, slate surfaces, and existing Supabase auth/project services are retained. Dashboard, AI providers, credits, and database schema are unchanged.

## Document and editing boundary

`app/lib/editor/model.ts` defines a versioned normalized document: tracks refer to clip IDs, clips refer to immutable assets or text/caption content, and transitions link adjacent clips. Seconds are the timeline unit; source offsets are source seconds and playback speed maps the two. Position is relative to the project dimensions and text size is in project pixels.

`operations.ts` exposes addClip, removeClip, moveClip, trimClip, splitClip, addText, addCaption, addTransition and changeClipProperty. UI commands and future AI edit decision lists use these same operations. Documents contain no Blobs, DOM elements, selections, playback, or panel state. History stores bounded structurally shared document snapshots; gestures preview in a transaction and commit once.

The bridge migrates both existing timeline representations. The normalized document is persisted under `timeline.editorModel` and mirrored to the legacy tracks for existing project consumers. Existing asset arrays and project metadata stay with the project service. No migration is required.

## Browser processing

HTML5 video/image decoders feed a Canvas compositor. Web Audio mixes each timed clip with source offsets, speed, volume, and fades. A separate playback store and requestAnimationFrame clock avoid frame-rate React updates to media panels and timeline clips. IndexedDB holds originals and recovery documents, scoped by account/project; object URLs are session-only and revoked at disposal. Waveform analysis uses a worker after native audio decoding. Missing local originals can be relinked.

Initial browser export uses the same compositor, canvas.captureStream, a Web Audio stream destination, and a supported MediaRecorder format. It runs in real time with cancellation, progress, and codec detection. WebM is the portable initial output; MP4 is offered only when the browser recorder supports it. WebCodecs alone would also need a demuxer and muxer; ffmpeg.wasm would add a large download and memory/cross-origin isolation requirements. Neither is required for this engine. A renderer interface allows a future worker/WebCodecs or persistent server job adapter without a second project model.

Originals are cached on this device. Signed-in projects automatically back up imported originals to the private editor-media bucket (50 MB/file, 500 MB/project preflight limit). Once media sync completes, another device restores originals through an owner-checked signed URL and caches them locally. Failed sync keeps device recovery and exposes a retry message. Guest originals and files exceeding the cloud limit stay on the device. Existing remote assets require CORS permission for canvas rendering/audio and export. Failures must identify the asset, never silently omit it. AI Media generates editable images through the server-side Gemini provider. Manual captions and SRT import/export require no AI service; selected audio/video clips can use the existing ElevenLabs transcription route.

## Gemini AI Edit

The existing AI Edit entry opens a prompt and review dialog. `/api/editor/ai-edit` verifies the Supabase bearer session and uses the existing server-side Gemini credential resolver (`GEMINI_API_KEY` or encrypted Admin provider credentials), configured model/fallbacks and usage telemetry. No new dependencies or database migration are required.

Only bounded timeline metadata and text are sent to Gemini; media URLs, IndexedDB keys, thumbnails and original bytes are excluded. Supported decisions reuse the manual editing operations, with aspect-ratio changes on the same document. Runtime validation and an atomic dry run reject invalid IDs, timings, locked tracks and unsupported properties. Apply checks the original snapshot and revision, commits once to existing history, and triggers normal autosave. Undo restores the whole prior edit. Generating a plan does not modify the project. Closing the dialog cancels the request.

AI Edit supports instruction-based timeline editing rather than raw footage understanding, silence detection or best-moment selection. Automatic transcription is a separate Captions-panel action; it maps source words through trim/speed/start and rejects results if the clip changed. Requests are limited to 256 KB, 300 clips/assets and 100 decisions, with an 80-second provider budget. A per-process per-user guard allows six plans per minute and one in flight; a multi-instance deployment can later replace this with a distributed limiter.

## B-roll downloads

Gallery cards/previews, studio B-roll and uploaded clip cards, and editor remote video assets use a shared Download action. It fetches the actual file through `/api/broll/download`, checks the session, and provides loading, retryable errors and completion feedback. MIME type determines the extension, filenames are sanitized (with Unicode attachment headers), and temporary browser URLs are released after download handoff.

The server streams at most 100 MB, checks file type, empty/truncated files and timeouts, and validates every redirect. Only HTTPS `videos.pexels.com` and the configured Supabase public `videos` bucket are accepted; this endpoint is not a generic URL proxy. Files from other hosts show an explicit unsupported-link error.

## Verification

Run `node scripts/test-editor-features.mjs` for download integrity/type/naming, client download cleanup, authentication, Gemini cancellation, malformed AI output, locked tracks, stale revisions, atomic application and Undo/Redo regression coverage. Run `npx tsc --noEmit --incremental false`, `npm run lint`, and `npm run build` for the complete project checks.

The integration follows the existing REST `generateContent` service and JSON response mode documented by [Google](https://ai.google.dev/api/generate-content); model selection and provider credentials remain server-side.

## Workspace repair and connected tools

Panels now have bounded responsive layout and synchronized timeline scrolling. Text/captions no longer wait for media elements. Clipboard paste is atomic and persists across selection changes. Relinking reloads media sources; canvas fonts load before export. Recorded WebM is finalized with duration metadata for re-import, and export has cancellation and a buffering deadline. New editor projects use UUIDs for the existing cloud saver. Local media remains account/project-scoped, with private cloud backup for supported signed-in originals.

AI Media uses `/api/editor/generate-image` with the existing Gemini key resolver and optional `GEMINI_IMAGE_MODEL` (default `gemini-2.5-flash-image`). An image-capable key with available provider quota is required. Account credits do not override provider quota. Stock search/import uses the existing B-roll API and authenticated download proxy. Captions use `/api/transcribe` with `ELEVENLABS_API_KEY`, strict bearer authentication and a 100 MB file limit; source URLs share the download allowlist.

The expanded regression suite covers 24 cases. See `docs/editor-fix-report.md` for browser/provider evidence and remaining external quota/testing limitations.
