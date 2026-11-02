-- Veelox Migration 0014: Projects, Voice Generations & Caption Generations Tables
-- Creates schema for end-to-end video pipeline: Script -> AI Voiceover -> Auto Captions

-- 1. Create projects table if not exists
create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null,
  trend_topic text,
  niche text,
  status text not null default 'draft',
  aspect_ratio text not null default '9:16',
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

create index if not exists projects_user_id_updated_at_idx on public.projects (user_id, updated_at desc);
create index if not exists projects_status_idx on public.projects (status);

alter table public.projects enable row level security;
drop policy if exists "Users manage own projects" on public.projects;
create policy "Users manage own projects" on public.projects for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- 2. Create voice_generations table
create table if not exists public.voice_generations (
  id uuid primary key default gen_random_uuid(),
  project_id text,
  user_id uuid not null references auth.users (id) on delete cascade,
  provider text not null default 'elevenlabs',
  voice_id text not null,
  voice_name text,
  language text default 'en',
  settings jsonb default '{}'::jsonb,
  script_text text not null,
  audio_url text,
  duration numeric default 0,
  scenes jsonb default '[]'::jsonb,
  words jsonb default '[]'::jsonb,
  status text not null default 'completed',
  credits_used integer default 5,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists voice_gen_user_idx on public.voice_generations (user_id, created_at desc);
create index if not exists voice_gen_project_idx on public.voice_generations (project_id);

alter table public.voice_generations enable row level security;
drop policy if exists "Users manage own voice_generations" on public.voice_generations;
create policy "Users manage own voice_generations" on public.voice_generations for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- 3. Create caption_generations table
create table if not exists public.caption_generations (
  id uuid primary key default gen_random_uuid(),
  project_id text,
  voice_generation_id uuid references public.voice_generations (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  transcript text not null,
  segments jsonb default '[]'::jsonb,
  words jsonb default '[]'::jsonb,
  preset text not null default 'clean',
  style_override jsonb default '{}'::jsonb,
  status text not null default 'completed',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists caption_gen_user_idx on public.caption_generations (user_id, created_at desc);
create index if not exists caption_gen_voice_idx on public.caption_generations (voice_generation_id);

alter table public.caption_generations enable row level security;
drop policy if exists "Users manage own caption_generations" on public.caption_generations;
create policy "Users manage own caption_generations" on public.caption_generations for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Grant permissions to authenticated & service_role
grant all on public.projects to authenticated, service_role;
grant all on public.voice_generations to authenticated, service_role;
grant all on public.caption_generations to authenticated, service_role;
