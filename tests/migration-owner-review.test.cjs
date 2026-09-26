const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');const path=require('node:path');const ts=require('typescript');
const source=fs.readFileSync(path.join(__dirname,'../lib/migration/owner-review.ts'),'utf8');
const loaded={exports:{}};new Function('exports',ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(loaded.exports);
const {parseOwnerReview,validReviewReceipt,dollarsToCents,reviewPacificInstant,validDate,validInstant}=loaded.exports;
const id='11111111-1111-4111-8111-111111111111',now=Date.parse('2026-09-26T03:00:00Z');
const input=(record_type='client',proposal={client_id:id})=>({request_id:id,source_hash:'a'.repeat(64),expected_revision:0,record_type,decision:'reviewed',owner_confirmed:true,reason:'Owner checked the original source.',proposal});
test('a package opening distinguishes known zero from unknown money; no estimated dollars are filled',()=>{
 const p={client_id:id,as_of_date:'2026-09-25',sessions_remaining:0,package_price_cents:null,amount_paid_cents:null,amount_owed_cents:0,credit_cents:null};
 const raw=input('package',p),before=JSON.stringify(raw),r=parseOwnerReview(raw,now);
 assert.equal(r.proposal.sessions_remaining,0);assert.equal(r.proposal.amount_paid_cents,null);assert.equal(r.proposal.amount_owed_cents,0);assert.equal(JSON.stringify(raw),before);
 assert.equal(dollarsToCents(''),null);assert.equal(dollarsToCents('0'),0);assert.equal(dollarsToCents('93.01'),9301);assert.equal(dollarsToCents('12.1'),1210);
 for(const v of ['-1','1.001','1e3','$93','1,000','Infinity'])assert.throws(()=>dollarsToCents(v));
});
test('owner confirmation, original checksum and exact allowlists are required',()=>{
 for(const extra of [{owner_confirmed:false},{source_hash:'not-a-checksum'},{role:'owner'},{expected_revision:-1},{decision:'imported'},{proposal:{client_id:id,paid:true}},{record_type:'transaction'}])assert.throws(()=>parseOwnerReview({...input(),...extra},now));
 assert.throws(()=>parseOwnerReview(input('client',{client_id:null}),now));
 assert.equal(parseOwnerReview({...input('client',{client_id:null}),decision:'hold',owner_confirmed:false},now).decision,'hold');
});
test('calendar reviews need valid explicit time, duration and status; old booking is not forced complete',()=>{
 const p={client_id:id,trainer_id:id,starts_at:'2026-09-20T09:00:00-07:00',duration_minutes:60,session_status:'scheduled'};
 assert.equal(parseOwnerReview(input('appointment',p),now).proposal.session_status,'scheduled');
 for(const patch of [{starts_at:'2026-02-30T09:00:00-08:00'},{starts_at:'2026-09-20T09:00:00'},{duration_minutes:0},{duration_minutes:60.5},{trainer_id:null},{session_status:'accepted'},{starts_at:'2026-10-01T09:00:00-07:00',session_status:'completed'}])assert.throws(()=>parseOwnerReview(input('appointment',{...p,...patch}),now));
 assert.equal(validDate('2026-02-30'),false);assert.equal(validInstant('2026-09-20T24:00:00Z'),false);assert.equal(validInstant('2026-09-20T09:00:00+14:01'),false);
});
test('package reviewed requires opening quantity/date and does not allow simultaneous debt and credit',()=>{
 const p={client_id:id,as_of_date:'2026-09-25',sessions_remaining:7,package_price_cents:120000,amount_paid_cents:null,amount_owed_cents:null,credit_cents:null};
 for(const patch of [{sessions_remaining:null},{as_of_date:null},{as_of_date:'2026-09-26'},{sessions_remaining:-1},{amount_paid_cents:1.5},{amount_owed_cents:100,credit_cents:100}])assert.throws(()=>parseOwnerReview(input('package',{...p,...patch}),now));
});
test('Pacific review rejects nonexistent/ambiguous clock times and honors explicit repeated-hour offsets',()=>{
 assert.equal(reviewPacificInstant('2026-10-01','09:00'),'2026-10-01T16:00:00.000Z');
 assert.equal(reviewPacificInstant('2026-12-01','09:00'),'2026-12-01T17:00:00.000Z');
 assert.throws(()=>reviewPacificInstant('2026-03-08','02:30'),/does not exist/);
 assert.throws(()=>reviewPacificInstant('2026-11-01','01:30'),/occurs twice/);
 assert.equal(reviewPacificInstant('2026-11-01','01:30','-07:00'),'2026-11-01T08:30:00.000Z');
 assert.equal(reviewPacificInstant('2026-11-01','01:30','-08:00'),'2026-11-01T09:30:00.000Z');
 assert.throws(()=>reviewPacificInstant('2026-12-01','09:00','-07:00'));
});
test('a success flag alone cannot confirm a saved review',()=>{
 const r=parseOwnerReview(input(),now),receipt={ok:true,request_id:id,record_id:id,revision:1,source_hash:r.source_hash,decision:r.decision};
 assert.equal(validReviewReceipt(receipt,r,id),true);
 for(const patch of [{ok:false},{request_id:'other'},{record_id:'other'},{revision:0},{source_hash:'b'.repeat(64)},{decision:'hold'}])assert.equal(validReviewReceipt({...receipt,...patch},r,id),false);
 assert.equal(validReviewReceipt({ok:true},r,id),false);
});
