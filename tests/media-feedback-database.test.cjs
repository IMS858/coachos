const {test,before,beforeEach,after}=require('node:test');
const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');
const root=path.join(__dirname,'..');
const owner='11111111-1111-4111-8111-111111111111',coach='22222222-2222-4222-8222-222222222222',other='33333333-3333-4333-8333-333333333333',client='44444444-4444-4444-8444-444444444444',client2='55555555-5555-4555-8555-555555555555',clip='66666666-6666-4666-8666-666666666666',clip2='77777777-7777-4777-8777-777777777777',demo='88888888-8888-4888-8888-888888888888',exercise='99999999-9999-4999-8999-999999999999';
let db,admin,testUrl,databaseName;const live=process.env.IMS_TEST_DATABASE_URL;
before(async()=>{
 if(live){const parsed=new URL(live);if(!['localhost','127.0.0.1'].includes(parsed.hostname)||parsed.pathname!='/ims_ci')throw Error('Only isolated localhost ims_ci tests are allowed');
  const {Client}=require('pg');admin=new Client({connectionString:live});await admin.connect();databaseName='ims_media_'+process.pid;await admin.query('create database '+databaseName);parsed.pathname='/'+databaseName;testUrl=parsed.toString();const pg=new Client({connectionString:testUrl});await pg.connect();db={exec:s=>pg.query(s),query:(s,p)=>pg.query(s,p),close:()=>pg.end()};
 }else{const {PGlite}=await import('@electric-sql/pglite');db=new PGlite();}
 await db.exec(`do $$begin if not exists(select 1 from pg_roles where rolname='anon') then create role anon;end if;if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated;end if;end$$;
 create schema auth;create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth,public to authenticated;
 create table public.profiles(id uuid primary key,role text,deleted_at timestamptz);
 create table public.clients(id uuid primary key,primary_trainer_id uuid);
 create table public.exercises(id uuid primary key,client_visible boolean);
 create table public.exercise_reviews(exercise_id uuid primary key,safety_status text);
 create table public.client_media(id uuid primary key,client_id uuid not null,uploaded_by uuid,kind text,title text,note text,storage_path text,exercise_id uuid,archived_at timestamptz,created_at timestamptz default now());
 create table public.audit_logs(id uuid primary key,actor_id uuid,action text,entity_type text,entity_id uuid,changes jsonb,created_at timestamptz default now());
 alter table public.client_media enable row level security;grant all on public.client_media to anon,authenticated;
 create policy legacy_broad_read on public.client_media for select to authenticated using(true);
 grant select on public.profiles,public.clients to authenticated;`);
 for(const name of ['0066_client_media_review.sql','0067_client_media_feedback_boundary.sql'])await db.exec(fs.readFileSync(path.join(root,'packages/db/migrations',name),'utf8'));
});
after(async()=>{await db?.close();if(admin){try{await admin.query('drop database '+databaseName);}finally{await admin.end();}}});
beforeEach(async()=>{
 await db.exec(`reset role;select set_config('request.jwt.claim.sub','',false);truncate public.client_media,public.audit_logs,public.exercise_reviews,public.exercises,public.clients,public.profiles cascade;
 insert into public.profiles values('${owner}','owner',null),('${coach}','trainer',null),('${other}','trainer',null),('${client}','client',null),('${client2}','client',null);
 insert into public.clients values('${client}','${coach}'),('${client2}','${other}');
 insert into public.exercises values('${exercise}',false);insert into public.exercise_reviews values('${exercise}','pending');
 insert into public.client_media(id,client_id,uploaded_by,kind,title,storage_path) values('${clip}','${client}','${client}','video','Synthetic clip','${client}/from-client-${clip}.mp4'),('${clip2}','${client2}','${client2}','video','Other synthetic clip','${client2}/from-client-${clip2}.mp4');
 insert into public.client_media(id,client_id,uploaded_by,kind,title,exercise_id) values('${demo}','${client}','${coach}','video','Private synthetic demo','${exercise}');`);
});
async function actor(id,role='authenticated'){await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);await db.exec('set role '+role);}
async function review(text='Move slowly and pause at the bottom.'){return (await db.query('select public.finalize_client_media_review($1,$2) result',[clip,text])).rows[0].result;}
async function state(){await db.exec('reset role');return (await db.query('select review_status,coach_feedback,reviewed_by,archived_at from public.client_media where id=$1',[clip])).rows[0];}
test('client submission enters queue; finalized feedback persists and clears only its row',async()=>{
 assert.equal((await state()).review_status,'awaiting_review');await actor(coach);const result=await review();assert.equal(result.ok,true);assert.equal(result.deduped,false);assert.equal((await review()).deduped,true);
 await actor(client);const row=(await db.query('select coach_feedback,review_status from public.client_media where id=$1',[clip])).rows[0];assert.equal(row.review_status,'reviewed');assert.equal(row.coach_feedback,'Move slowly and pause at the bottom.');
 await db.exec('reset role');assert.equal((await db.query("select id from public.client_media where review_status='awaiting_review'")).rows.length,1);assert.equal((await db.query("select id from public.audit_logs where action='client_media.reviewed'")).rows.length,1);
});
test('owner and assigned coach can review; other client trainer deleted missing and anonymous accounts cannot',async()=>{
 for(const uid of [client,client2,other,'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','']){await actor(uid);await assert.rejects(review(),e=>e.code==='42501');}
 await db.exec(`reset role;update public.profiles set deleted_at=now() where id='${coach}'`);await actor(coach);await assert.rejects(review(),e=>e.code==='42501');
 await actor('', 'anon');await assert.rejects(review(),e=>e.code==='42501');await actor(owner);assert.equal((await review()).ok,true);
});
test('restrictive scope survives legacy broad read; clients cannot read unapproved demos',async()=>{
 await actor(client);assert.deepEqual((await db.query('select id from public.client_media order by id')).rows.map(r=>r.id),[clip]);
 await actor(coach);assert.deepEqual((await db.query('select id from public.client_media order by id')).rows.map(r=>r.id),[clip,demo]);
 await actor(other);assert.deepEqual((await db.query('select id from public.client_media order by id')).rows.map(r=>r.id),[clip2]);
 await db.exec(`reset role;update public.exercises set client_visible=true;update public.exercise_reviews set safety_status='approved'`);await actor(client);assert.equal((await db.query('select id from public.client_media')).rows.length,2);
 await db.exec(`reset role;update public.profiles set deleted_at=now() where id='${client}'`);await actor(client);assert.equal((await db.query('select id from public.client_media')).rows.length,0);
});
test('direct client/staff writes, truncate and privileged finalized rewrite are rejected',async()=>{
 for(const uid of [client,coach,owner]){await actor(uid);await assert.rejects(db.query("update public.client_media set coach_feedback='Fake' where id=$1",[clip]),e=>e.code==='42501');await assert.rejects(db.query('truncate public.client_media'),e=>e.code==='42501');}
 await actor(coach);await review();await assert.rejects(review('Different later response'),e=>e.code==='22023');
 await db.exec('reset role');await assert.rejects(db.query("update public.client_media set coach_feedback='Silent rewrite' where id=$1",[clip]),e=>e.code==='42501');
});
test('audit failure rolls back review and archive, leaving queued evidence intact',async()=>{
 await db.exec("create function public.reject_media_audit() returns trigger language plpgsql as $$begin raise exception 'synthetic audit failure';end$$;create trigger reject_media_audit before insert on public.audit_logs for each row execute function public.reject_media_audit();");
 try{await actor(coach);await assert.rejects(review(),/synthetic audit failure/);assert.equal((await state()).review_status,'awaiting_review');await actor(coach);await assert.rejects(db.query('select public.archive_client_media($1)',[clip]),/synthetic audit failure/);assert.equal((await state()).archived_at,null);}
 finally{await db.exec('reset role;drop trigger reject_media_audit on public.audit_logs;drop function public.reject_media_audit();');}
});
test('archiving is scoped and idempotent, preserves feedback and excludes client playback records',async()=>{
 await actor(other);await assert.rejects(db.query('select public.archive_client_media($1)',[clip]),e=>e.code==='42501');
 await actor(coach);await review();let result=(await db.query('select public.archive_client_media($1) result',[clip])).rows[0].result;assert.equal(result.ok,true);result=(await db.query('select public.archive_client_media($1) result',[clip])).rows[0].result;assert.equal(result.deduped,true);
 await assert.rejects(review(),e=>e.code==='22023');await actor(client);assert.equal((await db.query('select id from public.client_media where id=$1',[clip])).rows.length,0);assert.equal((await state()).coach_feedback,'Move slowly and pause at the bottom.');
});
test('concurrent PostgreSQL reviews commit one feedback and one audit',{skip:!live},async()=>{
 const {Client}=require('pg');const peers=[new Client({connectionString:testUrl}),new Client({connectionString:testUrl})];
 try{await Promise.all(peers.map(async p=>{await p.connect();await p.query("select set_config('request.jwt.claim.sub',$1,false)",[coach]);await p.query('set role authenticated');}));const replies=await Promise.all(peers.map(p=>p.query('select public.finalize_client_media_review($1,$2) result',[clip,'Slow controlled movement.'])));assert.deepEqual(replies.map(r=>r.rows[0].result.deduped).sort(),[false,true]);await db.exec('reset role');assert.equal((await db.query('select id from public.audit_logs')).rows.length,1);}
 finally{await Promise.all(peers.map(p=>p.end()));}
});
