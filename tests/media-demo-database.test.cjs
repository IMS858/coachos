const {test,before,beforeEach,after}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');
const root=path.join(__dirname,'..'),live=process.env.IMS_TEST_DATABASE_URL;
const owner='11111111-1111-4111-8111-111111111111',coach='22222222-2222-4222-8222-222222222222',other='33333333-3333-4333-8333-333333333333',client='44444444-4444-4444-8444-444444444444',client2='55555555-5555-4555-8555-555555555555',exercise='66666666-6666-4666-8666-666666666666',unsafe='77777777-7777-4777-8777-777777777777';
let db,admin,url,name;
before(async()=>{
 if(live){const parsed=new URL(live);if(!['localhost','127.0.0.1'].includes(parsed.hostname)||parsed.pathname!='/ims_ci')throw Error('Only isolated local ims_ci tests are allowed');const {Client}=require('pg');admin=new Client({connectionString:live});await admin.connect();name='ims_demos_'+process.pid;await admin.query('create database '+name);parsed.pathname='/'+name;url=parsed.toString();const pg=new Client({connectionString:url});await pg.connect();db={exec:s=>pg.query(s),query:(s,p)=>pg.query(s,p),close:()=>pg.end()};}
 else{const {PGlite}=await import('@electric-sql/pglite');db=new PGlite();}
 await db.exec(`do $$begin if not exists(select 1 from pg_roles where rolname='anon') then create role anon;end if;if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated;end if;end$$;
 create schema auth;create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth,public to authenticated;
 create table public.profiles(id uuid primary key,role text,deleted_at timestamptz);create table public.clients(id uuid primary key,primary_trainer_id uuid);
 create table public.exercises(id uuid primary key,name text,ims_label text,video_url text,client_visible boolean);create table public.exercise_reviews(exercise_id uuid primary key,safety_status text);
 create table public.client_media(id uuid primary key,client_id uuid not null,uploaded_by uuid,kind text,category text,title text,note text,storage_path text,exercise_id uuid,archived_at timestamptz,created_at timestamptz default now());
 create table public.audit_logs(id uuid primary key,actor_id uuid,action text,entity_type text,entity_id uuid,changes jsonb);
 create schema storage;create table storage.objects(id integer primary key,bucket_id text,name text);alter table storage.objects enable row level security;
 grant usage on schema storage to anon,authenticated;grant select,insert,update,delete on storage.objects to anon,authenticated;create policy legacy_storage_all on storage.objects for all to anon,authenticated using(true) with check(true);
 grant select on public.profiles,public.clients to authenticated;`);
 for(const file of ['0066_client_media_review.sql','0067_client_media_feedback_boundary.sql','0068_client_media_storage_boundary.sql'])await db.exec(fs.readFileSync(path.join(root,'packages/db/migrations',file),'utf8'));
});
after(async()=>{await db?.close();if(admin){try{await admin.query('drop database '+name);}finally{await admin.end();}}});
beforeEach(async()=>{await db.exec(`reset role;select set_config('request.jwt.claim.sub','',false);truncate public.client_media,public.audit_logs,public.exercise_reviews,public.exercises,public.clients,public.profiles,storage.objects cascade;
 insert into public.profiles values('${owner}','owner',null),('${coach}','trainer',null),('${other}','trainer',null),('${client}','client',null),('${client2}','client',null);
 insert into public.clients values('${client}','${coach}'),('${client2}','${other}');
 insert into public.exercises values('${exercise}','Approved synthetic movement',null,'https://synthetic.invalid/demo',true),('${unsafe}','Private synthetic movement',null,'https://synthetic.invalid/private',false);
 insert into public.exercise_reviews values('${exercise}','approved'),('${unsafe}','pending');
 insert into storage.objects values(1,'client-media','${client}/clip.mp4'),(2,'avatars','${client}/avatar.png');`);});
async function actor(id,role='authenticated'){await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);await db.exec('set role '+role);}
async function assign(ids=[exercise]){return (await db.query('select public.assign_client_media_demos($1,$2,$3,$4) result',[client,ids,'mobility','Synthetic cue'])).rows[0].result;}
test('direct Storage access cannot bypass media approval and assignment gates, other buckets are unchanged',async()=>{
 for(const role of ['authenticated','anon']){await actor(role==='authenticated'?coach:'',role);assert.deepEqual((await db.query('select id from storage.objects order by id')).rows.map(r=>r.id),[2]);await assert.rejects(db.query("insert into storage.objects values(3,'client-media','forged.mp4')"),e=>e.code==='42501');await db.query("update storage.objects set name='replaced' where id=1");await db.query('delete from storage.objects where id=1');await assert.rejects(db.query("update storage.objects set bucket_id='client-media' where id=2"),e=>e.code==='42501');}
 await db.exec('reset role');assert.equal((await db.query('select name from storage.objects where id=1')).rows[0].name,client+'/clip.mp4');assert.equal((await db.query('select count(*)::int n from storage.objects')).rows[0].n,2);
});
test('approved demo assignment is atomic and idempotent without publishing a prescription',async()=>{
 await actor(coach);const first=await assign([exercise,exercise]),again=await assign();assert.equal(first.added,1);assert.equal(first.skipped,0);assert.equal(again.added,0);assert.equal(again.skipped,1);
 await actor(client);const rows=(await db.query('select client_id,exercise_id,note,review_status from public.client_media')).rows;assert.equal(rows.length,1);assert.equal(rows[0].exercise_id,exercise);assert.equal(rows[0].review_status,'not_required');
 await db.exec('reset role');assert.equal((await db.query('select count(*)::int n from public.audit_logs')).rows[0].n,1);
});
test('unapproved batch member rejects entire assignment; approval revocation hides existing demo',async()=>{
 await actor(coach);await assert.rejects(assign([exercise,unsafe]),e=>e.code==='22023');assert.equal((await db.query('select id from public.client_media')).rows.length,0);await assign();await db.exec("reset role;update public.exercise_reviews set safety_status='pending'");await actor(client);assert.equal((await db.query('select id from public.client_media')).rows.length,0);
});
test('missing deleted unauthorized and anonymous identities cannot assign demonstrations',async()=>{
 for(const id of [other,client,client2,'','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa']){await actor(id);await assert.rejects(assign(),e=>e.code==='42501');}
 await actor('', 'anon');await assert.rejects(assign(),e=>e.code==='42501');await db.exec(`reset role;update public.profiles set deleted_at=now() where id='${coach}'`);await actor(coach);await assert.rejects(assign(),e=>e.code==='42501');await actor(owner);assert.equal((await assign()).added,1);
});
test('demo audit failure rolls back assignments',async()=>{
 await db.exec("create function public.fail_demo_audit() returns trigger language plpgsql as $$begin raise exception 'synthetic audit failed';end$$;create trigger fail_demo_audit before insert on public.audit_logs for each row execute function public.fail_demo_audit();");
 try{await actor(coach);await assert.rejects(assign(),/synthetic audit failed/);assert.equal((await db.query('select id from public.client_media')).rows.length,0);}finally{await db.exec('reset role;drop trigger fail_demo_audit on public.audit_logs;drop function public.fail_demo_audit();');}
});
test('concurrent PostgreSQL assignments create only one live demo and audit',{skip:!live},async()=>{
 const {Client}=require('pg');const peers=[new Client({connectionString:url}),new Client({connectionString:url})];try{await Promise.all(peers.map(async p=>{await p.connect();await p.query("select set_config('request.jwt.claim.sub',$1,false)",[coach]);await p.query('set role authenticated');}));const replies=await Promise.all(peers.map(p=>p.query('select public.assign_client_media_demos($1,$2,$3,$4) result',[client,[exercise],'mobility','Synthetic cue'])));assert.deepEqual(replies.map(r=>r.rows[0].result.added).sort(),[0,1]);await db.exec('reset role');assert.equal((await db.query('select count(*)::int n from public.client_media')).rows[0].n,1);}finally{await Promise.all(peers.map(p=>p.end()));}
});
