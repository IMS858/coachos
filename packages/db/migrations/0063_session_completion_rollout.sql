-- Restore the missing session-completion RPC without activating the unrelated Stripe migration.
-- Preserves the existing ordered active-package selection and completion/undo counter semantics.
-- Adds scoped active-account checks, occurred-session validation and atomic audit evidence.
create or replace function public.set_session_completion(p_session_id uuid,p_complete boolean,p_service_type text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 actor uuid:=auth.uid(); actor_role text; assigned uuid;
 s public.sessions%rowtype; before_session public.sessions%rowtype;
 p public.plans%rowtype; counter jsonb:=null;
begin
 select role::text into actor_role from public.profiles where id=actor and deleted_at is null;
 if actor is null or actor_role is null or actor_role not in ('owner','trainer') then
  raise exception 'Staff authorization required' using errcode='42501';
 end if;
 if p_complete is null or (p_service_type is not null and p_service_type<>'training') then
  raise exception 'This completion workflow is training only' using errcode='22023';
 end if;
 select * into s from public.sessions where id=p_session_id for update;
 if not found then raise exception 'Session not found' using errcode='P0002';end if;
 select c.primary_trainer_id into assigned from public.clients c join public.profiles cp on cp.id=c.id
 where c.id=s.client_id and cp.role='client' and cp.deleted_at is null;
 if not found or (actor_role<>'owner' and s.trainer_id is distinct from actor and assigned is distinct from actor) then
  raise exception 'Assigned coach or owner required' using errcode='42501';
 end if;
 if s.session_type::text not in ('training','assessment') then raise exception 'Unsupported session type' using errcode='22023';end if;
 if p_complete and ((s.session_type::text='training' and p_service_type is distinct from 'training') or (s.session_type::text='assessment' and p_service_type is not null)) then
  raise exception 'Service does not match the session' using errcode='22023';
 end if;
 if p_complete and s.status='completed' then
  if s.service_type::text is distinct from p_service_type then raise exception 'Completion already recorded with a different service' using errcode='22023';end if;
  return jsonb_build_object('ok',true,'id',s.id,'status',s.status,'deduped',true,'counter',null);
 end if;
 if not p_complete and s.status<>'completed' then return jsonb_build_object('ok',true,'id',s.id,'status',s.status,'deduped',true);end if;
 before_session:=s;
 if p_complete then
  if s.status::text not in ('scheduled','confirmed') or s.scheduled_at is null or s.scheduled_at>now() then
   raise exception 'Only occurred scheduled or confirmed sessions can be completed' using errcode='22023';
  end if;
  if p_service_type is not null then
   select * into p from public.plans where client_id=s.client_id and service_type::text=p_service_type and kind='package' and status='active'
   order by created_at,id limit 1 for update;
   if found then
    if p.current_session_number is null or p.sessions_used is null or p.total_sessions is null or p.sessions_used<0 or p.current_session_number<0 then
     raise exception 'Package counters require reconciliation before completion' using errcode='22023';
    end if;
    update public.plans set current_session_number=current_session_number+1,sessions_used=sessions_used+1,updated_at=now() where id=p.id returning * into p;
    counter:=jsonb_build_object('plan_id',p.id,'incremented',true,'session_number',p.current_session_number,'total_sessions',p.total_sessions,
     'sessions_left',greatest(0,p.total_sessions-p.current_session_number),'exhausted',p.current_session_number>=p.total_sessions,'over_limit',p.current_session_number>p.total_sessions);
   else counter:=jsonb_build_object('plan_id',null,'incremented',false,'reason','no_active_package');
   end if;
  end if;
  update public.sessions set status='completed',service_type=p_service_type::public.service_type,plan_id=p.id,completed_at=now(),completed_by=actor where id=s.id returning * into s;
 else
  if s.plan_id is not null then
   select * into p from public.plans where id=s.plan_id for update;
   if not found or p.client_id<>s.client_id or p.current_session_number is null or p.sessions_used is null or p.current_session_number<1 or p.sessions_used<1 then
    raise exception 'Package requires reconciliation before undo' using errcode='22023';
   end if;
   update public.plans set current_session_number=current_session_number-1,sessions_used=sessions_used-1,updated_at=now() where id=p.id;
  end if;
  update public.sessions set status='confirmed',service_type=null,plan_id=null,completed_at=null,completed_by=null where id=s.id returning * into s;
 end if;
 insert into public.audit_logs(id,actor_id,action,entity_type,entity_id,changes)
 values(gen_random_uuid(),actor,case when p_complete then 'session.completed' else 'session.completion_reverted' end,'session',s.id,
  jsonb_build_object('before_status',before_session.status,'after_status',s.status,'before_plan_id',before_session.plan_id,'after_plan_id',s.plan_id,'counter',counter));
 return jsonb_build_object('ok',true,'id',s.id,'status',s.status,'deduped',false,'counter',counter);
end $$;
revoke all on function public.set_session_completion(uuid,boolean,text) from public,anon,authenticated;
grant execute on function public.set_session_completion(uuid,boolean,text) to authenticated;
