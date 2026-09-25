-- Restore retry-safe staff creation for Coach OS training/assessment sessions only.
-- Keeps scheduling separate from completion; completed logs delegate to the verified completion RPC.
create or replace function public.create_staff_session(p_id uuid,p_body jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 actor uuid:=auth.uid(); actor_role text; assigned uuid;
 s public.sessions%rowtype; requested_trainer uuid; requested_client uuid;
 requested_at timestamptz; requested_duration integer; requested_type text;
 requested_service text; requested_mode text; completion jsonb:=null;
begin
 select role::text into actor_role from public.profiles where id=actor and deleted_at is null;
 if actor is null or actor_role is null or actor_role not in ('owner','trainer') then
  raise exception 'Staff authorization required' using errcode='42501';
 end if;
 if p_id is null or p_body is null or jsonb_typeof(p_body)<>'object' then raise exception 'Invalid session request' using errcode='22023';end if;
 if exists(select 1 from jsonb_object_keys(p_body) k where k not in ('mode','client_id','trainer_id','scheduled_at','duration_minutes','session_type','service_type','notes_pre','notes_post','request_id')) then
  raise exception 'Unsupported session field' using errcode='22023';
 end if;
 requested_mode:=p_body->>'mode';
 if requested_mode not in ('schedule','log') then raise exception 'Invalid session mode' using errcode='22023';end if;
 begin
  requested_client:=(p_body->>'client_id')::uuid;
  requested_trainer:=coalesce((p_body->>'trainer_id')::uuid,actor);
  requested_at:=(p_body->>'scheduled_at')::timestamptz;
  requested_duration:=(p_body->>'duration_minutes')::integer;
 exception when others then raise exception 'Invalid session details' using errcode='22023';end;
 requested_type:=p_body->>'session_type'; requested_service:=p_body->>'service_type';
 if requested_client is null or requested_trainer is null or requested_at is null or requested_duration not between 1 and 480 then raise exception 'Invalid session details' using errcode='22023';end if;
 if requested_type not in ('training','assessment') then raise exception 'Coach OS staff creation supports training and assessment only' using errcode='22023';end if;
 if (requested_type='training' and requested_service is distinct from 'training') or (requested_type='assessment' and requested_service is not null) then raise exception 'Service does not match session type' using errcode='22023';end if;
 if requested_mode='schedule' and requested_at<=now() then raise exception 'Scheduled sessions must be in the future' using errcode='22023';end if;
 if requested_mode='log' and requested_at>now() then raise exception 'Completed logs cannot be in the future' using errcode='22023';end if;
 if coalesce(length(p_body->>'notes_pre'),0)>4000 or coalesce(length(p_body->>'notes_post'),0)>4000 then raise exception 'Session notes are too long' using errcode='22023';end if;
 select c.primary_trainer_id into assigned from public.clients c join public.profiles cp on cp.id=c.id where c.id=requested_client and cp.role='client' and cp.deleted_at is null;
 if not found then raise exception 'Active client required' using errcode='22023';end if;
 if not exists(select 1 from public.profiles p where p.id=requested_trainer and p.role in ('owner','trainer') and p.deleted_at is null) then raise exception 'Active trainer required' using errcode='22023';end if;
 if actor_role<>'owner' and requested_trainer is distinct from actor and assigned is distinct from actor then raise exception 'Assigned coach or owner required' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_id::text,0));
 select * into s from public.sessions where id=p_id for update;
 if found then
  if s.client_id is distinct from requested_client or s.trainer_id is distinct from requested_trainer or s.scheduled_at is distinct from requested_at or s.duration_minutes is distinct from requested_duration or s.session_type::text is distinct from requested_type or s.service_type::text is distinct from requested_service then
   raise exception 'Session retry does not match original request' using errcode='22023';
  end if;
  if requested_mode='log' and s.status<>'completed' then completion:=public.set_session_completion(s.id,true,requested_service); end if;
  return jsonb_build_object('ok',true,'session_id',s.id,'deduped',true,'counter',completion->'counter');
 end if;
 insert into public.sessions(id,client_id,trainer_id,scheduled_at,duration_minutes,session_type,service_type,status,notes_pre,notes_post)
 values(p_id,requested_client,requested_trainer,requested_at,requested_duration,requested_type::public.session_type,requested_service::public.service_type,'scheduled',p_body->>'notes_pre',p_body->>'notes_post')
 returning * into s;
 if requested_mode='log' then completion:=public.set_session_completion(s.id,true,requested_service); end if;
 return jsonb_build_object('ok',true,'session_id',s.id,'deduped',false,'counter',completion->'counter');
end $$;
revoke all on function public.create_staff_session(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.create_staff_session(uuid,jsonb) to authenticated;
