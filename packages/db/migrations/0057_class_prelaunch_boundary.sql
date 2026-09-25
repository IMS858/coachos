-- This release builds group coaching but does not launch enrollment.
-- Keep the existing model; do not introduce a second class system.
-- A later reviewed launch migration must replace and explicitly grant the booking commands.
revoke execute on function public.book_class(uuid,uuid) from public,anon,authenticated;
revoke execute on function public.cancel_class_booking(uuid) from public,anon,authenticated;

-- Owning a client record is not enough if that account has been disabled.
drop policy if exists "clients read own class enrollments" on public.class_enrollments;
create policy "active clients read own class enrollments" on public.class_enrollments for select to authenticated using(
 client_id=auth.uid() and exists(select 1 from public.profiles p where p.id=auth.uid() and p.role='client' and p.deleted_at is null)
);
drop policy if exists "staff reads class enrollments" on public.class_enrollments;
create policy "assigned staff reads class enrollments" on public.class_enrollments for select to authenticated using(
 exists(select 1 from public.profiles p where p.id=auth.uid() and p.deleted_at is null and
  (p.role='owner' or (p.role='trainer' and exists(select 1 from public.class_occurrences c where c.id=class_enrollments.occurrence_id and c.trainer_id=p.id))))
);
drop policy if exists "clients read own class access" on public.client_class_access;
create policy "active clients read own class access" on public.client_class_access for select to authenticated using(
 client_id=auth.uid() and exists(select 1 from public.profiles p where p.id=auth.uid() and p.role='client' and p.deleted_at is null)
);
drop policy if exists "clients read own class credit ledger" on public.class_credit_ledger;
create policy "active clients read own class credit ledger" on public.class_credit_ledger for select to authenticated using(
 client_id=auth.uid() and exists(select 1 from public.profiles p where p.id=auth.uid() and p.role='client' and p.deleted_at is null)
);
drop policy if exists "assigned coach records class delivery" on public.class_delivery_notes;
create policy "active assigned coach records occurred class delivery" on public.class_delivery_notes for insert to authenticated with check(
 coach_id=auth.uid()
 and exists(select 1 from public.profiles p where p.id=auth.uid() and p.role in ('owner','trainer') and p.deleted_at is null)
 and exists(select 1 from public.class_occurrences c where c.id=class_delivery_notes.occurrence_id and c.status in ('scheduled','completed') and c.starts_at<=now()
  and (c.trainer_id=auth.uid() or exists(select 1 from public.profiles p where p.id=auth.uid() and p.role='owner' and p.deleted_at is null))
  and (class_delivery_notes.class_program_id is null or exists(select 1 from public.class_programs cp where cp.id=class_delivery_notes.class_program_id and cp.template_id=c.template_id)))
);

-- Own-history projection survives completion/retirement without exposing another client,
-- private class programs, coach notes, credit records or instructor compensation.
create function public.get_my_class_participation() returns table(
 enrollment_id uuid,occurrence_id uuid,class_name text,category text,starts_at timestamptz,ends_at timestamptz,
 enrollment_status text,class_status text,attendance_marked_at timestamptz
) language plpgsql stable security definer set search_path='' as $$
begin
 if not exists(select 1 from public.profiles p where p.id=auth.uid() and p.role='client' and p.deleted_at is null) then
  raise exception 'Active client account required' using errcode='42501';
 end if;
 return query select e.id,c.id,t.name,t.category,c.starts_at,c.ends_at,e.status,c.status,e.attendance_marked_at
 from public.class_enrollments e join public.class_occurrences c on c.id=e.occurrence_id join public.class_templates t on t.id=c.template_id
 where e.client_id=auth.uid() and c.starts_at<=now()
 order by c.starts_at desc,c.id,e.id limit 100;
end $$;
revoke all on function public.get_my_class_participation() from public,anon;
grant execute on function public.get_my_class_participation() to authenticated;
