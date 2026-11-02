# Reference-Based Preset Editor

This isolated feature lives at `/preset-editor`. Manual Editor and the normal sequential AI Editor continue using their original routes, components and state. A preset edit creates a separate project; it never edits the source project. The existing normalized document, operation validators, compositor, Remotion player and frame-accurate MP4 exporter remain authoritative.

## Enable for local review

- `REFERENCE_PRESETS_ENABLED=true` enables the new page/API. Default is disabled.
- `NEXT_PUBLIC_REFERENCE_PRESETS_ENABLED=true` adds its navigation entry. Default is disabled.
- `REFERENCE_PRESET_LOCAL_STORE=true` uses private disk documents **only in development**. It is ignored in production.
- `REFERENCE_PRESET_INTERNAL_ORIGIN=http://127.0.0.1:3001` must point to the running application; nonlocal HTTP and URL credentials are rejected. Production requires an explicit HTTPS origin.
- `REFERENCE_PRESET_JOB_TOKEN_LIMIT=300000` may lower the production job cap; values above 300000 are clamped.
- Optional `REFERENCE_PRESET_INPUT_USD_PER_MILLION` and `REFERENCE_PRESET_OUTPUT_USD_PER_MILLION` enable an estimate from operator-supplied rates. These are not verified provider pricing. Without both, cost remains unknown.

For production, review and apply `supabase/migrations/20261027092336_reference_preset_documents.sql` before enabling the server flag. The migration is prepared, not automatically applied. The production adapter fails closed if its service-only table/RPC is unavailable. No existing billing, model or timeline tables are altered by the migration. Do not deploy or apply production migrations without the owner's approval.

## Registry and reference analysis

Register a real owned library video with name, category, description/rules and provenance. References are private canonical asset IDs, with actual extracted thumbnails. A reference cannot be used as its own raw footage; registered reference assets are excluded from B-roll selection. No captured reference clips are shipped in `public/` or inserted into generated videos.

FFprobe reads duration, dimensions, rotation and audio. FFmpeg measures scenes/silence and extracts representative JPEG bursts and mono PCM speech audio. The existing configured transcription route supplies actual timed words. The existing Claude adapter receives supported images, measured metadata and transcript, **not an unsupported raw video input**. It must report uncertainty about unsampled motion, exact SFX identity and proprietary fonts.

Style specifications have typed supported parameters, versioned history and reference hashes. Repeated user edits reuse the cached spec. Reanalysis is explicit; changing the reference/rules invalidates readiness. Jobs retain the version they started with.

## Sequential execution

One advance request claims and executes one stage: analyze footage, match direction, cuts/pacing, captions, caption motion, graphics, find B-roll, insert B-roll, zooms/transitions, SFX, timeline validation, render/verification. Disabled style operations are omitted.

Reasoning calls are independent and bounded. Caption styling, animation, validated insertion, document commits and export do not call the model. A single validation correction is permitted; transport/service failures are shown immediately without model switching or automatic retry storms. B-roll comes only from the actual private library or configured licensed search/download interface. Sound comes from actual built-in assets.

Claims use expiring leases and optimistic revisions. Each stage commits its result before the next runs. Cancelling invalidates the lease, so late responses cannot commit. A retry starts from the last committed stage and cannot insert the same committed stage twice. Project mirroring repairs an interrupted save and refuses to overwrite a manually changed timeline. Mandatory failures stop execution. All stages can be cancelled/resumed; failed rendering is saved and can be retried immediately.

The existing usage reservation functions remain in use. New token documents isolate the 20M reference-authoring pool from each production job. Conservative request reservations occur before network calls; actual returned usage settles them. Missing usage leaves its reservation in place. No configured model is replaced. Provider identity and cost are not independently certified by this feature.

The browser preview and export use the same normalized composition data. Completion additionally requires an actual owned H.264 MP4 with the expected dimensions, duration and audio, followed by a full FFmpeg decode. An AI response or valid EDL alone cannot complete a job.

## Validation and limitations

Run `npm run test:reference-presets`, `npm run test:beta`, TypeScript, focused ESLint and the production build. The new tests cover strict reference operations, real caption source clocks after cuts, persistence, concurrent workers, cancellation, feature-off behavior and budgets.

The initial implementation supports videos up to 60 seconds and 100 MB, bounded visual sampling, supported free-font substitutions, sparse graphics, one contextual B-roll insert and up to three SFX cues. It does not provide continuous subject tracking, arbitrary reference animations, proprietary font copying, exact beat detection or pixel-perfect replication. B-roll selection must find a valid relevant asset; unavailable assets fail the required stage. An unverified provider or missing credentials/reference never produces a successful AI edit.

Development-only deterministic render fixtures are engine verification, not evidence of successful AI reference matching. Record external-service failures separately from passed regression/render checks.
