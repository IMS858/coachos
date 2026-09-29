-- Additive owner-managed relationship operations. Original source/notes, accounts and money are preserved.
create table public.lead_workflows (
 lead_id uuid primary key references public.leads(id), revision integer not null default 1 check(revision>0), assigned_to uuid references public.profiles(id),
 priority text not null default 'normal' check(priority in ('low','normal','high')), due_on date, next_action text not null default '' check(length(next_action)<=500),
 goal text not null default '' check(length(goal)<=1200), availability text not null default '' check(length(availability)<=800),
 permission text not null default 'unknown' check(permission in ('unknown','allowed','do_not_contact')), permission_evidence text not null default '' check(length(permission_evidence)<=1000),
 tags text[] not null default '{}', outreach_draft text not null default '' check(length(outreach_draft)<=4000), archived_at timestamptz, updated_at timestamptz not null default clock_timestamp(),
 check(permission='unknown' or length(btrim(permission_evidence))>=10),check(permission<>'do_not_contact' or outreach_draft=''),check(due_on is null or length(next_action)>0),check(cardinality(tags)<=8)
);
create index lead_workflows_due on public.lead_workflows(due_on) where archived_at is null;
create table public.lead_activity (
 id uuid primary key, lead_id uuid not null references public.leads(id), actor_id uuid not null references public.profiles(id),
 kind text not null check(kind in ('note','outbound_contact','inbound_reply','consultation_booked','consultation_attended','no_show','inquiry_opened','stage_changed')),
 channel text not null check(channel in ('email','phone','sms','in_person','other')), occurred_at timestamptz not null,
 note text not null check(length(btrim(note)) between 10 and 2000), created_at timestamptz not null default clock_timestamp()
);
create index lead_activity_timeline on public.lead_activity(lead_id,occurred_at desc);
create table public.relationship_command_receipts (
 id uuid primary key, actor_id uuid not null references public.profiles(id), command jsonb not null, result jsonb not null, created_at timestamptz not null default clock_timestamp()
);
do $$declare t text;begin
 foreach t in array array['lead_workflows','lead_activity','relationship_command_receipts'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from public,anon,authenticated,service_role',t);
  execute format('grant select on public.%I to authenticated,service_role',t);
  execute format('create policy relationship_owner_read on public.%I for select to authenticated using (exists(select 1 from public.profiles p where p.id=auth.uid() and p.role=''owner'' and p.deleted_at is null))',t);
 end loop;
end$$;

-- Explicit owner-recorded inquiry marker adds present interest without rewriting a historical source.
create or replace function public.growth_is_inquiry(p_source text,p_notes text) returns boolean language plpgsql immutable set search_path='' as $$
declare line text;payload text;item jsonb;begin
 if p_source='agent_research' then return false;end if;
 if p_source=any(array['website_contact','manual','referral','consultation','event_inquiry']) then return true;end if;
 foreach line in array string_to_array(coalesce(p_notes,''),E'\n') loop
  payload:=substring(line from '^\[Website enquiry:[A-Za-z0-9_-]+\] (.+)$');
  if payload is not null then begin item:=payload::jsonb;if jsonb_typeof(item->'message')='string' and length(btrim(item->>'message'))>0 then return true;end if;exception when invalid_text_representation then null;end;end if;
  payload:=substring(line from '^\[IMS inquiry:[0-9a-f-]{36}\] (.+)$');
  if payload is not null then begin item:=payload::jsonb;if jsonb_typeof(item->'evidence')='string' and length(btrim(item->>'evidence'))>=10 and item->>'recorded_at' is not null then perform (item->>'recorded_at')::timestamptz;return true;end if;exception when invalid_text_representation or invalid_datetime_format or datetime_field_overflow then null;end;end if;
 end loop;return false;
end$$;
revoke all on function public.growth_is_inquiry(text,text) from public,anon,authenticated,service_role;

create function public.execute_relationship_command(p_command jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid();req uuid;act text;keys text[];entity uuid;stamp timestamptz:=clock_timestamp();result jsonb;
 receipt public.relationship_command_receipts%rowtype;l public.leads%rowtype;w public.lead_workflows%rowtype;person public.profiles%rowtype;client public.clients%rowtype;op public.staff_operations%rowtype;
 chosen uuid;before_state jsonb;activity_kind text;activity_note text;activity_time timestamptz;updated_version integer;
begin
 if not exists(select 1 from public.profiles where id=actor and role='owner' and deleted_at is null) then raise exception 'Active owner required' using errcode='42501';end if;
 if jsonb_typeof(p_command)<>'object' or octet_length(p_command::text)>20000 then raise exception 'Invalid relationship command' using errcode='22023';end if;
 req:=(p_command->>'request_id')::uuid;act:=p_command->>'action';if req is null then raise exception 'Request identity required' using errcode='22023';end if;
 keys:=case act
 when 'create_record' then array['action','request_id','kind','full_name','email','phone','interest','note','confirmed']
 when 'save_contact' then array['action','request_id','record_id','expected_updated_at','full_name','email','phone','interest','reason']
 when 'save_workflow' then array['action','request_id','record_id','expected_revision','assigned_to','priority','due_on','next_action','goal','availability','permission','permission_evidence','tags','outreach_draft','archived','reason']
 when 'record_activity' then array['action','request_id','record_id','kind','channel','occurred_at','note','confirmed']
 when 'set_stage' then array['action','request_id','record_id','expected_updated_at','stage','evidence']
 when 'open_inquiry' then array['action','request_id','record_id','expected_updated_at','evidence','confirmed']
 when 'assign_coach' then array['action','request_id','client_id','expected_updated_at','trainer_id','reason','access_change_confirmed']
 when 'save_staff' then array['action','request_id','staff_id','expected_updated_at','full_name','phone','reason']
 when 'save_operations' then array['action','request_id','staff_id','expected_updated_at','staff_status','operational_owner','responsibilities','notes','reason'] end;
 if keys is null or not p_command ?& keys or exists(select 1 from jsonb_object_keys(p_command) k where not k=any(keys)) then raise exception 'Invalid command fields' using errcode='22023';end if;
 if p_command ? 'reason' and char_length(btrim(p_command->>'reason')) not between 10 and 2000 then raise exception 'Audit reason required' using errcode='22023';end if;
 if p_command ? 'email' and p_command->>'email' is not null and (length(p_command->>'email')>254 or p_command->>'email' !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$') then raise exception 'Invalid contact email' using errcode='22023';end if;
 if p_command ? 'phone' and length(p_command->>'phone')>80 then raise exception 'Invalid phone' using errcode='22023';end if;
 if p_command ? 'full_name' and (jsonb_typeof(p_command->'full_name')<>'string' or char_length(btrim(p_command->>'full_name')) not between 2 and 160) then raise exception 'Name required' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended('ims-relationship-request:'||req::text,0));
 select * into receipt from public.relationship_command_receipts where id=req;
 if found then if receipt.actor_id<>actor or receipt.command<>p_command then raise exception 'Request reused with changed work' using errcode='23505';end if;return receipt.result||jsonb_build_object('deduped',true);end if;

 if act='create_record' then
  if p_command->>'kind' not in ('contact','inquiry') or p_command->'confirmed' is distinct from 'true'::jsonb or length(p_command->>'note')>4000 or (p_command->>'kind'='inquiry' and length(btrim(p_command->>'note'))<10) then raise exception 'Current inquiry evidence or explicit contact confirmation required' using errcode='22023';end if;
  entity:=req;
  insert into public.leads(id,full_name,email,phone,interest,source,stage,notes) values(entity,btrim(p_command->>'full_name'),nullif(lower(btrim(p_command->>'email')),''),nullif(btrim(p_command->>'phone'),''),nullif(btrim(p_command->>'interest'),''),case when p_command->>'kind'='inquiry' then 'manual' else 'manual_contact' end,'new',nullif(btrim(p_command->>'note'),'')) returning updated_at into stamp;

 elsif act in ('save_contact','save_workflow','record_activity','set_stage','open_inquiry') then
  entity:=(p_command->>'record_id')::uuid;select * into l from public.leads where id=entity for update;if not found then raise exception 'Contact not found' using errcode='22023';end if;
  select * into w from public.lead_workflows where lead_id=entity for update;
  if act in ('save_contact','set_stage','open_inquiry') and l.updated_at is distinct from (p_command->>'expected_updated_at')::timestamptz then raise exception 'Record changed; reload' using errcode='40001';end if;
  before_state:=jsonb_build_object('source',l.source,'stage',l.stage);
  if act='save_contact' then
   if l.source='agent_research' then raise exception 'Research source evidence is immutable here' using errcode='22023';end if;
   update public.leads set full_name=btrim(p_command->>'full_name'),email=nullif(lower(btrim(p_command->>'email')),''),phone=nullif(btrim(p_command->>'phone'),''),interest=nullif(btrim(p_command->>'interest'),''),updated_at=stamp where id=entity returning updated_at into stamp;
   -- No source/notes or account-login identity is updated.
  elsif act='save_workflow' then
   if coalesce(w.revision,0) is distinct from (p_command->>'expected_revision')::integer then raise exception 'Workflow changed; reload' using errcode='40001';end if;
   chosen:=(p_command->>'assigned_to')::uuid;
   if chosen is not null and not exists(select 1 from public.profiles where id=chosen and role in ('owner','trainer') and deleted_at is null) then raise exception 'Active staff required' using errcode='42501';end if;
   if jsonb_typeof(p_command->'archived')<>'boolean' or jsonb_typeof(p_command->'tags')<>'array' or jsonb_array_length(p_command->'tags')>8 or exists(select 1 from jsonb_array_elements(p_command->'tags') x where jsonb_typeof(x)<>'string' or length(x#>>'{}') not between 1 and 40) then raise exception 'Invalid workflow metadata' using errcode='22023';end if;
   updated_version:=coalesce(w.revision,0)+1;
   insert into public.lead_workflows(lead_id,revision,assigned_to,priority,due_on,next_action,goal,availability,permission,permission_evidence,tags,outreach_draft,archived_at,updated_at)
    values(entity,updated_version,chosen,p_command->>'priority',(p_command->>'due_on')::date,btrim(p_command->>'next_action'),btrim(p_command->>'goal'),btrim(p_command->>'availability'),p_command->>'permission',btrim(p_command->>'permission_evidence'),array(select jsonb_array_elements_text(p_command->'tags')),p_command->>'outreach_draft',case when (p_command->>'archived')::boolean then coalesce(w.archived_at,stamp) else null end,stamp)
    on conflict(lead_id) do update set revision=excluded.revision,assigned_to=excluded.assigned_to,priority=excluded.priority,due_on=excluded.due_on,next_action=excluded.next_action,goal=excluded.goal,availability=excluded.availability,permission=excluded.permission,permission_evidence=excluded.permission_evidence,tags=excluded.tags,outreach_draft=excluded.outreach_draft,archived_at=excluded.archived_at,updated_at=excluded.updated_at;
  elsif act='record_activity' then
   activity_kind:=p_command->>'kind';activity_note:=p_command->>'note';activity_time:=(p_command->>'occurred_at')::timestamptz;
   if activity_kind not in ('note','outbound_contact','inbound_reply','consultation_booked','consultation_attended','no_show') or p_command->'confirmed' is distinct from 'true'::jsonb or activity_time>now() then raise exception 'Only confirmed occurred activity is allowed' using errcode='22023';end if;
   if activity_kind='outbound_contact' and w.permission='do_not_contact' then raise exception 'Do not contact is active' using errcode='42501';end if;
   insert into public.lead_activity values(req,entity,actor,activity_kind,p_command->>'channel',activity_time,activity_note,stamp);
   if activity_kind='outbound_contact' and l.source is distinct from 'agent_research' then update public.leads set last_contacted_at=greatest(last_contacted_at,activity_time),updated_at=stamp where id=entity returning updated_at into stamp;end if;
  elsif act='set_stage' then
   if not public.growth_is_inquiry(l.source,l.notes) then raise exception 'Only a real inquiry has a sales stage' using errcode='22023';end if;
   if p_command->>'stage' not in ('new','contacted','nurturing','booked','converted','not_interested') or length(btrim(p_command->>'evidence')) not between 10 and 2000 then raise exception 'Stage evidence required' using errcode='22023';end if;
   if p_command->>'stage'='converted' and not exists(select 1 from public.lead_client_conversions c join public.profiles p on p.id=c.client_id where c.lead_id=entity and p.role='client' and p.deleted_at is null) then raise exception 'Verified client link required; conversion is not a payment' using errcode='22023';end if;
   update public.leads set stage=(p_command->>'stage')::public.lead_stage,updated_at=stamp where id=entity returning updated_at into stamp;
   insert into public.lead_activity values(req,entity,actor,'stage_changed','other',stamp,p_command->>'evidence',stamp);
  elsif act='open_inquiry' then
   if l.source='agent_research' or public.growth_is_inquiry(l.source,l.notes) or l.stage::text='converted' or p_command->'confirmed' is distinct from 'true'::jsonb or length(btrim(p_command->>'evidence')) not between 10 and 2000 then raise exception 'Explicit new inquiry evidence required; research and prior conversions are not promoted' using errcode='22023';end if;
   update public.leads set notes=coalesce(notes,'')||E'\n[IMS inquiry:'||req::text||'] '||jsonb_build_object('evidence',btrim(p_command->>'evidence'),'recorded_at',stamp)::text,stage='new',updated_at=stamp where id=entity returning updated_at into stamp;
   insert into public.lead_activity values(req,entity,actor,'inquiry_opened','other',stamp,p_command->>'evidence',stamp);
  end if;

 elsif act='assign_coach' then
  entity:=(p_command->>'client_id')::uuid;chosen:=(p_command->>'trainer_id')::uuid;
  select * into client from public.clients where id=entity for update;
  if not found or client.updated_at is distinct from (p_command->>'expected_updated_at')::timestamptz then raise exception 'Client changed; reload' using errcode='40001';end if;
  if not exists(select 1 from public.profiles where id=entity and role='client' and deleted_at is null) or p_command->'access_change_confirmed' is distinct from 'true'::jsonb then raise exception 'Confirm the active client and access change' using errcode='42501';end if;
  if chosen is not null and (not exists(select 1 from public.profiles where id=chosen and role in ('owner','trainer') and deleted_at is null) or exists(select 1 from public.staff_operations where staff_id=chosen and staff_status in ('inactive','leave'))) then raise exception 'Active available coach required' using errcode='42501';end if;
  before_state:=jsonb_build_object('primary_trainer_id',client.primary_trainer_id);
  update public.clients set primary_trainer_id=chosen,updated_at=stamp where id=entity returning updated_at into stamp;
  -- Existing appointments, programs, money, packages and authentication roles are untouched.

 elsif act in ('save_staff','save_operations') then
  entity:=(p_command->>'staff_id')::uuid;select * into person from public.profiles where id=entity for update;
  if not found or person.deleted_at is not null or person.role::text not in ('owner','trainer') then raise exception 'Active staff required' using errcode='42501';end if;
  if act='save_staff' then
   if person.updated_at is distinct from (p_command->>'expected_updated_at')::timestamptz then raise exception 'Staff profile changed; reload' using errcode='40001';end if;
   before_state:=jsonb_build_object('full_name',person.full_name,'phone',person.phone);
   update public.profiles set full_name=btrim(p_command->>'full_name'),phone=nullif(btrim(p_command->>'phone'),''),updated_at=stamp where id=entity returning updated_at into stamp;
  else
   select * into op from public.staff_operations where staff_id=entity for update;
   if op.updated_at is distinct from (p_command->>'expected_updated_at')::timestamptz then raise exception 'Operations changed; reload' using errcode='40001';end if;
   if jsonb_typeof(p_command->'responsibilities')<>'array' or jsonb_array_length(p_command->'responsibilities')>12 or exists(select 1 from jsonb_array_elements(p_command->'responsibilities') x where jsonb_typeof(x)<>'string' or length(x#>>'{}') not between 1 and 100) or length(p_command->>'operational_owner')>120 or length(p_command->>'notes')>2000 then raise exception 'Invalid staff operations' using errcode='22023';end if;
   before_state:=jsonb_build_object('staff_status',op.staff_status);
   insert into public.staff_operations(staff_id,staff_status,operational_owner,responsibilities,notes,updated_by,updated_at) values(entity,p_command->>'staff_status',p_command->>'operational_owner',array(select jsonb_array_elements_text(p_command->'responsibilities')),p_command->>'notes',actor,stamp)
    on conflict(staff_id) do update set staff_status=excluded.staff_status,operational_owner=excluded.operational_owner,responsibilities=excluded.responsibilities,notes=excluded.notes,updated_by=actor,updated_at=excluded.updated_at returning updated_at into stamp;
  end if;
 end if;
 result:=jsonb_build_object('ok',true,'id',entity,'request_id',req,'action',act,'updated_at',stamp,'revision',updated_version,'deduped',false);
 insert into public.relationship_command_receipts values(req,actor,p_command,result,stamp);
 insert into public.audit_logs(id,actor_id,action,entity_type,entity_id,changes) values(gen_random_uuid(),actor,'relationship.'||act,case when act in ('save_staff','save_operations') then 'profile' when act='assign_coach' then 'client' else 'lead' end,entity,jsonb_build_object('request_id',req,'before',before_state,'reason',coalesce(p_command->>'reason',p_command->>'evidence'),'auth_changed',false,'outreach_sent',false));
 return result;
end$$;
revoke all on function public.execute_relationship_command(jsonb) from public,anon,authenticated,service_role;
grant execute on function public.execute_relationship_command(jsonb) to authenticated;
