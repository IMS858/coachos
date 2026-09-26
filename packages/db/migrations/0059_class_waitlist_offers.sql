-- Explicit waitlist offers. Promotion is an offer, not automatic consent to a booked class.
create table if not exists public.class_waitlist_offers (
 id uuid primary key,
 enrollment_id uuid not null references public.class_enrollments(id) on delete cascade,
 occurrence_id uuid not null references public.class_occurrences(id) on delete cascade,
 client_id uuid not null references public.clients(id) on delete cascade,
 offered_at timestamptz not null default now(),
 expires_at timestamptz not null,
 accepted_at timestamptz,
 declined_at timestamptz,
 created_at timestamptz not null default now(),
 check(expires_at>offered_at),
 check(not(accepted_at is not null and declined_at is not null))
);
create unique index if not exists class_waitlist_offer_open on public.class_waitlist_offers(enrollment_id) where accepted_at is null and declined_at is null;
alter table public.class_waitlist_offers enable row level security;revoke all on public.class_waitlist_offers from anon,authenticated;grant select on public.class_waitlist_offers to authenticated;
create policy "owner reads waitlist offers" on public.class_waitlist_offers for select to authenticated using(exists(select 1 from public.profiles p where p.id=auth.uid() and p.role='owner' and p.deleted_at is null));
create policy "active clients read own waitlist offers" on public.class_waitlist_offers for select to authenticated using(client_id=auth.uid() and exists(select 1 from public.profiles p where p.id=auth.uid() and p.role='client' and p.deleted_at is null));
-- No write command is activated during prelaunch. Future seat-release transaction must create an offer and acceptance must explicitly book it.
