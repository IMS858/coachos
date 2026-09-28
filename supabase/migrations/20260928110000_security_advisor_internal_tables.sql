-- Security advisor cleanup for internal-only tables and extensions.
-- Preserve deny-by-default semantics while removing broad direct table privileges.

create schema if not exists extensions;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'citext')
     and exists (
       select 1
       from pg_extension e
       join pg_namespace n on n.oid = e.extnamespace
       where e.extname = 'citext' and n.nspname = 'public' and e.extrelocatable
     ) then
    execute 'alter extension citext set schema extensions';
  end if;
end
$$;

revoke all on table public.fuel_command_receipts from public, anon, authenticated;
revoke all on table public.intake_tokens from public, anon, authenticated;

grant all on table public.fuel_command_receipts to service_role;
grant all on table public.intake_tokens to service_role;

drop policy if exists fuel_command_receipts_no_direct_client_access on public.fuel_command_receipts;
create policy fuel_command_receipts_no_direct_client_access
on public.fuel_command_receipts
for all
to anon, authenticated
using (false)
with check (false);

drop policy if exists intake_tokens_no_direct_client_access on public.intake_tokens;
create policy intake_tokens_no_direct_client_access
on public.intake_tokens
for all
to anon, authenticated
using (false)
with check (false);
