-- Client-media files are served exclusively by scoped server signing endpoints.
-- A broad legacy staff Storage policy must not bypass assigned-client or exercise approval checks.
-- Do not alter policies for avatars, programme PDFs, intake signatures or other buckets.
create policy client_media_server_only on storage.objects as restrictive for all to anon,authenticated
using (bucket_id is distinct from 'client-media')
with check (bucket_id is distinct from 'client-media');
-- Existing issued URLs remain valid until expiry; this does not revoke bearer URLs.

-- Explicit reuse of approved demonstrations, not publication of a programme prescription.
create or replace function public.assign_client_media_demos(p_client_id uuid,p_exercise_ids uuid[],p_category text,p_note text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid();actor_role text;ids uuid[];exercise uuid;added_ids uuid[]:='{}';new_id uuid;missing_count integer;item public.exercises%rowtype;clean_note text:=nullif(btrim(p_note),'');
begin
 select role::text into actor_role from public.profiles where id=actor and deleted_at is null;
 if actor is null or actor_role is null or actor_role not in ('owner','trainer') then raise exception 'Active staff required' using errcode='42501';end if;
 if p_client_id is null or not public.can_read_client_media(p_client_id,null,null) then raise exception 'Assigned coach or owner required' using errcode='42501';end if;
 if p_exercise_ids is null or cardinality(p_exercise_ids) not between 1 and 30 or array_position(p_exercise_ids,null) is not null
   or p_category is null or p_category not in ('mobility','strength','conditioning','general') or coalesce(char_length(p_note),0)>2000 then raise exception 'Invalid demonstration request' using errcode='22023';end if;
 select array_agg(distinct id order by id) into ids from unnest(p_exercise_ids) id;
 -- Serialize explicit assignments for a client so repeated and concurrent requests cannot create duplicate live assignments.
 perform pg_advisory_xact_lock(hashtextextended('client-media-demos:'||p_client_id::text,0));
 perform e.id from public.exercises e where e.id=any(ids) order by e.id for share;
 perform r.exercise_id from public.exercise_reviews r where r.exercise_id=any(ids) order by r.exercise_id for share;
 select cardinality(ids)-count(*) into missing_count from public.exercises e join public.exercise_reviews r on r.exercise_id=e.id
  where e.id=any(ids) and e.client_visible and r.safety_status='approved' and e.video_url like 'https://%';
 if missing_count<>0 then raise exception 'Every exercise needs approved safety review, client visibility and a playable video' using errcode='22023';end if;
 foreach exercise in array ids loop
  if not exists(select 1 from public.client_media m where m.client_id=p_client_id and m.exercise_id=exercise and m.archived_at is null) then
   select * into item from public.exercises where id=exercise;
   new_id:=gen_random_uuid();
   insert into public.client_media(id,client_id,uploaded_by,kind,category,title,note,exercise_id,storage_path)
    values(new_id,p_client_id,actor,'video',p_category,coalesce(nullif(item.ims_label,''),item.name),clean_note,exercise,null);
   added_ids:=array_append(added_ids,new_id);
  end if;
 end loop;
 if cardinality(added_ids)>0 then
  insert into public.audit_logs(id,actor_id,action,entity_type,entity_id,changes)
   values(gen_random_uuid(),actor,'client_media.demos_assigned','client',p_client_id,jsonb_build_object('media_ids',added_ids,'exercise_ids',ids));
 end if;
 return jsonb_build_object('ok',true,'client_id',p_client_id,'added',cardinality(added_ids),'skipped',cardinality(ids)-cardinality(added_ids),'media_ids',added_ids);
end $$;
revoke all on function public.assign_client_media_demos(uuid,uuid[],text,text) from public,anon,authenticated;
grant execute on function public.assign_client_media_demos(uuid,uuid[],text,text) to authenticated;
