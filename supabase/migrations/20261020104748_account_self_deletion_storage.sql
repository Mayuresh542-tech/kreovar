-- Additive read-only lookup. Actual files are removed only through the Storage API.
create function public.list_kreovar_account_files(p_user_id uuid)
returns table(bucket_id text, name text, owner_id text)
language sql stable security invoker set search_path = ''
as $$
 select o.bucket_id,o.name,o.owner_id
 from storage.objects o
 where o.bucket_id in ('studio-assets','editor-media','voiceovers','videos','images')
 and (o.owner_id=p_user_id::text
      or starts_with(o.name,p_user_id::text||'/')
      or (o.bucket_id='videos' and starts_with(o.name,p_user_id::text||'_')))
 order by o.bucket_id,o.name limit 200;
$$;
revoke all on function public.list_kreovar_account_files(uuid) from public,anon,authenticated;
grant execute on function public.list_kreovar_account_files(uuid) to service_role;

-- Extend the existing rate-limit scope allowlist without changing its behavior.
create or replace function public.consume_api_rate_limit(p_user_id uuid,p_scope text,p_limit integer,p_window_seconds integer)
returns boolean language plpgsql set search_path=pg_catalog,public as $$
declare affected integer;
begin
 if p_user_id is null or p_scope not in ('admin-read','admin-write','render','voice','transcribe','generation','api','account-delete') or p_limit<1 or p_limit>1000 or p_window_seconds<1 or p_window_seconds>3600 then
  raise exception 'Invalid rate limit';
 end if;
 insert into public.api_rate_limits(user_id,scope,window_start,request_count)
 values(p_user_id,p_scope,now(),1)
 on conflict(user_id,scope) do update set
 window_start=case when api_rate_limits.window_start<=now()-make_interval(secs=>p_window_seconds) then now() else api_rate_limits.window_start end,
 request_count=case when api_rate_limits.window_start<=now()-make_interval(secs=>p_window_seconds) then 1 else api_rate_limits.request_count+1 end
 where api_rate_limits.window_start<=now()-make_interval(secs=>p_window_seconds) or api_rate_limits.request_count<p_limit;
 get diagnostics affected=row_count;
 return affected=1;
end;
$$;
