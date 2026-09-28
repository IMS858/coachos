const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),ts=require('typescript');
function load(scenario={}){
 let elevated=0,sent=0;
 const q={select(){return this;},eq(){return this;},maybeSingle:async()=>({data:scenario.profile===null?null:{role:scenario.role??'owner',deleted_at:scenario.deleted_at??null},error:scenario.profileError??null})};
 const userDb={auth:{getUser:async()=>({data:{user:scenario.user===false?null:{id:'synthetic-owner'}},error:scenario.authError??null})},from:()=>q};
 const source=ts.transpileModule(fs.readFileSync('app/api/clients/route.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const out={};
 new Function('require','exports',source)(name=>{
  if(name==='next/server')return {NextResponse:{json:(body,{status=200}={})=>({body,status})}};
  if(name==='@/lib/supabase/server')return {createClient:async()=>userDb,createServiceClient:()=>{elevated++;throw Error('Unexpected elevated access');}};
  if(name==='@/lib/invite')return {sendLoginInvite:()=>{sent++;throw Error('Unexpected invitation');}};
  if(name==='@/lib/audit')return {recordAudit:()=>{throw Error('Unexpected audit write');}};
  throw Error('Unexpected dependency '+name);
 },out);
 return {post:body=>out.POST({json:async()=>body}),counts:()=>({elevated,sent})};
}
test('missing or failed authentication cannot create a client identity',async()=>{
 for(const scenario of [{user:false},{authError:{message:'expired'}}]){
  const route=load(scenario);assert.equal((await route.post({})).status,401);assert.deepEqual(route.counts(),{elevated:0,sent:0});
 }
});
test('disabled staff, clients and unknown roles are denied before service-role access',async()=>{
 for(const scenario of [{role:'owner',deleted_at:'2026-01-01'},{role:'trainer',deleted_at:'2026-01-01'},{role:'client'},{role:'unexpected'},{profile:null}]){
  const route=load(scenario);assert.equal((await route.post({})).status,403);assert.deepEqual(route.counts(),{elevated:0,sent:0});
 }
});
test('authorization read failure does not become authorized staff',async()=>{
 const route=load({profileError:{message:'unavailable'}});assert.equal((await route.post({})).status,503);assert.deepEqual(route.counts(),{elevated:0,sent:0});
});
test('malformed fields return a validation error without creating users or sending messages',async()=>{
 for(const body of [null,[],false,{full_name:42},{email:42},{phone:{}},{initial_plan:[]},{initial_plan:{custom_label:4}},{}]){
  const route=load();assert.equal((await route.post(body)).status,400);assert.deepEqual(route.counts(),{elevated:0,sent:0});
 }
});
