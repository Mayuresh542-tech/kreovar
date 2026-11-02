-- Fretrend: saved AI Content Kit reports.
-- Run this in the Supabase SQL editor (or via the Supabase CLI).

create table if not exists content_kits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  topic text not null,
  niche text,
  virality_score int,
  kit jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists content_kits_user_id_created_at_idx
  on content_kits (user_id, created_at desc);

alter table content_kits enable row level security;

-- Each user can only see and manage their own saved kits.
drop policy if exists "Users manage own content kits" on content_kits;
create policy "Users manage own content kits"
  on content_kits for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
