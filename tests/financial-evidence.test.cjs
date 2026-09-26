// Synthetic read-only evidence. No external requests, real clients, payments or credentials.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),ts=require('typescript');
const root=path.join(__dirname,'..');
const jsx={jsx:(type,props)=>typeof type==='function'?type(props):({type,props}),jsxs:(type,props)=>typeof type==='function'?type(props):({type,props}),Fragment:'Fragment'};
function load(file,mocks={},cache=new Map()){
 const filename=path.resolve(root,file);if(cache.has(filename))return cache.get(filename);
 const out={};cache.set(filename,out);
 const source=ts.transpileModule(fs.readFileSync(filename,'utf8'),{fileName:filename,compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
 new Function('require','exports',source)(name=>{
  if(Object.hasOwn(mocks,name))return mocks[name];
  if(name==='react/jsx-runtime')return jsx;
  if(name==='next/link')return {__esModule:true,default:'Link'};
  if(name.startsWith('@/components/'))return new Proxy({},{get:(_,key)=>String(key)});
  if(name.startsWith('@/')||name.startsWith('.')){
   const p=name.startsWith('@/')?path.join(root,name.slice(2)):path.resolve(path.dirname(filename),name);
   const found=['.ts','.tsx'].map(ext=>p+ext).find(fs.existsSync);if(found)return load(path.relative(root,found),mocks,cache);
  }
  throw Error('Unexpected dependency '+name);
 },out);return out;
}
const model=load('lib/financials/evidence.ts');
const window={start:'2026-09-01T07:00:00.000Z',end:'2026-10-01T07:00:00.000Z',asOf:'2026-09-26T20:00:00.000Z',label:'September 2026'};
const payment=(extra={})=>({id:'p1',client_id:'c1',amount_cents:10000,currency:'usd',status:'succeeded',source:'stripe',source_id:'pi_1',paid_at:'2026-09-24T12:00:00Z',created_at:'2026-09-24T13:00:00Z',description:null,...extra});
const sum=rows=>model.summarizeCollected(rows,window);
function text(node){if(Array.isArray(node))return node.map(text).join(' ');if(node&&typeof node==='object')return text(node.props?.children);return node==null||typeof node==='boolean'?'':String(node);}

test('no receipts does not fabricate zero collected; a recorded zero is retained',()=>{
 assert.deepEqual(sum([]).currencies,[]);
 const result=sum([payment({amount_cents:0})]);assert.equal(result.currencies[0].collectedCents,0);assert.equal(result.currencies[0].collectedRecords,1);
});
test('failed and pending attempts are never receipts or receivables',()=>{
 const result=sum([payment({status:'failed'}),payment({id:'p2',source_id:'pi_2',status:'pending'})]);
 assert.deepEqual(result.currencies,[]);assert.equal(result.failedRecords,1);assert.equal(result.pendingRecords,1);assert.equal('outstandingCents' in result,false);
});
test('payment dates, not created_at, control the Pacific month',()=>{
 const result=sum([payment({paid_at:'2026-09-01T06:59:59Z'}),payment({id:'p2',source_id:'pi_2',paid_at:window.start,created_at:'2026-10-10T12:00:00Z'})]);
 assert.equal(result.outsideWindow,1);assert.equal(result.currencies[0].collectedCents,10000);
});
test('missing, normalized-invalid, offsetless and future dates remain review evidence',()=>{
 for(const paid_at of [null,'2026-02-30T12:00:00Z','2026-09-24T12:00:00','2026-09-27T12:00:00Z']){
  const result=sum([payment({paid_at})]);assert.equal(result.issues.length,1);assert.deepEqual(result.currencies,[]);
 }
});
test('amount, currency, status and external source reference are validated',()=>{
 for(const extra of [{amount_cents:null},{amount_cents:'100'},{amount_cents:-1},{amount_cents:1.1},{currency:'fake'},{status:'paid'},{source:null},{source:'mystery'},{source_id:null},{source_id:' pi_1 '}]){
  const result=sum([payment(extra)]);assert.equal(result.issues.length,1,JSON.stringify(extra));assert.deepEqual(result.currencies,[]);
 }
 assert.equal(sum([payment({source:'manual',source_id:null})]).currencies[0].collectedCents,10000);
});
test('currencies and refunds remain separate; refund-only does not imply known zero receipts',()=>{
 const result=sum([payment(),payment({id:'p2',source_id:'re_2',status:'refunded',amount_cents:-2000}),payment({id:'p3',source_id:'pi_3',currency:'jpy',amount_cents:2500})]);
 assert.deepEqual(result.currencies.map(g=>[g.currency,g.collectedCents,g.refundedCents]),[['JPY',2500,null],['USD',10000,2000]]);
 assert.equal(sum([payment({status:'refunded',amount_cents:-2000})]).currencies[0].collectedCents,null);
 assert.equal(sum([payment({status:'refunded',amount_cents:2000})]).issues.length,1);
});
test('duplicate source evidence holds both records, including a conflicting earlier-month copy',()=>{
 const result=sum([payment(),payment({id:'p2',paid_at:'2026-08-15T12:00:00Z',amount_cents:20000})]);
 assert.equal(result.issues.length,2);assert.deepEqual(result.currencies,[]);
 assert.throws(()=>sum([payment(),payment()]),/identity/);
 assert.throws(()=>sum([payment({id:''})]),/identity/);
});
test('unsafe sums fail instead of rounding money',()=>{
 assert.throws(()=>sum([payment({amount_cents:Number.MAX_SAFE_INTEGER}),payment({id:'p2',source_id:'pi_2',amount_cents:1})]),/precision/);
 assert.throws(()=>model.summarizeContractValues([Number.MAX_SAFE_INTEGER,1]),/precision/);
});
test('missing contract rates are not zero; partial totals remain explicitly partial',()=>{
 assert.deepEqual(model.summarizeContractValues([0]),{knownCents:0,completeCents:0,knownRecords:1,unknownRecords:0});
 assert.deepEqual(model.summarizeContractValues([10000,null,'2500',-1]),{knownCents:10000,completeCents:null,knownRecords:1,unknownRecords:3});
 assert.equal(model.summarizeContractValues([]).completeCents,null);
});

function database({rows={},fail=null,cap=null,nullCount=null,changeCount=null}={}){
 const calls=[];return {calls,from(table){const ops=[];calls.push({table,ops});const q={};
  for(const method of ['select','eq','gte','lt','in','order'])q[method]=(...args)=>{ops.push([method,...args]);return q;};
  q.range=async(a,b)=>{
   ops.push(['range',a,b]);if(fail===table)return {data:null,error:{message:'synthetic failure'},count:null};
   const source=rows[table]??[];const data=source.slice(a,b+1);
   return {data:cap===table?data.slice(0,Math.max(0,data.length-1)):data,error:null,count:nullCount===table?null:source.length+(changeCount===table&&a>0?1:0)};
  };return q;
 }};
}
test('financial windows handle Pacific DST, UTC month crossover and year rollover',()=>{
 const {financialWindow}=load('lib/financials/load.ts');
 const fall=financialWindow(new Date('2026-11-15T20:00:00Z'));assert.equal(fall.start,'2026-11-01T07:00:00.000Z');assert.equal(fall.end,'2026-12-01T08:00:00.000Z');
 const spring=financialWindow(new Date('2026-03-15T20:00:00Z'));assert.equal(spring.start,'2026-03-01T08:00:00.000Z');assert.equal(spring.end,'2026-04-01T07:00:00.000Z');
 assert.equal(financialWindow(new Date('2026-10-01T02:00:00Z')).label,'September 2026');
 assert.equal(financialWindow(new Date('2026-12-15T20:00:00Z')).end,'2027-01-01T08:00:00.000Z');
 assert.throws(()=>financialWindow(new Date('invalid')),/invalid/);
});
test('actual financial loader pages beyond 250 and never writes',async()=>{
 const rows={payments:Array.from({length:251},(_,i)=>payment({id:'p'+i,source_id:'pi_'+i}))};
 const db=database({rows}),data=await load('lib/financials/load.ts').loadFinancialEvidence(db,new Date(window.asOf));
 assert.equal(data.payments.status,'ready');assert.equal(data.payments.value.summary.currencies[0].collectedCents,2510000);
 assert.equal(db.calls.filter(c=>c.table==='payments').length,2);
 for(const call of db.calls){assert.equal(call.ops.find(op=>op[0]==='select')[2].count,'exact');assert.ok(call.ops.some(op=>op[0]==='order'&&op[1]==='id'));}
});
test('failed, capped, missing-count and changing-count queries never become empty successes',async()=>{
 for(const failure of [{fail:'payments'},{cap:'payments'},{nullCount:'payments'},{changeCount:'payments'}]){
  const db=database({...failure,rows:{payments:Array.from({length:251},(_,i)=>payment({id:'p'+i,source_id:'pi_'+i}))}});
  const result=await load('lib/financials/load.ts').loadFinancialEvidence(db,new Date(window.asOf));
  assert.equal(result.payments.status,'unavailable');assert.equal(result.training.status,'ready');assert.equal(result.subscriptions.status,'ready');
 }
});
test('training errors leave known collections available and never turn bookings into completed value',async()=>{
 const get=load('lib/financials/load.ts').loadFinancialEvidence;
 let result=await get(database({fail:'sessions',rows:{payments:[payment()]}}),new Date(window.asOf));
 assert.equal(result.training.status,'unavailable');assert.equal(result.payments.status,'ready');
 const session=(id,scheduled_at,status)=>({id,scheduled_at,status,session_type:'training',duration_minutes:60,client_id:'c1',trainer_id:'t1'});
 result=await get(database({rows:{sessions:[session('s1','2026-09-24T12:00:00Z','completed'),session('s2','2026-09-27T12:00:00Z','scheduled'),session('s3','2026-09-24T12:00:00Z','scheduled')]}}),new Date(window.asOf));
 assert.equal(result.training.value.analysis.totals.historical_estimate_cents,9300);assert.equal(result.training.value.analysis.totals.scheduled_estimate_cents,9300);assert.equal(result.training.value.analysis.totals.review_count,1);
});
test('financial owner authorization blocks ledger reads before loading any financial data',async()=>{
 for(const scenario of [{user:false},{role:'client'},{role:'trainer'},{role:'unknown'},{role:'owner',deleted_at:'2026-01-01'},{role:'owner',error:{message:'offline'}}]){
  let reads=0;
  const db={auth:{getUser:async()=>({data:{user:scenario.user===false?null:{id:'owner'}}})},from:()=>({select(){return this;},eq(){return this;},maybeSingle:async()=>({data:{role:scenario.role,deleted_at:scenario.deleted_at??null},error:scenario.error??null})})};
  const page=load('app/financials/page.tsx',{'@/lib/supabase/server':{createClient:async()=>db},'@/lib/financials/load':{loadFinancialEvidence:async()=>{reads++;throw Error('Unauthorized read');}},'next/navigation':{redirect:path=>{throw Error('redirect:'+path);}}}).default;
  await assert.rejects(page(),/redirect:/);assert.equal(reads,0);
 }
});
test('actual owner evidence panel distinguishes unknown, zero, source failure and independent currencies',async()=>{
 const data=await load('lib/financials/load.ts').loadFinancialEvidence(database({rows:{payments:[payment({amount_cents:0})],plans:[{id:'plan',monthly_rate_cents:null}]}}),new Date(window.asOf));
 const view=load('components/financials/evidence-panel.tsx').FinancialEvidencePanel;
 const output=text(view({data})).replace(/\s/g,' ');
 for(const label of ['Estimated training value','Known collected','Known outstanding','Unknown / needs reconciliation'])assert.ok(output.includes(label));
 assert.match(output,/USD 0.00/);assert.match(output,/Not established/);assert.match(output,/Needs review/);assert.match(output,/not independently bank-reconciled/);
 const failed=text(view({data:{...data,payments:{status:'unavailable',message:'synthetic source failure'}}}));
 assert.match(failed,/synthetic source failure/);assert.match(failed,/coverage is unavailable/);assert.doesNotMatch(failed,/0 payment records need review/);
});
