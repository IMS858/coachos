-- Atomic class attendance command for launch preparation.
create or replace function public.mark_class_attendance(p_enrollment_id uuid,p_status text,p_expected_updated_at timestamptz) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=auth.uid();v_role text;v_row public.class_enrollments;v_occ public.class_occurrences;
begin
 select role into v_role from public.profiles where id=v_actor and deleted_at is null;
 if v_role not in ('owner','trainer') then raise exception 'Staff authorization required' using errcode='42501';end if;
 if p_status not in ('attended','no_show') then raise exception 'Invalid attendance status';end if;
 select * into v_row from public.class_enrollments where id=p_enrollment_id for update;
 if not found then raise exception 'Enrollment not found' using errcode='P0002';end if;
 select * into v_occ from public.class_occurrences where id=v_row.occurrence_id;
 if not found or v_occ.status='cancelled' or v_occ.starts_at>now() then raise exception 'Class has not occurred' using errcode='23514';end if;
 if v_role='trainer' and v_occ.trainer_id<>v_actor then raise exception 'Assigned coach required' using errcode='42501';end if;
 if v_row.updated_at is distinct from p_expected_updated_at then raise exception 'Attendance changed elsewhere' using errcode='40001';end if;
 if v_row.status not in ('booked','attended','no_show') then raise exception 'Enrollment is not attendance eligible' using errcode='23514';end if;
 update public.class_enrollments set status=p_status,attendance_marked_at=clock_timestamp(),attendance_marked_by=v_actor,updated_at=clock_timestamp() where id=v_row.id returning * into v_row;
 insert into public.audit_logs(id,actor_id,action,entity_type,entity_id,changes) values(gen_random_uuid(),v_actor,'class.attendance_marked','class_enrollment',v_row.id,jsonb_build_object('status',p_status,'occurrence_id',v_row.occurrence_id));
 return jsonb_build_object('ok',true,'id',v_row.id,'status',v_row.status,'updated_at',v_row.updated_at);
end $$;
revoke all on function public.mark_class_attendance(uuid,text,timestamptz) from public,anon;
-- Prelaunch: do not grant execute to authenticated yet. Launch review must verify the audit_log schema and exact transaction on hosted PostgreSQL.
