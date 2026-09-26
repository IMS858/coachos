-- Apply with 0046/0047 as one verified rollout. No provider writes or client publication.
-- Raw observations and prescription snapshots are staff-only. Client history uses an allowlisted RPC.
drop policy if exists "client reads own session performance" on public.session_exercise_performance;
revoke insert,update,delete on public.session_exercise_performance from authenticated;
alter table public.session_exercise_performance add column performed_at timestamptz;
update public.session_exercise_performance r set performed_at=s.scheduled_at from public.sessions s where s.id=r.session_id;
alter table public.session_exercise_performance alter column performed_at set not null;
create index performance_client_performed on public.session_exercise_performance(client_id,performed_at desc);
create table public.session_performance_history (
 id uuid primary key default gen_random_uuid(),
 performance_id uuid not null references public.session_exercise_performance(id),
 actor_id uuid not null references public.profiles(id),
 before_values jsonb,
 after_values jsonb not null,
 created_at timestamptz not null default clock_timestamp()
);
alter table public.session_performance_history enable row level security;
revoke all on public.session_performance_history from anon,authenticated;
grant select on public.session_performance_history to authenticated;
create policy performance_history_staff_read on public.session_performance_history for select to authenticated using (
 exists(select 1 from public.profiles me where me.id=auth.uid() and me.deleted_at is null and me.role in ('owner','trainer'))
 and exists(select 1 from public.session_exercise_performance r where r.id=performance_id)
);

-- Definer is required because browser table DML is revoked. Every call authorizes the real actor.
create function public.save_session_performance(
 p_session_id uuid,p_record_id uuid,p_key text,p_expected_updated_at timestamptz,
 p_expected_program_updated_at timestamptz,p_expected_prescription jsonb,p_actual jsonb
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
 actor uuid:=auth.uid(); actor_role text; s public.sessions%rowtype; p public.programs%rowtype;
 prior public.session_exercise_performance%rowtype; saved public.session_exercise_performance%rowtype;
 a public.program_exercises%rowtype; ex jsonb; ex_id uuid; ex_name text; block_name text; snapshot jsonb;
 nsets integer; nrpe numeric; reps text; load_text text; note_text text; old_actual jsonb; normalized jsonb;
begin
 select role::text into actor_role from public.profiles where id=actor and deleted_at is null;
 if actor_role is null or actor_role not in ('owner','trainer') then raise exception 'Active staff required' using errcode='42501'; end if;
 if p_record_id is null or p_key is null or length(p_key) not between 1 and 180 then raise exception 'Exercise reference required' using errcode='22023'; end if;
 if jsonb_typeof(p_actual) is distinct from 'object'
   or not (p_actual ?& array['sets_completed','reps_completed','load_performed','rpe_actual','coach_note'])
   or exists(select 1 from jsonb_object_keys(p_actual) k where k<>all(array['sets_completed','reps_completed','load_performed','rpe_actual','coach_note'])) then
  raise exception 'Invalid performed fields' using errcode='22023';
 end if;
 if p_actual->'sets_completed'<>'null'::jsonb then
  if jsonb_typeof(p_actual->'sets_completed')<>'number' or (p_actual->>'sets_completed')!~ '^[0-9]+$' then raise exception 'Sets must be an integer' using errcode='22023'; end if;
  nsets:=(p_actual->>'sets_completed')::integer;
  if nsets not between 0 and 30 then raise exception 'Sets must be 0-30' using errcode='22023'; end if;
 end if;
 if p_actual->'rpe_actual'<>'null'::jsonb then
  if jsonb_typeof(p_actual->'rpe_actual')<>'number' then raise exception 'RPE must be numeric' using errcode='22023'; end if;
  nrpe:=(p_actual->>'rpe_actual')::numeric;
  if nrpe not between 1 and 10 or round(nrpe,1)<>nrpe then raise exception 'RPE must be 1-10 with at most one decimal' using errcode='22023'; end if;
 end if;
 if jsonb_typeof(p_actual->'reps_completed')<>'string' or jsonb_typeof(p_actual->'load_performed')<>'string' or jsonb_typeof(p_actual->'coach_note')<>'string' then raise exception 'Text fields required' using errcode='22023'; end if;
 reps:=btrim(p_actual->>'reps_completed'); load_text:=btrim(p_actual->>'load_performed'); note_text:=btrim(p_actual->>'coach_note');
 if length(reps)>80 or length(load_text)>160 or length(note_text)>1000 then raise exception 'Performed text too long' using errcode='22023'; end if;
 if nsets is null and nrpe is null and reps='' and load_text='' and note_text='' then raise exception 'Enter an actual result or observation; empty rows are not performance' using errcode='22023'; end if;
 normalized:=jsonb_build_object('sets_completed',nsets,'reps_completed',reps,'load_performed',load_text,'rpe_actual',nrpe,'coach_note',note_text);
 select * into s from public.sessions where id=p_session_id for update;
 if not found then raise exception 'Session not found' using errcode='P0002'; end if;
 if not exists(select 1 from public.clients c join public.profiles cp on cp.id=c.id where c.id=s.client_id and cp.deleted_at is null and cp.role='client' and (actor_role='owner' or s.trainer_id=actor or c.primary_trainer_id=actor)) then raise exception 'Session access denied' using errcode='42501'; end if;
 if s.status::text not in ('scheduled','confirmed','completed') or s.scheduled_at>clock_timestamp() then raise exception 'Only occurred training sessions may have performed results' using errcode='22023'; end if;
 if s.program_id is null then raise exception 'Choose a program first' using errcode='22023'; end if;
 select * into prior from public.session_exercise_performance where session_id=s.id and prescription_key=p_key for update;
 if found then
  if prior.id<>p_record_id or prior.program_id<>s.program_id then raise exception 'Result identity changed; refresh' using errcode='40001'; end if;
  old_actual:=jsonb_build_object('sets_completed',prior.sets_completed,'reps_completed',prior.reps_completed,'load_performed',prior.load_performed,'rpe_actual',prior.rpe_actual,'coach_note',prior.coach_note);
  -- Lost-response retries acknowledge the already-stored result, without duplicate history.
  if old_actual=normalized then return jsonb_build_object('ok',true,'id',prior.id,'updated_at',prior.updated_at,'deduped',true); end if;
  if prior.updated_at is distinct from p_expected_updated_at then raise exception 'Result changed; refresh before saving' using errcode='40001'; end if;
  update public.session_exercise_performance set sets_completed=nsets,reps_completed=reps,load_performed=load_text,rpe_actual=nrpe,coach_note=note_text where id=prior.id returning * into saved;
 else
  if p_expected_updated_at is not null then raise exception 'Result is missing; refresh' using errcode='40001'; end if;
  select * into p from public.programs where id=s.program_id and client_id=s.client_id for share;
  if not found or p.status::text not in ('draft','published','active') then raise exception 'Current client program required' using errcode='22023'; end if;
  if p.updated_at is distinct from p_expected_program_updated_at then raise exception 'Program changed; refresh before logging' using errcode='40001'; end if;
  if p.data->>'source'='ims_library_program' then
   select value into ex from jsonb_array_elements(p.data->'exercises') with ordinality as v(value,ord)
    where 'quick:'||(ord-1)::text||':'||coalesce(value->>'canonical_id',value->>'exercise_id',value->>'matched_exercise_id','custom')=p_key;
   if ex is null then raise exception 'Exercise is not in this program' using errcode='22023'; end if;
   ex_id:=coalesce(ex->>'exercise_id',ex->>'matched_exercise_id')::uuid; ex_name:=ex->>'name'; block_name:='training';
   snapshot:=jsonb_build_object('sets',ex->'sets','reps',btrim(coalesce(ex->>'reps','')),'load',btrim(coalesce(ex->>'load','')),'rpe',ex->'rpe','rest_seconds',ex->'rest_seconds','tempo',btrim(coalesce(ex->>'tempo','')),'cue',btrim(coalesce(ex->>'cue','')));
  elsif coalesce(p.data->>'source','')='ims_exercise_set' then raise exception 'Exercise selections are not programs' using errcode='22023';
  else
   select * into a from public.program_exercises where program_id=p.id and 'assignment:'||id::text=p_key for share;
   if not found then raise exception 'Exercise is not in this program' using errcode='22023'; end if;
   select coalesce(nullif(ims_label,''),name) into ex_name from public.exercises where id=a.exercise_id for share;
   ex_id:=a.exercise_id; block_name:=coalesce(a.block,'training');
   snapshot:=jsonb_build_object('sets',a.sets,'reps',coalesce(a.reps,''),'load',coalesce(a.load_prescription,''),'rpe',null,'rest_seconds',a.rest_seconds,'tempo',coalesce(a.tempo,''),'cue',coalesce(a.notes,''));
  end if;
  if snapshot is distinct from p_expected_prescription then raise exception 'Prescription changed; refresh before logging' using errcode='40001'; end if;
  insert into public.session_exercise_performance(id,session_id,client_id,program_id,prescription_key,exercise_id,exercise_name,prescription_snapshot,sets_completed,reps_completed,load_performed,rpe_actual,coach_note,recorded_by,performed_at)
   values(p_record_id,s.id,s.client_id,p.id,p_key,ex_id,ex_name,snapshot||jsonb_build_object('block',block_name,'program_updated_at',p.updated_at),nsets,reps,load_text,nrpe,note_text,actor,s.scheduled_at) returning * into saved;
 end if;
 insert into public.session_performance_history(performance_id,actor_id,before_values,after_values) values(saved.id,actor,case when prior.id is null then null else to_jsonb(prior) end,to_jsonb(saved));
 insert into public.audit_logs(actor_id,action,entity_type,entity_id,changes) values(actor,'session.performance.saved','session',s.id,jsonb_build_object('performance_id',saved.id,'correction',prior.id is not null));
 return jsonb_build_object('ok',true,'id',saved.id,'updated_at',saved.updated_at,'deduped',false);
end $$;
revoke all on function public.save_session_performance(uuid,uuid,text,timestamptz,timestamptz,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.save_session_performance(uuid,uuid,text,timestamptz,timestamptz,jsonb,jsonb) to authenticated;

create function public.get_my_coached_performance() returns table(
 id uuid,session_id uuid,exercise_id uuid,exercise_name text,sets_completed integer,reps_completed text,load_performed text,rpe_actual numeric,performed_at timestamptz
) language plpgsql stable security definer set search_path='' as $$
begin
 if not exists(select 1 from public.profiles me where me.id=auth.uid() and me.role='client' and me.deleted_at is null) then raise exception 'Active client required' using errcode='42501'; end if;
 return query select r.id,r.session_id,r.exercise_id,r.exercise_name,r.sets_completed,r.reps_completed,r.load_performed,r.rpe_actual,r.performed_at
 from public.session_exercise_performance r
 join public.sessions s on s.id=r.session_id and s.client_id=r.client_id
 join public.programs p on p.id=r.program_id and p.client_id=r.client_id
 join public.exercises e on e.id=r.exercise_id
 where r.client_id=auth.uid() and s.status::text='completed' and r.performed_at<=now()
   and p.status::text in ('active','published') and e.client_visible=true
   and exists(select 1 from public.exercise_reviews er where er.exercise_id=e.id and er.safety_status='approved')
 order by r.performed_at desc,r.id limit 100;
end $$;
revoke all on function public.get_my_coached_performance() from public,anon,authenticated;
grant execute on function public.get_my_coached_performance() to authenticated;

create function public.link_session_training_program(p_session_id uuid,p_program_id uuid,p_expected_program_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); actor_role text; s public.sessions%rowtype; p public.programs%rowtype;
begin
 select role::text into actor_role from public.profiles where id=actor and deleted_at is null;
 if actor_role is null or actor_role not in ('owner','trainer') then raise exception 'Active staff required' using errcode='42501'; end if;
 select * into s from public.sessions where id=p_session_id for update;
 if not found then raise exception 'Session not found' using errcode='P0002'; end if;
 if not exists(select 1 from public.clients c join public.profiles cp on cp.id=c.id where c.id=s.client_id and cp.role='client' and cp.deleted_at is null and (actor_role='owner' or s.trainer_id=actor or c.primary_trainer_id=actor)) then raise exception 'Session access denied' using errcode='42501'; end if;
 if s.status::text not in ('scheduled','confirmed') then raise exception 'Only scheduled training may change programs' using errcode='22023'; end if;
 select * into p from public.programs where id=p_program_id and client_id=s.client_id for share;
 if not found or p.status::text not in ('draft','active','published') or coalesce(p.data->>'source','')='ims_exercise_set' then raise exception 'Choose an existing client program, not an exercise selection' using errcode='22023'; end if;
 if s.program_id=p.id then return jsonb_build_object('ok',true,'deduped',true); end if;
 if s.program_id is distinct from p_expected_program_id then raise exception 'Session program changed; refresh' using errcode='40001'; end if;
 if exists(select 1 from public.session_exercise_performance r where r.session_id=s.id) then raise exception 'Performed evidence exists; keep its original program' using errcode='40001'; end if;
 update public.sessions set program_id=p.id,updated_at=clock_timestamp() where id=s.id;
 insert into public.audit_logs(actor_id,action,entity_type,entity_id,changes) values(actor,'session.program.linked','session',s.id,jsonb_build_object('before_program_id',s.program_id,'program_id',p.id));
 return jsonb_build_object('ok',true,'deduped',false);
end $$;
revoke all on function public.link_session_training_program(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.link_session_training_program(uuid,uuid,uuid) to authenticated;
