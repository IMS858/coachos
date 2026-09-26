-- Atomic recurring-series creation + first rolling window.
-- Prevents a series row surviving when initial session generation fails.
create or replace function public.create_recurring_series_atomic(
  p_client_id uuid,
  p_trainer_id uuid,
  p_session_type public.session_type,
  p_duration_minutes integer,
  p_location text,
  p_slots jsonb,
  p_start_date date,
  p_created_by uuid,
  p_occurrences jsonb,
  p_generated_until date
) returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare v_series_id uuid;
begin
  if p_duration_minutes <= 0 or p_duration_minutes > 240 then raise exception 'invalid duration'; end if;
  if jsonb_typeof(p_slots) <> 'array' or jsonb_array_length(p_slots) < 1 or jsonb_array_length(p_slots) > 4 then raise exception 'invalid slots'; end if;
  insert into public.recurring_series(client_id,trainer_id,session_type,duration_minutes,location,slots,status,start_date,created_by,generated_until)
  values(p_client_id,p_trainer_id,p_session_type,p_duration_minutes,p_location,p_slots,'active',p_start_date,p_created_by,p_generated_until)
  returning id into v_series_id;
  insert into public.sessions(client_id,trainer_id,scheduled_at,duration_minutes,session_type,location,status,recurring_series_id)
  select p_client_id,p_trainer_id,(x->>'scheduled_at')::timestamptz,p_duration_minutes,p_session_type,p_location,'scheduled',v_series_id
  from jsonb_array_elements(p_occurrences) x;
  return v_series_id;
end $$;
revoke all on function public.create_recurring_series_atomic(uuid,uuid,public.session_type,integer,text,jsonb,date,uuid,jsonb,date) from public, anon, authenticated;
grant execute on function public.create_recurring_series_atomic(uuid,uuid,public.session_type,integer,text,jsonb,date,uuid,jsonb,date) to service_role;
