-- Group-class foundation. Classes are training/coaching products, not massage services.
-- Templates are private until explicitly published; occurrences carry the operational schedule.
create table if not exists public.class_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 120),
  description text not null default '' check (char_length(description)<=2000),
  category text not null check (category in ('mobility','strength','pilates','kinstretch','conditioning','other')),
  duration_minutes integer not null check (duration_minutes between 15 and 180),
  capacity integer not null check (capacity between 1 and 100),
  location text,
  visibility text not null default 'private' check (visibility in ('private','published','retired')),
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.class_occurrences (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.class_templates(id) on delete restrict,
  trainer_id uuid not null references public.profiles(id),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  capacity integer not null check (capacity between 1 and 100),
  status text not null default 'scheduled' check (status in ('scheduled','cancelled','completed')),
  location text,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (starts_at<ends_at),
  unique(template_id,trainer_id,starts_at)
);
create index if not exists class_occurrences_schedule on public.class_occurrences(starts_at,trainer_id);
create table if not exists public.class_enrollments (
  id uuid primary key default gen_random_uuid(),
  occurrence_id uuid not null references public.class_occurrences(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  status text not null default 'booked' check (status in ('booked','waitlisted','cancelled','attended','no_show')),
  booked_at timestamptz not null default now(),
  cancelled_at timestamptz,
  attendance_marked_at timestamptz,
  attendance_marked_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(occurrence_id,client_id)
);
create index if not exists class_enrollments_client on public.class_enrollments(client_id,created_at desc);

alter table public.class_templates enable row level security;
alter table public.class_occurrences enable row level security;
alter table public.class_enrollments enable row level security;
revoke all on public.class_templates,public.class_occurrences,public.class_enrollments from anon,authenticated;
grant select,insert,update on public.class_templates,public.class_occurrences,public.class_enrollments to authenticated;

create policy "staff manages class templates" on public.class_templates for all to authenticated
using (exists(select 1 from public.profiles me where me.id=auth.uid() and me.deleted_at is null and me.role in ('owner','trainer')))
with check (exists(select 1 from public.profiles me where me.id=auth.uid() and me.deleted_at is null and me.role in ('owner','trainer')));
create policy "clients read published class templates" on public.class_templates for select to authenticated
using (visibility='published' and exists(select 1 from public.profiles me where me.id=auth.uid() and me.deleted_at is null and me.role='client'));

create policy "staff manages class occurrences" on public.class_occurrences for all to authenticated
using (exists(select 1 from public.profiles me where me.id=auth.uid() and me.deleted_at is null and me.role in ('owner','trainer')))
with check (exists(select 1 from public.profiles me where me.id=auth.uid() and me.deleted_at is null and me.role in ('owner','trainer')));
create policy "clients read published class occurrences" on public.class_occurrences for select to authenticated
using (status='scheduled' and exists(select 1 from public.class_templates t where t.id=template_id and t.visibility='published') and exists(select 1 from public.profiles me where me.id=auth.uid() and me.deleted_at is null and me.role='client'));

create policy "staff manages class enrollments" on public.class_enrollments for all to authenticated
using (exists(select 1 from public.profiles me where me.id=auth.uid() and me.deleted_at is null and me.role in ('owner','trainer')))
with check (exists(select 1 from public.profiles me where me.id=auth.uid() and me.deleted_at is null and me.role in ('owner','trainer')));
create policy "clients read own class enrollments" on public.class_enrollments for select to authenticated using(client_id=auth.uid());
create policy "clients create own published class enrollment" on public.class_enrollments for insert to authenticated
with check(client_id=auth.uid() and status in ('booked','waitlisted') and exists(select 1 from public.class_occurrences o join public.class_templates t on t.id=o.template_id where o.id=occurrence_id and o.status='scheduled' and o.starts_at>now() and t.visibility='published'));

-- Capacity-safe enrollment command. It decides booked vs waitlisted inside the database.
create or replace function public.book_class(p_occurrence_id uuid,p_request_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_user uuid:=auth.uid();v_capacity int;v_count int;v_status text;v_existing public.class_enrollments;
begin
 if v_user is null then raise exception 'Authentication required' using errcode='42501'; end if;
 if not exists(select 1 from public.profiles p where p.id=v_user and p.role='client' and p.deleted_at is null) then raise exception 'Client account required' using errcode='42501'; end if;
 select o.capacity into v_capacity from public.class_occurrences o join public.class_templates t on t.id=o.template_id where o.id=p_occurrence_id and o.status='scheduled' and o.starts_at>now() and t.visibility='published' for update of o;
 if v_capacity is null then raise exception 'Class is unavailable' using errcode='P0002'; end if;
 select * into v_existing from public.class_enrollments where occurrence_id=p_occurrence_id and client_id=v_user;
 if found and v_existing.status in ('booked','waitlisted') then return jsonb_build_object('ok',true,'id',v_existing.id,'status',v_existing.status,'deduped',true); end if;
 select count(*) into v_count from public.class_enrollments where occurrence_id=p_occurrence_id and status='booked';
 v_status:=case when v_count<v_capacity then 'booked' else 'waitlisted' end;
 if v_existing.id is not null then
   update public.class_enrollments set id=p_request_id,status=v_status,booked_at=clock_timestamp(),cancelled_at=null,updated_at=clock_timestamp() where occurrence_id=p_occurrence_id and client_id=v_user returning * into v_existing;
 else
   insert into public.class_enrollments(id,occurrence_id,client_id,status) values(p_request_id,p_occurrence_id,v_user,v_status) returning * into v_existing;
 end if;
 return jsonb_build_object('ok',true,'id',v_existing.id,'status',v_existing.status,'deduped',false);
end $$;
revoke all on function public.book_class(uuid,uuid) from public,anon;
grant execute on function public.book_class(uuid,uuid) to authenticated;

create or replace function public.cancel_class_booking(p_enrollment_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_user uuid:=auth.uid();v_row public.class_enrollments;v_promote uuid;
begin
 select * into v_row from public.class_enrollments where id=p_enrollment_id and client_id=v_user for update;
 if not found then raise exception 'Enrollment not found' using errcode='P0002'; end if;
 if v_row.status not in ('booked','waitlisted') then return jsonb_build_object('ok',true,'status',v_row.status,'deduped',true); end if;
 update public.class_enrollments set status='cancelled',cancelled_at=clock_timestamp(),updated_at=clock_timestamp() where id=v_row.id;
 if v_row.status='booked' then
   select id into v_promote from public.class_enrollments where occurrence_id=v_row.occurrence_id and status='waitlisted' order by booked_at,id limit 1 for update skip locked;
   if v_promote is not null then update public.class_enrollments set status='booked',updated_at=clock_timestamp() where id=v_promote; end if;
 end if;
 return jsonb_build_object('ok',true,'status','cancelled','promoted_enrollment_id',v_promote);
end $$;
revoke all on function public.cancel_class_booking(uuid) from public,anon;
grant execute on function public.cancel_class_booking(uuid) to authenticated;
