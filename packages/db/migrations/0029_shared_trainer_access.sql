-- IMS policy: all approved trainers may access all IMS client programs and assessments.
-- Do not grant trainer role through user-editable signup metadata.
drop policy if exists programs_assigned_staff_all on public.programs;
drop policy if exists programs_staff_all on public.programs;
create policy programs_staff_all on public.programs for all to authenticated
using (public.is_trainer()) with check (public.is_trainer());
drop policy if exists assessments_assigned_staff_all on public.assessments;
drop policy if exists assessments_staff_all on public.assessments;
create policy assessments_staff_all on public.assessments for all to authenticated
using (public.is_trainer()) with check (public.is_trainer());
