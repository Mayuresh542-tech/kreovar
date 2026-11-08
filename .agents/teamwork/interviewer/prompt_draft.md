Implement the Kreovar AI Editor Intelligent Custom Editing System and repair existing preset flows according to the approved design document at docs/superpowers/specs/2026-11-07-intelligent-custom-editing-and-preset-repair-design.md.

Integrity mode: development

Reference material: docs/superpowers/specs/2026-11-07-intelligent-custom-editing-and-preset-repair-design.md

## Requirements

### R1. Intelligent Custom AI Editing System
Implement natural language editing in `applyRequestedEdits` supporting free-form conversational editing instructions, section bounds and temporal ranges (e.g. "first 10s untouched", "after 0:15", "second half"), negative constraints (e.g. "don't change audio", "no SFX", "don't cut footage"), and conversational refinements that modify existing clips and captions (`composeCaption`, `changeClipProperty`, `clearZooms`, `changeText`) without generating duplicate elements. Enable clarification detection for ambiguous or conflicting instructions without crashing the pipeline, preserving question summaries in job history. Support context-aware timeline reasoning using speech transcript timestamps, clips, tracks, captions, sampled frames, and `editingHistory`, utilizing all 28 native timeline operations and tools.

### R2. Preset Flow Repair and Resilience
Audit and repair `PIPELINE_PRESETS` (`engaging`, `clean`, `punchy`). Ensure supporting preset stages (`applyZooms`, `applyBroll`, `applyMotionGraphics`, `applySoundEffects`) tolerate zero-decision completions gracefully without failing the job when project duration is short (<4s), when footage has no speech, or when an explicit skip rationale is documented. Ensure captions in presets apply dynamically and cleanly.

### R3. Model Architecture and Fallback Integration
Configure LLM planning in `editorProvider.ts` to use Groq with Qwen 3.7 27B (`qwen/qwen3.8-27b`) as the primary provider, with automatic fallback to Gemini 3.8 Flash (`gemini-3.8-flash`) via `app/lib/server/geminiService.ts` on Groq rate limits (429), timeouts, or 5xx errors, maintaining consistent JSON schemas and usage tracking.

### R4. Constraints and Non-Goals
Do not redesign the existing UI layout or styles in `AiEditingChat.tsx`. Do not remove existing presets. Do not rebuild the video editor or replace Remotion. Do not modify billing, credit, or subscription logic. Do not break manual editing capabilities. Do not deploy to production.

## Verification Resources
Synthetic mock project fixtures and speech transcripts created by the team in `scripts/test-custom-ai-editing.mjs`.

## Acceptance Criteria

### Automated Test Suite
- [ ] `scripts/test-custom-ai-editing.mjs` executes and passes all required test cases:
  - Natural language podcast edit instruction (captions + zooms + ducking)
  - Section-bounded instruction (e.g., "keep first 10 seconds untouched")
  - Negative constraint compliance (e.g., "don't touch audio")
  - Conversational refinement modifying existing elements without duplicate clips/captions
  - Clarification return without job failure
  - Preset resilience on short (<4s) footage
- [ ] `npx tsc --noEmit` passes with zero type errors
- [ ] `npm run build:cloudflare` builds successfully

### Pipeline Guardrails
- [ ] Clarification outputs preserve question text in `editingHistory` without generic error overrides
- [ ] Supporting preset stages succeed without failing the overall job on zero-addition edge cases
- [ ] Fallback to Gemini 3.8 Flash activates upon Groq rate limit (429) or 5xx outage
