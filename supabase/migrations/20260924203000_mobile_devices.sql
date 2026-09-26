-- Native IMS Fitness device registrations. Tokens are private server-managed data.
create table if not exists public.mobile_devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  platform text not null check (platform in ('ios')),
  push_token text not null unique,
  app_version text,
  device_label text,
  enabled boolean not null default true,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists mobile_devices_user_enabled on public.mobile_devices(user_id,enabled);
alter table public.mobile_devices enable row level security;
drop policy if exists mobile_devices_own_read on public.mobile_devices;
create policy mobile_devices_own_read on public.mobile_devices for select to authenticated using (user_id=auth.uid());
revoke all on public.mobile_devices from anon, authenticated;
grant select on public.mobile_devices to authenticated;
