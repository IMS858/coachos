const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const fs=require('node:fs');
const path=require('node:path');
const ids=Object.fromEntries(['owner','trainer','otherTrainer','client','disabled'].map(k=>[k,randomUUID()]));
const hash='a'.repeat(64),manifest='b'.repeat(64);
let db,admin,databaseName,phoneSequence=1000;
before(async()=>{
 const live=process.env.IMS_TEST_DATABASE_URL;
 if(live){const url=new URL(live);if(!['localhost','127.0.0.1'].includes(url.hostname)||url.pathname!='/ims_ci')throw Error('Only isolated local ims_ci is permitted');
  const {Client}=require('pg');admin=new Client({connectionString:live});await admin.connect();databaseName='ims_contacts_'+randomUUID().replaceAll('-','');await admin.query('create database "'+databaseName+'"');url.pathname='/'+databaseName;
  const pg=new Client({connectionString:url.toString()});await pg.connect();db={exec:s=>pg.query(s),query:(s,p)=>pg.query(s,p),close:()=>pg.end()};
 }else{const {PGlite}=await import('@electric-sql/pglite');db=new PGlite();}
 await db.exec(`create schema auth;
 do $$begin create role authenticated;exception when duplicate_object then null;end$$;
 do $$begin create role anon;exception when duplicate_object then null;end$$;
 do $$begin create role service_role;exception when duplicate_object then null;end$$;
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 grant usage on schema public,auth to authenticated,anon;
 create table auth.users(id uuid primary key,email text);
 create table auth.identities(user_id uuid,provider text);
 create table profiles(id uuid primary key,email text unique,full_name text,phone text,role text,deleted_at timestamptz);
 create table clients(id uuid primary key references profiles(id),status text,billing_type text,primary_trainer_id uuid,joined_at timestamptz,last_session_at timestamptz);
 create table sessions(id uuid primary key,vagaro_event_id text,client_id uuid,trainer_id uuid);
 create table audit_logs(id uuid primary key,actor_id uuid,action text,entity_type text,entity_id uuid,changes jsonb);
 insert into profiles(id,email,full_name,role,deleted_at) values('${ids.owner}','owner@example.test','Owner','owner',null),('${ids.trainer}','trainer@example.test','Trainer','trainer',null),('${ids.client}','existing@example.test','Existing Client','client',null),('${ids.disabled}','disabled@example.test','Disabled','owner',now());
 insert into clients(id) values('${ids.client}');grant select on profiles,clients to authenticated;`);
 for(const file of ['0070_migration_staging.sql','0073_migration_schedule_dry_run.sql','0080_migration_staging_receipt.sql'])await db.exec(fs.readFileSync(path.join(__dirname,'../packages/db/migrations',file),'utf8'));
 await db.exec('create table migration_latest_record_reviews(record_id uuid,decision text);');
 await db.exec('create table migration_client_identity_receipts(record_id uuid primary key);');
 await db.exec(`
  insert into profiles(id,email,full_name,role) values('${ids.otherTrainer}','other@example.test','Other Trainer','trainer');
  insert into auth.users(id,email) select id,email from profiles;
  alter table profiles alter column email set not null;
  alter table profiles add constraint profiles_id_fkey foreign key(id) references auth.users(id) on delete cascade;
  create function public.is_owner() returns boolean language sql security definer set search_path='' as $$ select exists(select 1 from public.profiles where id=auth.uid() and role='owner' and deleted_at is null) $$;
  alter table profiles enable row level security;
  grant select,insert,update,delete on profiles to authenticated;
  create policy profiles_owner on profiles for all to authenticated using(public.is_owner()) with check(public.is_owner());
  create policy profiles_self_read on profiles for select to authenticated using(id=auth.uid());
  create policy profiles_self_update on profiles for update to authenticated using(id=auth.uid()) with check(id=auth.uid());
  alter table clients enable row level security;
  grant select on clients to authenticated;
  create policy clients_scoped on clients for select to authenticated using(id=auth.uid() or primary_trainer_id=auth.uid() or public.is_owner());
  alter table sessions enable row level security;
  grant select on sessions to authenticated;
  create policy sessions_scoped on sessions for select to authenticated using(client_id=auth.uid() or trainer_id=auth.uid() or public.is_owner());
 `);
 for(let i=0;i<2;i++) await db.exec(fs.readFileSync(path.join(__dirname,'../packages/db/migrations/0091_contact_only_clients.sql'),'utf8'));
});
after(async()=>{await db?.close();if(admin){try{if(databaseName)await admin.query('drop database "'+databaseName+'"');}finally{await admin.end();}}});
async function raw(sql,p=[]){await db.exec('reset role');return(await db.query(sql,p)).rows;}
async function role(id=ids.owner,as='authenticated'){await db.exec('reset role;set role '+as);await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id??'']);}
async function source(email){const id=randomUUID(),batch=randomUUID(),sourceId='source-'+id,calendar='calendar-'+id,name='Source Client '+id,phone='800555'+(++phoneSequence),date=new Date(Date.now()+7*86400000).toISOString().slice(0,10);email??=id+'@example.test';
 await raw("insert into migration_batches(id,source_system,label,created_by) values($1,'vagaro','Synthetic identity batch',$2)",[batch,ids.owner]);
 await raw("insert into migration_records(id,batch_id,record_type,source_id,source_payload,source_hash) values($1,$2,'client',$3,$4,$5)",[id,batch,sourceId,JSON.stringify({fields:{'Source Name':name,Email:email,Phones:'Cell Phone\n'+phone+'\nDay Phone\n---'}}),hash]);
 for(const imported of [false,true]){const event=randomUUID();await raw("insert into migration_records(batch_id,record_type,source_id,source_parent_id,source_payload,source_hash,reconciliation_status,destination_id,destination_trainer_id) values($1,'appointment',$2,$3,$4,$5,$6,$7,$8)",[batch,event,imported?'witness':sourceId,JSON.stringify({fields:{'Calendar ID':calendar,'Raw date':date}}),hash,imported?'imported':'unmatched',imported?ids.client:null,imported?ids.trainer:null]);
  if(imported)await raw('insert into sessions values($1,$2,$3,$4)',[randomUUID(),event,ids.client,ids.trainer]);}
 await raw("update migration_batches set status='approved',approved_by=$2,approved_at=clock_timestamp(),staging_completed_at=now()-interval '1 minute',source_manifest_sha256=$3,expected_counts='{\"client\":1,\"appointment\":2,\"series\":0,\"package\":0,\"membership\":0,\"transaction\":0}' where id=$1",[batch,ids.owner,manifest]);return{id,batch,name,email,sourceId,calendar,phone};}
async function importContact(s,confirmed=true,h=hash,m=manifest){return(await db.query('select import_migration_contact_client($1,$2,$3,$4,$5) result',[s.id,h,m,confirmed,'Owner confirmed this is a separate coaching client; email will be added later.'])).rows[0].result;}
test('owner can create a real source-backed client without any email or auth account',async()=>{
 const s=await source('---');const beforeUsers=(await raw('select count(*) n from auth.users'))[0].n;
 await role();const result=await importContact(s);assert.equal(result.ok,true);assert.equal(result.account_created,false);assert.equal(result.invitation_sent,false);
 const p=(await raw('select * from profiles where id=$1',[result.client_id]))[0];assert.equal(p.full_name,s.name);assert.equal(p.email,null);assert.equal(p.phone,s.phone);assert.equal(p.contact_only,true);assert.equal(p.auth_user_id,null);
 const c=(await raw('select * from clients where id=$1',[result.client_id]))[0];assert.equal(c.primary_trainer_id,ids.trainer);assert.equal(c.billing_type,'unset');assert.equal(c.last_session_at,null);
 assert.equal((await raw('select count(*) n from auth.users'))[0].n,beforeUsers);
 assert.equal((await raw('select * from auth.identities where user_id=$1',[result.client_id])).length,0);
 assert.equal((await raw('select reconciliation_status from migration_records where id=$1',[s.id]))[0].reconciliation_status,'imported');
});
test('shared contact details create separate people only with explicit owner confirmation',async()=>{
 const s=await source('existing@example.test');await raw('update profiles set phone=$1 where id=$2',[s.phone,ids.client]);
 const prior=(await raw('select * from profiles where id=$1',[ids.client]))[0];
 await role();await assert.rejects(importContact(s,false),e=>e.code==='22023');
 const result=await importContact(s);assert.notEqual(result.client_id,ids.client);
 assert.deepEqual((await raw('select * from profiles where id=$1',[ids.client]))[0],prior);
 assert.equal((await raw('select email from profiles where id=$1',[result.client_id]))[0].email,null);
 assert.equal((await raw('select source_payload from migration_records where id=$1',[s.id]))[0].source_payload.fields.Email,'existing@example.test');
});
test('retries preserve the same person and exactly one durable import receipt',async()=>{
 const s=await source();await role();const first=await importContact(s),again=await importContact(s);assert.equal(first.client_id,again.client_id);assert.equal(again.deduped,true);
 assert.equal((await raw("select * from audit_logs where entity_id=$1 and action='migration.contact_client_imported'",[s.id])).length,1);
 assert.equal((await raw('select * from migration_contact_client_receipts where record_id=$1',[s.id])).length,1);
});
test('adding email later does not create a login, change identity or lose source mapping',async()=>{
 const s=await source('---');await role();const r=await importContact(s);
 const email=randomUUID()+'@example.test';await db.query('update profiles set email=$1 where id=$2',[email,r.client_id]);
 const p=(await raw('select * from profiles where id=$1',[r.client_id]))[0];assert.equal(p.email,email);assert.equal(p.contact_only,true);assert.equal(p.auth_user_id,null);
 assert.equal((await raw('select * from auth.users where id=$1',[r.client_id])).length,0);
 await role();assert.equal((await importContact(s)).client_id,r.client_id);
});
test('trainer, unrelated client, disabled owner and anonymous users cannot import or write receipts',async()=>{
 const s=await source();
 for(const id of [ids.trainer,ids.otherTrainer,ids.client,ids.disabled,randomUUID(),null]){
  await role(id);await assert.rejects(importContact(s),e=>e.code==='42501');
  assert.equal((await db.query('select * from migration_contact_client_receipts')).rows.length,0);
  await assert.rejects(db.query('delete from migration_contact_client_receipts'),e=>e.code==='42501');
 }
 await role(null,'anon');await assert.rejects(importContact(s),e=>e.code==='42501');
});
test('login identity FK, staff roles, generated auth links and self-update protections remain enforced',async()=>{
 await raw('select 1');
 await assert.rejects(db.query("insert into profiles(id,email,full_name,role) values($1,'missing-auth@example.test','No Auth','client')",[randomUUID()]),e=>e.code==='23503');
 for(const roleName of ['owner','trainer']) await assert.rejects(db.query('insert into profiles(id,email,full_name,role,contact_only) values($1,null,$2,$3,true)',[randomUUID(),'No Staff Login',roleName]),e=>e.code==='23514');
 await role(ids.client);
 await assert.rejects(db.query('update profiles set contact_only=true where id=$1',[ids.client]),e=>e.code==='42501');
 await assert.rejects(db.query('update profiles set id=$1 where id=$2',[randomUUID(),ids.client]),e=>e.code==='42501');
 await assert.rejects(db.query('update profiles set auth_user_id=$1 where id=$2',[ids.owner,ids.client]),e=>e.code==='428C9');
 const s=await source('---');await role();const r=await importContact(s);
 await assert.rejects(db.query('update profiles set contact_only=false where id=$1',[r.client_id]),e=>e.code==='42501');
});
test('contact clients and their schedule retain assigned-trainer and client isolation',async()=>{
 const s=await source('---');await role();const r=await importContact(s);
 const session=randomUUID();await raw('insert into sessions values($1,$2,$3,$4)',[session,'test-contact-event',r.client_id,ids.trainer]);
 for(const id of [ids.owner,ids.trainer]) {await role(id);assert.equal((await db.query('select id from clients where id=$1',[r.client_id])).rows.length,1);assert.equal((await db.query('select id from sessions where id=$1',[session])).rows.length,1);}
 for(const id of [ids.otherTrainer,ids.client,ids.disabled]) {await role(id);assert.equal((await db.query('select id from clients where id=$1',[r.client_id])).rows.length,0);assert.equal((await db.query('select id from sessions where id=$1',[session])).rows.length,0);}
});
test('changed source, stale manifest, changed coverage and explicit holds cannot be bypassed',async()=>{
 const s=await source('---');await role();
 await assert.rejects(importContact(s,true,'c'.repeat(64)),e=>e.code==='40001');
 await assert.rejects(importContact(s,true,hash,'d'.repeat(64)),e=>e.code==='40001');
 await raw('insert into migration_latest_record_reviews values($1,$2)',[s.id,'hold']);await role();await assert.rejects(importContact(s),e=>e.code==='23514');
 await raw('delete from migration_latest_record_reviews where record_id=$1',[s.id]);await raw("update migration_batches set expected_counts=jsonb_set(expected_counts,'{appointment}','3') where id=$1",[s.batch]);await role();await assert.rejects(importContact(s),e=>e.code==='40001');
});
test('identical full names and existing portal reservations are not silently duplicated',async()=>{
 const s=await source();await raw("update migration_records set source_payload=jsonb_set(source_payload,'{fields,Source Name}',to_jsonb('Existing Client'::text)) where id=$1",[s.id]);await role();await assert.rejects(importContact(s),e=>e.code==='23514');
 const reserved=await source();await raw('insert into migration_client_identity_receipts values($1)',[reserved.id]);await role();await assert.rejects(importContact(reserved),e=>e.code==='40001');
});
