# E2E Test Infra: Kreovar AI Editor Intelligent Custom Editing & Preset Repair

## Test Philosophy
- Opaque-box, requirement-driven derived from `ORIGINAL_REQUEST.md` and design spec.
- No dependency on internal implementation details.
- Uses `node --test` with synthetic mock project fixtures, speech transcripts, and pure timeline transformations.
- Methodology: Category-Partition + BVA + Pairwise + Workload Testing across Tiers 1-4.

## Feature Inventory & Test Mapping
| # | Feature | Requirement | Tier 1 (Equiv) | Tier 2 (Boundary) | Tier 3 (Pairwise) | Tier 4 (Scenario) |
|---|---------|-------------|:--------------:|:-----------------:|:-----------------:|:-----------------:|
| 1 | Natural language podcast edit instruction (captions + zooms + ducking) | R1 | 5 | 5 | ✓ | Scenario 1 |
| 2 | Section-bounded instruction ("keep first 10s untouched") | R1 | 5 | 5 | ✓ | Scenario 2 |
| 3 | Negative constraint compliance ("don't touch audio") | R1 | 5 | 5 | ✓ | Scenario 3 |
| 4 | Conversational refinement without duplicate elements | R1 | 5 | 5 | ✓ | Scenario 4 |
| 5 | Clarification return without job failure | R1 | 5 | 5 | ✓ | Scenario 5 |
| 6 | Preset resilience on short (<4s) footage | R2 | 5 | 5 | ✓ | Scenario 6 |
| 7 | Fallback to Gemini 3.8 Flash on Groq 429/timeout/5xx | R3 | 5 | 5 | ✓ | Scenario 7 |

## Test Architecture
- Test runner: `node --test scripts/test-custom-ai-editing.mjs`
- Language/Runtime: ES Module executing in Node.js test runner (`node:test`, `node:assert/strict`)
- Fixture Generator: Synthetic video projects with speech transcripts, multi-track clips, captions, and history
- Exit code: 0 on all tests passing

## Real-World Application Scenarios (Tier 4)
| # | Scenario | Features Exercised | Acceptance Target |
|---|----------|--------------------|-------------------|
| 1 | Full Podcast Edit | Captions + Zooms + Audio Ducking | Creates animated captions, zoom keyframes, and ducking decisions |
| 2 | Section-Bounded Edit | Temporal range ("keep first 10 seconds untouched") | Zero modifications to clips/tracks within [0, 10s] |
| 3 | Negative Constraints | Negative instructions ("don't touch audio", "no SFX") | Audio tracks and volumes strictly unchanged |
| 4 | Conversational Refinement | Multi-turn modification of existing elements | Modifies existing clip/caption in-place, 0 duplicates |
| 5 | Clarification Request | Ambiguous / conflicting prompt | Returns questions, 0 unhandled errors, job completes cleanly |
| 6 | Short Footage Resilience | Preset on <4s or silent footage | Supporting stages skip cleanly, 0 failures, valid completion |
| 7 | Model Fallback | Groq 429 rate limit or 5xx simulation | Transparent failover to Gemini 3.8 Flash, valid schema |

## Coverage Thresholds
- Tier 1: ≥5 per feature category
- Tier 2: ≥5 boundary/corner cases
- Tier 3: Pairwise combinations of constraints & styles
- Tier 4: ≥7 realistic end-to-end scenarios (covering all 6 acceptance criteria + fallback)
