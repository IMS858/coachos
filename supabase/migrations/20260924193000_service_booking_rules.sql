-- Booking metadata layered onto the existing service catalog.
alter table public.service_catalog add column if not exists client_bookable boolean not null default false;
alter table public.service_catalog add column if not exists session_type text;
alter table public.service_catalog add column if not exists booking_buffer_before_minutes integer not null default 0 check (booking_buffer_before_minutes between 0 and 180);
alter table public.service_catalog add column if not exists booking_buffer_after_minutes integer not null default 0 check (booking_buffer_after_minutes between 0 and 180);
alter table public.service_catalog add column if not exists minimum_notice_minutes integer not null default 60 check (minimum_notice_minutes between 0 and 10080);
alter table public.service_catalog add column if not exists booking_horizon_days integer not null default 60 check (booking_horizon_days between 1 and 365);

-- Start conservatively: only explicit session services become self-bookable.
update public.service_catalog set
  client_bookable=true,
  session_type='massage'
where active=true and slug in ('massage_30','massage_60','massage_90');
update public.service_catalog set
  client_bookable=true,
  session_type='body_comp'
where active=true and slug='body_comp';
update public.service_catalog set
  client_bookable=true,
  session_type='recovery'
where active=true and slug='compression';

-- Personal training remains available through the legacy 60-minute request path
-- until a duration-bearing catalog item is configured by the owner.
