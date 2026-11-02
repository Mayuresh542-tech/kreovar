-- Veelox: Central Admin Provider Configuration, Audit Logging, and Usage Telemetry
-- Stores encrypted credentials and configuration for AI, Voice, and Media providers.
-- Run this in the Supabase SQL editor (or via the Supabase CLI).

-- 1. Provider Configurations
create table if not exists provider_configs (
  id uuid primary key default gen_random_uuid(),
  provider_key text unique not null,
  category text not null, -- voice, ai, visuals, video, render, stock
  name text not null,
  enabled boolean not null default true,
  encrypted_api_key text, -- AES-256-GCM encrypted string, NULL if unconfigured
  config jsonb not null default '{}'::jsonb, -- non-secret settings only (e.g. voiceId, model, stability)
  last_tested_at timestamptz,
  last_test_status text not null default 'untested', -- connected, error, untested, disabled
  last_error text,
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists provider_configs_provider_key_idx
  on provider_configs (provider_key);

create index if not exists provider_configs_category_idx
  on provider_configs (category);

-- Enable RLS on provider_configs
alter table provider_configs enable row level security;

-- STRICT: No direct access for public / anon / authenticated users.
-- Only server-side service-role can read/write this table.
drop policy if exists "No public access to provider_configs" on provider_configs;
-- (With RLS enabled and no policies granted to authenticated/anon, all direct client queries are denied)


-- 2. Provider Audit Logs
create table if not exists provider_audit_logs (
  id uuid primary key default gen_random_uuid(),
  admin_user_id uuid references auth.users (id) on delete set null,
  action text not null, -- provider_configured, key_replaced, provider_tested, provider_enabled, provider_disabled, key_removed, config_updated
  provider_key text not null,
  metadata jsonb not null default '{}'::jsonb, -- sanitized metadata (NEVER secrets)
  created_at timestamptz not null default now()
);

create index if not exists provider_audit_logs_created_at_idx
  on provider_audit_logs (created_at desc);

create index if not exists provider_audit_logs_provider_key_idx
  on provider_audit_logs (provider_key);

alter table provider_audit_logs enable row level security;
-- Direct client access denied; service-role only.


-- 3. Provider Usage Logs
create table if not exists provider_usage_logs (
  id uuid primary key default gen_random_uuid(),
  provider_key text not null,
  operation text not null, -- generate_voice, script_completion, generate_visual, render_video
  user_id uuid references auth.users (id) on delete set null,
  units integer not null default 0, -- character count for ElevenLabs, token count for Groq
  unit_type text not null, -- characters, tokens, images, renders
  status text not null, -- success, error
  estimated_cost numeric(10, 6), -- null if cost estimate unavailable
  duration_ms integer,
  error_message text,
  created_at timestamptz not null default now()
);

create index if not exists provider_usage_logs_created_at_idx
  on provider_usage_logs (created_at desc);

create index if not exists provider_usage_logs_provider_key_idx
  on provider_usage_logs (provider_key);

create index if not exists provider_usage_logs_user_id_idx
  on provider_usage_logs (user_id);

alter table provider_usage_logs enable row level security;
-- Direct client access denied; service-role only.


-- 4. Seed Known Core Providers
insert into provider_configs (provider_key, category, name, enabled, config, last_test_status)
values
  (
    'elevenlabs',
    'voice',
    'ElevenLabs',
    true,
    '{"defaultVoiceId": "21m00Tcm4TlvDq8ikWAM", "modelId": "eleven_multilingual_v2", "stability": 0.5, "similarityBoost": 0.75}'::jsonb,
    'untested'
  ),
  (
    'groq',
    'ai',
    'Groq AI',
    true,
    '{"modelId": "llama-3.3-70b-versatile", "temperature": 0.7}'::jsonb,
    'untested'
  ),
  (
    'pollinations',
    'visuals',
    'Pollinations Visuals',
    true,
    '{"style": "cinematic", "enhancePrompt": true}'::jsonb,
    'connected'
  ),
  (
    'remotion_render',
    'render',
    'Remotion Client Engine',
    true,
    '{"fps": 30, "codec": "vp9", "exportFormat": "mp4"}'::jsonb,
    'connected'
  )
on conflict (provider_key) do nothing;
