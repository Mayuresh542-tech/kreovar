-- New feature only. Does not change editor documents, models, billing tables or project policies.
create table public.reference_preset_documents (
 owner_id uuid not null references auth.users(id) on delete cascade,
 kind text not null check(kind in ('preset','job','analysis','budget')),
 key text not null check(key ~ '^[A-Za-z0-9:_-]{1,160}$'),
 revision bigint not null default 1 check(revision>0),
 payload jsonb not null check(jsonb_typeof(payload)='object' and octet_length(payload::text)<=2097152),
 updated_at timestamptz not null default now(),
 primary key(owner_id,kind,key)
);
alter table public.reference_preset_documents enable row level security;
revoke all on public.reference_preset_documents from public,anon,authenticated;
grant select,insert,update,delete on public.reference_preset_documents to service_role;
create function public.reference_document_cas(p_owner uuid,p_kind text,p_key text,p_revision bigint,p_payload jsonb)
returns boolean language plpgsql security invoker set search_path='' as $$
declare affected integer;
begin
 if p_revision=0 then
  insert into public.reference_preset_documents(owner_id,kind,key,payload) values(p_owner,p_kind,p_key,p_payload) on conflict do nothing;
 else
  update public.reference_preset_documents set payload=p_payload,revision=revision+1,updated_at=now()
   where owner_id=p_owner and kind=p_kind and key=p_key and revision=p_revision;
 end if;
 get diagnostics affected=row_count;
 return affected=1;
end $$;
revoke all on function public.reference_document_cas(uuid,text,text,bigint,jsonb) from public,anon,authenticated;
grant execute on function public.reference_document_cas(uuid,text,text,bigint,jsonb) to service_role;
