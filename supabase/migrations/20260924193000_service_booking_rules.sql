-- Booking metadata layered onto the existing service catalog.
alter table public.service_catalog add column if not exists client_bookable boolean not null default false;
alter table public.service_catalog add column if not exists session_type text;
alter table public.service_catalog add column if not exists booking_buffer_before_minutes integer not null default 0 check (booking_buffer_before_minutes between 0 and 180);
alter table public.service_catalog add column if not exists booking_buffer_after_minutes integer not null default 0 check (booking_buffer_after_minutes between 0 and 180);
alter table public.service_catalog add column if not exists minimum_notice_minutes integer not null default 60 check (minimum_notice_minutes between 0 and 10080);
alter table public.service_catalog add column if not exists booking_horizon_days integer not null default 60 check (booking_horizon_days between 1 and 365);

-- IMS client self-booking is training-only for this release.
update public.service_catalog set client_bookable=false where client_bookable is distinct from false;
update public.service_catalog set
  client_bookable=true,
  session_type='training',
  duration_minutes=coalesce(duration_minutes,60)
where active=true and slug='facility_training';
