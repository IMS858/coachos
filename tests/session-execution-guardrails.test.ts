import test from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {readFileSync} from "node:fs";
import {PGlite} from "@electric-sql/pglite";
const owner="11111111-1111-4111-8111-111111111111",trainer="22222222-2222-4222-8222-222222222222",other="33333333-3333-4333-8333-333333333333",client="44444444-4444-4444-8444-444444444444",program="55555555-5555-4555-8555-555555555555",session="66666666-6666-4666-8666-666666666666",exercise="77777777-7777-4777-8777-777777777777",secondClient="88888888-8888-4888-8888-888888888888";
const version="2020-01-01T00:00:00Z";
const prescription={sets:3,reps:"8",load:"25 lb",rpe:7,rest_seconds:60,tempo:"",cue:"Control"};
const actual={sets_completed:3,reps_completed:"8",load_performed:"25 lb",rpe_actual:7.5,coach_note:"Private observation never released"};
test("complete session execution rollout is atomic, scoped, replay-safe and client-safe",async t=>{
 const db=new PGlite();
 try{
  await db.exec(`create role anon;create role authenticated;create schema auth;
   create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
   grant usage on schema auth to authenticated;
   create table public.profiles(id uuid primary key,role text,deleted_at timestamptz);
   create table public.clients(id uuid primary key references public.profiles(id),primary_trainer_id uuid);
   create table public.programs(id uuid primary key,client_id uuid,trainer_id uuid,status text,data jsonb,updated_at timestamptz);
   create table public.sessions(id uuid primary key,client_id uuid,trainer_id uuid,program_id uuid,status text,scheduled_at timestamptz,updated_at timestamptz);
   create table public.exercises(id uuid primary key,name text,ims_label text,client_visible boolean);
   create table public.exercise_reviews(exercise_id uuid,safety_status text);
   create table public.program_exercises(id uuid primary key,program_id uuid,exercise_id uuid,block text,position integer,sets integer,reps text,load_prescription text,rest_seconds integer,tempo text,notes text);
   create table public.audit_logs(id uuid primary key default gen_random_uuid(),actor_id uuid,action text,entity_type text,entity_id uuid,changes jsonb);
   insert into public.profiles(id,role) values('${owner}','owner'),('${trainer}','trainer'),('${other}','trainer'),('${client}','client'),('${secondClient}','client');
   insert into public.clients values('${client}','${trainer}'),('${secondClient}','${other}');
   insert into public.exercises values('${exercise}','Synthetic squat',null,true);
   insert into public.exercise_reviews values('${exercise}','approved');
   grant select on public.profiles,public.clients,public.programs,public.sessions,public.exercises to authenticated;`);
  await db.query("insert into public.programs values($1,$2,$3,'draft',$4::jsonb,$5)",[program,client,trainer,JSON.stringify({source:"ims_library_program",exercises:[{canonical_id:"EX-1",exercise_id:exercise,name:"Synthetic squat",...prescription}]}),version]);
  await db.query("insert into public.sessions values($1,$2,$3,$4,'scheduled','2020-01-02T18:00:00Z',$5)",[session,client,trainer,program,version]);
  await db.exec(readFileSync("packages/db/migrations/0046_program_decision_notes.sql","utf8"));
  await db.exec(readFileSync("packages/db/migrations/0047_session_exercise_performance.sql","utf8"));
  await db.exec(readFileSync("packages/db/migrations/0048_session_execution_guardrails.sql","utf8"));
  const asActor=async(id:string)=>{await db.exec("reset role");await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);await db.exec("set role authenticated");};
  const id=randomUUID();
  const save=async(opts:{record?:string;session?:string;key?:string;version?:string|null;programVersion?:string;prescription?:unknown;actual?:unknown}={})=>(await db.query<{result:{ok:boolean;id:string;updated_at:string;deduped:boolean}}>("select public.save_session_performance($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb) as result",[opts.session??session,opts.record??id,opts.key??"quick:0:EX-1",opts.version??null,opts.programVersion??version,JSON.stringify(opts.prescription??prescription),JSON.stringify(opts.actual??actual)])).rows[0].result;
  await t.test("anonymous, client, unrelated and deleted staff cannot save",async()=>{
   await db.exec("set role anon");await assert.rejects(save(),/permission denied/);
   for(const actor of [client,secondClient,other]){await asActor(actor);await assert.rejects(save(),/staff required|access denied/);}
   await db.exec(`reset role;update public.profiles set deleted_at=now() where id='${trainer}'`);await asActor(trainer);await assert.rejects(save(),/staff required/);
   await db.exec(`reset role;update public.profiles set deleted_at=null where id='${trainer}'`);
  });
  await asActor(trainer);
  await t.test("rejects empty, coerced, stale or forged prescription results",async()=>{
   await assert.rejects(save({actual:{sets_completed:null,reps_completed:"",load_performed:"",rpe_actual:null,coach_note:""}}),/empty rows/);
   await assert.rejects(save({actual:{...actual,sets_completed:true}}),/integer/);
   await assert.rejects(save({actual:{...actual,rpe_actual:7.55}}),/decimal/);
   await assert.rejects(save({prescription:{...prescription,load:"100 lb"}}),/Prescription changed/);
   await assert.rejects(save({programVersion:"2019-01-01T00:00:00Z"}),/Program changed/);
  });
  let first=await save();
  await t.test("save and lost-response replay create one result, one history and one audit",async()=>{
   assert.equal(first.ok,true);assert.equal((await save()).deduped,true);
   assert.equal((await db.query("select id from public.session_exercise_performance")).rows.length,1);
   assert.equal((await db.query("select id from public.session_performance_history")).rows.length,1);
   await db.exec("reset role");assert.equal((await db.query("select id from public.audit_logs")).rows.length,1);await asActor(trainer);
   await assert.rejects(db.query("update public.session_exercise_performance set coach_note='bypass'"),/permission denied/);
  });
  await t.test("corrections require current versions and preserve original prescription",async()=>{
   await assert.rejects(save({actual:{...actual,load_performed:"30 lb"}}),/Result changed/);
   const next=await save({version:first.updated_at,actual:{...actual,load_performed:"30 lb"}});assert.equal(next.deduped,false);
   assert.equal((await save({version:first.updated_at,actual:{...actual,load_performed:"30 lb"}})).deduped,true);
   await assert.rejects(save({version:first.updated_at,actual:{...actual,load_performed:"35 lb"}}),/Result changed/);
   assert.equal((await db.query<{prescription_snapshot:{load:string}}>("select prescription_snapshot from public.session_exercise_performance")).rows[0].prescription_snapshot.load,"25 lb");
   assert.equal((await db.query("select id from public.session_performance_history")).rows.length,2);first=next;
  });
  await t.test("client history is an allowlist gated by completion, publication and exercise safety",async()=>{
   await asActor(client);assert.equal((await db.query("select * from public.session_exercise_performance")).rows.length,0);assert.equal((await db.query("select * from public.session_performance_history")).rows.length,0);
   assert.equal((await db.query("select * from public.get_my_coached_performance()")).rows.length,0);
   await db.exec(`reset role;update public.sessions set status='completed' where id='${session}';update public.programs set status='active' where id='${program}'`);await asActor(client);
   const rows=(await db.query("select * from public.get_my_coached_performance()")).rows;assert.equal(rows.length,1);assert.equal("coach_note" in rows[0],false);assert.equal("prescription_snapshot" in rows[0],false);
   await asActor(secondClient);assert.equal((await db.query("select * from public.get_my_coached_performance()")).rows.length,0);
   await db.exec("reset role;update public.exercise_reviews set safety_status='pending'");await asActor(client);assert.equal((await db.query("select * from public.get_my_coached_performance()")).rows.length,0);
   await db.exec("reset role;update public.exercise_reviews set safety_status='approved'");
  });
  await t.test("future and missed sessions cannot change performed history",async()=>{
   for(const state of ["requested","cancelled","late_cancelled","no_show"]){await db.exec("reset role");await db.query("update public.sessions set status=$1 where id=$2",[state,session]);await asActor(trainer);await assert.rejects(save({version:first.updated_at,actual:{...actual,load_performed:"40 lb"}}),/occurred training sessions/);}
   await db.exec(`reset role;update public.sessions set status='scheduled',scheduled_at='2999-01-01' where id='${session}'`);await asActor(trainer);await assert.rejects(save(),/occurred training sessions/);
   await db.exec(`reset role;update public.sessions set scheduled_at='2020-01-02T18:00:00Z' where id='${session}'`);
  });
  await t.test("audit failure rolls back result, correction and history",async()=>{
   await db.exec("create function public.fail_audit() returns trigger language plpgsql as $$ begin raise exception 'Synthetic audit failure'; end $$;create trigger synthetic before insert on public.audit_logs for each row execute function public.fail_audit();");
   await asActor(trainer);await assert.rejects(save({version:first.updated_at,actual:{...actual,load_performed:"40 lb"}}),/Synthetic audit failure/);
   assert.equal((await db.query<{load_performed:string}>("select load_performed from public.session_exercise_performance")).rows[0].load_performed,"30 lb");assert.equal((await db.query("select id from public.session_performance_history")).rows.length,2);
   await db.exec("reset role;drop trigger synthetic on public.audit_logs");
  });
  await t.test("explicit program links cannot move to another client or replace performed history",async()=>{
   const another=randomUUID(),fresh=randomUUID(),wrong=randomUUID();
   await db.query("insert into public.programs values($1,$2,$3,'draft',$4::jsonb,$5),($6,$7,$3,'draft',$4::jsonb,$5)",[another,client,trainer,JSON.stringify({source:"ims_library_program",exercises:[]}),version,wrong,secondClient]);
   await db.query("insert into public.sessions values($1,$2,$3,null,'scheduled','2020-01-01',$4)",[fresh,client,trainer,version]);
   await asActor(trainer);
   const link=(sessionId:string,programId:string,expected:string|null)=>db.query("select public.link_session_training_program($1,$2,$3)",[sessionId,programId,expected]);
   await assert.rejects(link(fresh,wrong,null),/existing client program/);await link(fresh,another,null);await link(fresh,another,null);await assert.rejects(link(session,another,program),/Performed evidence/);
  });
 }finally{await db.close();}
});
