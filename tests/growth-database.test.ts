import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

const owner="11111111-1111-4111-8111-111111111111", trainer="22222222-2222-4222-8222-222222222222", client="33333333-3333-4333-8333-333333333333";
const research="44444444-4444-4444-8444-444444444444", inquiry="55555555-5555-4555-8555-555555555555", second="66666666-6666-4666-8666-666666666666";
const sourceVersion="2020-01-01T00:00:00Z", oldDate="2020-01-01";
const sourceNotes=JSON.stringify({type:"research_opportunity",organization:"Synthetic community",website_url:"https://example.org",evidence_url:"https://example.org/community",fit_reason:"Public organization-level evidence for testing only.",next_step:"Owner reviews the public evidence.",checked_on:oldDate});

test("growth migration executes real owner-only, atomic, idempotent commands", async t => {
  const db=new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated; create schema auth;
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      grant usage on schema auth to authenticated;
      create table public.profiles(id uuid primary key,role text,deleted_at timestamptz);
      create table public.clients(id uuid primary key references public.profiles(id));
      create table public.leads(id uuid primary key,source text,notes text,stage text,updated_at timestamptz);
      create table public.audit_logs(id uuid primary key default gen_random_uuid(),actor_id uuid,action text,entity_type text,entity_id uuid,changes jsonb);
      grant select on public.profiles to authenticated;
      insert into public.profiles(id,role) values('${owner}','owner'),('${trainer}','trainer'),('${client}','client');
      insert into public.clients values('${client}');`);
    await db.query("insert into public.leads values ($1,'agent_research',$2,'new',$3),($4,'referral',null,'converted',$3),($5,'manual',null,'converted',$3)",[research,sourceNotes,sourceVersion,inquiry,second]);
    await db.exec(readFileSync("packages/db/migrations/0045_growth_workspace.sql","utf8"));
    const asActor=async(id:string) => { await db.exec("reset role"); await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]); await db.exec("set role authenticated"); };
    const run=async(command:Record<string,unknown>) => (await db.query<{result:{id:string;updated_at:string;deduped:boolean;ok:boolean}}>("select public.execute_growth_command($1::jsonb) as result",[JSON.stringify(command)])).rows[0].result;
    const create={action:"save_campaign",request_id:randomUUID(),campaign_id:null,expected_updated_at:null,name:"Synthetic campaign",channel:"local_search",audience:"both",area:"Synthetic area",offer:"Private coaching consultation test",budget_cents:20000,status:"draft"};
    await asActor(owner);
    const campaign=await run(create);
    await t.test("identical retry is acknowledged once; mismatched reuse fails",async()=>{
      assert.equal(campaign.ok,true);assert.equal((await run(create)).deduped,true);
      await assert.rejects(run({...create,name:"Changed payload"}),/already used/);
      assert.equal((await db.query("select * from public.growth_campaigns")).rows.length,1);
      assert.equal((await db.query("select * from public.growth_actions")).rows.length,1);
    });
    await t.test("direct DML and non-owner commands are blocked",async()=>{
      await assert.rejects(db.query("update public.growth_campaigns set name='Bypass'"),/permission denied/);
      for(const id of [trainer,client]){
        await asActor(id);assert.equal((await db.query("select * from public.growth_campaigns")).rows.length,0);
        assert.equal((await db.query("select * from public.growth_actions")).rows.length,0);
        await assert.rejects(run({...create,request_id:randomUUID()}),/Active owner/);
      }
      await db.exec("reset role; set role anon");await assert.rejects(run({...create,request_id:randomUUID()}),/permission denied/);
      await asActor(owner);
    });
    await t.test("inactive owner cannot use the command or see owner records",async()=>{
      await db.exec(`reset role; update public.profiles set deleted_at=now() where id='${owner}'`);await asActor(owner);
      assert.equal((await db.query("select * from public.growth_campaigns")).rows.length,0);
      await assert.rejects(run({...create,request_id:randomUUID()}),/Active owner/);
      await db.exec(`reset role; update public.profiles set deleted_at=null where id='${owner}'`);await asActor(owner);
    });
    await t.test("campaign edits require the current version and reject unknown keys",async()=>{
      await assert.rejects(run({...create,request_id:randomUUID(),campaign_id:campaign.id,expected_updated_at:sourceVersion}),/changed/);
      await assert.rejects(run({...create,request_id:randomUUID(),send_email:true}),/Invalid growth command fields/);
      await assert.rejects(run({...create,request_id:randomUUID(),budget_cents:"200"}),/whole cents/);
    });
    const reviewCommand={action:"review_opportunity",request_id:randomUUID(),candidate_id:research,campaign_id:campaign.id,expected_source_updated_at:sourceVersion,expected_updated_at:null,decision:"approve",rationale:"Reviewed official source evidence",next_action:"Review public organization contact channel",due_on:oldDate,outreach_draft:"Draft only; never sent."};
    let review:{updated_at:string};
    await t.test("review persists without turning research into a lead",async()=>{
      review=await run(reviewCommand);
      assert.equal((await run(reviewCommand)).deduped,true);
      await assert.rejects(run({...reviewCommand,request_id:randomUUID()}),/Review changed/);
      await assert.rejects(run({...reviewCommand,request_id:randomUUID(),candidate_id:inquiry}),/Research candidate/);
      await db.exec("reset role");
      const stored=(await db.query<{source:string;notes:string}>("select source,notes from public.leads where id=$1",[research])).rows[0];
      assert.equal(stored.source,"agent_research");assert.equal(stored.notes,sourceNotes);await asActor(owner);
    });
    await t.test("spend is bounded, positive and linked to evidence; retries do not duplicate",async()=>{
      const expense={action:"record_spend",request_id:randomUUID(),campaign_id:campaign.id,amount_cents:10000,category:"research",incurred_on:oldDate,evidence_reference:"Synthetic receipt #1"};
      await run(expense);assert.equal((await run(expense)).deduped,true);
      await assert.rejects(run({...expense,request_id:randomUUID(),amount_cents:0}),/check constraint/);
      await assert.rejects(run({...expense,request_id:randomUUID(),amount_cents:1.5}),/whole cents/);
      await assert.rejects(run({...expense,request_id:randomUUID(),incurred_on:"9999-01-01"}),/check constraint/);
      assert.equal((await db.query("select * from public.growth_spend")).rows.length,1);
    });
    const attribution={action:"link_inquiry",request_id:randomUUID(),lead_id:inquiry,campaign_id:campaign.id,candidate_id:research,expected_source_updated_at:sourceVersion,expected_updated_at:null,evidence:"Synthetic referral stated by inquiry",client_id:client,revenue_from:oldDate};
    await t.test("only real inquiries can be attributed; each client is acquired once",async()=>{
      await assert.rejects(run({...attribution,request_id:randomUUID(),lead_id:research}),/Existing real inquiry/);
      await run(attribution);assert.equal((await run(attribution)).deduped,true);
      await assert.rejects(run({...attribution,request_id:randomUUID(),lead_id:second}),/unique constraint/);
      assert.equal((await db.query("select * from public.growth_attributions")).rows.length,1);
    });
    await t.test("source edits invalidate approvals and stale owner saves",async()=>{
      await db.exec(`reset role; update public.leads set updated_at='2020-01-02T00:00:00Z' where id='${research}'`);await asActor(owner);
      await assert.rejects(run({...reviewCommand,request_id:randomUUID(),expected_updated_at:review!.updated_at}),/Source changed/);
      await assert.rejects(run({...attribution,request_id:randomUUID(),lead_id:second,client_id:null,revenue_from:null}),/currently approved/);
    });
    await t.test("audit failure rolls back both state and idempotency ledger",async()=>{
      await db.exec(`reset role; create function public.fail_growth_audit() returns trigger language plpgsql as $$ begin raise exception 'Synthetic audit failure'; end $$;
        create trigger test_audit_failure before insert on public.audit_logs for each row execute function public.fail_growth_audit();`);
      await asActor(owner);const id=randomUUID();await assert.rejects(run({...create,request_id:id}),/Synthetic audit failure/);
      assert.equal((await db.query("select id from public.growth_campaigns where id=$1",[id])).rows.length,0);
      assert.equal((await db.query("select id from public.growth_actions where id=$1",[id])).rows.length,0);
      await db.exec("reset role; drop trigger test_audit_failure on public.audit_logs");
    });
    await t.test("database and JS inquiry semantics preserve historical sources",async()=>{
      const check=async(source:string,notes:string|null)=>(await db.query<{v:boolean}>("select public.growth_is_inquiry($1,$2) as v",[source,notes])).rows[0].v;
      assert.equal(await check("vagaro",null),false);
      assert.equal(await check("vagaro",'[Website enquiry:abc] {"message":"Training inquiry"}'),true);
      assert.equal(await check("vagaro",'[Website enquiry:abc] invalid'),false);
      assert.equal(await check("agent_research",'[Website enquiry:abc] {"message":"Training inquiry"}'),false);
    });
  } finally { await db.close(); }
});
