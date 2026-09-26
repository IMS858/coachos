const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const sql = fs.readFileSync('packages/db/migrations/0080_migration_staging_receipt.sql','utf8');

test('staging completion requires exact counts, checksum and a stable source snapshot',()=>{
 assert.match(sql,/Source count mismatch/);assert.match(sql,/manifest checksum required/i);
 assert.match(sql,/migration\.staging_completed/);assert.match(sql,/lock table public\.migration_records in share mode/i);
 assert.doesNotMatch(sql,/insert into public\.(sessions|payments|plans)/i);
});

test('actual staging SQL rejects unknown evidence and invalidates stale receipts without importing operations',async t=>{
 const {PGlite}=await import('@electric-sql/pglite');const db=new PGlite();
 const owner='11111111-1111-4111-8111-111111111111',trainer='22222222-2222-4222-8222-222222222222';
 const batch='33333333-3333-4333-8333-333333333333',record='44444444-4444-4444-8444-444444444444';
 const hash='a'.repeat(64),counts={client:1,appointment:0,series:0,package:0,membership:0,transaction:0};
 const finalize=(expected=counts,manifest=hash)=>db.query('select public.finalize_migration_staging($1,$2::jsonb,$3) result',[batch,JSON.stringify(expected),manifest]);
 const stamp=async()=> (await db.query('select staging_completed_at from migration_batches where id=$1',[batch])).rows[0].staging_completed_at;
 const actor=id=>db.query("select set_config('request.jwt.claim.sub',$1,false)",[id??'']);
 try {
  await db.exec(`create role anon;create role authenticated;create role service_role;
   create schema auth;create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
   create table profiles(id uuid primary key,role text,deleted_at timestamptz);
   create table migration_batches(id uuid primary key,status text not null);
   create table migration_records(id uuid primary key,batch_id uuid references migration_batches(id),record_type text,source_id text,source_parent_id text,source_payload jsonb,source_hash text,reconciliation_status text);
   create table audit_logs(id uuid primary key,actor_id uuid,action text,entity_type text,entity_id uuid,changes jsonb);`);
  await db.exec(sql);
  await db.query('insert into profiles(id,role) values($1,\'owner\'),($2,\'trainer\')',[owner,trainer]);
  await db.query("insert into migration_batches values($1,'draft',null,null,null)",[batch]);
  await db.query("insert into migration_records values($1,$2,'client','source-1',null,'{}','original','unmatched')",[record,batch]);
  await t.test('anonymous, unrelated trainer and disabled owner cannot finalize',async()=>{
   for(const id of [null,trainer]) {await actor(id);await assert.rejects(finalize(),e=>e.code==='42501');}
   await actor(owner);await db.query('update profiles set deleted_at=now() where id=$1',[owner]);
   await assert.rejects(finalize(),e=>e.code==='42501');await db.query('update profiles set deleted_at=null where id=$1',[owner]);
  });
  await t.test('null checksum, malformed counts, fractions, negatives and extra fields remain errors',async()=>{
   for(const h of [null,'','not-a-checksum'])await assert.rejects(finalize(counts,h),e=>e.code==='22023');
   for(const c of [null,[],{}, {...counts,other:0},{...counts,client:null},{...counts,client:'1'},{...counts,client:1.5},{...counts,client:-1},{...counts,client:2147483648}])await assert.rejects(finalize(c),e=>e.code==='22023');
   await assert.rejects(finalize({...counts,appointment:1}),e=>e.code==='23514');assert.equal(await stamp(),null);
  });
  await t.test('valid receipt is audited and an exact retry preserves its original timestamp',async()=>{
   assert.equal((await finalize()).rows[0].result.deduped,false);const first=await stamp();assert.ok(first);
   assert.equal((await finalize()).rows[0].result.deduped,true);assert.deepEqual(await stamp(),first);
   assert.equal((await db.query("select count(*)::int n from audit_logs where action='migration.staging_completed'")).rows[0].n,1);
  });
  await t.test('review-only edits retain source coverage but changed hash or payload invalidate it',async()=>{
   await db.query("update migration_records set reconciliation_status='matched' where id=$1",[record]);assert.ok(await stamp());
   await db.query("update migration_records set source_hash='changed' where id=$1",[record]);assert.equal(await stamp(),null);
   await finalize();await db.query("update migration_records set source_payload='{\"corrected\":true}' where id=$1",[record]);assert.equal(await stamp(),null);
  });
  await t.test('new and deleted evidence invalidate a receipt and count mismatches cannot be finalized',async()=>{
   await finalize();await db.query("insert into migration_records values(gen_random_uuid(),$1,'membership','membership-1',null,'{}','membership','unmatched')",[batch]);
   assert.equal(await stamp(),null);await assert.rejects(finalize(),e=>e.code==='23514');
   await finalize({...counts,membership:1});await db.query("delete from migration_records where record_type='membership'");assert.equal(await stamp(),null);
  });
  await t.test('audit failures roll back the new receipt',async()=>{
   await db.exec("create function fail_staging_audit() returns trigger language plpgsql as $$begin raise exception 'audit offline';end$$;create trigger test_audit_failure before insert on audit_logs for each row execute function fail_staging_audit();");
   await assert.rejects(finalize(),/audit offline/);assert.equal(await stamp(),null);
   await db.exec('drop trigger test_audit_failure on audit_logs;');
  });
  await t.test('truncating source evidence cannot leave a complete staging badge',async()=>{
   await finalize();await db.exec('truncate migration_records;');assert.equal(await stamp(),null);
   await assert.rejects(finalize(),e=>e.code==='23514');
  });
  await t.test('frozen batches remain closed and direct client-role execution has no unauthenticated access',async()=>{
   await db.query("update migration_batches set status='review' where id=$1",[batch]);
   await assert.rejects(finalize({...counts,client:0}),e=>e.code==='23514');
   assert.equal((await db.query("select has_function_privilege('anon','public.finalize_migration_staging(uuid,jsonb,text)','EXECUTE') allowed")).rows[0].allowed,false);
   assert.equal((await db.query("select has_function_privilege('authenticated','public.invalidate_migration_staging_receipt()','EXECUTE') allowed")).rows[0].allowed,false);
  });
 } finally {await db.close();}
});
