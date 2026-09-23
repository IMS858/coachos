-- Transactional assigned-trainer RLS regression. All temporary role and
-- program changes are rolled back. Run with privileged migration/test access.
begin;
select set_config('request.jwt.claim.sub',
 (select id::text from public.profiles where role='owner' limit 1),true);
select set_config('request.jwt.claim.role','authenticated',true);
-- Create one temporarily unassigned program without exposing client details.
update public.programs
set trainer_id=(select id from public.profiles where role='client' limit 1)
where id=(select id from public.programs order by id limit 1);
-- Temporarily demote the owner to trainer so the test uses a real auth identity.
update public.profiles set role='trainer' where id=auth.uid();
set local role authenticated;
do $$
declare visible integer; total integer; visible_assessments integer;
begin
  if public.is_owner() or not public.is_trainer() then
    raise exception 'TEST SETUP: simulated trainer role incorrect';
  end if;
  select count(*) into visible from public.programs;
  select count(*) into visible_assessments from public.assessments;
  -- Current synthetic fixture has 24 programs, one reassigned in this transaction.
  if visible<>23 or visible_assessments<>4 then
    raise exception 'TRAINER SCOPE FAILURE: programs %, assessments %',visible,visible_assessments;
  end if;
  raise notice 'PASS: trainer sees assigned programs and assessments, not the unassigned program';
end $$;
rollback;
