-- All editor model calls, corrections and B-roll comparisons share one durable job budget.
create table public.editor_token_jobs (
 job_id uuid primary key,
 project_id uuid not null,
 user_id uuid not null,
 limit_tokens integer not null default 300000 check (limit_tokens = 300000),
 used_tokens integer not null default 0 check (used_tokens >= 0),
 reserved_tokens integer not null default 0 check (reserved_tokens >= 0),
 blocked boolean not null default false,
 created_at timestamptz not null default now(),
 foreign key(project_id,user_id) references public.projects(id,user_id) on delete cascade
);
create index editor_token_jobs_owner on public.editor_token_jobs(user_id,project_id);
create table public.editor_token_requests (
 request_id uuid primary key,
 job_id uuid not null references public.editor_token_jobs(job_id) on delete cascade,
 reserved_tokens integer not null check(reserved_tokens between 1 and 300000),
 actual_tokens integer check(actual_tokens >= 0),
 created_at timestamptz not null default now()
);
create index editor_token_requests_job on public.editor_token_requests(job_id);
alter table public.editor_token_jobs enable row level security;
alter table public.editor_token_requests enable row level security;
revoke all on public.editor_token_jobs,public.editor_token_requests from public,anon,authenticated;
grant select,insert,update,delete on public.editor_token_jobs,public.editor_token_requests to service_role;

create function public.reserve_editor_tokens(p_user_id uuid,p_project_id uuid,p_job_id uuid,p_request_id uuid,p_tokens integer)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare j public.editor_token_jobs;
begin
 if p_tokens is null or p_tokens < 1 or p_tokens > 300000 then
  return jsonb_build_object('allowed',false,'code','EDIT_TOKEN_LIMIT');
 end if;
 if not exists(select 1 from public.projects where id=p_project_id and user_id=p_user_id) then raise exception 'Project unavailable'; end if;
 insert into public.editor_token_jobs(job_id,project_id,user_id) values(p_job_id,p_project_id,p_user_id) on conflict do nothing;
 select * into j from public.editor_token_jobs where job_id=p_job_id for update;
 if j.user_id<>p_user_id or j.project_id<>p_project_id then raise exception 'Editing job unavailable'; end if;
 if exists(select 1 from public.editor_token_requests where request_id=p_request_id) then
  return jsonb_build_object('allowed',false,'code','EDIT_TOKEN_DUPLICATE_REQUEST');
 end if;
 if j.blocked or j.used_tokens+j.reserved_tokens+p_tokens>j.limit_tokens then
  return jsonb_build_object('allowed',false,'code','EDIT_TOKEN_LIMIT','usedTokens',j.used_tokens,'reservedTokens',j.reserved_tokens,'limit',j.limit_tokens);
 end if;
 insert into public.editor_token_requests(request_id,job_id,reserved_tokens) values(p_request_id,p_job_id,p_tokens);
 update public.editor_token_jobs set reserved_tokens=reserved_tokens+p_tokens where job_id=p_job_id;
 return jsonb_build_object('allowed',true,'requestId',p_request_id,'usedTokens',j.used_tokens,'reservedTokens',j.reserved_tokens+p_tokens,'limit',j.limit_tokens);
end $$;

create function public.settle_editor_tokens(p_user_id uuid,p_job_id uuid,p_request_id uuid,p_actual_tokens integer)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare j public.editor_token_jobs; r public.editor_token_requests;
begin
 select * into j from public.editor_token_jobs where job_id=p_job_id and user_id=p_user_id for update;
 if not found then raise exception 'Editing job unavailable'; end if;
 select * into r from public.editor_token_requests where request_id=p_request_id and job_id=p_job_id for update;
 if not found then raise exception 'Request unavailable'; end if;
 if r.actual_tokens is not null then return true; end if;
 -- Unknown transport outcomes keep their reservation. Never refund a possibly billed request.
 if p_actual_tokens is null then return true; end if;
 if p_actual_tokens<0 or p_actual_tokens>100000000 then raise exception 'Invalid usage'; end if;
 update public.editor_token_requests set actual_tokens=p_actual_tokens where request_id=p_request_id;
 update public.editor_token_jobs set used_tokens=used_tokens+p_actual_tokens,reserved_tokens=reserved_tokens-r.reserved_tokens,
  blocked=blocked or used_tokens+p_actual_tokens+reserved_tokens-r.reserved_tokens>limit_tokens where job_id=p_job_id;
 return true;
end $$;
revoke all on function public.reserve_editor_tokens(uuid,uuid,uuid,uuid,integer) from public,anon,authenticated;
revoke all on function public.settle_editor_tokens(uuid,uuid,uuid,integer) from public,anon,authenticated;
grant execute on function public.reserve_editor_tokens(uuid,uuid,uuid,uuid,integer) to service_role;
grant execute on function public.settle_editor_tokens(uuid,uuid,uuid,integer) to service_role;
