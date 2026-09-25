const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const ts=require('typescript');
const root=path.join(__dirname,'..'),id='66666666-6666-4666-8666-666666666666',client='44444444-4444-4444-8444-444444444444';
function load(relative,mocks){const filename=path.join(root,relative),source=fs.readFileSync(filename,'utf8'),out=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText,module={exports:{}};new Function('require','module','exports',out)(name=>{if(Object.hasOwn(mocks,name))return mocks[name];if(name.startsWith('@/'))return load(''+name.slice(2)+'.ts',mocks);return require(name);},module,module.exports);return module.exports;}
function mock(options={}){
 const history=[];const profile={id:'coach',role:'trainer',deleted_at:null,...options.profile};const media={id,client_id:client,storage_path:client+'/from-client-'+id+'.mp4',poster_path:null,title:'Synthetic',kind:'video',exercise_id:null,archived_at:null,...options.media};
 const results={profiles:{data:profile,error:null},client_media:{data:media,error:null},clients:{data:{id:client,primary_trainer_id:options.assigned??'coach'},error:null},exercises:{data:{client_visible:true},error:null},exercise_reviews:{data:{safety_status:'approved'},error:null},...options.results};
 function query(table){history.push(['read',table]);const chain={};for(const method of ['select','eq','is','in'])chain[method]=()=>chain;chain.maybeSingle=async()=>results[table]??{data:null,error:null};return chain;}
 const db={auth:{getUser:async()=>({data:{user:options.noUser?null:{id:profile.id}}})},from:query,rpc:async(name,args)=>{history.push(['rpc',name,args]);return options.rpc??{data:{ok:true,id,deduped:false,review_status:'reviewed',reviewed_at:'2026-09-25T12:00:00Z',archived_at:'2026-09-25T12:00:00Z'},error:null};}};
 const svc={from:query,storage:{from:()=>({createSignedUrl:async()=>{history.push(['sign']);return {data:{signedUrl:'https://synthetic.invalid/private.mp4'},error:null};}})}};
 const mocks={'next/server':{NextResponse:{json:(body,init={})=>({status:init.status??200,body,headers:init.headers})}},'@/lib/supabase/server':{createClient:async()=>db,createServiceClient:()=>{history.push(['service']);return svc;}},'@/lib/exercises/capture':{CAPTURE_UUID:/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i},'@/lib/media/request':{smallJson:async r=>r.json()}};
 return {history,mocks};
}
function request(body={feedback:'Control the lowering phase.'},origin='https://coach.invalid'){return {headers:new Headers({origin}),nextUrl:new URL('https://coach.invalid/api/media/'+id),json:async()=>body};}
const params={params:Promise.resolve({id})};
test('review calls atomic RPC and only reports a validated receipt',async()=>{
 const {history,mocks}=mock();const route=load('app/api/media/[id]/review/route.ts',mocks),response=await route.POST(request(),params);
 assert.equal(response.status,200);assert.equal(response.body.ok,true);assert.equal(history[0][1],'finalize_client_media_review');assert.ok(!history.some(x=>x[0]==='service'));
});
test('review auth origin malformed input missing command and invalid receipts never become success',async()=>{
 const scenarios=[{options:{noUser:true},status:401},{origin:'https://wrong.invalid',status:403},{body:{feedback:'x'},status:400},{body:{feedback:'Valid',client_id:'other'},status:400},{options:{rpc:{data:null,error:{code:'PGRST202'}}},status:503},{options:{rpc:{data:{ok:true},error:null}},status:503},{options:{rpc:{data:null,error:{code:'42501'}}},status:403}];
 for(const scenario of scenarios){const {mocks}=mock(scenario.options);const response=await load('app/api/media/[id]/review/route.ts',mocks).POST(request(scenario.body,scenario.origin),params);assert.equal(response.status,scenario.status);assert.notEqual(response.body.ok,true);}
});
test('media signer is never reached for deleted unrelated or archived access',async()=>{
 for(const options of [{profile:{deleted_at:'2026-09-25'}},{assigned:'other-coach'},{profile:{role:'client',id:'other-client'}},{media:{archived_at:'2026-09-25'}},{results:{profiles:{data:null,error:{message:'offline'}}}}]){
  const {mocks,history}=mock(options);const result=await load('app/api/media/[id]/route.ts',mocks).GET(request(),params);assert.ok(result.status>=400);assert.ok(!history.some(x=>x[0]==='sign'));}
});
test('client demo signing requires both visibility and safety approval',async()=>{
 const {mocks,history}=mock({profile:{role:'client',id:client},media:{exercise_id:'exercise'},results:{exercise_reviews:{data:{safety_status:'pending'},error:null}}});
 const response=await load('app/api/media/[id]/route.ts',mocks).GET(request(),params);assert.equal(response.status,404);assert.ok(!history.some(x=>x[0]==='sign'));
});
test('assigned playback is read-only and successful signing returns a private uncached response',async()=>{
 const {mocks,history}=mock();const response=await load('app/api/media/[id]/route.ts',mocks).GET(request(),params);assert.equal(response.status,200);assert.equal(response.headers['Cache-Control'],'private, no-store');assert.equal(history.filter(x=>x[0]==='sign').length,1);assert.ok(!history.some(x=>x[0]==='rpc'));
});
test('archive failure or empty receipt cannot report removed media',async()=>{
 for(const rpc of [{data:null,error:{code:'PGRST202'}},{data:{ok:true},error:null}]){const {mocks}=mock({rpc});const response=await load('app/api/media/[id]/route.ts',mocks).DELETE(request(),params);assert.equal(response.status,503);assert.notEqual(response.body.ok,true);}
});
