-- Fretrend: search log. One row per "Find Trends" click, used for the
-- dashboard's "trends searched" stat and the "most searched niche" metric.
-- Run this in the Supabase SQL editor (or via the Supabase CLI).

create table if not exists searches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  niche text not null,
  created_at timestamptz not null default now()
);

create index if not exists searches_user_id_created_at_idx
  on searches (user_id, created_at desc);

alter table searches enable row level security;

-- Each user can only see and manage their own searches.
drop policy if exists "Users manage own searches" on searches;
create policy "Users manage own searches"
  on searches for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
