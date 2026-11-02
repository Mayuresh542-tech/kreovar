
create table public.admin_announcements (
 id uuid primary key default gen_random_uuid(),
 title text not null check(char_length(title) between 1 and 100),
 body text not null check(char_length(body) between 1 and 2000),
 published boolean not null default false,
 expires_at timestamptz,
 updated_by uuid not null,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create table public.admin_feature_controls (
 key text primary key check(key in ('maintenance','content','voice','captions','ai','stock','export','limits_free','limits_pro')),
 value jsonb not null,
 updated_by uuid not null,
 updated_at timestamptz not null default now()
);
create table public.admin_plan_grants (
 user_id uuid primary key references auth.users(id) on delete cascade,
 expires_at timestamptz not null,
 reason text not null check(char_length(reason) between 3 and 300),
 updated_by uuid not null,
 updated_at timestamptz not null default now()
);
create table public.admin_activity (
 id uuid primary key default gen_random_uuid(),
 actor_id uuid,
 action text not null,
 target text not null,
 detail jsonb not null default '{}',
 created_at timestamptz not null default now()
);
create index admin_activity_date on public.admin_activity(created_at desc);
alter table public.admin_announcements enable row level security;
alter table public.admin_feature_controls enable row level security;
alter table public.admin_plan_grants enable row level security;
alter table public.admin_activity enable row level security;
revoke all on public.admin_announcements,public.admin_feature_controls,public.admin_plan_grants,public.admin_activity from public,anon,authenticated;
grant all on public.admin_announcements,public.admin_feature_controls,public.admin_plan_grants,public.admin_activity to service_role;

create function kreovar_private.audit_admin_control() returns trigger
language plpgsql security invoker set search_path=pg_catalog,public as $$
declare r jsonb;
begin
 r=case when tg_op='DELETE' then to_jsonb(old) else to_jsonb(new) end;
 insert into public.admin_activity(actor_id,action,target,detail)
 values ((r->>'updated_by')::uuid,lower(tg_op)||':'||tg_table_name,
 coalesce(r->>'id',r->>'key',r->>'user_id'),
 jsonb_strip_nulls(jsonb_build_object('published',r->'published','expires_at',r->'expires_at','reason',r->'reason')));
 return case when tg_op='DELETE' then old else new end;
end;$$;
revoke all on function kreovar_private.audit_admin_control() from public,anon,authenticated;
create trigger audit_announcement after insert or update or delete on public.admin_announcements for each row execute function kreovar_private.audit_admin_control();
create trigger audit_control after insert or update or delete on public.admin_feature_controls for each row execute function kreovar_private.audit_admin_control();
create trigger audit_grant after insert or update or delete on public.admin_plan_grants for each row execute function kreovar_private.audit_admin_control();

-- Preserve the verified Whop entitlement implementation and layer explicit, expiring admin grants.
alter function kreovar_private.entitlement(uuid,timestamptz) rename to entitlement_before_admin_controls;
create function kreovar_private.entitlement(p_user_id uuid,p_now timestamptz default now()) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public set timezone='UTC' as $$
declare e jsonb; grant_end timestamptz; limits jsonb;
begin
 e=kreovar_private.entitlement_before_admin_controls(p_user_id,p_now);
 select expires_at into grant_end from public.admin_plan_grants where user_id=p_user_id and expires_at>p_now;
 if grant_end is not null and e->>'plan'='free' then
  e=e||jsonb_build_object('plan','pro','projectLimit',20,'maxResolution',1080,
  'limits','{"content_ideas":30,"content_scripts":30,"voice_characters":20000,"caption_seconds":1800,"ai_edits":10,"exports":null,"stock_downloads":100}'::jsonb);
 end if;
 select value into limits from public.admin_feature_controls where key='limits_'||(e->>'plan');
 if limits is not null then e=jsonb_set(e,'{limits}',limits);end if;
 return e;
end;$$;
revoke all on function kreovar_private.entitlement(uuid,timestamptz) from public,anon,authenticated;
grant execute on function kreovar_private.entitlement(uuid,timestamptz) to service_role;
