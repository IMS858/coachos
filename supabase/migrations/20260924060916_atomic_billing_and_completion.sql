-- Stage and verify before promoting the application. Never repair duplicates by deletion.
-- Existing duplicate Stripe identities intentionally cause this migration to fail.
alter table public.plans add column if not exists stripe_checkout_id text;
alter table public.plans add column if not exists stripe_event_created bigint not null default 0;
alter table public.payments add column if not exists stripe_payment_intent_id text;
create unique index if not exists plans_stripe_checkout_unique on public.plans(stripe_checkout_id) where stripe_checkout_id is not null;
create unique index if not exists plans_stripe_subscription_unique on public.plans(stripe_subscription_id) where stripe_subscription_id is not null;
create unique index if not exists payments_stripe_source_unique on public.payments(source,source_id) where source='stripe' and source_id is not null;
create index if not exists payments_stripe_intent_idx on public.payments(stripe_payment_intent_id) where stripe_payment_intent_id is not null;

create or replace function public.set_session_completion(p_session_id uuid, p_complete boolean, p_service_type text default null)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  s public.sessions%rowtype;
  p public.plans%rowtype;
  counter jsonb := null;
begin
  if auth.uid() is null or not public.is_trainer() then
    raise exception 'Staff authorization required' using errcode='42501';
  end if;
  if p_complete is null or (p_service_type is not null and p_service_type not in ('training','massage','pilates')) then
    raise exception 'Invalid completion request' using errcode='22023';
  end if;
  select * into s from public.sessions where id=p_session_id for update;
  if not found then raise exception 'Session not found' using errcode='P0002'; end if;
  if p_complete and s.status='completed' then
    if s.service_type::text is distinct from p_service_type then
      raise exception 'Completion already recorded with a different service' using errcode='22023';
    end if;
    return jsonb_build_object('ok',true,'deduped',true,'counter',null);
  end if;
  if not p_complete and s.status<>'completed' then
    return jsonb_build_object('ok',true,'deduped',true);
  end if;
  if p_complete then
    if s.status::text not in ('scheduled','confirmed') then
      raise exception 'Only scheduled or confirmed sessions can be completed' using errcode='22023';
    end if;
    if p_service_type is not null then
      select * into p from public.plans
      where client_id=s.client_id and service_type::text=p_service_type and kind='package' and status='active'
      order by created_at,id limit 1 for update;
      if found then
        update public.plans set current_session_number=coalesce(current_session_number,0)+1,
          sessions_used=coalesce(sessions_used,0)+1,updated_at=now() where id=p.id returning * into p;
        counter:=jsonb_build_object('plan_id',p.id,'incremented',true,'session_number',p.current_session_number,
          'total_sessions',p.total_sessions,'sessions_left',greatest(0,p.total_sessions-p.current_session_number),
          'exhausted',p.current_session_number>=p.total_sessions,'over_limit',p.current_session_number>p.total_sessions);
      else
        counter:=jsonb_build_object('plan_id',null,'incremented',false,'reason','no_active_package');
      end if;
    end if;
    update public.sessions set status='completed',service_type=p_service_type::public.service_type,
      plan_id=p.id,completed_at=now(),completed_by=auth.uid() where id=s.id;
  else
    if s.plan_id is not null then
      select * into p from public.plans where id=s.plan_id for update;
      if not found or p.client_id<>s.client_id or coalesce(p.current_session_number,0)<1 or coalesce(p.sessions_used,0)<1 then
        raise exception 'Package requires reconciliation before undo' using errcode='22023';
      end if;
      update public.plans set current_session_number=current_session_number-1,
        sessions_used=sessions_used-1,updated_at=now() where id=p.id;
    end if;
    update public.sessions set status='confirmed',service_type=null,plan_id=null,completed_at=null,completed_by=null where id=s.id;
  end if;
  return jsonb_build_object('ok',true,'deduped',false,'counter',counter);
end $$;
revoke all on function public.set_session_completion(uuid,boolean,text) from public,anon;
grant execute on function public.set_session_completion(uuid,boolean,text) to authenticated;

-- All event effects and the processed marker commit or roll back together.
-- Only the signature-verifying server may invoke this function.
create or replace function public.process_stripe_event(p_id text,p_type text,p_created bigint,p_command jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  prior public.stripe_events%rowtype;
  plan public.plans%rowtype;
  client uuid;
  matches integer;
  item jsonb;
  action text := p_command->>'action';
  payment_status public.payment_status;
begin
  if current_user<>'service_role' then raise exception 'Service role required' using errcode='42501'; end if;
  if p_id is null or p_type is null or p_created is null or action is null then raise exception 'Invalid event'; end if;
  insert into public.stripe_events(id,type,data) values(p_id,p_type,p_command) on conflict(id) do nothing;
  select * into prior from public.stripe_events where id=p_id for update;
  if prior.processed_at is not null then return jsonb_build_object('ok',true,'deduped',true); end if;
  if action='checkout' then
    client:=(p_command->>'client_id')::uuid;
    perform 1 from public.clients where id=client for update;
    if not found then raise exception 'Checkout client not found'; end if;
    -- Serialize separate event IDs describing the same checkout or subscription.
    perform pg_advisory_xact_lock(hashtextextended(coalesce(p_command->>'subscription_id',p_command->>'checkout_id'),0));
    select * into plan from public.plans where stripe_checkout_id=p_command->>'checkout_id'
      or (stripe_subscription_id is not null and stripe_subscription_id=p_command->>'subscription_id') for update;
    if found and plan.client_id<>client then raise exception 'Checkout client mismatch'; end if;
    if not found then
      insert into public.plans(client_id,kind,tier,service_type,status,stripe_checkout_id,stripe_subscription_id,
        monthly_rate_cents,sessions_per_week,total_sessions,current_session_number,sessions_used,package_total_cents,start_date)
      values(client,(p_command->>'kind')::public.plan_kind,(p_command->>'tier')::public.plan_tier,
        (p_command->>'service_type')::public.service_type,'active',p_command->>'checkout_id',p_command->>'subscription_id',
        (p_command->>'monthly_rate_cents')::integer,(p_command->>'sessions_per_week')::integer,
        (p_command->>'total_sessions')::integer,0,0,(p_command->>'package_total_cents')::integer,
        (to_timestamp(p_created) at time zone 'America/Los_Angeles')::date) returning * into plan;
      update public.clients set billing_type=(case when plan.kind='subscription' then 'membership' else 'package' end)::public.billing_type,
        status='active',joined_at=coalesce(joined_at,to_timestamp(p_created)) where id=client;
    end if;
    if plan.kind='package' then
      insert into public.payments(client_id,plan_id,amount_cents,currency,status,source,source_id,stripe_payment_intent_id,description,paid_at)
      values(client,plan.id,(p_command->>'amount_cents')::integer,p_command->>'currency','succeeded','stripe',
        coalesce(p_command->>'payment_intent_id',p_command->>'checkout_id'),p_command->>'payment_intent_id','Package payment',to_timestamp(p_created))
      on conflict(source,source_id) where source='stripe' and source_id is not null do nothing;
    end if;
  elsif action in ('subscription','invoice') then
    select * into plan from public.plans where stripe_subscription_id=p_command->>'subscription_id' for update;
    if not found then raise exception 'Subscription plan not ready; retry event'; end if;
    if action='subscription' then
      if p_created>=plan.stripe_event_created then
        update public.plans set status=p_command->>'status',stripe_event_created=p_created,
          end_date=case when p_command->>'status'='cancelled' then (to_timestamp(p_created) at time zone 'America/Los_Angeles')::date else null end
        where id=plan.id;
      end if;
    else
      payment_status:=(p_command->>'status')::public.payment_status;
      insert into public.payments(client_id,plan_id,amount_cents,currency,status,source,source_id,stripe_payment_intent_id,description,paid_at)
      values(plan.client_id,plan.id,(p_command->>'amount_cents')::integer,p_command->>'currency',payment_status,'stripe',
        p_command->>'invoice_id',p_command->>'payment_intent_id','Subscription payment',
        case when payment_status='succeeded' then to_timestamp(p_created) else null end)
      on conflict(source,source_id) where source='stripe' and source_id is not null do update
        set status=excluded.status,amount_cents=excluded.amount_cents,paid_at=excluded.paid_at,
            stripe_payment_intent_id=coalesce(excluded.stripe_payment_intent_id,public.payments.stripe_payment_intent_id)
        where public.payments.status<>'succeeded' or excluded.status='succeeded';
    end if;
  elsif action='refunds' then
    for item in select value from jsonb_array_elements(p_command->'refunds') loop
      client:=null;plan.id:=null;
      select p.client_id,p.plan_id into client,plan.id from public.payments p
        where p.stripe_payment_intent_id=item->>'payment_intent_id' and p.status='succeeded' and p.amount_cents>=0 limit 1;
      if client is null then
        select count(*), (array_agg(id))[1] into matches,client from public.clients where stripe_customer_id=item->>'customer_id';
        if matches<>1 then raise exception 'Refund client requires reconciliation'; end if;
      end if;
      insert into public.payments(client_id,plan_id,amount_cents,currency,status,source,source_id,stripe_payment_intent_id,description,paid_at)
      values(client,plan.id,-(item->>'amount_cents')::integer,item->>'currency','refunded','stripe',item->>'refund_id',
        item->>'payment_intent_id','Stripe refund',to_timestamp((item->>'created')::bigint))
      on conflict(source,source_id) where source='stripe' and source_id is not null do nothing;
    end loop;
  elsif action<>'ignore' then raise exception 'Unsupported command';
  end if;
  update public.stripe_events set processed_at=now(),processing_error=null where id=p_id;
  return jsonb_build_object('ok',true,'deduped',false);
end $$;
revoke all on function public.process_stripe_event(text,text,bigint,jsonb) from public,anon,authenticated;
grant execute on function public.process_stripe_event(text,text,bigint,jsonb) to service_role;

-- A stable client-generated ID makes retries of a newly logged session safe.
create or replace function public.create_staff_session(p_id uuid,p_body jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare s public.sessions%rowtype; result jsonb;
begin
 if auth.uid() is null or not public.is_trainer() then raise exception 'Staff authorization required' using errcode='42501';end if;
 if p_id is null or coalesce(p_body->>'mode','') not in ('schedule','log') then raise exception 'Invalid session request' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_id::text,0));
 select * into s from public.sessions where id=p_id;
 if found then
   if s.client_id is distinct from (p_body->>'client_id')::uuid or s.trainer_id is distinct from coalesce((p_body->>'trainer_id')::uuid,auth.uid()) or s.scheduled_at is distinct from (p_body->>'scheduled_at')::timestamptz then
     raise exception 'Session retry does not match original request' using errcode='22023';
   end if;
   return jsonb_build_object('ok',true,'session_id',s.id,'deduped',true,'counter',null);
 end if;
 if (p_body->>'duration_minutes')::integer not between 1 and 480 then raise exception 'Invalid duration' using errcode='22023';end if;
 insert into public.sessions(id,client_id,trainer_id,scheduled_at,duration_minutes,session_type,service_type,status,notes_pre,notes_post)
 values(p_id,(p_body->>'client_id')::uuid,coalesce((p_body->>'trainer_id')::uuid,auth.uid()),
 (p_body->>'scheduled_at')::timestamptz,(p_body->>'duration_minutes')::integer,(p_body->>'session_type')::public.session_type,
 (p_body->>'service_type')::public.service_type,'scheduled',p_body->>'notes_pre',p_body->>'notes_post');
 if p_body->>'mode'='log' then result:=public.set_session_completion(p_id,true,p_body->>'service_type');end if;
 return jsonb_build_object('ok',true,'session_id',p_id,'deduped',false,'counter',result->'counter');
end $$;
revoke all on function public.create_staff_session(uuid,jsonb) from public,anon;
grant execute on function public.create_staff_session(uuid,jsonb) to authenticated;

-- Server-authenticated cancellation: decision, debit and state change are one transaction.
create or replace function public.cancel_session_atomic(p_id uuid,p_actor uuid,p_reason text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare s public.sessions%rowtype;p public.plans%rowtype;late boolean;charged boolean:=false;plan_kind_result text:='none';
begin
 if current_user<>'service_role' then raise exception 'Service role required' using errcode='42501';end if;
 select * into s from public.sessions where id=p_id for update;
 if not found then raise exception 'Session not found' using errcode='P0002';end if;
 if not exists(select 1 from public.profiles where id=p_actor and deleted_at is null and (id=s.client_id or role in ('owner','trainer'))) then
   raise exception 'Not authorized' using errcode='42501';
 end if;
 if s.status::text in ('cancelled','late_cancelled') then
   return jsonb_build_object('ok',true,'deduped',true,'charged',s.late_cancel_fee_charged,'is_late',s.status::text='late_cancelled','can_reschedule',s.status::text='cancelled');
 end if;
 if s.status::text not in ('scheduled','confirmed','requested') then raise exception 'Session cannot be cancelled' using errcode='22023';end if;
 late:=s.scheduled_at < now()+interval '24 hours';
 select * into p from public.plans where client_id=s.client_id and kind='package' and status='active'
 and service_type::text=coalesce(s.service_type::text,s.session_type::text)
 order by created_at,id limit 1 for update;
 if found then plan_kind_result:='package';
 elsif exists(select 1 from public.plans where client_id=s.client_id and kind='subscription' and status='active') then plan_kind_result:='subscription';end if;
 -- A pending request has never reserved a confirmed session and incurs no debit.
 if late and plan_kind_result='package' and s.status::text<>'requested' then
   update public.plans set current_session_number=coalesce(current_session_number,0)+1,sessions_used=coalesce(sessions_used,0)+1,updated_at=now() where id=p.id;
   charged:=true;
 end if;
 update public.sessions set status=(case when late then 'late_cancelled' else 'cancelled' end)::public.session_status,
 cancelled_at=now(),cancelled_by=p_actor,cancellation_reason=nullif(left(p_reason,500),''),late_cancel_fee_charged=charged,plan_id=case when charged then p.id else null end where id=p_id;
 return jsonb_build_object('ok',true,'deduped',false,'is_late',late,'charged',charged,'can_reschedule',not late,'plan_kind',plan_kind_result);
end $$;
revoke all on function public.cancel_session_atomic(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.cancel_session_atomic(uuid,uuid,text) to service_role;

create or replace function public.set_session_no_show(p_id uuid,p_mark boolean,p_charge boolean default true)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare s public.sessions%rowtype;p public.plans%rowtype;charged boolean:=false;
begin
 if auth.uid() is null or not public.is_trainer() then raise exception 'Staff authorization required' using errcode='42501';end if;
 select * into s from public.sessions where id=p_id for update;
 if not found then raise exception 'Session not found' using errcode='P0002';end if;
 if (p_mark and s.status::text='no_show') or (not p_mark and s.status::text<>'no_show') then
   return jsonb_build_object('ok',true,'deduped',true,'charged',s.late_cancel_fee_charged);
 end if;
 if p_mark then
   if s.status::text not in ('scheduled','confirmed') then raise exception 'Only scheduled or confirmed sessions can be marked no-show' using errcode='22023';end if;
   if p_charge then
     select * into p from public.plans where client_id=s.client_id and kind='package' and status='active'
     and service_type::text=coalesce(s.service_type::text,s.session_type::text) order by created_at,id limit 1 for update;
     if found then
       update public.plans set current_session_number=coalesce(current_session_number,0)+1,sessions_used=coalesce(sessions_used,0)+1,updated_at=now() where id=p.id;
       charged:=true;
     end if;
   end if;
   update public.sessions set status='no_show',cancelled_at=now(),cancelled_by=auth.uid(),late_cancel_fee_charged=charged,plan_id=case when charged then p.id else null end where id=p_id;
 else
   if s.late_cancel_fee_charged then
     select * into p from public.plans where id=s.plan_id for update;
     if not found or p.client_id<>s.client_id or coalesce(p.current_session_number,0)<1 or coalesce(p.sessions_used,0)<1 then raise exception 'Package requires reconciliation before undo' using errcode='22023';end if;
     update public.plans set current_session_number=current_session_number-1,sessions_used=sessions_used-1,updated_at=now() where id=p.id;
   end if;
   update public.sessions set status='scheduled',cancelled_at=null,cancelled_by=null,late_cancel_fee_charged=false,plan_id=null where id=p_id;
 end if;
 return jsonb_build_object('ok',true,'deduped',false,'charged',charged);
end $$;
revoke all on function public.set_session_no_show(uuid,boolean,boolean) from public,anon;
grant execute on function public.set_session_no_show(uuid,boolean,boolean) to authenticated;
