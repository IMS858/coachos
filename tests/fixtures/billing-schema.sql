-- Synthetic minimal schema matching the inspected production column/enum contract.
create role anon;
create role authenticated;
create role service_role bypassrls;
create schema auth;
create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
create table auth.users(id uuid primary key);
create type public.service_type as enum('training','massage','pilates','recovery','body_comp');
create type public.plan_kind as enum('subscription','package');
create type public.plan_tier as enum('essentials_2x','standard_3x','premium_4x','recovery_monthly','custom','package_6','package_12','package_24','package_custom');
create type public.payment_status as enum('pending','succeeded','failed','refunded');
create type public.billing_type as enum('unset','membership','package');
create type public.session_type as enum('assessment','training','mobility','pilates','recovery','body_comp','massage');
create type public.session_status as enum('requested','scheduled','confirmed','completed','cancelled','late_cancelled','no_show');
create table public.profiles(id uuid primary key,role text,deleted_at timestamptz);
create function public.is_trainer() returns boolean language sql stable as $$select exists(select 1 from public.profiles where id=auth.uid() and role in ('owner','trainer') and deleted_at is null)$$;
create table public.clients(id uuid primary key,stripe_customer_id text,billing_type public.billing_type default 'unset',status text,joined_at timestamptz);
create table public.plans(id uuid primary key default gen_random_uuid(),client_id uuid references public.clients not null,
 kind public.plan_kind,tier public.plan_tier,service_type public.service_type,status text default 'active',
 current_session_number integer,total_sessions integer,sessions_used integer default 0,monthly_rate_cents integer,
 sessions_per_week integer,package_total_cents integer,start_date date,end_date date,expires_at date,stripe_subscription_id text,
 created_at timestamptz default now(),updated_at timestamptz default now(),
 constraint plan_consistency check((kind='subscription' and monthly_rate_cents is not null) or (kind='package' and total_sessions is not null and service_type is not null)));
create table public.sessions(id uuid primary key,client_id uuid references public.clients,status public.session_status default 'scheduled',
 cancelled_at timestamptz,cancelled_by uuid,cancellation_reason text,late_cancel_fee_charged boolean default false,service_type public.service_type,plan_id uuid references public.plans,completed_at timestamptz,completed_by uuid,
 session_type public.session_type,notes_pre text,notes_post text,trainer_id uuid,scheduled_at timestamptz,duration_minutes integer default 60,room_id uuid);
create table public.payments(id uuid primary key default gen_random_uuid(),client_id uuid not null references public.clients,
 plan_id uuid references public.plans,amount_cents integer not null,currency text not null,status public.payment_status,
 source text,source_id text,description text,paid_at timestamptz);
create table public.stripe_events(id text primary key,type text not null,data jsonb not null,processed_at timestamptz,processing_error text,created_at timestamptz default now());
grant usage on schema public,auth to anon,authenticated,service_role;
grant select on public.profiles to authenticated,service_role;
grant all on public.clients,public.plans,public.sessions,public.payments,public.stripe_events to service_role;
grant select,insert,update on public.clients,public.plans,public.sessions to authenticated;
alter table public.plans enable row level security;
alter table public.sessions enable row level security;
create policy staff_plan on public.plans for all to authenticated using(public.is_trainer()) with check(public.is_trainer());
create policy staff_session on public.sessions for all to authenticated using(public.is_trainer()) with check(public.is_trainer());
