-- Service-only outbox, immutable retry payload and a short processing lease.
create table if not exists public.notification_deliveries (
 id uuid primary key default gen_random_uuid(),dedupe_key text not null unique,
 recipient_id uuid not null references auth.users(id) on delete cascade,channel text not null default 'email',
 template text not null,status text not null default 'pending' check(status in ('pending','sent','failed')),
 provider_id text,attempted_at timestamptz not null default now(),sent_at timestamptz,error text
);
alter table public.notification_deliveries enable row level security;
revoke all on public.notification_deliveries from anon,authenticated;
grant all on public.notification_deliveries to service_role;
alter table public.notification_deliveries add column if not exists claim_token uuid;
alter table public.notification_deliveries add column if not exists attempts integer not null default 0;
alter table public.notification_deliveries add column if not exists first_attempted_at timestamptz;
alter table public.notification_deliveries add column if not exists payload jsonb;
create or replace function public.claim_notification(p_key text,p_recipient uuid,p_template text,p_payload jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare delivery public.notification_deliveries%rowtype; token uuid:=gen_random_uuid();
begin
 if current_user<>'service_role' then raise exception 'Service role required' using errcode='42501';end if;
 insert into public.notification_deliveries(dedupe_key,recipient_id,template,status,payload)
 values(p_key,p_recipient,p_template,'pending',p_payload) on conflict(dedupe_key) do nothing;
 select * into delivery from public.notification_deliveries where dedupe_key=p_key for update;
 if delivery.status='sent' then return null;end if;
 if delivery.recipient_id<>p_recipient then raise exception 'Recipient mismatch';end if;
 if delivery.claim_token is not null and delivery.status='pending' and delivery.attempted_at>now()-interval '5 minutes' then return null;end if;
 -- Resend keys expire after 24h. Ambiguous old deliveries require reconciliation,
 -- not an automatic resend that could duplicate an already accepted message.
 if coalesce(delivery.first_attempted_at,delivery.attempted_at)<now()-interval '23 hours' then
   update public.notification_deliveries set error='Manual review required: delivery retry window expired' where id=delivery.id;
   return null;
 end if;
 update public.notification_deliveries set claim_token=token,status='pending',attempts=attempts+1,
   attempted_at=now(),first_attempted_at=coalesce(first_attempted_at,now()),payload=coalesce(payload,p_payload)
 where id=delivery.id returning * into delivery;
 return jsonb_build_object('token',token,'payload',delivery.payload);
end $$;
create or replace function public.finish_notification(p_key text,p_token uuid,p_provider text,p_error text)
returns boolean language plpgsql security invoker set search_path='' as $$
begin
 if current_user<>'service_role' then raise exception 'Service role required' using errcode='42501';end if;
 update public.notification_deliveries set status=case when p_error is null then 'sent' else 'failed' end,
   provider_id=p_provider,error=left(p_error,500),sent_at=case when p_error is null then now() else null end
 where dedupe_key=p_key and claim_token=p_token and status='pending';
 return found;
end $$;
revoke all on function public.claim_notification(text,uuid,text,jsonb) from public,anon,authenticated;
revoke all on function public.finish_notification(text,uuid,text,text) from public,anon,authenticated;
grant execute on function public.claim_notification(text,uuid,text,jsonb) to service_role;
grant execute on function public.finish_notification(text,uuid,text,text) to service_role;
