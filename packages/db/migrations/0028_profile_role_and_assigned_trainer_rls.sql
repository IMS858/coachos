-- Mirrors the live security hardening applied 2026-09-23.
-- Keep privilege checks at the database layer: client-side role checks are insufficient.
create or replace function public.protect_profile_privileged_fields()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
  if (new.role is distinct from old.role or new.deleted_at is distinct from old.deleted_at
      or new.email is distinct from old.email)
     and current_user <> 'service_role'
     and not public.is_owner() then
    raise exception 'Only IMS owners or the service role may change account role, account email or deletion status'
      using errcode='42501';
  end if;
  return new;
end $$;
revoke all on function public.protect_profile_privileged_fields() from public,anon,authenticated;
drop trigger if exists protect_profile_privileged_fields on public.profiles;
create trigger protect_profile_privileged_fields before update on public.profiles
for each row execute function public.protect_profile_privileged_fields();

drop policy if exists programs_trainer_all on public.programs;
drop policy if exists programs_assigned_staff_all on public.programs;
create policy programs_assigned_staff_all on public.programs for all to authenticated
using (public.is_owner() or (public.is_trainer() and trainer_id=(select auth.uid())))
with check (public.is_owner() or (public.is_trainer() and trainer_id=(select auth.uid())));

drop policy if exists assessments_trainer_all on public.assessments;
drop policy if exists assessments_assigned_staff_all on public.assessments;
create policy assessments_assigned_staff_all on public.assessments for all to authenticated
using (public.is_owner() or (public.is_trainer() and trainer_id=(select auth.uid())))
with check (public.is_owner() or (public.is_trainer() and trainer_id=(select auth.uid())));
