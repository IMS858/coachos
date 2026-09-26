-- Provider-neutral wearable connection registry. No provider secrets or tokens are stored here.
create table if not exists public.client_data_connections(
 id uuid primary key default gen_random_uuid(),
 client_id uuid not null references public.clients(id) on delete restrict,
 provider text not null check(provider in ('apple_health','whoop','garmin','fitbit','oura','hume','coros','withings','other')),
 transport text not null check(transport in ('native_healthkit','terra','direct_oauth','apple_health_bridge')),
 status text not null default 'not_connected' check(status in ('not_connected','pending','connected','stale','revoked','error')),
 external_user_ref text,
 observed_categories text[] not null default '{}',
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


create or replace function public.sync_apple_health_connection_registry() returns trigger
 language plpgsql security definer set search_path='' as $$
begin
 if tg_op in ('INSERT','UPDATE') then
  insert into public.client_data_connections(client_id,provider,transport,status,observed_categories,last_synced_at,connected_at,updated_at)
  values(new.client_id,'apple_health','native_healthkit','connected',new.observed_types,new.synced_at,new.synced_at,clock_timestamp())
  on conflict(client_id,provider) do update set
   transport='native_healthkit',status='connected',observed_categories=excluded.observed_categories,
   last_synced_at=excluded.last_synced_at,connected_at=coalesce(public.client_data_connections.connected_at,excluded.connected_at),
   revoked_at=null,updated_at=clock_timestamp();
  return new;
 end if;
 if tg_op='DELETE' and not exists(select 1 from public.client_health_daily where client_id=old.client_id) then
  update public.client_data_connections set status='not_connected',observed_categories='{}',last_synced_at=null,updated_at=clock_timestamp()
  where client_id=old.client_id and provider='apple_health';
 end if;
 return old;
end $$;
revoke all on function public.sync_apple_health_connection_registry() from public,anon,authenticated,service_role;
drop trigger if exists apple_health_connection_registry on public.client_health_daily;
create trigger apple_health_connection_registry after insert or update or delete on public.client_health_daily
 for each row execute function public.sync_apple_health_connection_registry();
