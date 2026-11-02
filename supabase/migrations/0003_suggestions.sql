-- Fretrend: user suggestions / feedback inbox.
-- Run this in the Supabase SQL editor (or via the Supabase CLI).

create table if not exists suggestions (
  id uuid primary key default gen_random_uuid(),
  name text,
  email text,
  type text not null default 'Other',
  message text not null,
  created_at timestamptz not null default now()
);

create index if not exists suggestions_created_at_idx
  on suggestions (created_at desc);

alter table suggestions enable row level security;

-- Anyone (including anonymous visitors) can submit a suggestion...
drop policy if exists "Anyone can submit suggestions" on suggestions;
create policy "Anyone can submit suggestions"
  on suggestions for insert
  to anon, authenticated
  with check (true);

-- ...but only authenticated users can read them back.
drop policy if exists "Authenticated users can view suggestions" on suggestions;
create policy "Authenticated users can view suggestions"
  on suggestions for select
  to authenticated
  using (true);
