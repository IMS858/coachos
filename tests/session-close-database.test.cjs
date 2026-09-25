const {test,before,beforeEach,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const owner='11111111-1111-4111-8111-111111111111',trainer='22222222-2222-4222-8222-222222222222',other='33333333-3333-4333-8333-333333333333',client='44444444-4444-4444-8444-444444444444',sid='55555555-5555-4555-8555-555555555555',pid='66666666-6666-4666-8666-666666666666';
let db,admin,connectionString,database;
const live=process.env.IMS_TEST_DATABASE_URL;
before(async()=>{
 if(live){
  const url=new URL(live);if(!['localhost','127.0.0.1'].includes(url.hostname)||url.pathname!='/ims_ci')throw new Error('Completion tests require isolated loopback ims_ci');
  const {Client}=require('pg');admin=new Client({connectionString:live});await admin.connect();database='ims_close_loop_ci_'+process.pid;await admin.query('create database '+database);url.pathname='/'+database;connectionString=url.toString();const pg=new Client({connectionString});await pg.connect();db={exec:s=>pg.query(s),query:(s,p)=>pg.query(s,p),close:()=>pg.end()};
 }else{const {PGlite}=await import('@electric-sql/pglite');db=new PGlite();}
 await db.exec(`
 do $$ begin create role authenticated; exception when duplicate_object or unique_violation then null; end $$;
 do $$ begin create role anon; exception when duplicate_object or unique_violation then null; end $$;
 create schema auth;
 create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 grant usage on schema auth to authenticated,anon;
 create type public.service_type as enum('training','massage','pilates');
 create table public.profiles(id uuid primary key,role text,deleted_at timestamptz);
 create table public.clients(id uuid primary key references public.profiles(id),primary_trainer_id uuid);
 create table public.plans(id uuid primary key,client_id uuid references public.clients(id),kind text,service_type public.service_type,status text,current_session_number integer,total_sessions integer,sessions_used integer,created_at timestamptz default now(),updated_at timestamptz default now());
 create table public.sessions(id uuid primary key,client_id uuid references public.clients(id),trainer_id uuid,session_type text,status text,scheduled_at timestamptz,service_type public.service_type,plan_id uuid references public.plans(id),completed_at timestamptz,completed_by uuid);
 create table public.audit_logs(id uuid primary key,actor_id uuid,action text,entity_type text,entity_id uuid,changes jsonb);
 alter table public.plans enable row level security;alter table public.sessions enable row level security;alter table public.audit_logs enable row level security;
 `);
 await db.exec(fs.readFileSync(path.join(__dirname,'../packages/db/migrations/0063_session_completion_rollout.sql'),'utf8'));
});
after(async()=>{await db?.close();if(admin){if(database)await admin.query('drop database '+database);await admin.end();}});
beforeEach(async()=>{
 await db.exec(`reset role; select set_config('request.jwt.claim.sub','${owner}',false);truncate public.sessions,public.plans,public.clients,public.profiles,public.audit_logs cascade;
 insert into public.profiles(id,role) values('${owner}','owner'),('${trainer}','trainer'),('${other}','trainer'),('${client}','client');insert into public.clients values('${client}','${trainer}');
 insert into public.plans(id,client_id,kind,service_type,status,current_session_number,total_sessions,sessions_used) values('${pid}','${client}','package','training','active',0,12,0);
 insert into public.sessions(id,client_id,trainer_id,session_type,status,scheduled_at) values('${sid}','${client}','${trainer}','training','scheduled',now()-interval '1 hour');`);
});
async function asActor(id=trainer,role='authenticated'){await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);await db.exec('set role '+role);}
async function complete(value=true,service=value?'training':null){return (await db.query('select public.set_session_completion($1,$2,$3) as result',[sid,value,service])).rows[0].result;}
async function state(){await db.exec('reset role');return (await db.query(`select s.status,p.sessions_used,p.current_session_number,(select count(*)::int from public.audit_logs) as audits from public.sessions s cross join public.plans p where s.id='${sid}' and p.id='${pid}'`)).rows[0];}
test('completion, audit and package usage commit once; undo reverses the same package once',async()=>{
 await asActor();assert.equal((await complete()).ok,true);assert.equal((await complete()).deduped,true);assert.deepEqual(await state(),{status:'completed',sessions_used:1,current_session_number:1,audits:1});
 await asActor();assert.equal((await complete(false)).deduped,false);assert.equal((await complete(false)).deduped,true);assert.deepEqual(await state(),{status:'confirmed',sessions_used:0,current_session_number:0,audits:2});
});
test('unassigned trainers, clients, anonymous users and disabled accounts cannot close sessions',async()=>{
 for(const id of [other,client]){await asActor(id);await assert.rejects(complete(),/required/);}
 await asActor(client,'anon');await assert.rejects(complete(),/permission denied/);
 await db.exec(`reset role;update public.profiles set deleted_at=now() where id='${trainer}'`);await asActor();await assert.rejects(complete(),/Staff authorization/);
 await db.exec(`reset role;update public.profiles set deleted_at=null where id='${trainer}';update public.profiles set deleted_at=now() where id='${client}'`);await asActor(owner);await assert.rejects(complete(),/Assigned coach or owner/);
 assert.equal((await state()).sessions_used,0);
});
test('future, requested and missed sessions cannot generate performed completion',async()=>{
 await db.exec("update public.sessions set scheduled_at=now()+interval '1 day'");await asActor();await assert.rejects(complete(),/occurred/);
 for(const status of ['requested','cancelled','late_cancelled','no_show']){await db.exec(`reset role;update public.sessions set status='${status}',scheduled_at=now()-interval '1 day'`);await asActor();await assert.rejects(complete(),/occurred/);}
 assert.equal((await state()).sessions_used,0);
});
test('unknown package counters are unresolved, not silently zeroed',async()=>{
 await db.exec('update public.plans set sessions_used=null');await asActor();await assert.rejects(complete(),/reconciliation/);assert.equal((await state()).status,'scheduled');
});
test('audit failure rolls back both session state and package debit',async()=>{
 await db.exec("create function public.fail_close_audit() returns trigger language plpgsql as $$ begin raise exception 'Synthetic audit failure';end $$;create trigger fail_close_audit before insert on public.audit_logs for each row execute function public.fail_close_audit()");
 try{await asActor();await assert.rejects(complete(),/Synthetic audit failure/);assert.deepEqual(await state(),{status:'scheduled',sessions_used:0,current_session_number:0,audits:0});}
 finally{await db.exec('reset role;drop trigger fail_close_audit on public.audit_logs;drop function public.fail_close_audit()');}
});
test('assessment completion does not consume training and missing package stays explicit',async()=>{
 await db.exec("update public.sessions set session_type='assessment'");await asActor();await assert.rejects(complete(),/Service does not match/);assert.equal((await complete(true,null)).ok,true);assert.equal((await state()).sessions_used,0);
 await db.exec("update public.sessions set status='scheduled',session_type='training',service_type=null,completed_at=null;update public.plans set status='cancelled'");await asActor();const receipt=await complete();assert.equal(receipt.counter.incremented,false);assert.equal(receipt.counter.reason,'no_active_package');assert.equal((await state()).sessions_used,0);
});
test('two concurrent PostgreSQL completions consume exactly one session and one audit',{skip:!live},async()=>{
 const {Client}=require('pg');const peers=[new Client({connectionString}),new Client({connectionString})];
 try{await Promise.all(peers.map(async c=>{await c.connect();await c.query(`set role authenticated;select set_config('request.jwt.claim.sub','${trainer}',false)`);}));const results=await Promise.all(peers.map(c=>c.query('select public.set_session_completion($1,true,$2) as result',[sid,'training'])));assert.deepEqual(results.map(r=>r.rows[0].result.deduped).sort(),[false,true]);assert.deepEqual(await state(),{status:'completed',sessions_used:1,current_session_number:1,audits:1});}
 finally{await Promise.all(peers.map(c=>c.end()));}
});
