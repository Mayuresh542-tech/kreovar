-- Competitor Analysis: let users optionally store their own YouTube Data API v3
-- key. Used only as a FALLBACK — the server-wide YOUTUBE_API_KEY env var takes
-- precedence. Stored encrypted at rest (AES-256-GCM) exactly like groq_key, and
-- read back through the same decrypt() helper (which passes legacy plaintext
-- through unchanged). Run this in the Supabase SQL editor or via the CLI.

ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS youtube_api_key text;
