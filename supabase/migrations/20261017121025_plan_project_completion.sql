create or replace function public.kreovar_usage_status(p_user_id uuid) returns jsonb
language plpgsql security invoker set search_path=pg_catalog,public as $$
declare e jsonb; used jsonb; projects bigint;
begin
 e=kreovar_private.entitlement(p_user_id);
 select coalesce(jsonb_object_agg(feature,total),'{}'::jsonb) into used from (
  select a.key feature,sum(a.value::numeric) total from public.kreovar_usage_reservations r cross join lateral jsonb_each_text(r.amounts) a
  where r.user_id=p_user_id and r.period_start=(e->>'periodStart')::timestamptz and (r.state='completed' or (r.state='pending' and r.expires_at>now())) group by a.key
 ) counts;
 select count(*) into projects from public.projects where user_id=p_user_id and lower(status) not in ('completed','archived','ready','exported');
 return e||jsonb_build_object('used',used,'activeProjects',projects);
end;$$;

create or replace function kreovar_private.project_limit() returns trigger
language plpgsql security definer set search_path=pg_catalog,public as $$
declare e jsonb; existing public.projects; count_active bigint;
begin
 if auth.role()='authenticated' and (auth.uid() is null or new.user_id<>auth.uid()) then raise exception 'Project owner mismatch';end if;
 if tg_op='UPDATE' and new.user_id<>old.user_id then raise exception 'Project ownership cannot be transferred';end if;
 if lower(new.status) in ('completed','archived','ready','exported') then return new;end if;
 perform pg_advisory_xact_lock(hashtextextended('kreovar-usage:'||new.user_id::text,0));
 select * into existing from public.projects where id=new.id and user_id=new.user_id;
 if found and lower(existing.status) not in ('completed','archived','ready','exported') then return new;end if;
 e=kreovar_private.entitlement(new.user_id);
 if (e->>'unlimited')::boolean then return new;end if;
 select count(*) into count_active from public.projects where user_id=new.user_id and id<>new.id and lower(status) not in ('completed','archived','ready','exported');
 if count_active >= (e->>'projectLimit')::int then raise exception 'KREOVAR_PROJECT_LIMIT: Active project limit reached. Complete or delete a project, or upgrade your plan.';end if;
 return new;
end;$$;
