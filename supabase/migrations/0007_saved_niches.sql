-- Fretrend: niches a user has saved for personalized Trend Alerts.
-- One row per (user, niche). Powers the /alerts page and the sidebar bell count.
-- Run this in the Supabase SQL editor (or via the Supabase CLI).

create table if not exists saved_niches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  niche text not null,
  created_at timestamptz not null default now(),
  unique (user_id, niche)
);

create index if not exists saved_niches_user_id_created_at_idx
  on saved_niches (user_id, created_at asc);

alter table saved_niches enable row level security;

-- Each user can only see and manage their own saved niches.
drop policy if exists "Users manage own saved niches" on saved_niches;
create policy "Users manage own saved niches"
  on saved_niches for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
