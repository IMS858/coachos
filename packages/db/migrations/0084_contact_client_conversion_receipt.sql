-- Durable contact-to-client conversion receipt. Prevents one contact from creating multiple client identities.
create table if not exists public.lead_client_conversions(
 lead_id uuid primary key references public.leads(id) on delete restrict,
 client_id uuid not null unique references public.profiles(id) on delete restrict,
 converted_by uuid not null references public.profiles(id) on delete restrict,
 converted_at timestamptz not null default clock_timestamp()
);
alter table public.lead_client_conversions enable row level security;
revoke all on public.lead_client_conversions from public,anon,authenticated,service_role;
grant select on public.lead_client_conversions to authenticated;
grant select,insert,delete on public.lead_client_conversions to service_role;
drop policy if exists lead_client_conversions_staff_read on public.lead_client_conversions;
create policy lead_client_conversions_staff_read on public.lead_client_conversions for select to authenticated using(
 exists(select 1 from public.profiles p where p.id=auth.uid() and p.deleted_at is null and p.role in ('owner','trainer'))
);
