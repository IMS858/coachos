-- Additive owner-only growth control plane. No external execution or provider writes.
-- Research remains in leads(source=agent_research); approval never rewrites that source.
create table public.growth_campaigns (
  id uuid primary key,
  name text not null check (char_length(name) between 2 and 160),
  channel text not null check (channel in ('local_search','referral_partnerships','community','workplace','client_referrals')),
  audience text not null check (audience in ('general_population','private_coaching','both')),
  area text not null check (char_length(area) between 2 and 160),
  offer text not null check (char_length(offer) between 10 and 1000),
  budget_cents integer check (budget_cents between 0 and 10000000),
  status text not null default 'draft' check (status in ('draft','tracking','paused')),
  created_by uuid not null references public.profiles(id),
  updated_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.growth_opportunity_reviews (
  candidate_id uuid primary key references public.leads(id),
  campaign_id uuid references public.growth_campaigns(id),
  decision text not null check (decision in ('approve','hold','dismiss')),
  rationale text not null check (char_length(rationale) between 10 and 2000),
  next_action text not null default '' check (char_length(next_action) <= 500),
  due_on date,
  outreach_draft text not null default '' check (char_length(outreach_draft) <= 5000),
  source_updated_at timestamptz not null,
  reviewed_by uuid not null references public.profiles(id),
  updated_at timestamptz not null default now(),
  check (decision <> 'approve' or (char_length(next_action) >= 5 and due_on is not null))
);
create table public.growth_spend (
  id uuid primary key,
  campaign_id uuid not null references public.growth_campaigns(id),
  amount_cents integer not null check (amount_cents between 1 and 10000000),
  category text not null check (category in ('research','advertising','creative','other')),
  incurred_on date not null check (incurred_on <= current_date),
  evidence_reference text not null check (char_length(evidence_reference) between 5 and 500),
  recorded_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  voided_at timestamptz
);
create table public.growth_attributions (
  lead_id uuid primary key references public.leads(id),
  campaign_id uuid not null references public.growth_campaigns(id),
  candidate_id uuid references public.leads(id),
  evidence text not null check (char_length(evidence) between 10 and 2000),
  client_id uuid references public.clients(id),
  revenue_from date,
  recorded_by uuid not null references public.profiles(id),
  updated_at timestamptz not null default now(),
  check ((client_id is null and revenue_from is null) or (client_id is not null and revenue_from is not null and revenue_from <= current_date))
);
create unique index growth_one_acquisition_per_client on public.growth_attributions(client_id) where client_id is not null;
create index growth_reviews_campaign on public.growth_opportunity_reviews(campaign_id);
create index growth_reviews_due on public.growth_opportunity_reviews(due_on) where decision <> 'dismiss';
create index growth_spend_campaign on public.growth_spend(campaign_id);
create index growth_attributions_campaign on public.growth_attributions(campaign_id);
-- Immutable command ledger provides idempotency and a portable history even if a source changes.
create table public.growth_actions (
  id uuid primary key, actor_id uuid not null references public.profiles(id),
  command jsonb not null, result jsonb not null, created_at timestamptz not null default now()
);

do $$
declare t text;
begin
  foreach t in array array['growth_campaigns','growth_opportunity_reviews','growth_spend','growth_attributions','growth_actions'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on public.%I from anon, authenticated',t);
    execute format('grant select on public.%I to authenticated',t);
    execute format('create policy growth_owner_read on public.%I for select to authenticated using (exists(select 1 from public.profiles p where p.id=auth.uid() and p.role=''owner'' and p.deleted_at is null))',t);
  end loop;
end $$;

create function public.growth_is_inquiry(p_source text, p_notes text) returns boolean
language plpgsql immutable set search_path = '' as $$
declare line text; payload text; item jsonb;
begin
  if p_source='agent_research' then return false; end if;
  if p_source=any(array['website_contact','manual','referral','consultation','event_inquiry']) then return true; end if;
  foreach line in array string_to_array(coalesce(p_notes,''),E'\n') loop
    payload := substring(line from '^\[Website enquiry:[A-Za-z0-9_-]+\] (.+)$');
    if payload is not null then
      begin
        item := payload::jsonb;
        if jsonb_typeof(item->'message')='string' and length(btrim(item->>'message'))>0 then return true; end if;
      exception when invalid_text_representation then null;
      end;
    end if;
  end loop;
  return false;
end $$;
revoke all on function public.growth_is_inquiry(text,text) from public,anon,authenticated;

create function public.execute_growth_command(p_command jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid(); request_id uuid; action text; allowed text[]; entity_id uuid;
  stamp timestamptz := clock_timestamp(); result jsonb; notes_json jsonb;
  logged public.growth_actions%rowtype; campaign public.growth_campaigns%rowtype;
  review public.growth_opportunity_reviews%rowtype; attribution public.growth_attributions%rowtype;
  source public.leads%rowtype; candidate public.leads%rowtype;
  client_id uuid; revenue_from date;
begin
  if actor is null or not exists(select 1 from public.profiles where id=actor and role='owner' and deleted_at is null) then
    raise exception 'Active owner required' using errcode='42501';
  end if;
  if jsonb_typeof(p_command) is distinct from 'object' then raise exception 'Invalid growth command' using errcode='22023'; end if;
  action := p_command->>'action';
  case action
    when 'save_campaign' then allowed := array['request_id','action','campaign_id','expected_updated_at','name','channel','audience','area','offer','budget_cents','status'];
    when 'review_opportunity' then allowed := array['request_id','action','candidate_id','campaign_id','expected_source_updated_at','expected_updated_at','decision','rationale','next_action','due_on','outreach_draft'];
    when 'record_spend' then allowed := array['request_id','action','campaign_id','amount_cents','category','incurred_on','evidence_reference'];
    when 'link_inquiry' then allowed := array['request_id','action','lead_id','campaign_id','candidate_id','expected_source_updated_at','expected_updated_at','evidence','client_id','revenue_from'];
    else raise exception 'Unsupported growth command' using errcode='22023';
  end case;
  if not (p_command ?& allowed) or exists(select 1 from jsonb_object_keys(p_command) k where not (k=any(allowed))) then
    raise exception 'Invalid growth command fields' using errcode='22023';
  end if;
  request_id := (p_command->>'request_id')::uuid;
  if request_id is null then raise exception 'Request reference required' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended('ims-growth:'||request_id::text,0));
  select * into logged from public.growth_actions where id=request_id;
  if found then
    if logged.actor_id=actor and logged.command=p_command then return logged.result || jsonb_build_object('deduped',true); end if;
    raise exception 'Request reference already used for different content' using errcode='40001';
  end if;

  if action='save_campaign' then
    if p_command->'budget_cents' <> 'null'::jsonb and (jsonb_typeof(p_command->'budget_cents')<>'number' or (p_command->>'budget_cents') !~ '^[0-9]+$') then
      raise exception 'Budget must be whole cents' using errcode='22023';
    end if;
    entity_id := coalesce((p_command->>'campaign_id')::uuid,request_id);
    if p_command->>'campaign_id' is null then
      if p_command->>'expected_updated_at' is not null then raise exception 'New campaign has no version' using errcode='22023'; end if;
      insert into public.growth_campaigns(id,name,channel,audience,area,offer,budget_cents,status,created_by,updated_by,updated_at)
      values(entity_id,btrim(p_command->>'name'),p_command->>'channel',p_command->>'audience',btrim(p_command->>'area'),btrim(p_command->>'offer'),(p_command->>'budget_cents')::integer,p_command->>'status',actor,actor,stamp);
    else
      select * into campaign from public.growth_campaigns where id=entity_id for update;
      if not found or campaign.updated_at is distinct from (p_command->>'expected_updated_at')::timestamptz then raise exception 'Campaign changed; reload' using errcode='40001'; end if;
      update public.growth_campaigns set name=btrim(p_command->>'name'),channel=p_command->>'channel',audience=p_command->>'audience',area=btrim(p_command->>'area'),offer=btrim(p_command->>'offer'),budget_cents=(p_command->>'budget_cents')::integer,status=p_command->>'status',updated_by=actor,updated_at=stamp where id=entity_id;
    end if;

  elsif action='review_opportunity' then
    entity_id := (p_command->>'candidate_id')::uuid;
    select * into source from public.leads where id=entity_id for update;
    if not found or source.source is distinct from 'agent_research' then raise exception 'Research candidate required' using errcode='22023'; end if;
    if source.updated_at is distinct from (p_command->>'expected_source_updated_at')::timestamptz then raise exception 'Source changed; review again' using errcode='40001'; end if;
    if p_command->>'decision'='approve' then
      begin notes_json := source.notes::jsonb; exception when invalid_text_representation then raise exception 'Source evidence required' using errcode='22023'; end;
      if notes_json->>'type' is distinct from 'research_opportunity'
        or coalesce(notes_json->>'evidence_url','') !~ '^https://[^/]+\.[^/]+'
        or coalesce(notes_json->>'website_url','') !~ '^https://[^/]+\.[^/]+'
        or coalesce(notes_json->>'checked_on','') !~ '^\d{4}-\d{2}-\d{2}$'
        or (notes_json->>'checked_on')::date > current_date then raise exception 'Dated source evidence required' using errcode='22023'; end if;
    end if;
    perform pg_advisory_xact_lock(hashtextextended('ims-growth-review:'||entity_id::text,0));
    select * into review from public.growth_opportunity_reviews where candidate_id=entity_id for update;
    if review.updated_at is distinct from (p_command->>'expected_updated_at')::timestamptz then raise exception 'Review changed; reload' using errcode='40001'; end if;
    insert into public.growth_opportunity_reviews(candidate_id,campaign_id,decision,rationale,next_action,due_on,outreach_draft,source_updated_at,reviewed_by,updated_at)
    values(entity_id,(p_command->>'campaign_id')::uuid,p_command->>'decision',btrim(p_command->>'rationale'),btrim(p_command->>'next_action'),(p_command->>'due_on')::date,p_command->>'outreach_draft',source.updated_at,actor,stamp)
    on conflict(candidate_id) do update set campaign_id=excluded.campaign_id,decision=excluded.decision,rationale=excluded.rationale,next_action=excluded.next_action,due_on=excluded.due_on,outreach_draft=excluded.outreach_draft,source_updated_at=excluded.source_updated_at,reviewed_by=actor,updated_at=stamp;

  elsif action='record_spend' then
    entity_id := request_id;
    if jsonb_typeof(p_command->'amount_cents')<>'number' or (p_command->>'amount_cents') !~ '^[0-9]+$' then raise exception 'Spend must be whole cents' using errcode='22023'; end if;
    insert into public.growth_spend(id,campaign_id,amount_cents,category,incurred_on,evidence_reference,recorded_by)
    values(entity_id,(p_command->>'campaign_id')::uuid,(p_command->>'amount_cents')::integer,p_command->>'category',(p_command->>'incurred_on')::date,btrim(p_command->>'evidence_reference'),actor);

  elsif action='link_inquiry' then
    entity_id := (p_command->>'lead_id')::uuid;
    select * into source from public.leads where id=entity_id for update;
    if not found or not public.growth_is_inquiry(source.source,source.notes) then raise exception 'Existing real inquiry required; research is not a lead' using errcode='22023'; end if;
    if source.updated_at is distinct from (p_command->>'expected_source_updated_at')::timestamptz then raise exception 'Inquiry changed; reload' using errcode='40001'; end if;
    if p_command->>'candidate_id' is not null then
      select * into candidate from public.leads where id=(p_command->>'candidate_id')::uuid for share;
      select * into review from public.growth_opportunity_reviews where candidate_id=(p_command->>'candidate_id')::uuid for share;
      if candidate.source is distinct from 'agent_research' or review.decision is distinct from 'approve'
        or review.source_updated_at is distinct from candidate.updated_at
        or review.campaign_id is distinct from (p_command->>'campaign_id')::uuid then
        raise exception 'Choose a currently approved opportunity from this campaign' using errcode='22023';
      end if;
    end if;
    client_id := (p_command->>'client_id')::uuid; revenue_from := (p_command->>'revenue_from')::date;
    if client_id is not null and (source.stage::text<>'converted' or not exists(select 1 from public.clients c join public.profiles p on p.id=c.id where c.id=client_id and p.role='client' and p.deleted_at is null)) then
      raise exception 'Map only a converted inquiry to an existing client' using errcode='22023';
    end if;
    select * into attribution from public.growth_attributions where lead_id=entity_id for update;
    if attribution.updated_at is distinct from (p_command->>'expected_updated_at')::timestamptz then raise exception 'Attribution changed; reload' using errcode='40001'; end if;
    insert into public.growth_attributions(lead_id,campaign_id,candidate_id,evidence,client_id,revenue_from,recorded_by,updated_at)
    values(entity_id,(p_command->>'campaign_id')::uuid,(p_command->>'candidate_id')::uuid,btrim(p_command->>'evidence'),client_id,revenue_from,actor,stamp)
    on conflict(lead_id) do update set campaign_id=excluded.campaign_id,candidate_id=excluded.candidate_id,evidence=excluded.evidence,client_id=excluded.client_id,revenue_from=excluded.revenue_from,recorded_by=actor,updated_at=stamp;
  end if;

  result := jsonb_build_object('ok',true,'id',entity_id,'updated_at',stamp,'deduped',false);
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,changes)
  values(actor,'growth.'||action,'growth',entity_id,p_command - 'request_id');
  insert into public.growth_actions(id,actor_id,command,result) values(request_id,actor,p_command,result);
  return result;
end $$;
revoke all on function public.execute_growth_command(jsonb) from public,anon,authenticated;
grant execute on function public.execute_growth_command(jsonb) to authenticated;
