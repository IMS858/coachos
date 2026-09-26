const {test,before,after,beforeEach}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {randomUUID}=require('node:crypto');
const root=path.join(__dirname,'..');
const owner='11111111-1111-4111-8111-111111111111',trainer='22222222-2222-4222-8222-222222222222',c1='33333333-3333-4333-8333-333333333333',c2='44444444-4444-4444-8444-444444444444';
let db,admin,connection,day;
const local=process.env.IMS_TEST_DATABASE_URL;
const databaseName='ims_client_requests_'+process.pid;
before(async()=>{
  if(local){
    const url=new URL(local);if(!['localhost','127.0.0.1'].includes(url.hostname)||url.pathname!='/ims_ci')throw new Error('Only the isolated local ims_ci PostgreSQL service is allowed');
    const {Client}=require('pg');admin=new Client({connectionString:local});await admin.connect();await admin.query('create database '+databaseName);
    url.pathname='/'+databaseName;connection=url.toString();const pg=new Client({connectionString:connection});await pg.connect();db={exec:sql=>pg.query(sql),query:(sql,args)=>pg.query(sql,args),close:()=>pg.end()};
  }else{const {PGlite}=await import('@electric-sql/pglite');db=new PGlite();}
  await db.exec(`do $$ begin create role anon; exception when duplicate_object or unique_violation then null; end $$;
    do $$ begin create role authenticated; exception when duplicate_object or unique_violation then null; end $$;
    create schema auth;create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant usage on schema auth,public to authenticated,anon;
    create table public.profiles(id uuid primary key,role text,deleted_at timestamptz);
    create table public.clients(id uuid primary key references public.profiles(id),primary_trainer_id uuid references public.profiles(id));
    create table public.sessions(id uuid primary key,client_id uuid references public.clients(id),trainer_id uuid references public.profiles(id),scheduled_at timestamptz not null,duration_minutes integer,session_type text,status text,notes_pre text);
    create table public.trainer_availability_rules(id uuid primary key default gen_random_uuid(),trainer_id uuid,weekday integer,start_time time,end_time time,active boolean);
    create table public.trainer_time_blocks(id uuid primary key default gen_random_uuid(),trainer_id uuid,starts_at timestamptz,ends_at timestamptz);
    create table public.class_occurrences(id uuid primary key default gen_random_uuid(),trainer_id uuid,starts_at timestamptz,ends_at timestamptz,status text);
    create table public.audit_logs(id uuid primary key,actor_id uuid,action text,entity_type text,entity_id uuid,changes jsonb);
    insert into public.profiles values('${owner}','owner',null),('${trainer}','trainer',null),('${c1}','client',null),('${c2}','client',null);
    insert into public.clients values('${c1}','${trainer}'),('${c2}','${trainer}');
  `);
  // Run the actual migration unchanged, in a separate synthetic database.
  await db.exec(fs.readFileSync(path.join(root,'packages/db/migrations/0069_client_training_requests.sql'),'utf8'));
  day=(await db.query("select (date_trunc('week',now() at time zone 'America/Los_Angeles')::date+7)::text as day")).rows[0].day;
});
after(async()=>{await db?.close();if(admin){try{await admin.query('drop database '+databaseName);}finally{await admin.end();}}});
beforeEach(async()=>{await db.exec(`reset role;truncate public.client_training_requests,public.audit_logs,public.sessions,public.class_occurrences,public.trainer_time_blocks,public.trainer_availability_rules;update public.profiles set deleted_at=null;update public.clients set primary_trainer_id='${trainer}';`);});
async function asActor(id=c1,role='authenticated'){await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);await db.exec('set role '+role);}
async function when(time='09:00',offset=0){await db.exec('reset role');return (await db.query("select (($1::date+$2::int)::text||'T'||$3::text)::timestamp at time zone 'America/Los_Angeles' as at",[day,offset,time])).rows[0].at;}
async function request(id,at,note='Synthetic note'){return (await db.query('select public.request_client_training_session($1,$2,$3) as result',[id,at,note])).rows[0].result;}
async function available(){return (await db.query('select public.get_my_training_availability($1) as result',[day])).rows[0].result;}
async function tableCount(table){await db.exec('reset role');return Number((await db.query('select count(*) as n from public.'+table)).rows[0].n);}
test('request, receipt and audit commit once; late retry reports the current status without changing it',async()=>{
  const at=await when(),id=randomUUID();await asActor();const first=await request(id,at);assert.equal(first.status,'requested');assert.equal(first.deduped,false);assert.equal((await request(id,at)).deduped,true);
  assert.equal(await tableCount('sessions'),1);assert.equal(await tableCount('client_training_requests'),1);assert.equal(await tableCount('audit_logs'),1);
  await db.query("update public.sessions set status='cancelled',scheduled_at=now()-interval '1 day' where id=$1",[id]);await asActor();const replay=await request(id,at);assert.equal(replay.status,'cancelled');assert.equal(replay.deduped,true);
  await assert.rejects(request(id,at,'Changed payload'),/does not match/);await asActor(c2);await assert.rejects(request(id,at),/does not match/);assert.equal(await tableCount('sessions'),1);
});
test('anonymous, deleted, staff and unassigned clients cannot invoke client request writes',async()=>{
  const at=await when();for(const actor of ['',trainer,owner]){await asActor(actor);await assert.rejects(request(randomUUID(),at),/Active client/);}
  await asActor('', 'anon');await assert.rejects(request(randomUUID(),at),/permission denied/);
  await db.exec('reset role');await db.query('update public.profiles set deleted_at=now() where id=$1',[c1]);await asActor();await assert.rejects(request(randomUUID(),at),/Active client/);
  await db.exec('reset role');await db.query('update public.profiles set deleted_at=null where id=$1',[c1]);await db.query('update public.clients set primary_trainer_id=null where id=$1',[c1]);await asActor();await assert.rejects(request(randomUUID(),at),/primary coach/);
  assert.equal(await tableCount('sessions'),0);
});
test('clients cannot bypass the commands through direct tables or arbitrary trainer availability',async()=>{
  const at=await when();await asActor();await assert.rejects(db.query('select public.client_training_slot_available($1,$2)',[trainer,at]),/permission denied/);
  await assert.rejects(db.query('select * from public.client_training_requests'),/permission denied/);await assert.rejects(db.query('insert into public.client_training_requests(id,client_id,session_id,requested_start,request_note) values($1,$2,$1,$3,\'x\')',[randomUUID(),c1,at]),/permission denied/);
});
test('discovery and request enforce the same full-slot, rule, session, class and blocked-time policy',async()=>{
  const at=await when(),early=await when('08:30');await db.query("insert into public.sessions values($1,$2,$3,$4,60,'training','confirmed',null)",[randomUUID(),c2,trainer,early]);
  await db.query("insert into public.class_occurrences(trainer_id,starts_at,ends_at,status) values($1,$2::timestamptz+interval '2 hour',$2::timestamptz+interval '3 hour','scheduled')",[trainer,at]);
  await db.query("insert into public.trainer_time_blocks(trainer_id,starts_at,ends_at) values($1,$2::timestamptz+interval '4 hour',$2::timestamptz+interval '5 hour')",[trainer,at]);
  await asActor();const slots=(await available()).slots;assert.ok(!slots.includes('09:00'));assert.ok(slots.includes('09:30'));assert.ok(!slots.includes('11:00'));assert.ok(!slots.includes('13:00'));assert.equal(slots.at(-1),'18:00');
  await assert.rejects(request(randomUUID(),at),/unavailable/);
  const classAt=await when('11:00');await asActor();await assert.rejects(request(randomUUID(),classAt),/unavailable/);
  const blockAt=await when('13:00');await asActor();await assert.rejects(request(randomUUID(),blockAt),/unavailable/);
  const closing=await when('18:30');await asActor();await assert.rejects(request(randomUUID(),closing),/unavailable/);
  await db.exec('reset role');await db.query("insert into public.trainer_availability_rules(trainer_id,weekday,start_time,end_time,active) values($1,1,'10:00','12:00',true)",[trainer]);await asActor();assert.deepEqual((await available()).slots,['10:00']);
});
test('unknown duration evidence fails closed; no notice, excessive horizon and Sunday are unavailable',async()=>{
  const at=await when();await db.query("insert into public.sessions values($1,$2,$3,$4,null,'training','scheduled',null)",[randomUUID(),c2,trainer,at]);await asActor();await assert.rejects(available(),/duration evidence/);
  await db.exec('reset role;truncate public.sessions cascade');const sunday=await when('09:00',6);await asActor();await assert.rejects(request(randomUUID(),sunday),/unavailable/);await assert.rejects(request(randomUUID(),new Date()),/unavailable/);await assert.rejects(request(randomUUID(),new Date(Date.now()+90*86400000)),/unavailable/);
});
test('failed audit rolls back the request, provenance receipt and row; retry can then succeed',async()=>{
  const at=await when(),id=randomUUID();await db.exec("create function public.fail_request_audit() returns trigger language plpgsql as $$begin raise exception 'Synthetic request audit failure';end$$;create trigger fail_audit before insert on public.audit_logs for each row execute function public.fail_request_audit();");
  try{await asActor();await assert.rejects(request(id,at),/Synthetic request audit failure/);assert.equal(await tableCount('sessions'),0);assert.equal(await tableCount('client_training_requests'),0);}finally{await db.exec('reset role;drop trigger fail_audit on public.audit_logs;drop function public.fail_request_audit();');}
  await asActor();assert.equal((await request(id,at)).status,'requested');
});
test('five-request cap is enforced inside the same transaction',async()=>{
  const at=await when();for(let i=0;i<5;i++)await db.query("insert into public.sessions values($1,$2,$3,$4::timestamptz+make_interval(days=>$5),60,'training','requested',null)",[randomUUID(),c1,trainer,at,i+1]);await asActor();await assert.rejects(request(randomUUID(),at),e=>e.code==='P0100');assert.equal(await tableCount('sessions'),5);
});
test('separate PostgreSQL clients cannot win the same trainer slot; a same-ID race debits nothing',{skip:!local},async()=>{
  const {Client}=require('pg'),at=await when(),peers=[new Client({connectionString:connection}),new Client({connectionString:connection})];
  try{await Promise.all(peers.map(async(p,i)=>{await p.connect();await p.query("select set_config('request.jwt.claim.sub',$1,false)",[i?c2:c1]);await p.query('set role authenticated');}));
    const different=await Promise.allSettled(peers.map(p=>p.query("select public.request_client_training_session($1,$2,'race')",[randomUUID(),at])));assert.equal(different.filter(x=>x.status==='fulfilled').length,1);assert.equal(await tableCount('sessions'),1);
    await db.exec('reset role;truncate public.sessions,public.client_training_requests,public.audit_logs cascade');const id=randomUUID();await peers[1].query("select set_config('request.jwt.claim.sub',$1,false)",[c1]);
    const same=await Promise.all(peers.map(p=>p.query("select public.request_client_training_session($1,$2,'race') as result",[id,at])));assert.deepEqual(same.map(r=>r.rows[0].result.deduped).sort(),[false,true]);assert.equal(await tableCount('sessions'),1);assert.equal(await tableCount('audit_logs'),1);
  }finally{await Promise.all(peers.map(p=>p.end()));}
});
