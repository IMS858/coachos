-- Recurring class series and class-specific access products.
alter table public.class_occurrences add column if not exists series_id uuid;
alter table public.class_occurrences add column if not exists source_key text;
create unique index if not exists class_occurrence_source_key_unique on public.class_occurrences(source_key) where source_key is not null;

create table if not exists public.class_series (
 id uuid primary key default gen_random_uuid(),
 template_id uuid not null references public.class_templates(id) on delete restrict,
 trainer_id uuid not null references public.profiles(id),
 weekday integer not null check(weekday between 0 and 6),
 start_time time not null,
 duration_minutes integer not null check(duration_minutes between 15 and 180),
 capacity integer not null check(capacity between 1 and 100),
 location text,
 starts_on date not null,
 ends_on date,
 active boolean not null default true,
 created_by uuid not null references public.profiles(id),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 check(ends_on is null or ends_on>=starts_on)
);
alter table public.class_occurrences add constraint class_occurrences_series_fk foreign key(series_id) references public.class_series(id) on delete set null;
alter table public.class_series enable row level security;
revoke all on public.class_series from anon,authenticated;
grant select on public.class_series to authenticated;
create policy "staff reads class series" on public.class_series for select to authenticated using(exists(select 1 from public.profiles me where me.id=auth.uid() and me.deleted_at is null and me.role in ('owner','trainer')));

create table if not exists public.class_access_products (
 id uuid primary key default gen_random_uuid(),
 name text not null check(char_length(name) between 2 and 120),
 access_type text not null check(access_type in ('drop_in','credit_pack','monthly_limited','monthly_unlimited')),
 credits integer check(credits is null or credits between 1 and 200),
 validity_days integer check(validity_days is null or validity_days between 1 and 730),
 active boolean not null default true,
 notes text not null default '' check(char_length(notes)<=1000),
 created_by uuid not null references public.profiles(id),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create table if not exists public.client_class_access (
 id uuid primary key default gen_random_uuid(),
 client_id uuid not null references public.clients(id) on delete cascade,
 product_id uuid not null references public.class_access_products(id) on delete restrict,
 credits_total integer,
 credits_used integer not null default 0 check(credits_used>=0),
 starts_on date not null,
 expires_on date,
 status text not null default 'active' check(status in ('active','expired','cancelled')),
 source text not null default 'manual' check(source in ('manual','stripe','migration')),
 source_reference text,
 created_by uuid not null references public.profiles(id),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 check(credits_total is null or (credits_total>=1 and credits_used<=credits_total)),
 check(expires_on is null or expires_on>=starts_on)
);
create index if not exists client_class_access_client on public.client_class_access(client_id,status,expires_on);
alter table public.class_access_products enable row level security;
alter table public.client_class_access enable row level security;
revoke all on public.class_access_products,public.client_class_access from anon,authenticated;
grant select on public.class_access_products,public.client_class_access to authenticated;
create policy "staff reads class products" on public.class_access_products for select to authenticated using(exists(select 1 from public.profiles me where me.id=auth.uid() and me.deleted_at is null and me.role in ('owner','trainer')));
create policy "clients read active class products" on public.class_access_products for select to authenticated using(active and exists(select 1 from public.profiles me where me.id=auth.uid() and me.role='client' and me.deleted_at is null));
create policy "staff reads class access" on public.client_class_access for select to authenticated using(exists(select 1 from public.profiles me where me.id=auth.uid() and me.deleted_at is null and me.role in ('owner','trainer')));
create policy "clients read own class access" on public.client_class_access for select to authenticated using(client_id=auth.uid());

-- Access is intentionally not consumed by class booking yet. Entitlement charging needs a separate transactional ledger before launch.
