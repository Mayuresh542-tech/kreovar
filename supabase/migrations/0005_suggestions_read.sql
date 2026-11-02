-- Fretrend: mark-as-read flag for the admin suggestions inbox.
-- Run this in the Supabase SQL editor (or via the Supabase CLI).

alter table suggestions
  add column if not exists read boolean not null default false;

-- The admin panel reads/updates suggestions via the Supabase service role key
-- (server-side, bypasses RLS), so no extra RLS policy is required here.
