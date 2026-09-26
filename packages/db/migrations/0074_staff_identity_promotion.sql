-- Explicit owner-controlled staff identity promotion for pre-existing auth/profile rows.
create or replace function public.promote_existing_profile_to_trainer(p_profile_id uuid,p_full_name text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid();p public.profiles%rowtype;
begin
 if not exists(select 1 from public.profiles where id=actor and role='owner' and deleted_at is null) then raise exception 'Owner authorization required' using errcode='42501';end if;
 select * into p from public.profiles where id=p_profile_id for update;if not found or p.deleted_at is not null then raise exception 'Active profile required' using errcode='P0002';end if;
 if exists(select 1 from public.clients where id=p_profile_id) then raise exception 'Client record cannot be promoted through staff identity command' using errcode='23514';end if;
 if p.role not in ('client','trainer') then raise exception 'Only an unassigned profile can become a trainer' using errcode='23514';end if;
 perform set_config('ims.owner_profile_mutation','on',true);
 update public.profiles set full_name=btrim(p_full_name),role='trainer',updated_at=clock_timestamp() where id=p_profile_id;
 insert into public.audit_logs(id,actor_id,action,entity_type,entity_id,changes) values(gen_random_uuid(),actor,'staff.profile_promoted','profile',p_profile_id,jsonb_build_object('prior_role',p.role,'prior_name',p.full_name,'new_name',btrim(p_full_name),'email',p.email));
 return jsonb_build_object('ok',true,'profile_id',p_profile_id,'role','trainer');
end $$;
revoke all on function public.promote_existing_profile_to_trainer(uuid,text) from public,anon,authenticated;grant execute on function public.promote_existing_profile_to_trainer(uuid,text) to authenticated;
