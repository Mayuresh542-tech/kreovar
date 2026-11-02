-- Additive allowances. Existing projects, subscriptions, assets and credit balances are untouched.
create schema if not exists kreovar_private;
revoke all on schema kreovar_private from public,anon,authenticated;
grant usage on schema kreovar_private to service_role;

create table public.kreovar_usage_reservations (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 period_start timestamptz not null,
 amounts jsonb not null,
 state text not null default 'pending' check(state in ('pending','completed','refunded')),
 created_at timestamptz not null default now(),
 expires_at timestamptz not null default now()+interval '30 minutes'
);
create index kreovar_usage_user_period on public.kreovar_usage_reservations(user_id,period_start,state);
alter table public.kreovar_usage_reservations enable row level security;
revoke all on public.kreovar_usage_reservations from public,anon,authenticated;
grant select,insert,update,delete on public.kreovar_usage_reservations to service_role;

-- This private, narrowly scoped helper needs auth.users for verified admin flags and signup anchors.
create function kreovar_private.entitlement(p_user_id uuid,p_now timestamptz default now())
returns jsonb language plpgsql security definer set search_path=pg_catalog,public set timezone='UTC' as $$
declare s public.subscriptions; joined timestamptz; unlimited boolean; paid boolean; anchor timestamptz; n int; started timestamptz; ended timestamptz; limits jsonb;
begin
 select created_at,(lower(email)='mayureshsharma542@gmail.com' and raw_app_meta_data->>'unlimited_credits'='true') into joined,unlimited from auth.users where id=p_user_id;
 if joined is null then raise exception 'Account unavailable'; end if;
 select * into s from public.subscriptions where user_id=p_user_id;
 paid=coalesce(s.source='whop' and s.plan in ('pro','creator','studio') and s.status='active' and s.external_subscription_id is not null and s.billing_cycle in ('monthly','yearly') and s.current_period_start<=p_now and s.current_period_end>p_now,false);
 anchor=case when paid then s.current_period_start else joined end;
 n=greatest(0,(extract(year from p_now at time zone 'UTC')::int-extract(year from anchor at time zone 'UTC')::int)*12+extract(month from p_now at time zone 'UTC')::int-extract(month from anchor at time zone 'UTC')::int);
 started=anchor+make_interval(months=>n);
 if started>p_now then n=greatest(0,n-1);started=anchor+make_interval(months=>n);end if;
 ended=anchor+make_interval(months=>n+1);
 if paid and s.billing_cycle='monthly' then started=anchor;ended=s.current_period_end;end if;
 if paid then ended=least(ended,s.current_period_end);end if;
 limits=case when paid then '{"content_ideas":30,"content_scripts":30,"voice_characters":20000,"caption_seconds":1800,"ai_edits":10,"exports":null,"stock_downloads":100}'::jsonb else '{"content_ideas":3,"content_scripts":3,"voice_characters":1000,"caption_seconds":120,"ai_edits":1,"exports":3,"stock_downloads":10}'::jsonb end;
 return jsonb_build_object('plan',case when paid then 'pro' else 'free' end,'unlimited',coalesce(unlimited,false),'periodStart',started,'periodEnd',ended,'limits',limits,'projectLimit',case when paid then 20 else 2 end,'maxResolution',case when paid or coalesce(unlimited,false) then 1080 else 720 end);
end;$$;
revoke all on function kreovar_private.entitlement(uuid,timestamptz) from public,anon,authenticated;
grant execute on function kreovar_private.entitlement(uuid,timestamptz) to service_role;

create function public.kreovar_usage_status(p_user_id uuid) returns jsonb
language plpgsql security invoker set search_path=pg_catalog,public as $$
declare e jsonb; used jsonb; projects bigint;
begin
 e=kreovar_private.entitlement(p_user_id);
 select coalesce(jsonb_object_agg(feature,total),'{}'::jsonb) into used from (
  select a.key feature,sum(a.value::numeric) total from public.kreovar_usage_reservations r cross join lateral jsonb_each_text(r.amounts) a
  where r.user_id=p_user_id and r.period_start=(e->>'periodStart')::timestamptz and (r.state='completed' or (r.state='pending' and r.expires_at>now())) group by a.key
 ) counts;
 select count(*) into projects from public.projects where user_id=p_user_id and lower(status) not in ('completed','archived');
 return e||jsonb_build_object('used',used,'activeProjects',projects);
end;$$;
revoke all on function public.kreovar_usage_status(uuid) from public,anon,authenticated;
grant execute on function public.kreovar_usage_status(uuid) to service_role;

create function public.kreovar_reserve_usage(p_user_id uuid,p_amounts jsonb) returns jsonb
language plpgsql security invoker set search_path=pg_catalog,public as $$
declare e jsonb; a record; used numeric; cap numeric; reservation uuid;
begin
 if jsonb_typeof(p_amounts)<>'object' or p_amounts='{}'::jsonb then raise exception 'Invalid allowance request';end if;
 perform pg_advisory_xact_lock(hashtextextended('kreovar-usage:'||p_user_id::text,0));
 e=public.kreovar_usage_status(p_user_id);
 for a in select * from jsonb_each_text(p_amounts) loop
  if not (e->'limits' ? a.key) or a.value is null or a.value !~ '^[1-9][0-9]{0,6}$' then raise exception 'Invalid allowance units';end if;
  cap=(e->'limits'->>a.key)::numeric;used=coalesce((e->'used'->>a.key)::numeric,0);
  if not (e->>'unlimited')::boolean and cap is not null and used+a.value::numeric>cap then return jsonb_build_object('allowed',false,'feature',a.key,'limit',cap,'used',used,'periodEnd',e->'periodEnd');end if;
 end loop;
 insert into public.kreovar_usage_reservations(user_id,period_start,amounts) values(p_user_id,(e->>'periodStart')::timestamptz,p_amounts) returning id into reservation;
 return e||jsonb_build_object('allowed',true,'reservationId',reservation);
end;$$;
revoke all on function public.kreovar_reserve_usage(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.kreovar_reserve_usage(uuid,jsonb) to service_role;

create function public.kreovar_finish_usage(p_user_id uuid,p_id uuid,p_success boolean,p_export_only boolean default false) returns boolean
language plpgsql security invoker set search_path=pg_catalog,public as $$
declare r public.kreovar_usage_reservations;
begin
 select * into r from public.kreovar_usage_reservations where id=p_id and user_id=p_user_id for update;
 if not found or (p_export_only and r.amounts<>'{"exports":1}'::jsonb) then return false;end if;
 if r.state<>'pending' then return r.state=case when p_success then 'completed' else 'refunded' end;end if;
 if p_success and r.expires_at<=now() then return false;end if;
 update public.kreovar_usage_reservations set state=case when p_success then 'completed' else 'refunded' end where id=p_id;
 return true;
end;$$;
revoke all on function public.kreovar_finish_usage(uuid,uuid,boolean,boolean) from public,anon,authenticated;
grant execute on function public.kreovar_finish_usage(uuid,uuid,boolean,boolean) to service_role;

-- Trigger is deliberately a definer: direct authenticated PostgREST inserts must also respect caps.
create function kreovar_private.project_limit() returns trigger
language plpgsql security definer set search_path=pg_catalog,public as $$
declare e jsonb; existing public.projects; count_active bigint;
begin
 if auth.role()='authenticated' and (auth.uid() is null or new.user_id<>auth.uid()) then raise exception 'Project owner mismatch';end if;
 if tg_op='UPDATE' and new.user_id<>old.user_id then raise exception 'Project ownership cannot be transferred';end if;
 if lower(new.status) in ('completed','archived') then return new;end if;
 perform pg_advisory_xact_lock(hashtextextended('kreovar-usage:'||new.user_id::text,0));
 select * into existing from public.projects where id=new.id and user_id=new.user_id;
 if found and lower(existing.status) not in ('completed','archived') then return new;end if;
 e=kreovar_private.entitlement(new.user_id);
 if (e->>'unlimited')::boolean then return new;end if;
 select count(*) into count_active from public.projects where user_id=new.user_id and id<>new.id and lower(status) not in ('completed','archived');
 if count_active >= (e->>'projectLimit')::int then raise exception 'KREOVAR_PROJECT_LIMIT: Active project limit reached. Complete or delete a project, or upgrade your plan.';end if;
 return new;
end;$$;
revoke all on function kreovar_private.project_limit() from public,anon,authenticated;
create trigger kreovar_project_limit before insert or update of user_id,status on public.projects for each row execute function kreovar_private.project_limit();
