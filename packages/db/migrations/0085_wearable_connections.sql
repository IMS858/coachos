-- Provider-neutral wearable connection registry. No provider secrets or tokens are stored here.
create table if not exists public.client_data_connections(
 id uuid primary key default gen_random_uuid(),
 client_id uuid not null references public.clients(id) on delete restrict,
 provider text not null check(provider in ('apple_health','whoop','garmin','fitbit','oura','hume','coros','withings','other')),
 transport text not null check(transport in ('native_healthkit','terra','direct_oauth','apple_health_bridge')),
 status text not null default 'not_connected' check(status in ('not_connected','pending','connected','stale','revoked','error')),
 external_user_ref text,
 granted_categories text[] not null default '{}',
 last_synced_at timestamptz,
 connected_at timestamptz,
 revoked_at timestamptz,
 created_at timestamptz not null default clock_timestamp(),
 updated_at timestamptz not null default clock_timestamp(),
 unique(client_id,provider)
);
alter table public.client_data_connections enable row level security;
revoke all on public.client_data_connections from public,anon,authenticated,service_role;
grant select on public.client_data_connections to authenticated;
grant select,insert,update,delete on public.client_data_connections to service_role;
drop policy if exists client_data_connections_read on public.client_data_connections;
create policy client_data_connections_read on public.client_data_connections for select to authenticated using(
 exists(select 1 from public.profiles actor join public.clients c on c.id=client_data_connections.client_id
 where actor.id=auth.uid() and actor.deleted_at is null
 and (actor.role='owner' or (actor.role='trainer' and c.primary_trainer_id=actor.id) or (actor.role='client' and actor.id=client_data_connections.client_id)))
);
