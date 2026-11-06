# Local captions

The existing /api/transcribe route supports offline faster-whisper on the machine running Next.js. It preserves the existing authentication, request limits, caption grouping and private Asset Library saving.

Local configuration in .env.local:

TRANSCRIPTION_PROVIDER=local
LOCAL_TRANSCRIPTION_MODEL=base

Python must be available on PATH; LOCAL_TRANSCRIPTION_PYTHON can point to another installed interpreter. The optional Python dependency is pinned in requirements-transcription.txt. The selected tiny/base/small model must already be cached. Inference uses local_files_only and offline environment flags; it never downloads a model during a user request and never falls back to an external speech provider.

On the current PC, base and tiny are complete and verified. Base is selected; tiny remains a faster option. Both original MOV files were successfully processed offline using base. Users should review and correct speech recognition wording and timings before publication.

Editor transcription extracts mono 16 kHz PCM for the requested source range in supported browsers, uploads that smaller audio to the same local route, and maps word timings back through source trim and clip speed. The original video remains unchanged. Caption files continue to sync to the existing private cloud library.

One local inference runs at a time. Busy/unavailable engines return explicit errors; cancellation terminates the child process and cleans up its temporary input. No API key is used by local speech recognition.

This setup is for localhost or a server with the Python runtime/model installed. It does not provision Python/model execution on Cloudflare Workers. AI planning still uses the configured Groq model and editing metadata; local speech recognition does not replace that planning service.
