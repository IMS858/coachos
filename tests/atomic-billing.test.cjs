const {test,before,beforeEach,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const owner='11111111-1111-4111-8111-111111111111',client='22222222-2222-4222-8222-222222222222',sid='33333333-3333-4333-8333-333333333333',pid='44444444-4444-4444-8444-444444444444';
let db;
const live=process.env.IMS_TEST_DATABASE_URL;
before(async()=>{
 if(live){
  const url=new URL(live);
  if(!['localhost','127.0.0.1'].includes(url.hostname)||url.pathname!='/ims_ci')throw Error('Tests require the isolated local ims_ci database');
  const {Client}=require('pg');const pg=new Client({connectionString:live});await pg.connect();db={exec:s=>pg.query(s),query:(s,p)=>pg.query(s,p),close:()=>pg.end()};
 }else{const {PGlite}=await import('@electric-sql/pglite');db=new PGlite();}
 await db.exec(fs.readFileSync(path.join(__dirname,'fixtures/billing-schema.sql'),'utf8'));
 const file=fs.readdirSync(path.join(root,'supabase/migrations')).find(x=>x.endsWith('_atomic_billing_and_completion.sql'));
 await db.exec(fs.readFileSync(path.join(root,'supabase/migrations',file),'utf8'));
 for(const suffix of ['_reliable_notification_delivery.sql',...(live?['_trainer_booking_exclusion.sql']:[])]){const migration=fs.readdirSync(path.join(root,'supabase/migrations')).find(x=>x.endsWith(suffix));await db.exec(fs.readFileSync(path.join(root,'supabase/migrations',migration),'utf8'));}
});
after(async()=>{await db?.close()});
beforeEach(async()=>{
 await db.exec(`reset role; truncate public.notification_deliveries,auth.users,public.sessions,public.payments,public.plans,public.clients,public.profiles,public.stripe_events cascade;
 insert into auth.users values('${client}');
 insert into public.profiles values('${owner}','owner',null),('${client}','client',null);
 insert into public.clients(id,stripe_customer_id) values('${client}','cus_test');
 insert into public.plans(id,client_id,kind,tier,service_type,status,current_session_number,total_sessions,sessions_used) values('${pid}','${client}','package','package_12','training','active',0,12,0);
 insert into public.sessions(id,client_id,status) values('${sid}','${client}','scheduled');`);
});
async function role(who='authenticated',uid=owner){await db.exec(`set role ${who}; select set_config('request.jwt.claim.sub','${uid}',false);`)}
async function completion(value=true){return (await db.query('select public.set_session_completion($1,$2,$3) as result',[sid,value,value?'training':null])).rows[0].result;}
async function count(){await db.exec('reset role');return (await db.query('select current_session_number as n from public.plans where id=$1',[pid])).rows[0].n;}
const checkout={action:'checkout',client_id:client,checkout_id:'cs_test',kind:'package',tier:'package_6',service_type:'training',total_sessions:6,package_total_cents:60000,amount_cents:60000,currency:'usd',payment_intent_id:'pi_test'};
async function event(id,command,created=100){await role('service_role');return (await db.query('select public.process_stripe_event($1,$2,$3,$4::jsonb) as result',[id,'test.event',created,JSON.stringify(command)])).rows[0].result;}
async function rows(sql){await db.exec('reset role');return (await db.query(sql)).rows;}
test('repeated completion debits once and repeated undo reverses once',async()=>{
 await role();assert.equal((await completion()).deduped,false);assert.equal((await completion()).deduped,true);assert.equal(await count(),1);
 await role();await completion(false);await completion(false);assert.equal(await count(),0);
});
test('session write failure rolls back its package debit',async()=>{
 await db.exec("create function public.fail_session() returns trigger language plpgsql as $$begin raise exception 'synthetic failure'; end$$; create trigger fail_session before update on public.sessions for each row execute function public.fail_session();");
 await role();await assert.rejects(completion(),/synthetic failure/);assert.equal(await count(),0);
 await db.exec('drop trigger fail_session on public.sessions; drop function public.fail_session();');
});
test('clients and deleted staff cannot change completion',async()=>{
 await role('authenticated',client);await assert.rejects(completion(),/Staff authorization/);
 await db.exec(`reset role;update public.profiles set deleted_at=now() where id='${owner}';`);await role();await assert.rejects(completion(),/Staff authorization/);
});
test('cancelled sessions cannot consume package usage; overrun remains visible',async()=>{
 await db.exec(`update public.sessions set status='cancelled';`);await role();await assert.rejects(completion(),/Only scheduled/);
 await db.exec('reset role;update public.sessions set status=\'scheduled\';update public.plans set current_session_number=12,sessions_used=12;');await role();assert.equal((await completion()).counter.over_limit,true);
});
test('Stripe replay and two event IDs for one checkout create one plan and payment',async()=>{
 await event('evt_1',checkout);assert.equal((await event('evt_1',checkout)).deduped,true);await event('evt_2',checkout);
 assert.equal((await rows("select * from public.plans where stripe_checkout_id='cs_test'")).length,1);
 assert.equal((await rows('select * from public.payments')).length,1);
});
test('Stripe failure after plan insert rolls the whole event back',async()=>{
 await db.exec("create function public.fail_client() returns trigger language plpgsql as $$begin raise exception 'synthetic failure';end$$;create trigger fail_client before update on public.clients for each row execute function public.fail_client();");
 await assert.rejects(event('evt_fail',checkout),/synthetic failure/);
 assert.equal((await rows("select * from public.plans where stripe_checkout_id is not null")).length,0);
 assert.equal((await rows('select * from public.stripe_events')).length,0);
 await db.exec('drop trigger fail_client on public.clients;drop function public.fail_client();');await event('evt_fail',checkout);
});
test('invoice retries until its plan exists and late failure cannot replace paid invoice',async()=>{
 const invoice={action:'invoice',subscription_id:'sub_test',invoice_id:'in_test',status:'failed',amount_cents:10000,currency:'usd'};
 await assert.rejects(event('evt_early',invoice),/not ready/);
 await event('evt_checkout',{...checkout,checkout_id:'cs_sub',kind:'subscription',tier:'essentials_2x',subscription_id:'sub_test',monthly_rate_cents:10000,total_sessions:null,service_type:null});
 await event('evt_early',invoice);await event('evt_paid',{...invoice,status:'succeeded'});await event('evt_late',invoice);
 const payments=await rows("select * from public.payments where source_id='in_test'");assert.equal(payments.length,1);assert.equal(payments[0].status,'succeeded');
});
test('partial refunds are individual amounts and retain client attribution',async()=>{
 await event('evt_checkout',checkout);
 const refund=(id,amount)=>({refund_id:id,amount_cents:amount,currency:'usd',created:101,payment_intent_id:'pi_test',customer_id:'cus_test'});
 await event('evt_r1',{action:'refunds',refunds:[refund('re_1',100)]});await event('evt_r2',{action:'refunds',refunds:[refund('re_1',100),refund('re_2',200)]});
 const refunds=await rows("select * from public.payments where status='refunded'");assert.equal(refunds.length,2);assert.equal(refunds.reduce((sum,r)=>sum+r.amount_cents,0),-300);assert.ok(refunds.every(r=>r.client_id===client));
});
test('older subscription events cannot undo a newer cancellation',async()=>{
 await event('evt_checkout',{...checkout,kind:'subscription',tier:'essentials_2x',subscription_id:'sub_test',monthly_rate_cents:10000,total_sessions:null,service_type:null});
 await event('evt_cancel',{action:'subscription',subscription_id:'sub_test',status:'cancelled'},200);
 await event('evt_old',{action:'subscription',subscription_id:'sub_test',status:'active'},150);
 assert.equal((await rows("select status from public.plans where stripe_subscription_id='sub_test'"))[0].status,'cancelled');
});
test('authenticated callers cannot invoke service-only Stripe mutation',async()=>{
 await role();await assert.rejects(db.query("select public.process_stripe_event('forged','test',1,'{\"action\":\"ignore\"}')"),/permission denied/);
});
test('concurrent PostgreSQL connections complete the same session exactly once',{skip:!live},async()=>{
 const {Client}=require('pg');const clients=[new Client({connectionString:live}),new Client({connectionString:live})];
 try{await Promise.all(clients.map(async c=>{await c.connect();await c.query(`set role authenticated;select set_config('request.jwt.claim.sub','${owner}',false)`);}));
 const results=await Promise.all(clients.map(c=>c.query('select public.set_session_completion($1,true,$2) as result',[sid,'training'])));
 assert.deepEqual(results.map(r=>r.rows[0].result.deduped).sort(),[false,true]);assert.equal(await count(),1);
 }finally{await Promise.all(clients.map(c=>c.end()));}
});
test('new past-session log and retries create exactly one debit',async()=>{
 await role();const body={mode:'log',client_id:client,trainer_id:owner,scheduled_at:'2026-09-24T16:00:00Z',duration_minutes:60,session_type:'training',service_type:'training'};
 const id='55555555-5555-4555-8555-555555555555';
 const save=()=>db.query('select public.create_staff_session($1,$2::jsonb) as result',[id,JSON.stringify(body)]);
 assert.equal((await save()).rows[0].result.deduped,false);assert.equal((await save()).rows[0].result.deduped,true);assert.equal(await count(),1);
});
test('new log failure rolls back both session and debit',async()=>{
 await db.exec("create function public.fail_session() returns trigger language plpgsql as $$begin raise exception 'synthetic failure'; end$$; create trigger fail_session before update on public.sessions for each row execute function public.fail_session();");
 await role();const body={mode:'log',client_id:client,scheduled_at:'2026-09-24T16:00:00Z',duration_minutes:60,session_type:'training',service_type:'training'};
 await assert.rejects(db.query('select public.create_staff_session($1,$2::jsonb)',['55555555-5555-4555-8555-555555555555',JSON.stringify(body)]),/synthetic failure/);
 assert.equal(await count(),0);assert.equal((await rows('select * from public.sessions')).length,1);
 await db.exec('drop trigger fail_session on public.sessions;drop function public.fail_session();');
});
async function claim(payload={to:'synthetic@example.invalid',subject:'Test'}){await role('service_role');return (await db.query('select public.claim_notification($1,$2,$3,$4) as result',['test-key',client,'test',JSON.stringify(payload)])).rows[0].result;}
test('notification lease excludes duplicate workers and retries preserve original payload',async()=>{
 const first=await claim();assert.ok(first.token);assert.equal(await claim(),null);
 await db.query('select public.finish_notification($1,$2,$3,$4)',['test-key',first.token,null,'temporary failure']);
 const second=await claim({to:'changed@example.invalid',subject:'Changed'});assert.notEqual(second.token,first.token);assert.equal(second.payload.to,'synthetic@example.invalid');
 assert.equal((await db.query('select public.finish_notification($1,$2,$3,$4) as ok',['test-key',first.token,'provider-old',null])).rows[0].ok,false);
 assert.equal((await db.query('select public.finish_notification($1,$2,$3,$4) as ok',['test-key',second.token,'provider-new',null])).rows[0].ok,true);
 assert.equal(await claim(),null);
});
test('expired notification leases recover, ambiguous old delivery requires review',async()=>{
 const first=await claim();await db.exec("reset role;update public.notification_deliveries set attempted_at=now()-interval '6 minutes'");
 assert.notEqual((await claim()).token,first.token);
 await db.exec("reset role;update public.notification_deliveries set attempted_at=now()-interval '24 hours',first_attempted_at=now()-interval '24 hours'");assert.equal(await claim(),null);
 assert.match((await rows('select error from public.notification_deliveries'))[0].error,/Manual review/);
});
test('notification mutation is unavailable to authenticated clients',async()=>{
 await role('authenticated',client);await assert.rejects(db.query('select public.claim_notification($1,$2,$3,$4)',['forged',client,'test','{}']),/permission denied/);
});
test('trainer exclusion rejects concurrent overlapping bookings but allows adjacent times',{skip:!live},async()=>{
 const {Client}=require('pg');const peers=[new Client({connectionString:live}),new Client({connectionString:live})];
 try{await Promise.all(peers.map(c=>c.connect()));
 const results=await Promise.allSettled(peers.map((c,i)=>c.query("insert into public.sessions(id,client_id,trainer_id,scheduled_at,duration_minutes) values($1,$2,$3,'2026-09-24T16:00:00Z',60)",[`66666666-6666-4666-8666-66666666666${i}`,client,owner])));
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(results.find(r=>r.status==='rejected').reason.code,'23P01');
 await db.query("insert into public.sessions(id,client_id,trainer_id,scheduled_at,duration_minutes) values('77777777-7777-4777-8777-777777777777',$1,$2,'2026-09-24T17:00:00Z',60)",[client,owner]);
 }finally{await Promise.all(peers.map(c=>c.end()));}
});
test('late package cancellation and replay debit once; another client cannot cancel',async()=>{
 await db.exec(`update public.sessions set scheduled_at=now()+interval '1 hour',session_type='training',service_type='training';`);await role('service_role');
 const cancel=actor=>db.query('select public.cancel_session_atomic($1,$2,$3) as result',[sid,actor,'Synthetic cancellation']);
 await assert.rejects(cancel('99999999-9999-4999-8999-999999999999'),/Not authorized/);
 assert.equal((await cancel(client)).rows[0].result.charged,true);assert.equal((await cancel(client)).rows[0].result.deduped,true);assert.equal(await count(),1);
});
test('late cancellation does not debit an unrelated service package or pending request',async()=>{
 await db.exec(`update public.sessions set scheduled_at=now()+interval '1 hour',session_type='pilates';`);await role('service_role');
 assert.equal((await db.query('select public.cancel_session_atomic($1,$2,$3) as result',[sid,client,'Test'])).rows[0].result.charged,false);assert.equal(await count(),0);
 await db.exec("update public.sessions set status='requested',session_type='training'");await role('service_role');
 assert.equal((await db.query('select public.cancel_session_atomic($1,$2,$3) as result',[sid,client,'Test'])).rows[0].result.charged,false);assert.equal(await count(),0);
});
test('no-show replay and undo touch only the originally billed package once',async()=>{
 await db.exec("update public.sessions set session_type='training'");await role();
 const change=mark=>db.query('select public.set_session_no_show($1,$2,true) as result',[sid,mark]);
 assert.equal((await change(true)).rows[0].result.charged,true);assert.equal((await change(true)).rows[0].result.deduped,true);assert.equal(await count(),1);
 await db.exec("update public.plans set status='cancelled'");await role();await change(false);await change(false);assert.equal(await count(),0);
});
test('two PostgreSQL webhook workers for one checkout create one payment',{skip:!live},async()=>{
 const {Client}=require('pg');const peers=[new Client({connectionString:live}),new Client({connectionString:live})];
 try{await Promise.all(peers.map(async c=>{await c.connect();await c.query('set role service_role');}));
 await Promise.all(peers.map((c,i)=>c.query('select public.process_stripe_event($1,$2,$3,$4::jsonb)',[`evt_concurrent_${i}`,'checkout.session.completed',100,JSON.stringify(checkout)])));
 assert.equal((await rows("select * from public.payments where source_id='pi_test'")).length,1);
 assert.equal((await rows("select * from public.plans where stripe_checkout_id='cs_test'")).length,1);
 }finally{await Promise.all(peers.map(c=>c.end()));}
});
