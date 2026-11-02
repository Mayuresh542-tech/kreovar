-- Fretrend pivot: drop unused video/voiceover/image provider keys from api_keys.
-- Run this in the Supabase SQL editor (or via the Supabase CLI).
-- Kept columns: groq_key (primary), claude_key (not listed for removal).

ALTER TABLE api_keys DROP COLUMN IF EXISTS elevenlabs_key;
ALTER TABLE api_keys DROP COLUMN IF EXISTS kling_key;          -- name used by the old settings UI
ALTER TABLE api_keys DROP COLUMN IF EXISTS kling_access_key;
ALTER TABLE api_keys DROP COLUMN IF EXISTS kling_secret_key;
ALTER TABLE api_keys DROP COLUMN IF EXISTS runway_key;
ALTER TABLE api_keys DROP COLUMN IF EXISTS pika_key;
ALTER TABLE api_keys DROP COLUMN IF EXISTS stability_key;
ALTER TABLE api_keys DROP COLUMN IF EXISTS openai_key;
