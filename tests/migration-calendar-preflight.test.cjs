// Synthetic only: no hosted credentials, client data, network or mutation calls.
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),ts=require('typescript');
const root=path.join(__dirname,'..');
const jsx={jsx:(type,props)=>({type,props}),jsxs:(type,props)=>({type,props}),Fragment:'Fragment'};
function load(file,mocks={}) {
 const out={},src=ts.transpileModule(fs.readFileSync(path.join(root,file),'utf8'),{fileName:file,compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
 new Function('require','exports',src)(name=>{
  if(Object.hasOwn(mocks,name))return mocks[name];
  if(name==='react/jsx-runtime')return jsx;
  if(name==='next/link')return{__esModule:true,default:'Link'};
  if(name.startsWith('@/components/'))return{AppShell:'AppShell'};
  const base=name.startsWith('@/')?name.slice(2):path.join(path.dirname(file),name);
  const target=['.ts','.tsx'].map(ext=>base+ext).find(p=>fs.existsSync(path.join(root,p)));
  if(target)return load(target,mocks);
  throw Error('Unmocked dependency '+name);
 },out);return out;
}
const {calendarPreflight,EVIDENCE_KINDS}=load('lib/migration/calendar-preflight.ts');
const hash='a'.repeat(64),observed='2026-09-26T20:00:00Z',batchId='11111111-1111-4111-8111-111111111111';
const counts=(extra={})=>({...Object.fromEntries(EVIDENCE_KINDS.map(k=>[k,0])),...extra});
const batch=(extra={})=>({id:batchId,label:'Synthetic batch',status:'draft',expected_counts:null,source_manifest_sha256:null,staging_completed_at:null,approved_by:null,approved_at:null,...extra});
const record=(extra={})=>({id:'record-1',record_type:'appointment',source_id:'source-1',source_hash:hash,reconciliation_status:'unmatched',dry_run_status:null,...extra});
const review=(extra={})=>({id:'review-1',record_id:'record-1',record_type:'appointment',source_hash:hash,revision:1,decision:'reviewed',owner_confirmed:true,...extra});
const evaluate=(b=batch(),rs=[],vs=[])=>calendarPreflight(b,rs,vs,observed);

test('missing source declaration and an empty staged calendar are unknown, never import clearance',()=>{
 const r=evaluate();assert.equal(r.coverageState,'undeclared');assert.equal(r.calendarRows,0);assert.equal(r.importAuthorized,false);assert(r.coverage.every(c=>c.expected===null&&c.missing===null));
});
test('all six evidence counts are required; malformed or coercible counts are rejected',()=>{
 for(const c of [{},[],{client:1},counts({client:'1'}),counts({client:-1}),counts({client:1.5}),counts({client:null}),counts({extra:0}),counts({client:2147483648})])assert.equal(evaluate(batch({expected_counts:c})).coverageState,'invalid_declaration');
});
test('matching counts require a valid, nonfuture receipt and never establish import authority',()=>{
 const b=batch({expected_counts:counts({appointment:1}),source_manifest_sha256:hash,staging_completed_at:'2026-09-26T18:00:00Z'});
 assert.equal(evaluate(b,[record()]).coverageState,'declared_counts_match');assert.equal(evaluate(b,[record()]).importAuthorized,false);
 for(const patch of [{source_manifest_sha256:null},{source_manifest_sha256:'bad'},{staging_completed_at:null},{staging_completed_at:'invalid'},{staging_completed_at:'2070-01-01T00:00:00Z'}])assert.equal(evaluate({...b,...patch},[record()]).coverageState,'receipt_missing');
});
test('missing and excess staged records stay visible; a receipt cannot cover changed counts',()=>{
 const b=batch({expected_counts:counts({client:3}),source_manifest_sha256:hash,staging_completed_at:'2026-09-26T18:00:00Z'}),r=evaluate(b,[record()]);
 assert.equal(r.coverageState,'count_mismatch');assert.equal(r.coverage[0].missing,3);assert.equal(r.coverage[1].excess,1);
});
test('ready markers without current matching owner review remain unreviewed or stale',()=>{
 const row=record({dry_run_status:'ready'});assert.equal(evaluate(batch(),[row]).reviewCounts.unreviewed,1);
 for(const v of [review({source_hash:'b'.repeat(64)}),review({record_type:'package'}),review({owner_confirmed:false})]) {
  const r=evaluate(batch(),[row],[v]);assert.equal(r.reviewCounts.stale,1);assert.equal(r.storedReadyMarkers,0);
 }
});
test('even reviewed legacy ready markers do not become fresh collision checks',()=>{
 const r=evaluate(batch(),[record({dry_run_status:'ready'})],[review()]);assert.equal(r.reviewCounts.reviewed,1);assert.equal(r.storedReadyMarkers,1);assert.equal(r.importAuthorized,false);
});
test('hold, confirmed exclusion and imported status remain separate evidence categories',()=>{
 assert.equal(evaluate(batch(),[record()],[review({decision:'hold',owner_confirmed:false})]).reviewCounts.held,1);
 assert.equal(evaluate(batch(),[record()],[review({decision:'excluded'})]).reviewCounts.excluded,1);
 assert.equal(evaluate(batch(),[record()],[review({decision:'excluded',owner_confirmed:false})]).reviewCounts.stale,1);
 assert.equal(evaluate(batch(),[record({reconciliation_status:'imported'})],[]).reviewCounts.imported,1);
});
test('duplicate identities, unknown kinds and malformed hashes fail rather than total partial data',()=>{
 for(const rows of [[record(),record()], [record(),record({id:'record-2'})], [record({record_type:'unknown'})], [record({source_hash:'bad'})], [record({source_id:''})]])assert.throws(()=>evaluate(batch(),rows),/identities or hashes/);
});
test('duplicate, orphan and invalid latest reviews cannot silently overwrite review state',()=>{
 for(const vs of [[review(),review({id:'review-2'})],[review({record_id:'unknown'})],[review({revision:0})],[review({revision:1.5})],[review({decision:'ready'})]])assert.throws(()=>evaluate(batch(),[record()],vs),/review evidence/);
});
function dbHarness({records=[],reviews=[],failure=null,capped=false,changed=false,missingCount=false}={}) {
 const calls=[],b=batch();
 const db={from(table){const call={table,ops:[]};calls.push(call);let included=null;const q={};
  for(const method of ['select','eq','order'])q[method]=(...args)=>{call.ops.push([method,...args]);return q;};
  q.in=(key,values)=>{included=values;call.ops.push(['in',key,values]);return q;};
  q.range=async(from,to)=>{call.ops.push(['range',from,to]);let rows=table==='migration_records'?records:reviews.filter(v=>included.includes(v.record_id));return{data:failure===table?null:capped?rows.slice(from,Math.min(to+1,from+1)):rows.slice(from,to+1),count:missingCount?null:rows.length,error:failure===table?{}:null};};
  q.maybeSingle=async()=>({data:changed?{...b,status:'review'}:b,error:failure===table?{}:null});return q;
 }};return{db,calls,b};
}
const loadEvidence=load('lib/migration/calendar-preflight-load.ts').loadCalendarPreflight;
test('actual loader reads more than one page and scopes each review chunk to that batch appointments',async()=>{
 const records=Array.from({length:501},(_,i)=>record({id:'r'+i,source_id:'s'+i})),reviews=records.map((r,i)=>review({id:'v'+i,record_id:r.id})),h=dbHarness({records,reviews});
 const result=await loadEvidence(h.db,h.b);assert.equal(result.calendarRows,501);assert.equal(result.reviewCounts.reviewed,501);
 assert.equal(h.calls.filter(c=>c.table==='migration_records').length,3);assert.equal(h.calls.filter(c=>c.table==='migration_latest_record_reviews').length,6);
 for(const c of h.calls.filter(c=>c.table==='migration_records'))assert(c.ops.some(op=>op[0]==='eq'&&op[1]==='batch_id'&&op[2]===batchId));
 for(const c of h.calls.filter(c=>c.table==='migration_latest_record_reviews'))assert(c.ops.some(op=>op[0]==='in'&&op[1]==='record_id'&&op[2].length<=100));
});
test('actual loader rejects truncated, failed, count-less and changed-batch evidence',async()=>{
 for(const opts of [{capped:true},{failure:'migration_records'},{failure:'migration_latest_record_reviews'},{failure:'migration_batches'},{changed:true},{missingCount:true}]) {
  const h=dbHarness({...opts,records:[record(),record({id:'r2',source_id:'s2'})],reviews:[review()]});await assert.rejects(loadEvidence(h.db,h.b));
 }
});
test('empty appointment staging does not cause an unscoped all-review read',async()=>{
 const h=dbHarness({records:[record({record_type:'client'})]});await loadEvidence(h.db,h.b);assert.equal(h.calls.some(c=>c.table==='migration_latest_record_reviews'),false);
});
function text(node){if(Array.isArray(node))return node.map(text).join(' ');if(node&&typeof node==='object')return text(node.props?.children);return node==null||typeof node==='boolean'?'':String(node);}
function pageHarness({user=true,role='owner',deleted=null,profileError=null,unavailable=false,noBatch=false}={}) {
 const calls=[],b=batch(),db={auth:{getUser:async()=>({data:{user:user?{id:'viewer'}:null}})},from(table){calls.push(table);const q={};for(const m of ['select','eq','order','limit'])q[m]=()=>q;q.maybeSingle=async()=>table==='profiles'?{data:{role,deleted_at:deleted},error:profileError}:{data:noBatch?null:b,error:null};return q;}};
 const page=load('app/settings/migration/preflight/page.tsx',{'@/lib/supabase/server':{createClient:async()=>db},'next/navigation':{redirect:to=>{throw Error('redirect:'+to)},notFound:()=>{throw Error('notFound')}},'@/lib/migration/owner-review':{REVIEW_UUID:/^[a-f0-9-]{36}$/},'@/lib/migration/calendar-preflight-load':{PREFLIGHT_BATCH_COLUMNS:'id,label',loadCalendarPreflight:async()=>{calls.push('evidence');if(unavailable)throw Error('offline');return evaluate(b);}}}).default;
 return{calls,run:(params={})=>page({searchParams:Promise.resolve(params)})};
}
for(const [label,options] of [['anonymous',{user:false}],['trainer',{role:'trainer'}],['client',{role:'client'}],['deleted owner',{deleted:'2026-01-01'}],['failed authorization',{profileError:{}}]])test('preflight page blocks '+label+' before source reads',async()=>{
 const h=pageHarness(options);await assert.rejects(h.run());assert(!h.calls.includes('migration_batches'));assert(!h.calls.includes('evidence'));
});
test('actual page distinguishes no staged appointments from a cleared calendar',async()=>{
 const h=pageHarness(),tree=await h.run();assert.match(text(tree),/No appointment evidence staged/);assert.match(text(tree),/not an empty or cleared live calendar/);assert.match(text(tree),/Source totals have not been declared/);assert.doesNotMatch(text(tree),/Import approved|Ready to import/);
});
test('actual page shows unavailable evidence instead of false empty or zero-held success',async()=>{
 const tree=await pageHarness({unavailable:true}).run();assert.match(text(tree),/preflight unavailable/);assert.doesNotMatch(text(tree),/No appointment evidence staged|0 missing|Declared staging counts match/);
});
test('explicit missing or malformed batch IDs never fall through to a different batch',async()=>{
 await assert.rejects(pageHarness({noBatch:true}).run({batch:batchId}),/notFound/);
 for(const batch of ['',[],[batchId],'bad-id'])await assert.rejects(pageHarness().run({batch}),/notFound/);
});
