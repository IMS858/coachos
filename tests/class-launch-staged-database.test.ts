import test from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {readFileSync} from "node:fs";
import {PGlite} from "@electric-sql/pglite";
const owner="11111111-1111-4111-8111-111111111111",coach="22222222-2222-4222-8222-222222222222",other="33333333-3333-4333-8333-333333333333",client="44444444-4444-4444-8444-444444444444";
test("staged occurrence release, waitlist and attendance respect final prelaunch permissions",async t=>{
 const db=new PGlite();
 try{
  await db.exec(`create role anon;create role authenticated;create schema auth;
   create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
   grant usage on schema auth to authenticated;
   create table public.profiles(id uuid primary key,role text,deleted_at timestamptz);
   create table public.clients(id uuid primary key references public.profiles(id));
   create table public.exercises(id uuid primary key);
   create table public.audit_logs(id uuid primary key,actor_id uuid,action text,entity_type text,entity_id uuid,changes jsonb);
   insert into public.profiles(id,role) values('${owner}','owner'),('${coach}','trainer'),('${other}','trainer'),('${client}','client');
   insert into public.clients values('${client}');grant select on public.profiles,public.clients,public.exercises to authenticated;
   alter default privileges in schema public grant execute on functions to authenticated;`);
  for(const name of ["0048_group_classes","0049_class_series_access","0050_class_credit_ledger","0051_class_programming","0052_class_delivery_notes","0053_class_compensation_rules","0054_class_program_assignments","0055_class_growth_attribution","0057_class_prelaunch_boundary","0058_class_occurrence_release","0059_class_waitlist_offers","0060_class_attendance_command"])await db.exec(readFileSync(`packages/db/migrations/${name}.sql`,"utf8"));
  const template=randomUUID(),occurrence=randomUUID(),future=randomUUID(),enrollment=randomUUID(),auditFailureEnrollment=randomUUID();
  await db.query("insert into public.class_templates(id,name,category,duration_minutes,capacity,visibility,created_by) values($1,'Synthetic mobility','mobility',60,6,'published',$2)",[template,owner]);
  await db.query("insert into public.class_occurrences(id,template_id,trainer_id,starts_at,ends_at,capacity,status,created_by) values($1,$3,$4,'2020-01-01T17:00:00Z','2020-01-01T18:00:00Z',6,'scheduled',$5),($2,$3,$4,'2999-01-01T17:00:00Z','2999-01-01T18:00:00Z',6,'scheduled',$5)",[occurrence,future,template,coach,owner]);
  await db.query("insert into public.class_enrollments(id,occurrence_id,client_id,status) values($1,$2,$3,'booked'),($4,$5,$3,'booked')",[enrollment,occurrence,client,auditFailureEnrollment,future]);
  const actor=async(id:string|null)=>{await db.exec("reset role");await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id??""]);await db.exec("set role authenticated");};
  const attendance=(status:string|null="attended",version:string|null=null,id=enrollment)=>db.query<{result:{ok:boolean;updated_at:string;deduped:boolean}}>("select public.mark_class_attendance($1,$2,$3) as result",[id,status,version]);
  await t.test("default authenticated function privileges cannot silently open booking or attendance",async()=>{
   const rights=await db.query<{book:boolean;cancel:boolean;attendance:boolean}>("select has_function_privilege('authenticated','public.book_class(uuid,uuid)','EXECUTE') as book,has_function_privilege('authenticated','public.cancel_class_booking(uuid)','EXECUTE') as cancel,has_function_privilege('authenticated','public.mark_class_attendance(uuid,text,timestamptz)','EXECUTE') as attendance");
   assert.deepEqual(rights.rows[0],{book:false,cancel:false,attendance:false});
   await actor(owner);await assert.rejects(attendance(),/permission denied/);
  });
  await t.test("template publication cannot expose unreleased class dates",async()=>{
   await actor(client);assert.equal((await db.query("select id from public.class_occurrences")).rows.length,0);
   await db.exec("reset role");await db.query("update public.class_occurrences set release_state='released',released_at=now(),released_by=$1 where id=$2",[owner,future]);await actor(client);
   assert.equal((await db.query("select id from public.class_occurrences")).rows.length,1);
   await assert.rejects(db.query("select public.book_class($1,$2)",[future,randomUUID()]),/permission denied/);
   await assert.rejects(db.query("insert into public.class_waitlist_offers(id,enrollment_id,occurrence_id,client_id,expires_at) values($1,$2,$3,$4,now()+interval '1 hour')",[randomUUID(),auditFailureEnrollment,future,client]),/permission denied/);
  });
  // Isolated test grant only, to exercise staged internals. Repository migration never grants it.
  await db.exec("reset role;grant execute on function public.mark_class_attendance(uuid,text,timestamptz) to authenticated");
  await t.test("staged command itself fails closed for absent identity, disabled or unrelated staff",async()=>{
   for(const id of [null,client,other]){await actor(id);await assert.rejects(attendance(),/Staff authorization|Assigned coach/);}
   await db.exec("reset role");await db.query("update public.profiles set deleted_at=now() where id=$1",[coach]);await actor(coach);await assert.rejects(attendance(),/Staff authorization/);
   await db.exec("reset role");await db.query("update public.profiles set deleted_at=null where id=$1",[coach]);await actor(coach);await assert.rejects(attendance(null),/Invalid attendance/);
  });
  await t.test("staged attendance has version checks, replay safety and retained before/after evidence",async()=>{
   await actor(coach);await assert.rejects(attendance(),/Attendance changed elsewhere/);
   const version=(await db.query<{stamp:string}>("select updated_at::text as stamp from public.class_enrollments where id=$1",[enrollment])).rows[0].stamp;
   const saved=(await attendance("attended",version)).rows[0].result;assert.equal(saved.ok,true);assert.equal(saved.deduped,false);
   assert.equal((await attendance("attended",version)).rows[0].result.deduped,true);
   await assert.rejects(attendance("no_show",saved.updated_at),/corrections require/);
   await db.exec("reset role");const audits=await db.query<{changes:{before:{status:string};after:{status:string}}}>("select changes from public.audit_logs");assert.equal(audits.rows.length,1);assert.equal(audits.rows[0].changes.before.status,"booked");assert.equal(audits.rows[0].changes.after.status,"attended");
  });
  await t.test("staged attendance rolls back when audit fails",async()=>{
   await db.exec("reset role");await db.query("update public.class_occurrences set starts_at='2020-01-02T17:00:00Z',ends_at='2020-01-02T18:00:00Z' where id=$1",[future]);
   await db.exec("create function public.fail_audit() returns trigger language plpgsql as $$begin raise exception 'Synthetic audit failure';end$$;create trigger fail before insert on public.audit_logs for each row execute function public.fail_audit()");
   await actor(coach);const stamp=(await db.query<{stamp:string}>("select updated_at::text as stamp from public.class_enrollments where id=$1",[auditFailureEnrollment])).rows[0].stamp;
   await assert.rejects(attendance("attended",stamp,auditFailureEnrollment),/Synthetic audit failure/);
   assert.equal((await db.query<{status:string}>("select status from public.class_enrollments where id=$1",[auditFailureEnrollment])).rows[0].status,"booked");
  });
 }finally{await db.close();}
});
