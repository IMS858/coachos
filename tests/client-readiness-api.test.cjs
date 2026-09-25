const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const ts=require('typescript');
const root=path.join(__dirname,'..');
const id='66666666-6666-4666-8666-666666666666',client='44444444-4444-4444-8444-444444444444';
function load(relative,mocks={}){
  const file=path.join(root,relative),out=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText,loaded={exports:{}};
  new Function('require','module','exports',out)(name=>{
    if(Object.hasOwn(mocks,name))return mocks[name];
    if(name.startsWith('@/'))return load(name.slice(2)+'.ts',mocks);
    if(name.startsWith('.'))return load(path.relative(root,path.resolve(path.dirname(file),name))+'.ts',mocks);
    return require(name);
  },loaded,loaded.exports);return loaded.exports;
}
function context(options={}){
  const calls=[];let updating=false;
  const q={};for(const m of ['select','eq','is'])q[m]=(...args)=>{calls.push([m,...args]);return q;};
  q.update=value=>{updating=true;calls.push(['update',value]);return q;};
  q.maybeSingle=async()=>updating?(options.write??{data:{id:client,full_name:'Client',phone:null},error:null}):(options.profile??{data:{role:'client',deleted_at:null},error:null});
  const db={auth:{getUser:async()=>({data:{user:options.noUser?null:{id:client}}})},from:table=>{calls.push(['from',table]);return q;},rpc:async(name,args)=>{calls.push(['rpc',name,args]);return options.rpc??{data:{ok:true,id,status:'requested',deduped:false},error:null};}};
  const mocks={'next/server':{NextResponse:{json:(body,init={})=>({status:init.status??200,body,headers:init.headers})}},'@/lib/supabase/server':{createClient:async()=>db},'@/lib/media/request':{smallJson:async r=>r.json()},'@/lib/mailer':{sendEmail:async()=>{calls.push(['email']);return {ok:false};},emailShell:x=>x.bodyHtml}};
  return {mocks,calls};
}
function req(body,url='https://ims.invalid/api/sessions/request',origin='https://ims.invalid'){return {headers:new Headers(origin?{origin}:{}),nextUrl:new URL(url),json:async()=>body};}
const payload={request_id:id,scheduled_at:'2026-10-05T16:00:00Z',session_type:'training',note:'Technique focus'};
test('request is RPC-only, returns a validated pending receipt, and email failure is not booking failure',async()=>{
  const previous=process.env.OWNER_EMAIL;process.env.OWNER_EMAIL='synthetic@example.invalid';
  try{const {mocks,calls}=context();const result=await load('app/api/sessions/request/route.ts',mocks).POST(req(payload));assert.equal(result.status,201);assert.equal(result.body.status,'requested');assert.equal(result.body.notification,'not_confirmed');assert.equal(calls[0][1],'request_client_training_session');assert.ok(!calls.some(x=>x[0]==='update'||x[0]==='from'));assert.equal(result.headers['Cache-Control'],'private, no-store');}finally{if(previous===undefined)delete process.env.OWNER_EMAIL;else process.env.OWNER_EMAIL=previous;}
});
test('request authorization, malformed payloads and command failures never become success or notification',async()=>{
  const scenarios=[{options:{noUser:true},status:401},{origin:'https://other.invalid',status:403},{origin:null,status:403},{body:{...payload,client_id:'other'},status:400},{body:{...payload,service_id:id},status:400},{body:{...payload,session_type:'massage'},status:400},{body:{...payload,note:'x'.repeat(501)},status:400},{body:{...payload,scheduled_at:'2026-02-30T16:00:00Z'},status:400},{options:{rpc:{data:null,error:{code:'PGRST202'}}},status:503},{options:{rpc:{data:null,error:{code:'42501',message:'Active client required'}}},status:403},{options:{rpc:{data:null,error:{code:'P0100',message:'Too many requests'}}},status:429},{options:{rpc:{data:{ok:true},error:null}},status:503}];
  for(const item of scenarios){const {mocks,calls}=context(item.options);const result=await load('app/api/sessions/request/route.ts',mocks).POST(req(item.body??payload,undefined,Object.hasOwn(item,'origin')?item.origin:'https://ims.invalid'));assert.equal(result.status,item.status);assert.notEqual(result.body.ok,true);assert.ok(!calls.some(x=>x[0]==='email'));}
});
test('availability requires a matching complete receipt; unknown never becomes empty or open slots',async()=>{
  const url='https://ims.invalid/api/sessions/availability?date=2026-10-05';
  for(const rpc of [{data:null,error:{code:'PGRST202'}},{data:{date:'2026-10-05',slots:[]},error:null},{data:{ok:true,date:'2026-10-06',duration_minutes:60,slots:[]},error:null},{data:{ok:true,date:'2026-10-05',duration_minutes:60,slots:['18:30']},error:null}]){const {mocks}=context({rpc});const result=await load('app/api/sessions/availability/route.ts',mocks).GET(req(null,url));assert.equal(result.status,503);assert.equal(result.body.slots,undefined);}
  const {mocks}=context({rpc:{data:{ok:true,date:'2026-10-05',duration_minutes:60,slots:['09:00']},error:null}});const result=await load('app/api/sessions/availability/route.ts',mocks).GET(req(null,url));assert.deepEqual(result.body.slots,['09:00']);
});
test('account uses self-scoped RLS update, validates returned values, and rejects zero-row fake saves',async()=>{
  for(const write of [{data:null,error:null},{data:{id:'other',full_name:'Client',phone:null},error:null},{data:{id:client,full_name:'wrong',phone:null},error:null},{data:null,error:{message:'offline'}}]){const {mocks}=context({write});const result=await load('app/api/account/route.ts',mocks).PATCH(req({full_name:'Client',phone:''}));assert.equal(result.status,503);assert.notEqual(result.body.ok,true);}
  const {mocks,calls}=context();const result=await load('app/api/account/route.ts',mocks).PATCH(req({full_name:' Client ',phone:' '}));assert.equal(result.status,200);assert.deepEqual(result.body.profile,{full_name:'Client',phone:null});assert.ok(calls.some(x=>x[0]==='eq'&&x[1]==='id'&&x[2]===client));
});
test('account denies deleted/staff users, invalid origins and extra administrative fields before writes',async()=>{
  for(const item of [{body:{full_name:'Client',phone:'',role:'owner'},status:400},{body:{full_name:'Client'},status:400},{options:{profile:{data:{role:'client',deleted_at:'2026-09-25'},error:null}},status:403},{options:{profile:{data:{role:'trainer',deleted_at:null},error:null}},status:403},{origin:'https://other.invalid',status:403}]){const {mocks,calls}=context(item.options);const response=await load('app/api/account/route.ts',mocks).PATCH(req(item.body??{full_name:'Client',phone:''},undefined,item.origin));assert.equal(response.status,item.status);assert.ok(!calls.some(x=>x[0]==='update'));}
});
test('Pacific slot conversion is device-zone independent and a full session fits before close',()=>{
  const contract=load('lib/booking/client-contract.ts');const before=process.env.TZ;
  try{for(const zone of ['UTC','Asia/Tokyo','America/New_York']){process.env.TZ=zone;assert.equal(contract.requestedInstant('2026-10-05','09:00'),'2026-10-05T16:00:00.000Z');assert.equal(contract.requestedInstant('2026-12-07','09:00'),'2026-12-07T17:00:00.000Z');}}
  finally{if(before===undefined)delete process.env.TZ;else process.env.TZ=before;}
  assert.equal(contract.studioSlots('2026-10-05').at(-1),'18:00');assert.equal(contract.studioSlots('2026-10-03').at(-1),'12:00');assert.deepEqual(contract.studioSlots('2026-10-04'),[]);assert.throws(()=>contract.studioSlots('2026-02-30'));assert.throws(()=>contract.requestedInstant('2026-10-05','18:30'));
});
test('package numbers cannot turn missing or inconsistent usage into a full package',()=>{
  const {packageBalance}=load('lib/billing/package-balance.ts');const pack={kind:'package',total_sessions:12,sessions_used:3,current_session_number:3};assert.equal(packageBalance(pack).remaining,9);assert.equal(packageBalance({...pack,sessions_used:null}).state,'unknown');assert.equal(packageBalance({...pack,current_session_number:1}).state,'unknown');assert.equal(packageBalance({...pack,sessions_used:13,current_session_number:13}).remaining,0);
});
test('transport failure from the database is ambiguous, not proof that a request was unsaved',async()=>{const {mocks}=context({rpc:{data:null,error:{code:'',message:'TypeError: fetch failed'}}});const result=await load('app/api/sessions/request/route.ts',mocks).POST(req(payload));assert.equal(result.status,503);assert.equal(result.body.saved,undefined);});
