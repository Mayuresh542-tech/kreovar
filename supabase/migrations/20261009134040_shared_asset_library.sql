create table public.studio_assets (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 kind text not null check (kind in ('video','image','audio','caption')),
 filename text not null check (length(filename) between 1 and 180),
 mime text not null,
 size_bytes bigint not null check (size_bytes > 0 and size_bytes <= 104857600),
 content_hash text not null check (content_hash ~ '^[a-f0-9]{64}$'),
 storage_path text not null check (storage_path like user_id::text || '/%'),
 source text not null default 'upload',
 metadata jsonb not null default '{}'::jsonb,
 status text not null default 'pending' check (status in ('pending','ready')),
 created_at timestamptz not null default now(),
 unique(user_id,content_hash), unique(id,user_id)
);
create index studio_assets_user_created on public.studio_assets(user_id,created_at desc);
alter table public.studio_assets enable row level security;
create policy "Read own studio assets" on public.studio_assets for select to authenticated using ((select auth.uid())=user_id);
revoke all on public.studio_assets from anon,authenticated;
grant select on public.studio_assets to authenticated;
grant all on public.studio_assets to service_role;

create unique index projects_asset_owner_key on public.projects(id,user_id);
create table public.project_asset_links (
 user_id uuid not null references auth.users(id) on delete cascade,
 project_id uuid not null,
 asset_id uuid not null,
 role text not null check (role in ('raw_footage','broll_assets','voiceovers','thumbnails','backgrounds','sfx_assets','captions')),
 created_at timestamptz not null default now(),
 primary key(project_id,asset_id,role),
 foreign key(project_id,user_id) references public.projects(id,user_id) on delete cascade,
 foreign key(asset_id,user_id) references public.studio_assets(id,user_id) on delete cascade
);
create index project_asset_links_owner on public.project_asset_links(user_id,asset_id);
alter table public.project_asset_links enable row level security;
create policy "Read own project asset links" on public.project_asset_links for select to authenticated using ((select auth.uid())=user_id);
revoke all on public.project_asset_links from anon,authenticated;
grant select on public.project_asset_links to authenticated;
grant all on public.project_asset_links to service_role;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 values('studio-assets','studio-assets',false,104857600,
 array['video/mp4','video/webm','video/quicktime','audio/mpeg','audio/wav','audio/x-wav','audio/mp4','audio/ogg','audio/webm','image/png','image/jpeg','image/webp','application/x-subrip','text/vtt'])
 on conflict(id) do nothing;
create policy "Read own private studio originals" on storage.objects for select to authenticated
 using (bucket_id='studio-assets' and (storage.foldername(name))[1]=(select auth.uid())::text);

-- Service-only reservation serializes per-user quota checks and deduplicates retries.
create function public.reserve_studio_asset(p_user_id uuid,p_hash text,p_kind text,p_filename text,p_mime text,p_bytes bigint,p_path text,p_source text,p_metadata jsonb)
 returns public.studio_assets language plpgsql security invoker set search_path='' as $$
 declare found public.studio_assets;
 begin
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user_id::text,734));
 select * into found from public.studio_assets where user_id=p_user_id and content_hash=p_hash;
 if found.id is not null then return found; end if;
 if (select coalesce(sum(size_bytes),0)+p_bytes from public.studio_assets where user_id=p_user_id)>2147483648
 then raise exception 'ASSET_QUOTA_EXCEEDED'; end if;
 insert into public.studio_assets(user_id,content_hash,kind,filename,mime,size_bytes,storage_path,source,metadata)
 values(p_user_id,p_hash,p_kind,p_filename,p_mime,p_bytes,p_path,p_source,p_metadata) returning * into found;
 return found;
 end;
 $$;
revoke all on function public.reserve_studio_asset(uuid,text,text,text,text,bigint,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.reserve_studio_asset(uuid,text,text,text,text,bigint,text,text,jsonb) to service_role;

