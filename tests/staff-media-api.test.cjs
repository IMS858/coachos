const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const ts=require('typescript');
const root=path.join(__dirname,'..'),coach='22222222-2222-4222-8222-222222222222',client='44444444-4444-4444-8444-444444444444',base='66666666-6666-4666-8666-666666666666';
function load(relative,mocks){const source=fs.readFileSync(path.join(root,relative),'utf8'),out=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,module={exports:{}};new Function('require','module','exports',out)(name=>Object.hasOwn(mocks,name)?mocks[name]:name.startsWith('@/')?load(name.slice(2)+'.ts',mocks):require(name),module,module.exports);return module.exports;}
function request(body,origin='https://coach.invalid'){return {headers:new Headers({origin}),nextUrl:new URL('https://coach.invalid/api/media'),json:async()=>body};}
function mock(options={}){
 const calls=[];
 function query(table){const eqs={},chain={};for(const method of ['select','is','in'])chain[method]=()=>chain;chain.eq=(key,value)=>{eqs[key]=value;return chain;};chain.insert=()=>{calls.push('insert');return chain;};chain.update=()=>{calls.push('update');return chain;};chain.single=async()=>({data:{id:base},error:null});chain.maybeSingle=async()=>{
  if(table==='profiles'&&eqs.id===coach)return {data:{id:coach,role:'trainer',deleted_at:null,...options.viewer},error:options.profileError?{message:'offline'}:null};
  if(table==='profiles')return {data:{id:client,role:'client',deleted_at:null,email:null,...options.recipient},error:null};
  if(table==='clients')return {data:{id:client,primary_trainer_id:options.assigned??coach},error:options.clientError?{message:'offline'}:null};
  return {data:null,error:null};};return chain;}
 const db={auth:{getUser:async()=>({data:{user:options.noUser?null:{id:coach}}})},from:query,rpc:async(name)=>{calls.push(name);return options.rpc??{data:{ok:true,client_id:client,added:1,skipped:0,media_ids:[base]},error:null};}};
 const svc={from:query,storage:{from:()=>({createSignedUploadUrl:async()=>{calls.push('sign');return {data:{signedUrl:'https://synthetic.invalid/upload',token:'synthetic'},error:null};},list:async()=>({data:[{id:'file',name:base+'.mp4',metadata:{mimetype:'video/mp4',size:options.fileSize??1024}}],error:null})})}};
 const mocks={'next/server':{NextResponse:{json:(body,init={})=>({body,status:init.status??200})}},'@/lib/supabase/server':{createClient:async()=>db,createServiceClient:()=>{calls.push('service');return svc;}},'@/lib/exercises/capture':{CAPTURE_UUID:/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i},'@/lib/media/request':{smallJson:async r=>r.json()},'@/lib/mailer':{sendEmail:async()=>{calls.push('email');return {ok:true};},emailShell:x=>x.bodyHtml}};
 return {calls,mocks};
}
const save={client_id:client,title:'Synthetic demo',storage_path:client+'/'+base+'.mp4',kind:'video',category:'mobility',duration_seconds:10};
test('staff upload save and assignment deny unauthorized accounts before privileged operations',async()=>{
 const routes=[['app/api/media/upload-url/route.ts',{client_id:client,ext:'mp4',base}],['app/api/media/route.ts',save],['app/api/media/assign/route.ts',{client_id:client,exercise_ids:[base]}]];
 for(const [route,body] of routes)for(const options of [{noUser:true},{viewer:{deleted_at:'2026-09-25'}},{viewer:{role:'client'}},{assigned:'other'},{recipient:{deleted_at:'2026-09-25'}},{clientError:true},{profileError:true}]){const {calls,mocks}=mock(options);const response=await load(route,mocks).POST(request(body));assert.ok(response.status>=400);assert.ok(!calls.includes('service'));assert.ok(!calls.includes('assign_client_media_demos'));assert.ok(!calls.includes('email'));}
});
test('staff media origin and body guards run before signing',async()=>{
 for(const [body,origin] of [[{client_id:client,ext:'mp4',base},'https://other.invalid'],[{client_id:client,ext:'html'},undefined],[{client_id:client,base:'from-client-'+base},undefined]]){const {calls,mocks}=mock();const response=await load('app/api/media/upload-url/route.ts',mocks).POST(request(body,origin));assert.ok(response.status>=400);assert.ok(!calls.includes('sign'));}
});
test('assigned coach gets a scoped upload path; incomplete saved file never succeeds',async()=>{
 let context=mock();let response=await load('app/api/media/upload-url/route.ts',context.mocks).POST(request({client_id:client,ext:'mp4',base}));assert.equal(response.status,200);assert.equal(response.body.path,client+'/'+base+'.mp4');
 context=mock({fileSize:0});response=await load('app/api/media/route.ts',context.mocks).POST(request(save));assert.equal(response.status,409);assert.ok(!context.calls.includes('insert'));
 context=mock();response=await load('app/api/media/route.ts',context.mocks).POST(request(save));assert.equal(response.status,201);assert.equal(response.body.id,base);
});
test('demo assignment requires a complete receipt and reports missing RPC without sending',async()=>{
 for(const rpc of [{data:null,error:{code:'PGRST202'}},{data:{ok:true},error:null},{data:{ok:true,client_id:client,added:1,skipped:0,media_ids:[]},error:null}]){const {calls,mocks}=mock({rpc});const response=await load('app/api/media/assign/route.ts',mocks).POST(request({client_id:client,exercise_ids:[base]}));assert.equal(response.status,503);assert.ok(!calls.includes('email'));}
 const {mocks,calls}=mock();const response=await load('app/api/media/assign/route.ts',mocks).POST(request({client_id:client,exercise_ids:[base]}));assert.equal(response.status,200);assert.equal(response.body.added,1);assert.ok(!calls.includes('service'));
});
