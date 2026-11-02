-- Sandbox receipts are intentionally separate from real subscriptions and quota grants.
create table public.dodo_sandbox_checkouts (
 id uuid primary key, user_id uuid not null references auth.users(id) on delete cascade,
 email text not null, cycle text not null check(cycle in ('monthly','yearly')),
 product_id text not null, session_id text unique, subscription_id text unique,
 state jsonb not null default '{"status":"pending","paid":false}'::jsonb,
 checked_at timestamptz, last_webhook_at timestamptz, created_at timestamptz not null default now()
);
create index dodo_sandbox_checkouts_user_idx on public.dodo_sandbox_checkouts(user_id,created_at desc);
create table public.dodo_sandbox_events (
 event_id text primary key check(length(event_id) between 1 and 200),
 checkout_id uuid not null references public.dodo_sandbox_checkouts(id) on delete cascade,
 created_at timestamptz not null default now()
);
alter table public.dodo_sandbox_checkouts enable row level security;
alter table public.dodo_sandbox_events enable row level security;
revoke all on public.dodo_sandbox_checkouts,public.dodo_sandbox_events from public,anon,authenticated;
grant select,insert,update,delete on public.dodo_sandbox_checkouts,public.dodo_sandbox_events to service_role;

create function public.kreovar_apply_dodo_sandbox_snapshot(p_checkout_id uuid,p_state jsonb,p_checked_at timestamptz,p_event_id text default null)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare r public.dodo_sandbox_checkouts; inserted integer;
begin
 select * into r from public.dodo_sandbox_checkouts where id=p_checkout_id for update;
 if not found then raise exception 'Sandbox checkout unavailable'; end if;
 if coalesce(jsonb_typeof(p_state),'null')<>'object' or not coalesce(p_state->>'status' in ('pending','active','failed','cancelled','expired','refunded','on_hold','paused','past_due'),false)
  or coalesce(jsonb_typeof(p_state->'paid'),'null')<>'boolean' or p_checked_at is null then raise exception 'Invalid sandbox snapshot'; end if;
 if p_event_id is not null then
  insert into public.dodo_sandbox_events(event_id,checkout_id) values(p_event_id,p_checkout_id) on conflict do nothing;
  get diagnostics inserted=row_count;
  if inserted=0 then return jsonb_build_object('duplicate',true); end if;
 end if;
 if r.checked_at is null or r.checked_at<=p_checked_at then
  update public.dodo_sandbox_checkouts set state=p_state,subscription_id=coalesce(p_state->>'subscriptionId',subscription_id),checked_at=p_checked_at,
   last_webhook_at=case when p_event_id is not null then now() else last_webhook_at end where id=p_checkout_id;
 elsif p_event_id is not null then
  update public.dodo_sandbox_checkouts set last_webhook_at=now() where id=p_checkout_id;
 end if;
 return jsonb_build_object('duplicate',false);
end $$;
revoke all on function public.kreovar_apply_dodo_sandbox_snapshot(uuid,jsonb,timestamptz,text) from public,anon,authenticated;
grant execute on function public.kreovar_apply_dodo_sandbox_snapshot(uuid,jsonb,timestamptz,text) to service_role;
