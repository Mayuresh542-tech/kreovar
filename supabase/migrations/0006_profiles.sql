-- Fretrend: user profiles + first-run onboarding state.
-- `onboarding_completed` tracks whether a user has finished (or skipped) the
-- 5-step welcome flow so it is shown exactly once — on first signup — and never
-- again. Run this in the Supabase SQL editor (or via the Supabase CLI).

create table if not exists profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  onboarding_completed boolean not null default false,
  created_at timestamptz not null default now()
);

alter table profiles enable row level security;

-- Each user can only see and manage their own profile row.
drop policy if exists "Users manage own profile" on profiles;
create policy "Users manage own profile"
  on profiles for all
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- Auto-create a profile row for every new auth user. New signups therefore start
-- with onboarding_completed = false and see the welcome flow on first visit.
-- security definer lets the trigger insert past RLS as the table owner.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id)
  values (new.id)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Backfill existing accounts as already-onboarded so the welcome flow only ever
-- appears for brand-new signups, never for users who predate this feature.
insert into public.profiles (id, onboarding_completed)
select id, true from auth.users
on conflict (id) do nothing;
