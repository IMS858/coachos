-- Durable delivery ledger. Unique keys prevent duplicate reminders across overlapping cron runs.
create table if not exists public.notification_deliveries (
  id uuid primary key default gen_random_uuid(),
  dedupe_key text not null unique,
  recipient_id uuid not null references auth.users(id) on delete cascade,
  channel text not null default 'email',
  template text not null,
  status text not null default 'pending' check (status in ('pending','sent','failed')),
  provider_id text,
  attempted_at timestamptz not null default now(),
  sent_at timestamptz,
  error text
);
create index if not exists idx_notification_deliveries_status on public.notification_deliveries(status, attempted_at);
alter table public.notification_deliveries enable row level security;
-- Service role only: no client-facing RLS policies on the delivery ledger.
