const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const fs=require('node:fs');
const path=require('node:path');
const ids=Object.fromEntries(['owner','trainer','other','client','clientB','disabled','program','programB','exercise','exerciseB'].map(k=>[k,randomUUID()]));
let db,admin,databaseName;
before(async()=>{
  const live=process.env.IMS_TEST_DATABASE_URL;
  if(live){
    const url=new URL(live);
    if(!['localhost','127.0.0.1'].includes(url.hostname)||url.pathname!='/ims_ci')throw Error('Only isolated local ims_ci is permitted');
    const {Client}=require('pg');admin=new Client({connectionString:live});await admin.connect();
    databaseName='ims_nested_'+randomUUID().replaceAll('-','');
    await admin.query('create database "'+databaseName+'"');url.pathname='/'+databaseName;
    const pg=new Client({connectionString:url.toString()});await pg.connect();
    db={exec:s=>pg.query(s),query:(s,p)=>pg.query(s,p),close:()=>pg.end()};
  }else{const {PGlite}=await import('@electric-sql/pglite');db=new PGlite();}
  await db.exec(`create schema auth;
    do $$begin create role authenticated;exception when duplicate_object then null;end$$;
    do $$begin create role anon;exception when duplicate_object then null;end$$;
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant usage on schema public,auth to authenticated,anon;
    create table public.profiles(id uuid primary key,role text,deleted_at timestamptz);
    create table public.clients(id uuid primary key,primary_trainer_id uuid);
    create table public.plans(id uuid primary key,client_id uuid);
    create table public.sessions(id uuid primary key,client_id uuid);
    create table public.programs(id uuid primary key,client_id uuid,status text);
    create table public.program_exercises(id uuid primary key,program_id uuid,notes text);
    create table public.messages(id uuid primary key,client_id uuid,body text);
    insert into public.profiles values
      ('${ids.owner}','owner',null),('${ids.trainer}','trainer',null),('${ids.other}','trainer',null),
      ('${ids.client}','client',null),('${ids.clientB}','client',null),('${ids.disabled}','trainer',now());
    insert into public.clients values('${ids.client}','${ids.trainer}'),('${ids.clientB}','${ids.other}');
    insert into public.programs values('${ids.program}','${ids.client}','published'),('${ids.programB}','${ids.clientB}','published');
    insert into public.program_exercises values('${ids.exercise}','${ids.program}','A'),('${ids.exerciseB}','${ids.programB}','B');
    insert into public.plans values(gen_random_uuid(),'${ids.client}'),(gen_random_uuid(),'${ids.clientB}');
    insert into public.sessions values(gen_random_uuid(),'${ids.client}'),(gen_random_uuid(),'${ids.clientB}');
    insert into public.messages values(gen_random_uuid(),'${ids.client}','A'),(gen_random_uuid(),'${ids.clientB}','B');
    grant select on public.profiles to authenticated;`);
  for(const table of ['clients','plans','sessions','programs','program_exercises','messages']){
    await db.exec(`alter table public.${table} enable row level security;
      grant all on public.${table} to authenticated;
      create policy legacy_broad_access on public.${table} for all to authenticated using(true) with check(true);`);
  }
  const sql=fs.readFileSync(path.join(__dirname,'../packages/db/migrations/0087_scope_nested_program_data.sql'),'utf8');
  await db.exec(sql);await db.exec(sql); // forward reconciliation must be safely repeatable
});
after(async()=>{await db?.close();if(admin){try{if(databaseName)await admin.query('drop database "'+databaseName+'"');}finally{await admin.end();}}});
async function role(id,as='authenticated'){
  await db.exec('reset role');await db.exec('set role '+as);
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id??'']);
}
async function rows(sql,p=[]){return(await db.query(sql,p)).rows;}
test('owner retains access; assigned trainer sees only assigned workout children despite broad legacy policies',async()=>{
  await role(ids.owner);assert.equal((await rows('select id from public.program_exercises')).length,2);
  await role(ids.trainer);assert.deepEqual((await rows('select id from public.program_exercises')).map(r=>r.id),[ids.exercise]);
  await role(ids.other);assert.deepEqual((await rows('select id from public.program_exercises')).map(r=>r.id),[ids.exerciseB]);
});
test('unrelated child writes and moving a workout into another client are denied',async()=>{
  await role(ids.trainer);
  assert.equal((await rows('update public.program_exercises set notes=$1 where id=$2 returning id',['blocked',ids.exerciseB])).length,0);
  await assert.rejects(db.query('update public.program_exercises set program_id=$1 where id=$2',[ids.programB,ids.exercise]),/row-level security/);
  await assert.rejects(db.query('insert into public.program_exercises values($1,$2,$3)',[randomUUID(),ids.programB,'blocked']),/row-level security/);
  assert.equal((await rows('delete from public.program_exercises where id=$1 returning id',[ids.exerciseB])).length,0);
  assert.equal((await rows('update public.program_exercises set notes=$1 where id=$2 returning id',['assigned edit',ids.exercise])).length,1);
});
test('clients do not acquire new workout-child visibility; published-parent queries do not recurse',async()=>{
  await role(ids.client);assert.equal((await rows('select id from public.program_exercises')).length,0);
  assert.deepEqual((await rows('select id from public.programs')).map(r=>r.id),[ids.program]);
  assert.equal((await rows('select id from public.programs p where exists(select 1 from public.program_exercises e where e.program_id=p.id)')).length,0);
});
test('disabled and missing accounts cannot read core rows, even with permissive legacy policies',async()=>{
  for(const id of [ids.disabled,randomUUID(),null]){
    await role(id);
    for(const table of ['clients','plans','sessions','programs','program_exercises','messages'])assert.equal((await rows('select id from public.'+table)).length,0,table);
  }
});
test('trainer/client row scope is enforced on parent tables and cannot be reassigned by a write',async()=>{
  await role(ids.trainer);
  for(const table of ['clients','plans','programs','messages'])assert.equal((await rows('select id from public.'+table)).length,1,table);
  await assert.rejects(db.query('insert into public.programs values($1,$2,$3)',[randomUUID(),ids.clientB,'draft']),/row-level security/);
  await role(ids.client);
  for(const table of ['clients','plans','programs','messages'])assert.equal((await rows('select id from public.'+table)).length,1,table);
  await assert.rejects(db.query('insert into public.plans values($1,$2)',[randomUUID(),ids.client]),/row-level security/);
});
test('ordinary users cannot truncate operational records or delete conversation history',async()=>{
  await role(ids.owner);
  for(const table of ['clients','plans','sessions','programs','program_exercises','messages'])await assert.rejects(db.exec('truncate public.'+table),/permission denied/);
  await assert.rejects(db.exec('delete from public.messages'),/permission denied/);
});
test('private lookups expose no anonymous executor and take no caller-controlled actor',async()=>{
  await role(null,'anon');await assert.rejects(db.query('select ims_private.active_account()'),/permission denied/);
  await db.exec('reset role');
  const funcs=await rows("select p.proname,p.prosecdef,p.proconfig,has_function_privilege('anon',p.oid,'execute') anon from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='ims_private'");
  assert.equal(funcs.length,3);
  for(const f of funcs){assert.equal(f.prosecdef,true);assert.equal(f.anon,false);assert.ok(f.proconfig.some(v=>v.startsWith('search_path=')));}
});
