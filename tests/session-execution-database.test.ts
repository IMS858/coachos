import test from "node:test";import assert from "node:assert/strict";import {randomUUID} from "node:crypto";import {readFileSync} from "node:fs";import {PGlite} from "@electric-sql/pglite";
const owner="11111111-1111-4111-8111-111111111111",trainer="22222222-2222-4222-8222-222222222222",other="33333333-3333-4333-8333-333333333333",client="44444444-4444-4444-8444-444444444444",program="55555555-5555-4555-8555-555555555555",session="66666666-6666-4666-8666-666666666666",exercise="77777777-7777-4777-8777-777777777777";
test("session exercise performance migration keeps prescription identity immutable and staff-scoped",async()=>{
 const db=new PGlite();try{
  await db.exec(`create role anon;create role authenticated;create schema auth;create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
  grant usage on schema auth to authenticated;
  create table public.profiles(id uuid primary key,role text,deleted_at timestamptz);
  create table public.clients(id uuid primary key references public.profiles(id),primary_trainer_id uuid references public.profiles(id));
  create table public.programs(id uuid primary key,client_id uuid references public.clients(id),trainer_id uuid references public.profiles(id));
  create table public.exercises(id uuid primary key);
  create table public.sessions(id uuid primary key,client_id uuid references public.clients(id),trainer_id uuid references public.profiles(id),program_id uuid references public.programs(id),status text);
  insert into public.profiles(id,role) values('${owner}','owner'),('${trainer}','trainer'),('${other}','trainer'),('${client}','client');
  insert into public.clients values('${client}','${trainer}');insert into public.exercises values('${exercise}');insert into public.programs values('${program}','${client}','${trainer}');insert into public.sessions values('${session}','${client}','${trainer}','${program}','scheduled');
  grant select on public.profiles,public.clients,public.programs,public.sessions,public.exercises to authenticated;`);
  await db.exec(readFileSync("packages/db/migrations/0047_session_exercise_performance.sql","utf8"));
  const asActor=async(id:string)=>{await db.exec("reset role");await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);await db.exec("set role authenticated");};
  const rowId=randomUUID();
  await asActor(trainer);await db.query("insert into public.session_exercise_performance(id,session_id,client_id,program_id,prescription_key,exercise_id,exercise_name,prescription_snapshot,sets_completed,reps_completed,recorded_by) values($1,$2,$3,$4,'assignment:test',$5,'Synthetic exercise',$6::jsonb,3,'8',$7)",[rowId,session,client,program,exercise,JSON.stringify({sets:3,reps:"8"}),trainer]);
  assert.equal((await db.query("select id from public.session_exercise_performance")).rows.length,1);
  await db.query("update public.session_exercise_performance set rpe_actual=7.5,coach_note='Good tolerance' where id=$1",[rowId]);
  await assert.rejects(db.query("update public.session_exercise_performance set exercise_name='Rewritten' where id=$1",[rowId]),/immutable/);
  await assert.rejects(db.query("delete from public.session_exercise_performance where id=$1",[rowId]),/permission denied/);
  await asActor(other);assert.equal((await db.query("select id from public.session_exercise_performance")).rows.length,0);await assert.rejects(db.query("insert into public.session_exercise_performance(id,session_id,client_id,program_id,prescription_key,exercise_name,recorded_by) values($1,$2,$3,$4,'x','Unauthorized',$5)",[randomUUID(),session,client,program,other]),/row-level security/);
  await asActor(client);assert.equal((await db.query("select id from public.session_exercise_performance")).rows.length,0);
  await asActor(owner);assert.equal((await db.query("select rpe_actual from public.session_exercise_performance")).rows[0].rpe_actual,"7.5");await db.query("update public.session_exercise_performance set coach_note='Owner corrected observation' where id=$1",[rowId]);
  await db.exec("reset role; update public.sessions set status='cancelled' where id='"+session+"'");await asActor(trainer);await assert.rejects(db.query("update public.session_exercise_performance set coach_note='Should fail' where id=$1",[rowId]),/row-level security/);
 }finally{await db.close();}
});