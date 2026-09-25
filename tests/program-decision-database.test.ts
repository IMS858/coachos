import test from "node:test";import assert from "node:assert/strict";import {randomUUID} from "node:crypto";import {readFileSync} from "node:fs";import {PGlite} from "@electric-sql/pglite";
const owner="11111111-1111-4111-8111-111111111111",trainer="22222222-2222-4222-8222-222222222222",other="33333333-3333-4333-8333-333333333333",client="44444444-4444-4444-8444-444444444444",program="55555555-5555-4555-8555-555555555555";
test("program decision migration enforces immutable scoped staff history",async()=>{
 const db=new PGlite();try{
  await db.exec(`create role anon;create role authenticated;create schema auth;create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
  grant usage on schema auth to authenticated;
  create table public.profiles(id uuid primary key,role text,deleted_at timestamptz);
  create table public.clients(id uuid primary key references public.profiles(id),primary_trainer_id uuid references public.profiles(id));
  create table public.programs(id uuid primary key,client_id uuid references public.clients(id),trainer_id uuid references public.profiles(id));
  insert into public.profiles(id,role) values('${owner}','owner'),('${trainer}','trainer'),('${other}','trainer'),('${client}','client');
  insert into public.clients values('${client}','${trainer}');
  insert into public.programs values('${program}','${client}','${trainer}');
  grant select on public.profiles,public.clients,public.programs to authenticated;`);
  await db.exec(readFileSync("packages/db/migrations/0046_program_decision_notes.sql","utf8"));
  const asActor=async(id:string)=>{await db.exec("reset role");await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);await db.exec("set role authenticated");};
  await asActor(trainer);const id=randomUUID();await db.query("insert into public.program_decision_notes(id,program_id,client_id,actor_id,category,note) values($1,$2,$3,$4,'progression','Progressed after recorded clean sessions.')",[id,program,client,trainer]);
  assert.equal((await db.query("select id from public.program_decision_notes")).rows.length,1);
  await assert.rejects(db.query("update public.program_decision_notes set note='Changed note'"),/permission denied/);
  await assert.rejects(db.query("delete from public.program_decision_notes"),/permission denied/);
  await asActor(other);assert.equal((await db.query("select id from public.program_decision_notes")).rows.length,0);await assert.rejects(db.query("insert into public.program_decision_notes(id,program_id,client_id,actor_id,category,note) values($1,$2,$3,$4,'other','Unauthorized scoped note attempt.')",[randomUUID(),program,client,other]),/row-level security/);
  await asActor(client);assert.equal((await db.query("select id from public.program_decision_notes")).rows.length,0);
  await asActor(owner);assert.equal((await db.query("select id from public.program_decision_notes")).rows.length,1);await db.query("insert into public.program_decision_notes(id,program_id,client_id,actor_id,category,note) values($1,$2,$3,$4,'assessment','Owner recorded assessment-driven change.')",[randomUUID(),program,client,owner]);
  assert.equal((await db.query("select id from public.program_decision_notes")).rows.length,2);
 }finally{await db.close();}
});