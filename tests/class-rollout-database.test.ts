import test from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {readFileSync} from "node:fs";
import {PGlite} from "@electric-sql/pglite";
const owner="11111111-1111-4111-8111-111111111111",coach="22222222-2222-4222-8222-222222222222",other="33333333-3333-4333-8333-333333333333",client="44444444-4444-4444-8444-444444444444",clientB="55555555-5555-4555-8555-555555555555";
test("complete class migration chain preserves prelaunch, private IP and own-client history",async t=>{
 const db=new PGlite();
 try{
  await db.exec(`create role anon;create role authenticated;create schema auth;
   create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
   grant usage on schema auth to authenticated;
   create table public.profiles(id uuid primary key,role text,deleted_at timestamptz);
   create table public.clients(id uuid primary key references public.profiles(id));
   create table public.exercises(id uuid primary key);
   insert into public.profiles(id,role) values('${owner}','owner'),('${coach}','trainer'),('${other}','trainer'),('${client}','client'),('${clientB}','client');
   insert into public.clients values('${client}'),('${clientB}');grant select on public.profiles,public.clients,public.exercises to authenticated;`);
  for(const file of ["0048_group_classes.sql","0049_class_series_access.sql","0050_class_credit_ledger.sql","0051_class_programming.sql","0052_class_delivery_notes.sql","0053_class_compensation_rules.sql","0054_class_program_assignments.sql","0055_class_growth_attribution.sql","0057_class_prelaunch_boundary.sql"])await db.exec(readFileSync("packages/db/migrations/"+file,"utf8"));
  const template=randomUUID(),templateB=randomUUID(),occurrence=randomUUID(),future=randomUUID(),enrollment=randomUUID(),program=randomUUID(),wrongProgram=randomUUID();
  await db.query("insert into public.class_templates(id,name,category,duration_minutes,capacity,created_by) values($1,'Synthetic mobility','mobility',60,6,$3),($2,'Synthetic strength','strength',60,6,$3)",[template,templateB,owner]);
  await db.query("insert into public.class_occurrences(id,template_id,trainer_id,starts_at,ends_at,capacity,status,created_by) values($1,$3,$4,'2020-01-01T17:00:00Z','2020-01-01T18:00:00Z',6,'completed',$5),($2,$3,$4,'2999-01-01T17:00:00Z','2999-01-01T18:00:00Z',6,'scheduled',$5)",[occurrence,future,template,coach,owner]);
  await db.query("insert into public.class_enrollments(id,occurrence_id,client_id,status,attendance_marked_at,attendance_marked_by) values($1,$2,$3,'attended','2020-01-01T18:05:00Z',$4)",[enrollment,occurrence,client,coach]);
  await db.query("insert into public.class_enrollments(occurrence_id,client_id,status) values($1,$2,'booked'),($3,$4,'booked')",[occurrence,clientB,future,client]);
  await db.query("insert into public.class_programs(id,template_id,name,objective,created_by) values($1,$3,'Private group plan','Coach-only rationale',$5),($2,$4,'Other group plan','Separate template',$5)",[program,wrongProgram,template,templateB,owner]);
  await db.query("insert into public.class_compensation_rules(trainer_id,compensation_type,base_rate,effective_on,created_by) values($1,'flat_class',75,'2020-01-01',$2)",[coach,owner]);
  const asActor=async(id:string)=>{await db.exec("reset role");await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);await db.exec("set role authenticated");};
  await t.test("anonymous and every authenticated role cannot invoke prototype registration",async()=>{
   await db.exec("set role anon");await assert.rejects(db.query("select public.book_class($1,$2)",[future,randomUUID()]),/permission denied/);
   for(const actor of [owner,coach,client]){await asActor(actor);await assert.rejects(db.query("select public.book_class($1,$2)",[future,randomUUID()]),/permission denied/);await assert.rejects(db.query("select public.cancel_class_booking($1)",[enrollment]),/permission denied/);}
  });
  await t.test("private programming and compensation never leak into client history",async()=>{
   await asActor(client);assert.equal((await db.query("select * from public.class_programs")).rows.length,0);assert.equal((await db.query("select * from public.class_program_exercises")).rows.length,0);assert.equal((await db.query("select * from public.class_compensation_rules")).rows.length,0);
   const result=await db.query<Record<string,unknown>>("select * from public.get_my_class_participation()");assert.equal(result.rows.length,1);assert.equal(result.rows[0].enrollment_id,enrollment);assert.equal(result.rows[0].class_name,"Synthetic mobility");
   for(const field of ["coach_note","note","objective","client_id","trainer_id","base_rate","source_reference"])assert.equal(field in result.rows[0],false);
   await asActor(clientB);const b=await db.query<{enrollment_id:string}>("select * from public.get_my_class_participation()");assert.equal(b.rows.length,1);assert.notEqual(b.rows[0].enrollment_id,enrollment);
  });
  await t.test("retired class history remains available to its participant",async()=>{
   await db.exec("reset role");await db.query("update public.class_templates set visibility='retired' where id=$1",[template]);await asActor(client);
   assert.equal((await db.query("select * from public.get_my_class_participation()")).rows.length,1);
  });
  await t.test("only assigned coach and owner can read this roster; wages remain owner-only",async()=>{
   await asActor(other);assert.equal((await db.query("select * from public.class_enrollments")).rows.length,0);
   await asActor(coach);assert.equal((await db.query("select * from public.class_enrollments")).rows.length,3);assert.equal((await db.query("select * from public.class_compensation_rules")).rows.length,0);
   await asActor(owner);assert.equal((await db.query("select * from public.class_compensation_rules")).rows.length,1);await assert.rejects(db.query("select * from public.get_my_class_participation()"),/Active client/);
  });
  await t.test("delivery records cannot attach another template program or invent future delivery",async()=>{
   const insert=(occ:string,plan:string|null)=>db.query("insert into public.class_delivery_notes(id,occurrence_id,class_program_id,coach_id,note) values($1,$2,$3,$4,'Synthetic delivery observation')",[randomUUID(),occ,plan,coach]);
   await asActor(coach);await insert(occurrence,program);await assert.rejects(insert(occurrence,wrongProgram),/row-level security/);await assert.rejects(insert(future,program),/row-level security/);
   await db.exec("reset role");await db.query("update public.profiles set deleted_at=now() where id=$1",[coach]);await asActor(coach);await assert.rejects(insert(occurrence,program),/row-level security/);
  });
  await t.test("disabled clients cannot read enrollment or call the history projection",async()=>{
   await db.exec("reset role");await db.query("update public.profiles set deleted_at=now() where id=$1",[client]);await asActor(client);assert.equal((await db.query("select * from public.class_enrollments")).rows.length,0);await assert.rejects(db.query("select * from public.get_my_class_participation()"),/Active client/);
  });
  await t.test("every own-client enrollment, access and credit read policy includes active-account checks",async()=>{
   await db.exec("reset role");const policies=await db.query<{policyname:string;qual:string}>("select policyname,qual from pg_policies where schemaname='public' and tablename in ('class_enrollments','client_class_access','class_credit_ledger') and cmd='SELECT'");
   for(const policy of policies.rows.filter(p=>p.qual.includes("client_id = auth.uid()")))assert.match(policy.qual,/deleted_at/,policy.policyname);
  });
 }finally{await db.close();}
});
