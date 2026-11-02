-- Veelox Migration 0012: Unified Subscriptions, Credit Transactions, Whop Webhook Events, and Affiliate System
-- Supports Source A (Direct / Main Site) and Source B (Whop)

-- 1. Subscriptions Table
create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete cascade not null unique,
  source text not null default 'direct' check (source in ('direct', 'whop')),
  plan text not null default 'free' check (plan in ('free', 'creator', 'studio')),
  status text not null default 'active' check (status in ('active', 'past_due', 'canceled', 'expired', 'trialing')),
  credits integer not null default 30,
  current_period_start timestamptz not null default now(),
  current_period_end timestamptz,
  external_customer_id text,
  external_subscription_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists subscriptions_user_id_idx on public.subscriptions (user_id);
create index if not exists subscriptions_source_idx on public.subscriptions (source);
create index if not exists subscriptions_status_idx on public.subscriptions (status);
create index if not exists subscriptions_plan_idx on public.subscriptions (plan);
create index if not exists subscriptions_external_sub_idx on public.subscriptions (external_subscription_id);

alter table public.subscriptions enable row level security;

-- Users can read their own subscription
create policy "Users can view own subscription"
  on public.subscriptions for select
  using (auth.uid() = user_id);

-- Only service role can insert/update subscriptions directly
create policy "Service role manages subscriptions"
  on public.subscriptions for all
  using (auth.jwt()->>'role' = 'service_role');


-- 2. Credit Transactions Table (Server-side ledger)
create table if not exists public.credit_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete cascade not null,
  amount integer not null, -- positive for credits added, negative for usage
  type text not null check (type in ('monthly_grant', 'usage', 'refund', 'adjustment', 'bonus')),
  feature text, -- e.g. 'content_kit', 'trend_scan', 'voiceover', 'system'
  reference_id text, -- kit id, project id, webhook id, etc.
  created_at timestamptz not null default now()
);

create index if not exists credit_tx_user_id_idx on public.credit_transactions (user_id);
create index if not exists credit_tx_created_at_idx on public.credit_transactions (created_at desc);
create index if not exists credit_tx_type_idx on public.credit_transactions (type);

alter table public.credit_transactions enable row level security;

create policy "Users can view own credit transactions"
  on public.credit_transactions for select
  using (auth.uid() = user_id);


-- 3. Webhook Events Table (Idempotent tracking for Whop)
create table if not exists public.webhook_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'whop',
  external_event_id text not null,
  event_type text not null,
  processed boolean not null default false,
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  payload_hash text,
  metadata jsonb not null default '{}'::jsonb,
  constraint webhook_events_provider_external_id_key unique (provider, external_event_id)
);

create index if not exists webhook_events_external_id_idx on public.webhook_events (provider, external_event_id);
create index if not exists webhook_events_processed_idx on public.webhook_events (processed);

alter table public.webhook_events enable row level security;
-- Service role only


-- 4. Affiliates Table
create table if not exists public.affiliates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete cascade unique not null,
  referral_code text unique not null,
  status text not null default 'active' check (status in ('active', 'inactive', 'suspended')),
  commission_rate numeric(5, 4) not null default 0.2000, -- 20% standard commission
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists affiliates_user_id_idx on public.affiliates (user_id);
create index if not exists affiliates_code_idx on public.affiliates (referral_code);

alter table public.affiliates enable row level security;

create policy "Users can view own affiliate account"
  on public.affiliates for select
  using (auth.uid() = user_id);


-- 5. Affiliate Referrals Table
create table if not exists public.affiliate_referrals (
  id uuid primary key default gen_random_uuid(),
  affiliate_id uuid references public.affiliates (id) on delete cascade not null,
  referred_user_id uuid references auth.users (id) on delete cascade unique not null,
  referral_code text not null,
  source text default 'direct',
  created_at timestamptz not null default now()
);

create index if not exists affiliate_referrals_affiliate_id_idx on public.affiliate_referrals (affiliate_id);
create index if not exists affiliate_referrals_referred_user_idx on public.affiliate_referrals (referred_user_id);

alter table public.affiliate_referrals enable row level security;

create policy "Affiliates can view own referrals"
  on public.affiliate_referrals for select
  using (
    exists (
      select 1 from public.affiliates
      where public.affiliates.id = public.affiliate_referrals.affiliate_id
      and public.affiliates.user_id = auth.uid()
    )
  );


-- 6. Affiliate Commissions Table
create table if not exists public.affiliate_commissions (
  id uuid primary key default gen_random_uuid(),
  affiliate_id uuid references public.affiliates (id) on delete cascade not null,
  referred_user_id uuid references auth.users (id) on delete set null,
  subscription_id uuid references public.subscriptions (id) on delete set null,
  amount numeric(10, 2) not null default 0.00,
  status text not null default 'pending' check (status in ('pending', 'approved', 'paid', 'rejected')),
  created_at timestamptz not null default now()
);

create index if not exists affiliate_commissions_affiliate_id_idx on public.affiliate_commissions (affiliate_id);
create index if not exists affiliate_commissions_status_idx on public.affiliate_commissions (status);

alter table public.affiliate_commissions enable row level security;

create policy "Affiliates can view own commissions"
  on public.affiliate_commissions for select
  using (
    exists (
      select 1 from public.affiliates
      where public.affiliates.id = public.affiliate_commissions.affiliate_id
      and public.affiliates.user_id = auth.uid()
    )
  );
