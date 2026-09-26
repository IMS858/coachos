const {test,before,after}=require('node:test');const assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');const fs=require('node:fs');const path=require('node:path');
const root=path.join(__dirname,'..'),live=process.env.IMS_TEST_DATABASE_URL;
const owner=randomUUID(),trainer=randomUUID(),client=randomUUID(),clientB=randomUUID(),deleted=randomUUID();
let db,admin,databaseName,peerUrl;
before(async()=>{
 if(live){
  const url=new URL(live);if(!['localhost','127.0.0.1'].includes(url.hostname)||url.pathname!='/ims_ci')throw Error('Only the isolated local ims_ci service is permitted');
  const {Client}=require('pg');admin=new Client({connectionString:live});await admin.connect();
  databaseName='ims_review_'+randomUUID().replaceAll('-','');await admin.query('create database "'+databaseName+'"');url.pathname='/'+databaseName;peerUrl=url.toString();
  const pg=new Client({connectionString:peerUrl});await pg.connect();db={exec:s=>pg.query(s),query:(s,p)=>pg.query(s,p),close:()=>pg.end()};
 }else{const {PGlite}=await import('@electric-sql/pglite');db=new PGlite();}
 await db.exec(`create schema auth;
  do $$begin create role authenticated;exception when duplicate_object then null;end$$;
  do $$begin create role anon;exception when duplicate_object then null;end$$;
  do $$begin create role service_role;exception when duplicate_object then null;end$$;
  create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
  grant usage on schema public,auth to authenticated,anon,service_role;
  create table public.profiles(id uuid primary key,role text not null,deleted_at timestamptz);
  create table public.clients(id uuid primary key references public.profiles(id));
  create table public.audit_logs(id uuid primary key,actor_id uuid,action text,entity_type text,entity_id uuid,changes jsonb);
  create table public.sessions(id uuid primary key);create table public.plans(id uuid primary key);create table public.payments(id uuid primary key);
  grant select on public.profiles,public.clients to authenticated;
  insert into public.profiles values('${owner}','owner',null),('${trainer}','trainer',null),('${client}','client',null),('${clientB}','client',null),('${deleted}','owner',now());
  insert into public.clients values('${client}'),('${clientB}');`);
 for(const file of ['0070_migration_staging.sql','0076_migration_owner_reviews.sql'])await db.exec(fs.readFileSync(path.join(root,'packages/db/migrations',file),'utf8'));
});
after(async()=>{await db?.close();if(admin){try{if(databaseName)await admin.query('drop database "'+databaseName+'"');}finally{await admin.end();}}});
async function role(id=owner,connection=db,as='authenticated'){await connection.query('reset role');await connection.query('set role '+as);await connection.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);}
async function raw(sql,params=[]){await db.exec('reset role');return(await db.query(sql,params)).rows;}
async function source(kind='client'){
 const record=randomUUID(),batch=randomUUID();await db.exec('reset role');
 await db.query("insert into public.migration_batches(id,source_system,label,created_by)values($1,'vagaro','Synthetic test evidence',$2)",[batch,owner]);
 await db.query("insert into public.migration_records(id,batch_id,record_type,source_id,source_payload,source_hash)values($1,$2,$3,$4,$5,$6)",[record,batch,kind,'synthetic:'+record,JSON.stringify({fields:{'Source Name':'Synthetic client'},provenance:{sheet:'Synthetic',row:1}}),'a'.repeat(64)]);
 return{record,batch};
}
function input(kind='client',proposal={client_id:client}){return{request_id:randomUUID(),expected_revision:0,source_hash:'a'.repeat(64),record_type:kind,decision:'reviewed',owner_confirmed:true,reason:'Synthetic owner reviewed original source evidence.',proposal};}
async function save(record,body,connection=db){return(await connection.query('select public.review_migration_record($1,$2::jsonb) result',[record,JSON.stringify(body)])).rows[0].result;}
const packageProposal=()=>({client_id:client,as_of_date:'2026-01-01',sessions_remaining:0,package_price_cents:null,amount_paid_cents:null,amount_owed_cents:0,credit_cents:null});
test('actual SQL writes one review and one audit, retains raw evidence and never creates operational rows',async()=>{
 const s=await source('package'),body=input('package',packageProposal());const before=await raw('select source_payload,source_hash,reconciliation_status from public.migration_records where id=$1',[s.record]);
 await role();let result=await save(s.record,body);assert.equal(result.revision,1);assert.equal(result.deduped,false);result=await save(s.record,body);assert.equal(result.deduped,true);
 const reviews=await raw('select * from public.migration_record_reviews where record_id=$1',[s.record]);assert.equal(reviews.length,1);assert.equal(reviews[0].proposal.amount_paid_cents,null);assert.equal(reviews[0].proposal.sessions_remaining,0);
 assert.equal((await raw('select * from public.audit_logs where entity_id=$1',[s.record])).length,1);
 assert.deepEqual(await raw('select source_payload,source_hash,reconciliation_status from public.migration_records where id=$1',[s.record]),before);
 for(const table of ['sessions','plans','payments'])assert.equal((await raw('select * from public.'+table)).length,0);
 assert.equal((await raw('select * from public.clients')).length,2);
});
test('SQL rejects trainer/client/disabled/anonymous review mutations and hides review history from non-owners',async()=>{
 const s=await source(),body=input();await role();await save(s.record,body);
 for(const who of [trainer,client,deleted]){await role(who);await assert.rejects(save(s.record,{...body,request_id:randomUUID()}),/owner authorization/);assert.equal((await db.query('select * from public.migration_record_reviews')).rows.length,0);assert.equal((await db.query('select * from public.migration_latest_record_reviews')).rows.length,0);}
 await role(client,db,'anon');await assert.rejects(save(s.record,body),/permission denied/);
});
test('review SQL refuses nulls, extra fields and invalid confirmation before any review is written',async()=>{
 const s=await source(),body=input();await role();
 for(const patch of [{owner_confirmed:false},{decision:null},{proposal:null},{proposal:{client_id:client,role:'owner'}},{source_hash:null},{expected_revision:null},{record_type:'appointment'},{reason:null}])await assert.rejects(save(s.record,{...body,...patch}));
 assert.equal((await raw('select * from public.migration_record_reviews where record_id=$1',[s.record])).length,0);
});
test('SQL validates destination role and identity, valid dates and explicit timezone offsets',async()=>{
 const s=await source('appointment'),p={client_id:client,trainer_id:trainer,starts_at:'2026-01-02T17:00:00Z',duration_minutes:60,session_status:'scheduled'};await role();
 for(const patch of [{client_id:trainer},{trainer_id:client},{client_id:randomUUID()},{trainer_id:deleted},{starts_at:'2026-02-30T17:00:00Z'},{starts_at:'2026-01-02T17:00:00'},{duration_minutes:0},{duration_minutes:60.5},{session_status:'accepted'},{starts_at:'2099-01-02T17:00:00Z',session_status:'completed'}])await assert.rejects(save(s.record,input('appointment',{...p,...patch})));
 const result=await save(s.record,input('appointment',p));assert.equal(result.decision,'reviewed');
});
test('SQL package opening cannot infer unknown quantity, use a future date or combine debt and credit',async()=>{
 const s=await source('package');await role();
 for(const patch of [{sessions_remaining:null},{as_of_date:null},{as_of_date:'2099-01-01'},{as_of_date:'2026-02-30'},{amount_paid_cents:-1},{amount_owed_cents:100,credit_cents:100}])await assert.rejects(save(s.record,input('package',{...packageProposal(),...patch})));
 const body={...input('package',{...packageProposal(),sessions_remaining:null}),decision:'hold',owner_confirmed:false};assert.equal((await save(s.record,body)).decision,'hold');
});
test('new revisions preserve old decisions and stale tabs or changed retry payloads fail',async()=>{
 const s=await source(),first=input();await role();await save(s.record,first);
 await assert.rejects(save(s.record,{...first,reason:'A materially different statement under the same request.'}),/does not match/);
 await assert.rejects(save(s.record,{...first,request_id:randomUUID()}),/Another review/);
 const second={...first,request_id:randomUUID(),expected_revision:1,decision:'hold',owner_confirmed:false,reason:'Synthetic follow-up evidence needs another review.'};assert.equal((await save(s.record,second)).revision,2);
 assert.equal((await raw('select * from public.migration_record_reviews where record_id=$1',[s.record])).length,2);
 await role();const latest=(await db.query('select * from public.migration_latest_record_reviews where record_id=$1',[s.record])).rows;assert.equal(latest.length,1);assert.equal(latest[0].revision,2);
});
test('source checksum changes and frozen batches prevent a new review',async()=>{
 const s=await source(),body=input();await role();await assert.rejects(save(s.record,{...body,source_hash:'b'.repeat(64)}),/Source evidence changed/);
 await raw("update public.migration_batches set status='approved' where id=$1",[s.batch]);await role();await assert.rejects(save(s.record,body),/frozen/);
});
test('a lost receipt retry after batch freeze returns only the already saved revision',async()=>{
 const s=await source(),body=input();await role();await save(s.record,body);await raw("update public.migration_batches set status='approved' where id=$1",[s.batch]);await role();assert.equal((await save(s.record,body)).deduped,true);
 assert.equal((await raw('select * from public.migration_record_reviews where record_id=$1',[s.record])).length,1);
});
test('audit failure rolls back the review and leaves a retry possible',async()=>{
 const s=await source(),body=input();await db.exec("create function public.fail_review_audit()returns trigger language plpgsql as $$begin raise exception 'Synthetic review audit failure';end$$;create trigger fail_review_audit before insert on public.audit_logs for each row execute function public.fail_review_audit();");
 try{await role();await assert.rejects(save(s.record,body),/Synthetic review audit failure/);assert.equal((await raw('select * from public.migration_record_reviews where record_id=$1',[s.record])).length,0);}
 finally{await db.exec('reset role;drop trigger fail_review_audit on public.audit_logs;drop function public.fail_review_audit();');}
 await role();assert.equal((await save(s.record,body)).revision,1);
});
test('review history cannot be silently rewritten or truncated, including by an administrative connection',async()=>{
 const s=await source(),body=input();await role();await save(s.record,body);
 await assert.rejects(db.query('delete from public.migration_record_reviews where record_id=$1',[s.record]),/permission denied/);
 await db.exec('reset role');await assert.rejects(db.query("update public.migration_record_reviews set reason='Silent history rewrite' where record_id=$1",[s.record]),/append-only/);
 await assert.rejects(db.query('truncate public.migration_record_reviews'),/append-only/);
});
test('concurrent PostgreSQL retries create exactly one review and audit',{skip:!live},async()=>{
 const s=await source(),body=input();const {Client}=require('pg'),peers=[new Client({connectionString:peerUrl}),new Client({connectionString:peerUrl})];
 try{await Promise.all(peers.map(async p=>{await p.connect();await role(owner,p);}));const results=await Promise.all(peers.map(p=>save(s.record,body,p)));assert.deepEqual(results.map(r=>r.deduped).sort(),[false,true]);assert.equal((await raw('select * from public.audit_logs where entity_id=$1',[s.record])).length,1);}
 finally{await Promise.all(peers.map(p=>p.end()));}
});
test('concurrent different decisions from the same revision cannot overwrite one another',{skip:!live},async()=>{
 const s=await source(),body=input();const {Client}=require('pg'),peers=[new Client({connectionString:peerUrl}),new Client({connectionString:peerUrl})];
 try{await Promise.all(peers.map(async p=>{await p.connect();await role(owner,p);}));const results=await Promise.allSettled(peers.map((p,i)=>save(s.record,{...body,request_id:randomUUID(),reason:'Synthetic parallel decision number '+i},p)));assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(results.find(r=>r.status==='rejected').reason.code,'40001');assert.equal((await raw('select * from public.migration_record_reviews where record_id=$1',[s.record])).length,1);}
 finally{await Promise.all(peers.map(p=>p.end()));}
});
