const {test}=require("node:test");const assert=require("node:assert/strict");const {randomUUID}=require("node:crypto");const {readFileSync}=require("node:fs");const {PGlite}=require("@electric-sql/pglite");
const owner="11111111-1111-4111-8111-111111111111",trainer="22222222-2222-4222-8222-222222222222",otherTrainer="33333333-3333-4333-8333-333333333333",client="44444444-4444-4444-8444-444444444444",staff="55555555-5555-4555-8555-555555555555";
test("client app engagement is idempotent, metadata-free and scoped to owner/primary trainer",async()=>{const db=new PGlite();try{
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema public,auth to anon,authenticated,service_role;
 create table public.profiles(id uuid primary key,email text,full_name text,role text,deleted_at timestamptz,contact_only boolean default false,auth_user_id uuid);
 create table public.clients(id uuid primary key references public.profiles(id),primary_trainer_id uuid references public.profiles(id));
 create function public.is_owner() returns boolean language sql stable security definer set search_path='' as $$select exists(select 1 from public.profiles where id=auth.uid() and role='owner' and deleted_at is null)$$;
 create table public.app_events(id bigserial primary key,user_id uuid references public.profiles(id),role text,event text not null,path text,meta jsonb,created_at timestamptz not null default now());
 alter table public.app_events enable row level security;create policy app_events_insert_self on public.app_events for insert to authenticated with check(user_id=auth.uid());create policy app_events_owner_read on public.app_events for select to authenticated using(public.is_owner());
 grant all on public.app_events to anon,authenticated,service_role;grant usage,select on sequence public.app_events_id_seq to authenticated,service_role;
 insert into public.profiles values
 ('${owner}','o@example.invalid','Owner','owner',null,false,'${owner}'),
 ('${trainer}','t@example.invalid','Assigned','trainer',null,false,'${trainer}'),
 ('${otherTrainer}','x@example.invalid','Other','trainer',null,false,'${otherTrainer}'),
 ('${client}','c@example.invalid','Client','client',null,false,'${client}'),
 ('${staff}','s@example.invalid','Staff','trainer',null,false,'${staff}');
 insert into public.clients values('${client}','${trainer}');`);
 await db.exec(readFileSync("packages/db/migrations/0097_client_app_engagement.sql","utf8"));
 const asActor=async id=>{await db.exec("reset role");await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);await db.exec("set role authenticated");};
 await asActor(client);await assert.rejects(db.query("insert into public.app_events(user_id,role,event,path,meta) values($1,'client','view','/private/client-id',$2::jsonb)",[client,JSON.stringify({free_text:"secret"})]),/permission denied/);
 const req=randomUUID();let r=(await db.query("select public.record_client_app_event($1,'view','training') r",[req])).rows[0].r;assert.equal(r.recorded,true);assert.equal(r.deduped,false);r=(await db.query("select public.record_client_app_event($1,'view','training') r",[req])).rows[0].r;assert.equal(r.deduped,true);await assert.rejects(db.query("select public.record_client_app_event($1,'view','messages')",[req]),/identity reused/);
 await db.exec("reset role;set role service_role");const row=(await db.query("select role,event,path,meta,request_id from public.app_events where request_id=$1",[req])).rows[0];assert.equal(row.role,"client");assert.equal(row.event,"view");assert.equal(row.path,"training");assert.equal(row.meta,null);assert.equal(row.request_id,req);
 await asActor(staff);r=(await db.query("select public.record_client_app_event($1,'view','dashboard') r",[randomUUID()])).rows[0].r;assert.equal(r.recorded,false);
 await asActor(trainer);let summary=(await db.query("select public.get_client_app_engagement($1) r",[client])).rows[0].r;assert.equal(summary.portal_provisioned,true);assert.equal(summary.events_30d,1);assert.equal(summary.surfaces_30d.training,1);assert.equal(summary.recent[0].surface,"training");assert.equal("path" in summary.recent[0],false);
 await asActor(otherTrainer);await assert.rejects(db.query("select public.get_client_app_engagement($1)",[client]),/not authorized/);
 await asActor(client);await assert.rejects(db.query("select public.get_client_app_engagement($1)",[client]),/not authorized/);
 await db.exec("reset role;set role service_role");const view=(await db.query("select portal_provisioned,active_days_30d,training_views_30d from public.client_engagement where id=$1",[client])).rows[0];assert.equal(view.portal_provisioned,true);assert.equal(Number(view.active_days_30d),1);assert.equal(Number(view.training_views_30d),1);
 }finally{await db.close();}});
