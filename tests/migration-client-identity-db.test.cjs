const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const fs=require('node:fs');
const path=require('node:path');
const ids=Object.fromEntries(['owner','trainer','client','disabled'].map(k=>[k,randomUUID()]));
const hash='a'.repeat(64),manifest='b'.repeat(64);
let db,admin,databaseName,phoneSequence=1000;
before(async()=>{
 const live=process.env.IMS_TEST_DATABASE_URL;
 if(live){const url=new URL(live);if(!['localhost','127.0.0.1'].includes(url.hostname)||url.pathname!='/ims_ci')throw Error('Only isolated local ims_ci is permitted');
  const {Client}=require('pg');admin=new Client({connectionString:live});await admin.connect();databaseName='ims_identity_'+randomUUID().replaceAll('-','');await admin.query('create database "'+databaseName+'"');url.pathname='/'+databaseName;
  const pg=new Client({connectionString:url.toString()});await pg.connect();db={exec:s=>pg.query(s),query:(s,p)=>pg.query(s,p),close:()=>pg.end()};
 }else{const {PGlite}=await import('@electric-sql/pglite');db=new PGlite();}
 await db.exec(`create schema auth;
 do $$begin create role authenticated;exception when duplicate_object then null;end$$;
 do $$begin create role anon;exception when duplicate_object then null;end$$;
 do $$begin create role service_role;exception when duplicate_object then null;end$$;
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 grant usage on schema public,auth to authenticated,anon;
 create table auth.users(id uuid primary key,email text,deleted_at timestamptz,banned_until timestamptz,raw_app_meta_data jsonb,raw_user_meta_data jsonb,role text default 'authenticated',is_super_admin boolean default false);
 create table auth.identities(id uuid primary key default gen_random_uuid(),user_id uuid,provider text,provider_id text,identity_data jsonb,last_sign_in_at timestamptz,created_at timestamptz,updated_at timestamptz);
 alter table auth.users add column instance_id uuid,add column aud text,add column encrypted_password text,add column email_confirmed_at timestamptz,add column invited_at timestamptz,add column confirmation_token text,add column confirmation_sent_at timestamptz,add column recovery_token text,add column recovery_sent_at timestamptz,add column email_change_token_new text,add column email_change text,add column email_change_sent_at timestamptz,add column last_sign_in_at timestamptz,add column created_at timestamptz,add column updated_at timestamptz,add column phone text,add column phone_confirmed_at timestamptz,add column phone_change text,add column phone_change_token text,add column phone_change_sent_at timestamptz,add column email_change_token_current text,add column email_change_confirm_status smallint,add column reauthentication_token text,add column reauthentication_sent_at timestamptz,add column is_sso_user boolean,add column is_anonymous boolean;
 create table profiles(id uuid primary key,email text unique,full_name text,phone text,role text,deleted_at timestamptz);
 create table clients(id uuid primary key references profiles(id),status text,billing_type text,primary_trainer_id uuid,joined_at timestamptz,last_session_at timestamptz);
 create table sessions(id uuid primary key,vagaro_event_id text,client_id uuid,trainer_id uuid);
 create table audit_logs(id uuid primary key,actor_id uuid,action text,entity_type text,entity_id uuid,changes jsonb);
 insert into profiles(id,email,full_name,role,deleted_at) values('${ids.owner}','owner@example.test','Owner','owner',null),('${ids.trainer}','trainer@example.test','Trainer','trainer',null),('${ids.client}','existing@example.test','Existing Client','client',null),('${ids.disabled}','disabled@example.test','Disabled','owner',now());
 insert into clients(id) values('${ids.client}');grant select on profiles,clients to authenticated;`);
 for(const file of ['0070_migration_staging.sql','0073_migration_schedule_dry_run.sql','0080_migration_staging_receipt.sql'])await db.exec(fs.readFileSync(path.join(__dirname,'../packages/db/migrations',file),'utf8'));
 await db.exec('create table migration_latest_record_reviews(record_id uuid,decision text);');
 for(let i=0;i<2;i++)await db.exec(fs.readFileSync(path.join(__dirname,'../packages/db/migrations/0090_migration_client_identity_receipts.sql'),'utf8'));
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
async function prepare(s,h=hash,m=manifest){return(await db.query('select prepare_migration_client_identity($1,$2,$3) result',[s.id,h,m])).rows[0].result;}
async function finalize(s){return(await db.query('select finalize_migration_client_identity($1,$2,$3) result',[s.id,hash,manifest])).rows[0].result;}
async function account(q,metadata=true){await raw('insert into auth.users(id,email,raw_app_meta_data,raw_user_meta_data) values($1,$2,$3,$4)',[q.client_id,q.email,JSON.stringify(metadata?{ims_migration_record_id:q.record_id,ims_migration_source_hash:q.source_hash,ims_migration_manifest_sha256:q.manifest_sha256}:{}),JSON.stringify({ims_migration_record_id:q.record_id})]);await raw("insert into auth.identities(user_id,provider,provider_id,identity_data) values($1,'email',$2,$3)",[q.client_id,q.client_id,JSON.stringify({email:q.email,sub:q.client_id})]);}
test('reservation is source-bound and retry-safe, not an auth account or client import',async()=>{const s=await source();await role();const q=await prepare(s),again=await prepare(s);assert.equal(q.status,'reserved');assert.equal(q.trainer_id,ids.trainer);assert.equal(q.phone,s.phone);assert.equal(q.client_id,again.client_id);assert.equal(again.deduped,true);
 assert.equal((await raw('select * from auth.users where id=$1',[q.client_id])).length,0);assert.equal((await raw('select * from clients where id=$1',[q.client_id])).length,0);assert.equal((await raw('select * from audit_logs where entity_id=$1',[s.id])).length,1);});
test('owner-only reservation and read access deny trainer, client, disabled and anon',async()=>{const s=await source();await role();await prepare(s);for(const id of [ids.trainer,ids.client,ids.disabled,randomUUID(),null]){await role(id);await assert.rejects(prepare(s),e=>e.code==='42501');assert.equal((await db.query('select * from migration_client_identity_receipts')).rows.length,0);}await role(null,'anon');await assert.rejects(prepare(s),/permission denied/);});
test('missing and malformed source email cannot be replaced by a dummy identity',async()=>{for(const email of ['---','bad address','name@','']){const s=await source(email);await role();await assert.rejects(prepare(s),/valid unique source email/);assert.equal((await raw('select * from migration_client_identity_receipts where record_id=$1',[s.id])).length,0);}});
test('household destination collision is held even when contact matches exactly',async()=>{const s=await source('existing@example.test');await role();await assert.rejects(prepare(s),/Existing or shared destination identity/);});
test('batch coverage, manifest, source hash and explicit holds are enforced',async()=>{const s=await source();await role();await assert.rejects(prepare(s,'c'.repeat(64)),/snapshot changed/);await assert.rejects(prepare(s,hash,'c'.repeat(64)),/snapshot changed/);
 await raw('insert into migration_latest_record_reviews values($1,\'hold\')',[s.id]);await role();await assert.rejects(prepare(s),/owner hold/);await raw('delete from migration_latest_record_reviews where record_id=$1',[s.id]);
 await raw("update migration_batches set expected_counts=jsonb_set(expected_counts,'{client}','2') where id=$1",[s.batch]);await role();await assert.rejects(prepare(s),/coverage changed/);
 await raw("update migration_batches set status='draft' where id=$1",[s.batch]);await role();await assert.rejects(prepare(s),/owner-approved/);});
test('no calendar mapping means no guessed primary trainer',async()=>{const s=await source();await raw("delete from sessions where vagaro_event_id in(select source_id from migration_records where batch_id=$1 and reconciliation_status='imported')",[s.batch]);await role();await assert.rejects(prepare(s),/missing or ambiguous/);});
test('finalization rejects absent auth and untrusted user-editable metadata',async()=>{const s=await source();await role();const q=await prepare(s);await assert.rejects(finalize(s),/real source-bound Auth identity/);await account(q,false);await role();await assert.rejects(finalize(s),/real source-bound Auth identity/);assert.equal((await raw('select * from clients where id=$1',[q.client_id])).length,0);});
test('real source-bound auth finalizes once without billing, attendance or joining-date fabrication',async()=>{const s=await source();await role();const q=await prepare(s);await account(q);await role();const done=await finalize(s);assert.equal(done.status,'finalized');assert.equal(done.invitation_sent,false);assert.equal(done.client_id,q.client_id);assert.equal((await finalize(s)).deduped,true);
 const c=(await raw('select * from clients where id=$1',[q.client_id]))[0];assert.equal(c.billing_type,'unset');assert.equal(c.joined_at,null);assert.equal(c.last_session_at,null);assert.equal(c.primary_trainer_id,ids.trainer);
 const r=(await raw('select source_hash,source_payload,destination_id,reconciliation_status from migration_records where id=$1',[s.id]))[0];assert.equal(r.source_hash,hash);assert.equal(r.source_payload.fields.Email,s.email);assert.equal(r.destination_id,q.client_id);assert.equal(r.reconciliation_status,'imported');assert.equal((await raw("select * from audit_logs where entity_id=$1 and action='migration.client_identity_imported'",[s.id])).length,1);});
test('audit failure rolls back profile/client/mapping while preserving reservation for retry',async()=>{const s=await source();await role();const q=await prepare(s);await account(q);await raw("create function fail_identity_audit() returns trigger language plpgsql as $$begin if new.action='migration.client_identity_imported' then raise exception 'Synthetic audit failure';end if;return new;end$$;create trigger fail_identity_audit before insert on audit_logs for each row execute function fail_identity_audit();");
 try{await role();await assert.rejects(finalize(s),/Synthetic audit failure/);assert.equal((await raw('select * from clients where id=$1',[q.client_id])).length,0);assert.equal((await raw('select status from migration_client_identity_receipts where record_id=$1',[s.id]))[0].status,'reserved');}finally{await raw('drop trigger fail_identity_audit on audit_logs;drop function fail_identity_audit();');}
 await role();assert.equal((await finalize(s)).status,'finalized');});

const adminScript=()=>fs.readFileSync(path.join(__dirname,'../scripts/migration/import-unconfirmed-source-identities.sql'),'utf8');
test('administrative import is source-backed, unconfirmed, credential-free and idempotent',async()=>{const s=await source();
 await raw("select set_config('request.jwt.claim.sub',$1,false),set_config('ims.migration_identity_records',$2,false)",[ids.owner,JSON.stringify([s.id])]);await raw(adminScript());
 const q=(await raw('select * from migration_client_identity_receipts where record_id=$1',[s.id]))[0];assert.equal(q.status,'finalized');
 const u=(await raw('select * from auth.users where id=$1',[q.client_id]))[0];assert.equal(u.email,s.email);assert.equal(u.role,'authenticated');assert.equal(u.encrypted_password,'');assert.equal(u.email_confirmed_at,null);assert.equal(u.invited_at,null);assert.equal(u.last_sign_in_at,null);assert.equal(u.is_super_admin,false);assert.equal(u.is_anonymous,false);
 const identity=(await raw('select * from auth.identities where user_id=$1',[q.client_id]))[0];assert.equal(identity.identity_data.email_verified,false);assert.equal(identity.identity_data.email,s.email);
 const before=await raw('select * from audit_logs where entity_id=$1 order by action',[s.id]);await raw(adminScript());assert.deepEqual(await raw('select * from audit_logs where entity_id=$1 order by action',[s.id]),before);
});
test('administrative utility cannot be run as an ordinary authenticated owner',async()=>{const s=await source();await role();await db.query("select set_config('ims.migration_identity_records',$1,false)",[JSON.stringify([s.id])]);await assert.rejects(db.exec(adminScript()),e=>e.code==='42501');});
test('administrative utility rolls back the entire selected group on a conflicting source',async()=>{const good=await source(),bad=await source('existing@example.test');
 await raw("select set_config('request.jwt.claim.sub',$1,false),set_config('ims.migration_identity_records',$2,false)",[ids.owner,JSON.stringify([good.id,bad.id])]);await assert.rejects(raw(adminScript()),/Existing or shared destination identity/);assert.equal((await raw('select * from migration_client_identity_receipts where record_id=$1',[good.id])).length,0);assert.equal((await raw('select * from auth.users where email=$1',[good.email])).length,0);
});
