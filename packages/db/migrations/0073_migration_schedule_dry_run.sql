-- Dry-run schedule decisions live in migration evidence only.
alter table public.migration_records add column if not exists dry_run_status text check(dry_run_status is null or dry_run_status in ('ready','hold'));
alter table public.migration_records add column if not exists dry_run_reason text;
alter table public.migration_records add column if not exists destination_trainer_id uuid references public.profiles(id);
create index if not exists migration_schedule_dry_run on public.migration_records(batch_id,dry_run_status) where record_type='appointment';

create or replace function public.record_migration_schedule_dry_run(p_record_id uuid,p_status text,p_reason text,p_client_id uuid,p_trainer_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid();r public.migration_records%rowtype;
begin
 if not exists(select 1 from public.profiles where id=actor and role='owner' and deleted_at is null) then raise exception 'Owner authorization required' using errcode='42501';end if;
 if p_status not in ('ready','hold') or coalesce(char_length(p_reason),0)>500 then raise exception 'Invalid dry-run result' using errcode='22023';end if;
 select * into r from public.migration_records where id=p_record_id and record_type='appointment' for update;if not found then raise exception 'Appointment source record not found' using errcode='P0002';end if;
 if p_status='ready' and (p_client_id is null or p_trainer_id is null or p_reason is not null) then raise exception 'Ready appointments require resolved identities and no hold reason' using errcode='22023';end if;
 update public.migration_records set destination_id=p_client_id,destination_trainer_id=p_trainer_id,dry_run_status=p_status,dry_run_reason=nullif(btrim(p_reason),'') where id=r.id;
 return jsonb_build_object('ok',true,'id',r.id,'dry_run_status',p_status);
end $$;
revoke all on function public.record_migration_schedule_dry_run(uuid,text,text,uuid,uuid) from public,anon,authenticated;grant execute on function public.record_migration_schedule_dry_run(uuid,text,text,uuid,uuid) to authenticated;
