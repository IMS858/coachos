-- Explicit class-instructor compensation rules. Never derive compensation from class price or access product.
create table if not exists public.class_compensation_rules (
 id uuid primary key default gen_random_uuid(),
 trainer_id uuid not null references public.profiles(id),
 template_id uuid references public.class_templates(id) on delete cascade,
 compensation_type text not null check(compensation_type in ('flat_class','hourly','per_attendee','custom')),
 base_rate numeric(10,2) check(base_rate is null or base_rate>=0),
 per_attendee_rate numeric(10,2) check(per_attendee_rate is null or per_attendee_rate>=0),
 effective_on date not null,
 active boolean not null default true,
 notes text not null default '' check(char_length(notes)<=1000),
 created_by uuid not null references public.profiles(id),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
alter table public.class_compensation_rules enable row level security;revoke all on public.class_compensation_rules from anon,authenticated;grant select on public.class_compensation_rules to authenticated;
create policy "owner reads class compensation rules" on public.class_compensation_rules for select to authenticated using(exists(select 1 from public.profiles me where me.id=auth.uid() and me.role='owner' and me.deleted_at is null));
-- Calculation/submission is intentionally absent. Class compensation requires explicit owner configuration and future payroll review evidence.
