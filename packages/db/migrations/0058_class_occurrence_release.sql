-- Per-occurrence release state. Template visibility describes the offering; occurrence release controls client registration.
alter table public.class_occurrences add column if not exists release_state text not null default 'private' check(release_state in ('private','released','closed'));
alter table public.class_occurrences add column if not exists released_at timestamptz;
alter table public.class_occurrences add column if not exists released_by uuid references public.profiles(id);
create index if not exists class_occurrences_release on public.class_occurrences(release_state,starts_at);

drop policy if exists "clients read published class occurrences" on public.class_occurrences;
create policy "clients read released class occurrences" on public.class_occurrences for select to authenticated using(
 release_state='released' and status='scheduled'
 and exists(select 1 from public.class_templates t where t.id=template_id and t.visibility='published')
 and exists(select 1 from public.profiles me where me.id=auth.uid() and me.deleted_at is null and me.role='client')
);
-- Booking commands remain revoked by 0057. Releasing an occurrence is necessary but not sufficient to launch registration.
