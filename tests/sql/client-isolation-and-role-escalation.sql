-- IMS privacy regression: run against a non-production copy or within a rolled-back transaction.
-- Uses existing accounts only as impersonation IDs. Does not disclose client data.
-- Fails immediately if any client can see another client's program or assessment,
-- if a client can see staff review data, or if profile self-promotion succeeds.
begin;
select set_config('request.jwt.claim.sub',
 (select client_id::text from public.programs group by client_id order by count(*) desc limit 1), true);
select set_config('request.jwt.claim.role','authenticated',true);
set local role authenticated;
do $$
declare
  current_client uuid:=auth.uid();
  own_programs integer;
  leaked_programs integer;
  blocked boolean:=false;
begin
  if current_client is null then raise exception 'TEST SETUP: no client with programs'; end if;
  select count(*), count(*) filter (where client_id<>current_client)
    into own_programs, leaked_programs from public.programs;
  if own_programs=0 or leaked_programs<>0 then
    raise exception 'CLIENT PROGRAM RLS FAILURE: own %, leaked %',own_programs,leaked_programs;
  end if;
  if exists(select 1 from public.assessments where client_id<>current_client) then
    raise exception 'CLIENT ASSESSMENT RLS FAILURE';
  end if;
  if exists(select 1 from public.canonical_exercise_queue) or
     exists(select 1 from public.exercise_reviews) then
    raise exception 'STAFF EXERCISE REVIEW RLS FAILURE';
  end if;
  begin
    update public.profiles set role='owner' where id=current_client;
  exception when insufficient_privilege then blocked:=true;
  end;
  if not blocked then raise exception 'ACCOUNT ROLE ESCALATION FAILURE'; end if;
  raise notice 'PASS: own programs visible, other clients private, staff reviews private, role escalation blocked';
end $$;
rollback;
