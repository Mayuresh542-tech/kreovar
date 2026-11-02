-- Fretrend: Custom Brand Voice. Stores each user's chosen content tone so the AI
-- matches their personality when generating content kits.
--   brand_voice        — a preset id (professional | funny | edgy | educational |
--                        inspirational | balanced) or 'custom'. Defaults to
--                        'balanced' so users who never set one get neutral output.
--   brand_voice_custom — free-text voice description, used only when brand_voice
--                        is 'custom' (e.g. "sarcastic and Gen-Z with lots of slang").
-- Both are read by the content-kit / platform-kit API routes (server-side, via the
-- service-role client) and injected into the Groq system prompt. Run this in the
-- Supabase SQL editor (or via the Supabase CLI).

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS brand_voice text NOT NULL DEFAULT 'balanced';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS brand_voice_custom text NOT NULL DEFAULT '';
