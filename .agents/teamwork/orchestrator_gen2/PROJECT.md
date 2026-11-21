# Project: Kreovar Video Editor Hardening & UI/Export Integration

## Architecture
- **Timeline & State Management**: `app/lib/editor/sequentialEdit.ts`, `app/lib/editor/sequentialEditClient.ts`, `app/lib/editor/inPlaceReconciler.ts`, `app/lib/editor/operations.ts`, `app/lib/editor/rippleCut.ts`, `useConversationalAiChat.ts`. Manages multi-stage AI editing, atomic snapshot rollback, non-destructive validation, and speech transcript alignment.
- **Transcribe & Captions**: `app/api/transcribe/route.ts`, `app/captions/page.tsx`, `app/lib/editor/canvasCaptions.ts`, `app/lib/editor/studioCanvas.ts`. Speech alignment, word-level timestamps, Hinglish normalization, preset styling.
- **Desktop & Mobile Presentation**:
  - Desktop: `app/components/editor/workspace/AssetDrawer.tsx`, `app/components/editor/workspace/TimelinePanel.tsx`, `app/components/editor/workspace/CanvasStage.tsx`, `app/components/editor/workspace/EditorLayout.tsx`. Full Inspector controls, B-roll integration, transitions, safe areas, drag-and-drop, keyboard shortcuts.
  - Mobile: `app/components/editor/workspace/MobileEditorLayout.tsx`, `app/components/editor/workspace/MobileCanvasStage.tsx`, `app/components/editor/workspace/MobileTimeline.tsx`. Hidden track unhide, trim handles, loop guard.
- **Compositor & Offline Export**: `app/lib/editor/offlineExport.ts`, `app/lib/editor/compositor.ts`, `app/lib/editor/studioCanvas.ts`, `app/lib/editor/aiValidation.ts`. Multi-track compositing according to `project.trackOrder`, audio time-stretching & bleed prevention, font pre-loading, feeder concurrency control.
- **Billing, Rate-Limiting & AI Providers**: `app/api/editor/broll-choice/route.ts`, `app/lib/server/planUsage.ts`, `app/api/editor/generate-image/route.ts`, `app/lib/server/groqEditorTransport.ts`, `app/lib/server/editorProvider.ts`. Atomic credit accounting, rate limit ordering, try/finally token settlement, Gemini token metadata & vision frames.

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | TypeScript Signature Alignment | `normalizeHinglishWords` accepts `{ word?: string; start: number; end: number }` base interface | R1 | ORIGINAL_REQUEST |
| 2 | Eliminate In-Place Mutation | Clone snapshot before validation in `sequentialEdit.ts` & `sequentialEditClient.ts` | R1 | ORIGINAL_REQUEST |
| 3 | Preserve Text Clips without Graphic | Retain titles & lower-thirds on `text` track unless flagged hallucination | R1 | ORIGINAL_REQUEST |
| 4 | Multi-Stage Pipeline Expansion | Dynamically expand intermediate stages in `analyzeFootage` right before `validateEdit` | R1 | ORIGINAL_REQUEST |
| 5 | Reconciler RippleCut Invariant | Sort and append `rippleCut` decisions at the very end of reconciled decisions | R1 | ORIGINAL_REQUEST |
| 6 | Atomic Multi-Stage Undo & Lock Race | Record `preTurnRevision`, atomic rollback, lock manual edits during execution, await lock release | R1 | ORIGINAL_REQUEST |
| 7 | Test DOM Alignment | Align `test-sequential-edit.mjs` selectors/testids with `AssetDrawer.tsx` / `EditorLayout.tsx` | R1 | ORIGINAL_REQUEST |
| 8 | ESLint Cleanup | Fix 5 ESLint errors in `scripts/test-account-deletion.mjs`, `scripts/test-caption-video.mjs`, `scripts/test-seo.mjs` | R1 | ORIGINAL_REQUEST |
| 9 | Full Clip & Caption Inspector | Port missing controls (Transform, Timing, Visual FX, Captions, Audio) into `AssetDrawer.tsx` | R2 | ORIGINAL_REQUEST |
| 10 | Real Tool Integrations & Track Caps | Wire B-Roll `/api/editor/broll-choice`, Transitions to `TransitionKind`, DND, Hinglish revert, 30-track cap | R2 | ORIGINAL_REQUEST |
| 11 | Canvas & Keyboard Shortcuts | Loop ref in `CanvasStage`, 2D Euclidean scale/rotate handles, dynamic Safe Area guides, N/F/+/-/Cmd+C/Cmd+V | R2 | ORIGINAL_REQUEST |
| 12 | Mobile UI Polish | Loop disable on duration 0, Hidden Tracks unhide pill, trim handles on overlay/caption/audio | R2 | ORIGINAL_REQUEST |
| 13 | Timeline & Caption Slicing Ops | Preserve/remap `words` in `changeText`, accurate `words[]` slice in `trimClip`/`splitClip`, `mergeCaptions` sourceEnd, re-index `rippleCut.ts` | R3 | ORIGINAL_REQUEST |
| 14 | Export & Compositor Audio/Layer Sync | Output duration in `source.start`, bleed clamping, trackOrder visual layer sorting, alpha/filter composition, `loadCaptionFonts`, feeder mutex | R3 | ORIGINAL_REQUEST |
| 15 | Billing, Rate-Limit & Provider Fixes | No refund on successful B-roll in `withUsage`, rate limit order in `generate-image`, Groq try/finally token settlement, Gemini token usage & vision frames | R3 | ORIGINAL_REQUEST |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| R1 | State Mutations, Pipeline Routing, Undo Stack & TS/Lint | Features 1-8 | none | DONE |
| R1-Gate | R1 Gate Check | `tsc --noEmit`, `npm run lint`, `npm run test:chat-routing`, `npm run test:e2e` | R1 | DONE |
| R2 | Real Editor Controls in Desktop & Mobile UI | Features 9-12 | R1-Gate | DONE |
| R2-Gate | R2 Gate Check | Inspector, B-Roll, DND, Canvas, Mobile UI, build verification | R2 | DONE |
| R3 | Export Audio Sync, Compositor, Billing & AI Vision | Features 13-15 | R2-Gate | DONE |
| R3-Gate | R3 Gate Check | Slicing, Audio sync, TrackOrder, Mutex, Billing, RateLimit | R3 | DONE |
| Final-Verify | Full Acceptance Criteria Sign-Off | All test suites passing, 0 errors, all 12 AC verified | R3-Gate | IN_PROGRESS |

## Code Layout
- `app/api/transcribe/route.ts`: Transcribe API & `normalizeHinglishWords`
- `app/captions/page.tsx`: Captions page Hinglish integration
- `app/lib/editor/sequentialEdit.ts`: Stage expansion, validation, snapshot isolation
- `app/lib/editor/sequentialEditClient.ts`: Execution client, lock handling, rollback
- `app/lib/editor/inPlaceReconciler.ts`: Decision reconciliation & rippleCut ordering
- `app/lib/editor/useConversationalAiChat.ts`: Undo management & lock integration
- `app/components/editor/workspace/AssetDrawer.tsx`: Inspector, B-Roll, transitions, assets
- `app/components/editor/workspace/TimelinePanel.tsx`: Track rows & vertical scroll sync
- `app/components/editor/workspace/CanvasStage.tsx`: Canvas rendering, handles, safe areas
- `app/components/editor/workspace/EditorLayout.tsx`: Keyboard shortcuts & layout
- `app/components/editor/workspace/MobileEditorLayout.tsx`: Mobile layout & playback
- `app/components/editor/workspace/MobileCanvasStage.tsx`: Mobile stage
- `app/components/editor/workspace/MobileTimeline.tsx`: Mobile timeline, hidden tracks, trim handles
- `app/lib/editor/operations.ts`: Timeline operations & 30-track limit
- `app/lib/editor/rippleCut.ts`: Ripple cut, word re-indexing, visual treatment
- `app/lib/editor/offlineExport.ts`: Offline export, audio duration, feeder mutex, fonts
- `app/lib/editor/compositor.ts`: Realtime compositor layer ordering & filtering
- `app/lib/editor/studioCanvas.ts` & `canvasCaptions.ts`: Caption rendering & styles
- `app/lib/editor/aiValidation.ts`: Track cap validation & snapshot recovery
- `app/api/editor/broll-choice/route.ts`: B-roll selection & usage accounting
- `app/lib/server/planUsage.ts`: Usage tracking & refund rules
- `app/api/editor/generate-image/route.ts`: Image generation & rate limit order
- `app/lib/server/groqEditorTransport.ts`: Groq transport & try/finally token settlement
- `app/lib/server/editorProvider.ts`: Model provider, Gemini metadata & vision frames
