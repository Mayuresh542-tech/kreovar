-- Veelox Migration 0015: Caption Templates Table
-- Stores user-saved and custom viral caption styling configurations with Supabase RLS.

create table if not exists public.caption_templates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete cascade,
  name text not null,
  category text not null default 'Custom',
  description text,
  style jsonb not null default '{}'::jsonb,
  is_public boolean default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists caption_templates_user_idx on public.caption_templates (user_id, updated_at desc);
create index if not exists caption_templates_category_idx on public.caption_templates (category);

alter table public.caption_templates enable row level security;

-- Policy 1: Users can view public templates and their own custom templates
drop policy if exists "Users view public and own templates" on public.caption_templates;
create policy "Users view public and own templates"
  on public.caption_templates for select
  using (is_public = true or auth.uid() = user_id);

-- Policy 2: Users can insert their own templates
drop policy if exists "Users insert own templates" on public.caption_templates;
create policy "Users insert own templates"
  on public.caption_templates for insert
  with check (auth.uid() = user_id);

-- Policy 3: Users can update their own templates
drop policy if exists "Users update own templates" on public.caption_templates;
create policy "Users update own templates"
  on public.caption_templates for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Policy 4: Users can delete their own templates
drop policy if exists "Users delete own templates" on public.caption_templates;
create policy "Users delete own templates"
  on public.caption_templates for delete
  using (auth.uid() = user_id);

grant all on public.caption_templates to authenticated, service_role;
