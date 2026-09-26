-- Atomic class attendance command for launch preparation only.
-- Default privileges may grant execute independently of PUBLIC: explicitly revoke all app roles.
create or replace function public.mark_class_attendance(p_enrollment_id uuid,p_status text,p_expected_updated_at timestamptz) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
 v_actor uuid:=auth.uid();v_role text;v_occurrence_id uuid;
 v_row public.class_enrollments;v_before public.class_enrollments;v_occ public.class_occurrences;
begin
 select role::text into v_role from public.profiles where id=v_actor and deleted_at is null;
 if v_actor is null or v_role is null or v_role not in ('owner','trainer') then raise exception 'Staff authorization required' using errcode='42501';end if;
 if p_status is null or p_status not in ('attended','no_show') then raise exception 'Invalid attendance status' using errcode='22023';end if;
 select occurrence_id into v_occurrence_id from public.class_enrollments where id=p_enrollment_id;
 if not found then raise exception 'Enrollment not found' using errcode='P0002';end if;
 -- Class first, enrollment second: the future booking/cancellation path must share this lock order.
 select * into v_occ from public.class_occurrences where id=v_occurrence_id for update;
 if not found or v_occ.status not in ('scheduled','completed') or v_occ.starts_at>now() then raise exception 'Class has not occurred' using errcode='23514';end if;
 if v_role='trainer' and v_occ.trainer_id is distinct from v_actor then raise exception 'Assigned coach required' using errcode='42501';end if;
 select * into v_before from public.class_enrollments where id=p_enrollment_id and occurrence_id=v_occ.id for update;
 if not found then raise exception 'Enrollment changed elsewhere' using errcode='40001';end if;
 if not exists(select 1 from public.profiles p join public.clients c on c.id=p.id where c.id=v_before.client_id and p.role='client' and p.deleted_at is null) then raise exception 'Active client required' using errcode='42501';end if;
 -- A lost-response retry acknowledges existing evidence without a second audit entry.
 if v_before.status=p_status and v_before.attendance_marked_at is not null and v_before.attendance_marked_by is not null then
  return jsonb_build_object('ok',true,'id',v_before.id,'status',v_before.status,'updated_at',v_before.updated_at,'deduped',true);
 end if;
 if v_before.updated_at is distinct from p_expected_updated_at then raise exception 'Attendance changed elsewhere' using errcode='40001';end if;
 if v_before.status in ('attended','no_show') then raise exception 'Attendance corrections require a reasoned correction workflow' using errcode='23514';end if;
 if v_before.status<>'booked' then raise exception 'Enrollment is not attendance eligible' using errcode='23514';end if;
 update public.class_enrollments set status=p_status,attendance_marked_at=clock_timestamp(),attendance_marked_by=v_actor,updated_at=clock_timestamp() where id=v_before.id returning * into v_row;
 insert into public.audit_logs(id,actor_id,action,entity_type,entity_id,changes) values(gen_random_uuid(),v_actor,'class.attendance_marked','class_enrollment',v_row.id,jsonb_build_object('before',to_jsonb(v_before),'after',to_jsonb(v_row),'occurrence_id',v_occ.id));
 return jsonb_build_object('ok',true,'id',v_row.id,'status',v_row.status,'updated_at',v_row.updated_at,'deduped',false);
end $$;
revoke all on function public.mark_class_attendance(uuid,text,timestamptz) from public,anon,authenticated;
-- Prelaunch: do not grant execute to authenticated yet. The API and final owner launch approval remain separate.
