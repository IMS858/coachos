-- Apply only after 0066, in staging before hosted rollout. No messages or payments are sent.
-- Client-facing feedback is finalized atomically with its audit record.
create or replace function public.can_read_client_media(p_client_id uuid,p_exercise_id uuid,p_archived_at timestamptz)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(
  select 1 from public.profiles viewer join public.clients c on c.id=p_client_id
  join public.profiles client on client.id=c.id and client.role='client' and client.deleted_at is null
  where viewer.id=auth.uid() and viewer.deleted_at is null and (
   viewer.role='owner' or (viewer.role='trainer' and c.primary_trainer_id=viewer.id)
   or (viewer.role='client' and c.id=viewer.id and p_archived_at is null and (
    p_exercise_id is null or exists(select 1 from public.exercises e join public.exercise_reviews r on r.exercise_id=e.id
      where e.id=p_exercise_id and e.client_visible and r.safety_status='approved')
   ))
  )
 );
$$;
revoke all on function public.can_read_client_media(uuid,uuid,timestamptz) from public,anon,authenticated;
grant execute on function public.can_read_client_media(uuid,uuid,timestamptz) to authenticated;
alter table public.client_media enable row level security;
revoke all on public.client_media from public,anon,authenticated;
grant select on public.client_media to authenticated;
drop policy if exists clients_read_own_media on public.client_media;
drop policy if exists staff_insert_media on public.client_media;
drop policy if exists staff_read_media on public.client_media;
create policy media_scoped_read on public.client_media for select to authenticated using(
 public.can_read_client_media(client_id,exercise_id,archived_at)
);
-- Restrictive guard prevents any older permissive SELECT policy from broadening access.
create policy media_active_scope_guard on public.client_media as restrictive for select to authenticated using(
 public.can_read_client_media(client_id,exercise_id,archived_at)
);

create or replace function public.protect_client_media_feedback() returns trigger
language plpgsql set search_path='' as $$
begin
 if tg_op='INSERT' then
  if new.coach_feedback is not null or new.reviewed_at is not null or new.reviewed_by is not null or new.review_status='reviewed' then
   raise exception 'New media cannot fabricate a completed review' using errcode='22023';
  end if;
  new.review_status:=case when new.uploaded_by=new.client_id and new.storage_path like new.client_id::text||'/from-client-%'
    then 'awaiting_review' else 'not_required' end;
  return new;
 end if;
 if row(new.client_id,new.uploaded_by,new.storage_path,new.exercise_id) is distinct from row(old.client_id,old.uploaded_by,old.storage_path,old.exercise_id) then
  raise exception 'Coaching media identity is immutable' using errcode='42501';
 end if;
 if row(new.review_status,new.coach_feedback,new.reviewed_at,new.reviewed_by) is distinct from row(old.review_status,old.coach_feedback,old.reviewed_at,old.reviewed_by) then
  if old.review_status<>'awaiting_review' or new.review_status<>'reviewed' or old.archived_at is not null
     or old.uploaded_by is distinct from old.client_id or old.storage_path is null or old.storage_path not like old.client_id::text||'/from-client-%'
     or new.reviewed_by is distinct from auth.uid() or new.reviewed_at is null
     or new.coach_feedback is null or char_length(btrim(new.coach_feedback)) not between 2 and 2000
     or not exists(select 1 from public.profiles p join public.clients c on c.id=old.client_id
       where p.id=auth.uid() and p.deleted_at is null and (p.role='owner' or (p.role='trainer' and c.primary_trainer_id=p.id))) then
   raise exception 'Review is finalized or this coach is not authorized' using errcode='42501';
  end if;
 end if;
 return new;
end $$;
revoke all on function public.protect_client_media_feedback() from public,anon,authenticated;
create trigger protect_client_media_feedback before insert or update on public.client_media
for each row execute function public.protect_client_media_feedback();

create or replace function public.finalize_client_media_review(p_media_id uuid,p_feedback text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); actor_role text; m public.client_media%rowtype; feedback text:=btrim(p_feedback);
begin
 select role::text into actor_role from public.profiles where id=actor and deleted_at is null;
 if actor is null or actor_role is null or actor_role not in ('owner','trainer') then raise exception 'Active staff required' using errcode='42501';end if;
 if p_media_id is null or feedback is null or char_length(feedback) not between 2 and 2000 then raise exception 'Feedback must be 2–2,000 characters' using errcode='22023';end if;
 select * into m from public.client_media where id=p_media_id for update;
 if not found then raise exception 'Media not found' using errcode='P0002';end if;
 if not public.can_read_client_media(m.client_id,m.exercise_id,m.archived_at) then raise exception 'Assigned coach or owner required' using errcode='42501';end if;
 if m.archived_at is not null or m.uploaded_by is distinct from m.client_id or m.storage_path is null or m.storage_path not like m.client_id::text||'/from-client-%' then
  raise exception 'Active client submission required' using errcode='22023';
 end if;
 if m.review_status='reviewed' then
  if m.coach_feedback=feedback and m.reviewed_by=actor then return jsonb_build_object('ok',true,'id',m.id,'review_status','reviewed','reviewed_at',m.reviewed_at,'deduped',true);end if;
  raise exception 'Review already finalized; send a follow-up instead of rewriting history' using errcode='22023';
 end if;
 if m.review_status<>'awaiting_review' then raise exception 'Submission is not awaiting review' using errcode='22023';end if;
 update public.client_media set review_status='reviewed',coach_feedback=feedback,reviewed_by=actor,reviewed_at=clock_timestamp() where id=m.id returning * into m;
 insert into public.audit_logs(id,actor_id,action,entity_type,entity_id,changes)
 values(gen_random_uuid(),actor,'client_media.reviewed','client_media',m.id,jsonb_build_object('client_id',m.client_id,'reviewed_at',m.reviewed_at));
 return jsonb_build_object('ok',true,'id',m.id,'review_status','reviewed','reviewed_at',m.reviewed_at,'deduped',false);
end $$;
revoke all on function public.finalize_client_media_review(uuid,text) from public,anon,authenticated;
grant execute on function public.finalize_client_media_review(uuid,text) to authenticated;

create or replace function public.archive_client_media(p_media_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); actor_role text; m public.client_media%rowtype;
begin
 select role::text into actor_role from public.profiles where id=actor and deleted_at is null;
 if actor is null or actor_role is null or actor_role not in ('owner','trainer') then raise exception 'Active staff required' using errcode='42501';end if;
 select * into m from public.client_media where id=p_media_id for update;
 if not found then raise exception 'Media not found' using errcode='P0002';end if;
 if not public.can_read_client_media(m.client_id,m.exercise_id,m.archived_at) then raise exception 'Assigned coach or owner required' using errcode='42501';end if;
 if m.archived_at is not null then return jsonb_build_object('ok',true,'id',m.id,'archived_at',m.archived_at,'deduped',true);end if;
 update public.client_media set archived_at=clock_timestamp() where id=m.id returning * into m;
 insert into public.audit_logs(id,actor_id,action,entity_type,entity_id,changes)
 values(gen_random_uuid(),actor,'client_media.archived','client_media',m.id,jsonb_build_object('client_id',m.client_id));
 return jsonb_build_object('ok',true,'id',m.id,'archived_at',m.archived_at,'deduped',false);
end $$;
revoke all on function public.archive_client_media(uuid) from public,anon,authenticated;
grant execute on function public.archive_client_media(uuid) to authenticated;
