const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const ts=require('typescript');
const root=path.join(__dirname,'..'),id='11111111-1111-4111-8111-111111111111';
function load(file,deps={}){const compiled=ts.transpileModule(fs.readFileSync(path.join(root,file),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;const loaded={exports:{}};new Function('require','exports',compiled)(name=>{if(!(name in deps))throw Error('Unexpected import '+name);return deps[name];},loaded.exports);return loaded.exports;}
function harness({role='owner',deleted=false,user=true,profileError=false,rpcError=null,receipt=null,throws=false}={}){
 const calls=[];const db={auth:{getUser:async()=>({data:{user:user?{id}:null}})},from(table){calls.push(table);const q={select(){return q},eq(){return q},maybeSingle:async()=>({data:{role,deleted_at:deleted?'2026-01-01':null},error:profileError?{}:null})};return q;},async rpc(name,params){calls.push(name);if(throws)throw Error('offline');const p=params.p_review;return{data:receipt??{ok:true,request_id:p.request_id,record_id:params.p_record_id,revision:p.expected_revision+1,source_hash:p.source_hash,decision:p.decision},error:rpcError};}};
 const {POST}=load('app/api/migration/records/[id]/review/route.ts',{'next/server':{NextResponse:{json:(body,opts)=>({body,...opts})}},'@/lib/supabase/server':{createClient:async()=>db},'@/lib/media/request':{smallJson:async r=>r.body},'@/lib/migration/owner-review':load('lib/migration/owner-review.ts')});
 const body={request_id:id,source_hash:'a'.repeat(64),expected_revision:0,record_type:'client',decision:'reviewed',owner_confirmed:true,reason:'Confirmed from the source client record.',proposal:{client_id:id}};
 return{calls,body,run:(b=body,origin='https://ims.example.invalid')=>POST({body:b,nextUrl:{origin:'https://ims.example.invalid'},headers:{get:()=>origin}},{params:Promise.resolve({id})})};
}
test('actual owner review endpoint rejects non-owner/deleted/anonymous before any mutation',async()=>{
 for(const option of [{user:false},{role:'trainer'},{role:'client'},{deleted:true},{profileError:true}]){const h=harness(option),r=await h.run();assert.notEqual(r.status,200);assert.ok(!h.calls.includes('review_migration_record'));}
});
test('origin and payload guards prevent unauthorized extra fields and missing confirmation',async()=>{
 let h=harness();assert.equal((await h.run(h.body,'https://other.example.invalid')).status,403);assert.ok(!h.calls.includes('review_migration_record'));
 for(const patch of [{role:'owner'},{owner_confirmed:false},{proposal:{client_id:id,amount_paid_cents:9300}}]){h=harness();assert.equal((await h.run({...h.body,...patch})).status,400);assert.ok(!h.calls.includes('review_migration_record'));}
});
test('actual API delegates only to the audited review RPC and validates the full receipt',async()=>{
 let h=harness(),r=await h.run();assert.equal(r.status,200);assert.equal(r.body.revision,1);assert.deepEqual(h.calls,['profiles','review_migration_record']);assert.equal(r.headers['Cache-Control'],'private, no-store');
 h=harness({receipt:{ok:true}});assert.equal((await h.run()).status,503);
});
test('missing command, stale revision and transport failures cannot become saved states',async()=>{
 for(const [code,status] of [['PGRST202',503],['40001',409],['23505',409],['42501',403],['P0002',404],['22023',400],['XX000',503]]){const h=harness({rpcError:{code}});assert.equal((await h.run()).status,status);}
 assert.equal((await harness({throws:true}).run()).status,503);
});
