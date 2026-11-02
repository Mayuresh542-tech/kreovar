alter table public.dodo_sandbox_events add column receipt jsonb;
create index dodo_sandbox_payment_lookup_idx on public.dodo_sandbox_checkouts ((state->>'paymentId'));
create or replace function public.kreovar_apply_dodo_sandbox_snapshot(p_checkout_id uuid,p_state jsonb,p_checked_at timestamptz,p_event_id text default null)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare r public.dodo_sandbox_checkouts; inserted integer; new_payment_time timestamptz; old_payment_time timestamptz;
begin
 select * into r from public.dodo_sandbox_checkouts where id=p_checkout_id for update;
 if not found then raise exception 'Sandbox checkout unavailable'; end if;
 if coalesce(jsonb_typeof(p_state),'null')<>'object' or not coalesce(p_state->>'status' in ('pending','active','failed','cancelled','expired','refunded','on_hold','paused','past_due'),false)
  or coalesce(jsonb_typeof(p_state->'paid'),'null')<>'boolean' or p_checked_at is null then raise exception 'Invalid sandbox snapshot'; end if;
 new_payment_time=(p_state->>'paymentCreatedAt')::timestamptz;
 old_payment_time=(r.state->>'paymentCreatedAt')::timestamptz;
 if p_event_id is not null then
  insert into public.dodo_sandbox_events(event_id,checkout_id,receipt) values(p_event_id,p_checkout_id,p_state->'eventReceipt') on conflict do nothing;
  get diagnostics inserted=row_count;
  if inserted=0 then return jsonb_build_object('duplicate',true); end if;
 end if;
 if (old_payment_time is null or coalesce(new_payment_time>=old_payment_time,false))
  and (r.checked_at is null or r.checked_at<=p_checked_at or coalesce(new_payment_time>old_payment_time,false)) then
  update public.dodo_sandbox_checkouts set state=p_state-'eventReceipt',subscription_id=coalesce(p_state->>'subscriptionId',subscription_id),checked_at=p_checked_at,
   last_webhook_at=case when p_event_id is not null then now() else last_webhook_at end where id=p_checkout_id;
 elsif p_event_id is not null then
  update public.dodo_sandbox_checkouts set last_webhook_at=now() where id=p_checkout_id;
 end if;
 return jsonb_build_object('duplicate',false);
end $$;
revoke all on function public.kreovar_apply_dodo_sandbox_snapshot(uuid,jsonb,timestamptz,text) from public,anon,authenticated;
grant execute on function public.kreovar_apply_dodo_sandbox_snapshot(uuid,jsonb,timestamptz,text) to service_role;
