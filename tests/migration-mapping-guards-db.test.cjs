const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const fs=require('node:fs');
const path=require('node:path');
const ids=Object.fromEntries(['owner','trainer','client','clientB','disabled'].map(k=>[k,randomUUID()]));
let db,admin,databaseName;
before(async()=>{
 const live=process.env.IMS_TEST_DATABASE_URL;
 if(live){
  const url=new URL(live);if(!['localhost','127.0.0.1'].includes(url.hostname)||url.pathname!='/ims_ci')throw Error('Only isolated local ims_ci is permitted');
  const {Client}=require('pg');admin=new Client({connectionString:live});await admin.connect();
  databaseName='ims_map_'+randomUUID().replaceAll('-','');await admin.query('create database "'+databaseName+'"');url.pathname='/'+databaseName;
  const pg=new Client({connectionString:url.toString()});await pg.connect();db={exec:s=>pg.query(s),query:(s,p)=>pg.query(s,p),close:()=>pg.end()};
 }else{const {PGlite}=await import('@electric-sql/pglite');db=new PGlite();}
 await db.exec(`create schema auth;
  do $$begin create role authenticated;exception when duplicate_object then null;end$$;
  do $$begin create role anon;exception when duplicate_object then null;end$$;
  do $$begin create role service_role;exception when duplicate_object then null;end$$;
  create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
  grant usage on schema public,auth to authenticated,anon;
  create table profiles(id uuid primary key,role text,deleted_at timestamptz);
  create table clients(id uuid primary key references profiles(id));
  create table audit_logs(id uuid primary key,actor_id uuid,action text,entity_type text,entity_id uuid,changes jsonb);
  insert into profiles values('${ids.owner}','owner',null),('${ids.trainer}','trainer',null),('${ids.client}','client',null),('${ids.clientB}','client',null),('${ids.disabled}','owner',now());
  insert into clients values('${ids.client}'),('${ids.clientB}');grant select on profiles,clients to authenticated;`);
 for(const file of ['0070_migration_staging.sql','0073_migration_schedule_dry_run.sql','0089_migration_mapping_receipt_guards.sql','0089_migration_mapping_receipt_guards.sql'])await db.exec(fs.readFileSync(path.join(__dirname,'../packages/db/migrations',file),'utf8'));
});
after(async()=>{await db?.close();if(admin){try{if(databaseName)await admin.query('drop database "'+databaseName+'"');}finally{await admin.end();}}});
async function role(id=ids.owner,as='authenticated'){await db.exec('reset role;set role '+as);await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id??'']);}
async function raw(sql,p=[]){await db.exec('reset role');return(await db.query(sql,p)).rows;}
async function source(imported=false,kind='appointment'){
 const id=randomUUID(),batch=randomUUID();await raw("insert into migration_batches(id,source_system,label,status,created_by) values($1,'vagaro','Synthetic mapping test','approved',$2)",[batch,ids.owner]);
 await raw("insert into migration_records(id,batch_id,record_type,source_id,source_payload,source_hash,reconciliation_status,destination_id,destination_trainer_id,dry_run_status) values($1,$2,$3,$4,'{}',$5,$6,$7,$8,$9)",[id,batch,kind,'synthetic-'+id,'a'.repeat(64),imported?'imported':'unmatched',imported?ids.client:null,imported?ids.trainer:null,imported?'ready':null]);return{id,batch};
}
async function reconcile(id,client=ids.client,status='matched',note=null){return(await db.query('select reconcile_migration_record($1,$2,$3,$4) result',[id,client,status,note])).rows[0].result;}
async function dry(id,status='ready',reason=null,client=ids.client,trainer=ids.trainer){return(await db.query('select record_migration_schedule_dry_run($1,$2,$3,$4,$5) result',[id,status,reason,client,trainer])).rows[0].result;}
test('legacy matching cannot undo an imported receipt, even for the owner',async()=>{
 const s=await source(true);const before=await raw('select * from migration_records where id=$1',[s.id]);await role();
 for(const state of ['matched','ready','needs_review','excluded'])await assert.rejects(reconcile(s.id,ids.clientB,state),e=>e.code==='40001');
 assert.deepEqual(await raw('select * from migration_records where id=$1',[s.id]),before);
});
test('dry-run retry is safe but cannot remap imported client/trainer or change status',async()=>{
 const s=await source(true);await role();assert.equal((await dry(s.id)).deduped,true);
 for(const args of [['ready',null,ids.clientB,ids.trainer],['ready',null,ids.client,ids.owner],['hold','Do not erase imported evidence',null,null]])await assert.rejects(dry(s.id,...args),e=>e.code==='40001');
 assert.equal((await raw('select * from audit_logs where entity_id=$1',[s.id])).length,0);
});
test('valid mapping and dry-run retries write only one audit each, not sessions',async()=>{
 const s=await source();await role();assert.equal((await reconcile(s.id)).deduped,false);assert.equal((await reconcile(s.id)).deduped,true);
 assert.equal((await dry(s.id)).deduped,false);assert.equal((await dry(s.id)).deduped,true);
 assert.equal((await raw('select * from audit_logs where entity_id=$1',[s.id])).length,2);
 assert.deepEqual((await raw('select source_payload,source_hash from migration_records where id=$1',[s.id]))[0],{source_payload:{},source_hash:'a'.repeat(64)});
});
test('null status, invalid identities, blank hold reason and closed batches fail',async()=>{
 const s=await source();await role();
 await assert.rejects(reconcile(s.id,ids.client,null),e=>e.code==='22023');await assert.rejects(dry(s.id,null),e=>e.code==='22023');
 await assert.rejects(reconcile(s.id,ids.trainer),/Active destination client/);await assert.rejects(dry(s.id,'ready',null,ids.client,ids.clientB),/Active destination coach/);
 await assert.rejects(dry(s.id,'hold',' ',null,null),/explicit reason/);await assert.rejects(dry(s.id,'ready',null,ids.client,ids.disabled),/Active destination coach/);
 for(const status of ['cancelled','imported','reconciled']){await raw('update migration_batches set status=$1 where id=$2',[status,s.batch]);await role();await assert.rejects(reconcile(s.id),/closed/);await assert.rejects(dry(s.id),/closed/);}
});
test('owner-only scope and anonymous execution denial survive replacement',async()=>{
 const s=await source();for(const id of [ids.trainer,ids.client,ids.disabled,randomUUID(),null]){await role(id);await assert.rejects(reconcile(s.id),e=>e.code==='42501');await assert.rejects(dry(s.id),e=>e.code==='42501');}
 await role(null,'anon');await assert.rejects(reconcile(s.id),/permission denied/);await assert.rejects(dry(s.id),/permission denied/);
});
test('audit failure rolls back mapping and leaves same retry usable',async()=>{
 const s=await source();await raw("create function fail_map_audit() returns trigger language plpgsql as $$begin raise exception 'Synthetic audit failure';end$$;create trigger fail_map_audit before insert on audit_logs for each row execute function fail_map_audit();");
 try{await role();await assert.rejects(dry(s.id),/Synthetic audit failure/);assert.equal((await raw('select destination_id from migration_records where id=$1',[s.id]))[0].destination_id,null);}
 finally{await raw('drop trigger fail_map_audit on audit_logs;drop function fail_map_audit();');}
 await role();assert.equal((await dry(s.id)).deduped,false);
});
