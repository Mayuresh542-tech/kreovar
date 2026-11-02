-- Include render outputs by immutable job identity, never by a user-editable URL.
create or replace function public.list_kreovar_account_files(p_user_id uuid)
returns table(bucket_id text,name text,owner_id text)
language sql stable security invoker set search_path='' as $$
 select o.bucket_id,o.name,
 case when o.bucket_id='videos' and exists(select 1 from public.render_jobs j where j.user_id=p_user_id and o.name='rendered/'||j.id::text||'.mp4') then p_user_id::text else o.owner_id end
 from storage.objects o
 where o.bucket_id in ('studio-assets','editor-media','voiceovers','videos','images')
 and (o.owner_id=p_user_id::text or starts_with(o.name,p_user_id::text||'/')
 or (o.bucket_id='videos' and (starts_with(o.name,p_user_id::text||'_') or exists(select 1 from public.render_jobs j where j.user_id=p_user_id and o.name='rendered/'||j.id::text||'.mp4'))))
 order by o.bucket_id,o.name limit 200;
$$;
revoke all on function public.list_kreovar_account_files(uuid) from public,anon,authenticated;
grant execute on function public.list_kreovar_account_files(uuid) to service_role;
