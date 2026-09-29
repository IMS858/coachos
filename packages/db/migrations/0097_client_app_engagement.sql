-- 0097 — privacy-safe client app engagement and client-profile integration.
-- New events contain only an allowlisted action, an allowlisted product surface,
-- a server-observed client identity, and a timestamp. No URL IDs, free text,
-- message bodies, device identifiers, IP addresses, health data or Google IDs.

alter table public.app_events add column if not exists request_id uuid;
create unique index if not exists app_events_request_once
  on public.app_events(request_id) where request_id is not null;

-- Close the legacy direct-write path. New client events go through the RPC below.
drop policy if exists app_events_insert_self on public.app_events;
drop policy if exists app_events_owner_read on public.app_events;
revoke all on table public.app_events from public,anon,authenticated,service_role;
grant select on table public.app_events to authenticated,service_role;
grant insert on table public.app_events to service_role;
create policy app_events_owner_read on public.app_events for select to authenticated
  using (public.is_owner());

create or replace function public.record_client_app_event(
  p_request uuid,
  p_event text,
  p_surface text
) returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  actor uuid := auth.uid();
  prior public.app_events%rowtype;
  inserted_id bigint;
begin
  if actor is null then
    return jsonb_build_object('ok',true,'request_id',p_request,'recorded',false,'deduped',false);
  end if;
  perform 1 from public.profiles
    where id=actor and role::text='client' and deleted_at is null and coalesce(contact_only,false)=false;
  if not found then
    return jsonb_build_object('ok',true,'request_id',p_request,'recorded',false,'deduped',false);
  end if;
  if p_request is null
     or p_event not in ('view','watch','book','message','complete')
     or p_surface not in ('dashboard','training','fuel','progress','messages','booking','classes','account','other') then
    raise exception 'Invalid client usage event' using errcode='22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('ims-client-usage:'||p_request::text,0));
  select * into prior from public.app_events where request_id=p_request;
  if found then
    if prior.user_id is distinct from actor or prior.event is distinct from p_event or prior.path is distinct from p_surface then
      raise exception 'Usage request identity reused' using errcode='23505';
    end if;
    return jsonb_build_object('ok',true,'request_id',p_request,'recorded',true,'deduped',true);
  end if;

  if (select count(*) from public.app_events
      where user_id=actor and request_id is not null and created_at>now()-interval '1 hour') >= 120 then
    return jsonb_build_object('ok',true,'request_id',p_request,'recorded',false,'deduped',false);
  end if;

  insert into public.app_events(user_id,role,event,path,meta,request_id)
  values(actor,'client',p_event,p_surface,null,p_request)
  returning id into inserted_id;

  return jsonb_build_object('ok',true,'request_id',p_request,'recorded',true,'deduped',false,'id',inserted_id);
end $$;
revoke all on function public.record_client_app_event(uuid,text,text) from public,anon,authenticated,service_role;
grant execute on function public.record_client_app_event(uuid,text,text) to authenticated;

-- Existing rows are retained as historical evidence. The rollup normalizes their
-- old route strings into the same finite surface vocabulary without exposing
-- the original path or metadata.
create or replace view public.client_engagement
with (security_invoker=true)
as
with safe_events as (
  select
    e.user_id,
    e.event,
    e.created_at,
    case
      when e.path in ('dashboard','training','fuel','progress','messages','booking','classes','account','other') then e.path
      when e.path='/dashboard' or e.path like '/dashboard/%' then 'dashboard'
      when e.path like '/plan%' or e.path like '/library%' then 'training'
      when e.path like '/fuel%' then 'fuel'
      when e.path like '/progress%' then 'progress'
      when e.path like '/messages%' then 'messages'
      when e.path like '/book%' or e.path like '/sessions%' then 'booking'
      when e.path like '/classes%' then 'classes'
      when e.path like '/account%' then 'account'
      else 'other'
    end as surface
  from public.app_events e
  where e.role='client'
)
select
  p.id,
  p.full_name,
  p.email,
  max(e.created_at) as last_active_at,
  count(*) filter (where e.created_at>now()-interval '30 days') as events_30d,
  count(*) filter (where e.created_at>now()-interval '7 days') as events_7d,
  count(*) filter (where e.event='watch') as videos_watched,
  (p.auth_user_id is not null) as portal_provisioned,
  count(distinct ((e.created_at at time zone 'America/Los_Angeles')::date))
    filter (where e.created_at>now()-interval '7 days') as active_days_7d,
  count(distinct ((e.created_at at time zone 'America/Los_Angeles')::date))
    filter (where e.created_at>now()-interval '30 days') as active_days_30d,
  count(*) filter (where e.event='view' and e.created_at>now()-interval '30 days') as views_30d,
  count(*) filter (where e.event='watch' and e.created_at>now()-interval '30 days') as videos_watched_30d,
  count(*) filter (where e.event='message' and e.created_at>now()-interval '30 days') as messages_sent_30d,
  count(*) filter (where e.event='book' and e.created_at>now()-interval '30 days') as booking_requests_30d,
  count(*) filter (where e.event='view' and e.surface='training' and e.created_at>now()-interval '30 days') as training_views_30d,
  count(*) filter (where e.event='view' and e.surface='fuel' and e.created_at>now()-interval '30 days') as fuel_views_30d,
  count(*) filter (where e.event='view' and e.surface='progress' and e.created_at>now()-interval '30 days') as progress_views_30d,
  count(*) filter (where e.event='view' and e.surface='messages' and e.created_at>now()-interval '30 days') as message_views_30d,
  count(*) filter (where e.event='view' and e.surface='booking' and e.created_at>now()-interval '30 days') as booking_views_30d,
  count(*) filter (where e.event='view' and e.surface='classes' and e.created_at>now()-interval '30 days') as classes_views_30d
from public.profiles p
left join safe_events e on e.user_id=p.id
where p.role::text='client' and p.deleted_at is null and coalesce(p.contact_only,false)=false
group by p.id,p.full_name,p.email,p.auth_user_id;

revoke all on table public.client_engagement from public,anon,authenticated,service_role;
grant select on table public.client_engagement to service_role;

create or replace function public.get_client_app_engagement(p_client uuid)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  actor uuid := auth.uid();
  viewer_role text;
  portal boolean;
  result jsonb;
begin
  select role::text into viewer_role from public.profiles
    where id=actor and deleted_at is null;
  if viewer_role='owner' then
    null;
  elsif viewer_role='trainer' and exists(
    select 1 from public.clients c where c.id=p_client and c.primary_trainer_id=actor
  ) then
    null;
  else
    raise exception 'Client app engagement not authorized' using errcode='42501';
  end if;

  select (auth_user_id is not null) into portal from public.profiles
    where id=p_client and role::text='client' and deleted_at is null and coalesce(contact_only,false)=false;
  if not found then raise exception 'Client not available' using errcode='22023'; end if;

  with safe as (
    select
      e.event,
      e.created_at,
      case
        when e.path in ('dashboard','training','fuel','progress','messages','booking','classes','account','other') then e.path
        when e.path='/dashboard' or e.path like '/dashboard/%' then 'dashboard'
        when e.path like '/plan%' or e.path like '/library%' then 'training'
        when e.path like '/fuel%' then 'fuel'
        when e.path like '/progress%' then 'progress'
        when e.path like '/messages%' then 'messages'
        when e.path like '/book%' or e.path like '/sessions%' then 'booking'
        when e.path like '/classes%' then 'classes'
        when e.path like '/account%' then 'account'
        else 'other'
      end as surface
    from public.app_events e
    where e.user_id=p_client and e.role='client'
  ), summary as (
    select
      max(created_at) as last_active_at,
      count(*) filter (where created_at>now()-interval '7 days') as events_7d,
      count(*) filter (where created_at>now()-interval '30 days') as events_30d,
      count(distinct ((created_at at time zone 'America/Los_Angeles')::date))
        filter (where created_at>now()-interval '7 days') as active_days_7d,
      count(distinct ((created_at at time zone 'America/Los_Angeles')::date))
        filter (where created_at>now()-interval '30 days') as active_days_30d,
      count(*) filter (where event='watch' and created_at>now()-interval '30 days') as videos_watched_30d,
      count(*) filter (where event='message' and created_at>now()-interval '30 days') as messages_sent_30d,
      count(*) filter (where event='book' and created_at>now()-interval '30 days') as booking_requests_30d,
      count(*) filter (where event='view' and surface='dashboard' and created_at>now()-interval '30 days') as dashboard_views_30d,
      count(*) filter (where event='view' and surface='training' and created_at>now()-interval '30 days') as training_views_30d,
      count(*) filter (where event='view' and surface='fuel' and created_at>now()-interval '30 days') as fuel_views_30d,
      count(*) filter (where event='view' and surface='progress' and created_at>now()-interval '30 days') as progress_views_30d,
      count(*) filter (where event='view' and surface='messages' and created_at>now()-interval '30 days') as message_views_30d,
      count(*) filter (where event='view' and surface='booking' and created_at>now()-interval '30 days') as booking_views_30d,
      count(*) filter (where event='view' and surface='classes' and created_at>now()-interval '30 days') as classes_views_30d
    from safe
  )
  select jsonb_build_object(
    'client_id',p_client,
    'portal_provisioned',portal,
    'last_active_at',s.last_active_at,
    'events_7d',s.events_7d,
    'events_30d',s.events_30d,
    'active_days_7d',s.active_days_7d,
    'active_days_30d',s.active_days_30d,
    'actions_30d',jsonb_build_object(
      'videos_watched',s.videos_watched_30d,
      'messages_sent',s.messages_sent_30d,
      'booking_requests',s.booking_requests_30d
    ),
    'surfaces_30d',jsonb_build_object(
      'dashboard',s.dashboard_views_30d,
      'training',s.training_views_30d,
      'fuel',s.fuel_views_30d,
      'progress',s.progress_views_30d,
      'messages',s.message_views_30d,
      'booking',s.booking_views_30d,
      'classes',s.classes_views_30d
    ),
    'recent',coalesce((
      select jsonb_agg(jsonb_build_object('event',r.event,'surface',r.surface,'created_at',r.created_at) order by r.created_at desc)
      from (select event,surface,created_at from safe order by created_at desc limit 8) r
    ),'[]'::jsonb)
  ) into result
  from summary s;
  return result;
end $$;
revoke all on function public.get_client_app_engagement(uuid) from public,anon,authenticated,service_role;
grant execute on function public.get_client_app_engagement(uuid) to authenticated;
