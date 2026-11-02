-- Veelox: Projects table for end-to-end AI video creation.
-- Stores the entire lifecycle from trend -> idea -> research -> script -> voice -> visuals -> timeline -> MP4 export.
-- Run this in the Supabase SQL editor (or via the Supabase CLI).

create table if not exists projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null,
  trend_topic text,
  niche text,
  status text not null default 'draft', -- draft, researching, scripting, generating_voice, generating_assets, editing, ready, rendering, exported, error
  aspect_ratio text not null default '9:16', -- 9:16, 16:9, 1:1
  duration numeric not null default 60,
  idea jsonb,
  research jsonb,
  script jsonb,
  scenes jsonb,
  timeline jsonb,
  captions jsonb,
  export_url text,
  thumbnail_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists projects_user_id_updated_at_idx
  on projects (user_id, updated_at desc);

create index if not exists projects_status_idx
  on projects (status);

alter table projects enable row level security;

-- Each user can only see and manage their own projects.
drop policy if exists "Users manage own projects" on projects;
create policy "Users manage own projects"
  on projects for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
