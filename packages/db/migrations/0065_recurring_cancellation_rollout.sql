-- Atomic standing-series cancellation: preserve history and cancel future scheduled occurrences together.
create or replace function public.cancel_recurring_series(p_series_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid();role_name text;series public.recurring_series%rowtype;cancelled_count integer;
begin
 select role::text into role_name from public.profiles where id=actor and deleted_at is null;
 if role_name not in ('owner','trainer') then raise exception 'Staff authorization required' using errcode='42501';end if;
 select * into series from public.recurring_series where id=p_series_id for update;if not found then raise exception 'Standing booking not found' using errcode='P0002';end if;
 if role_name='trainer' and series.trainer_id<>actor then raise exception 'Assigned coach or owner required' using errcode='42501';end if;
 if series.status='cancelled' then return jsonb_build_object('ok',true,'deduped',true,'cancelled_sessions',0);end if;
 update public.sessions set status='cancelled',cancelled_at=clock_timestamp(),cancelled_by=actor,cancellation_reason='standing_series_cancelled'
 where recurring_series_id=p_series_id and scheduled_at>now() and status='scheduled';get diagnostics cancelled_count=row_count;
 update public.recurring_series set status='cancelled',updated_at=clock_timestamp() where id=p_series_id;
 insert into public.audit_logs(id,actor_id,action,entity_type,entity_id,changes) values(gen_random_uuid(),actor,'recurring_series.cancelled','recurring_series',p_series_id,jsonb_build_object('future_sessions_cancelled',cancelled_count));
 return jsonb_build_object('ok',true,'deduped',false,'cancelled_sessions',cancelled_count);
end $$;
revoke all on function public.cancel_recurring_series(uuid) from public,anon,authenticated;grant execute on function public.cancel_recurring_series(uuid) to authenticated;
