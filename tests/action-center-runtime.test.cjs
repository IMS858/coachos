// Synthetic fixtures only. No hosted credentials, SQL writes, notifications or external calls.
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),ts=require('typescript');
const root=path.join(__dirname,'..');
const jsx={jsx:(type,props)=>({type,props}),jsxs:(type,props)=>({type,props}),Fragment:'fragment'};
function load(file,mocks={}) {
 const filename=path.join(root,file),result=ts.transpileModule(fs.readFileSync(filename,'utf8'),{fileName:filename,reportDiagnostics:true,compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}});
 assert.equal((result.diagnostics||[]).filter(d=>d.category===ts.DiagnosticCategory.Error).length,0,file);
 const output={};new Function('require','exports','console',result.outputText)(name=>{
  if(Object.hasOwn(mocks,name))return mocks[name];
  if(name==='react/jsx-runtime')return jsx;
  if(name==='next/link')return{__esModule:true,default:'Link'};
  if(name==='lucide-react')return new Proxy({},{get:(_,key)=>String(key)});
  if(name==='@/components/layout/app-shell')return{AppShell:'AppShell'};
  if(name==='@/components/fuel/review-queue')return{FuelReviewQueue:'FuelReviewQueue'};
  if(name.startsWith('@/')){const p=name.slice(2),f=['.ts','.tsx'].map(ext=>p+ext).find(p=>fs.existsSync(path.join(root,p)));if(f)return load(f,mocks);}
  throw Error('Unmocked '+name);
 },output,{warn:()=>{}});return output;
}
const owner='11111111-1111-4111-8111-111111111111',trainer='22222222-2222-4222-8222-222222222222',client='33333333-3333-4333-8333-333333333333',otherClient='44444444-4444-4444-8444-444444444444',mediaId='55555555-5555-4555-8555-555555555555';
const now=new Date('2026-09-26T21:00:00Z');
const uuid=i=>'aaaaaaaa-aaaa-4aaa-8aaa-'+String(i).padStart(12,'0');
const base={clients:[{id:client,primary_trainer_id:trainer,status:'active',last_session_at:null}],profiles:[{id:client,full_name:'Synthetic Client'}],programs:[],sessions:[],class_occurrences:[],client_media:[],payments:[],plans:[]};
function harness({tables={},fail=[],truncated=null,nullData=null,noCount=null,messages=[],growth={untouched:[]},messageError=false,leadError=false}={}){
 const data={...base,...tables},calls=[],helperCalls=[];
 const db={from(table){const call={table,ops:[]};calls.push(call);const filters=[];let range=[0,249];const q={};
  q.select=(...args)=>{call.ops.push(['select',...args]);return q;};
  q.order=(...args)=>{call.ops.push(['order',...args]);return q;};
  q.range=(a,b)=>{range=[a,b];call.ops.push(['range',a,b]);return q;};
  for(const method of ['eq','neq','in','is','gte','lte'])q[method]=(column,value)=>{call.ops.push([method,column,value]);filters.push(row=>{
   const v=row[column];return method==='eq'?v===value:method==='neq'?v!==value:method==='in'?value.includes(v):method==='is'?v===value:method==='gte'?v>=value:v<=value;
  });return q;};
  q.or=(value)=>{call.ops.push(['or',value]);filters.push(row=>row.data?.source!=='ims_exercise_set');return q;};
  q.then=(resolve,reject)=>{
   const all=(data[table]||[]).filter(row=>filters.every(f=>f(row))).sort((a,b)=>a.id.localeCompare(b.id));
   const rows=all.slice(range[0],range[1]+1);if(truncated===table&&rows.length)rows.pop();
   return Promise.resolve({data:fail.includes(table)||nullData===table?null:rows,error:fail.includes(table)?{code:'42703',message:'private details MUST NOT surface'}:null,count:noCount===table?null:all.length}).then(resolve,reject);
  };return q;
 }};
 const mocks={'@/lib/leads/queries':{loadLeadWorkspace:async()=>{helperCalls.push('leads');if(leadError)throw Error('private lead detail');return growth;}},'@/lib/messages/actionable':{loadStaffUnreadMessages:async()=>{helperCalls.push('messages');if(messageError)throw Error('private message detail');return messages;}},'@/lib/media/review-links':{mediaReviewHref:id=>{if(!/^[a-f0-9-]{36}$/.test(id))throw Error('Invalid media');return'/coaching/media/'+id;}}};
 const module=load('lib/action-center/load.ts',mocks);
 return{db,calls,helperCalls,mocks,run:(role='owner')=>module.loadActionCenter(db,{id:role==='owner'?owner:trainer,role},now)};
}
const get=(data,id)=>data.queues.find(q=>q.id===id);
test('the deployed missing-media-column failure only disables its own queue',async()=>{
 const h=harness({fail:['client_media'],messages:[{id:'message',client_id:client,body:'Synthetic incoming',created_at:now.toISOString()}]});const data=await h.run();
 assert.equal(get(data,'form-video-actions').status,'unavailable');assert.equal(get(data,'form-video-actions').total,null);
 assert.equal(get(data,'messages').total,1);assert.equal(get(data,'quiet').total,1);assert.equal(get(data,'classes').total,0);
 assert.doesNotMatch(JSON.stringify(data),/private details/);
});
test('failed, null and count-less queries never become a known zero',async()=>{
 for(const patch of [{fail:['sessions']},{nullData:'sessions'},{noCount:'sessions'}]){
  const d=await harness(patch).run();assert.equal(get(d,'requests').total,null);assert.equal(get(d,'requests').status,'unavailable');assert.equal(get(d,'programs').total,0);
 }
});
test('valid empty evidence stays a verified empty queue rather than a loading failure',async()=>{
 const data=await harness().run();for(const id of ['requests','messages','form-video-actions','programs','classes','leads','payments','packages']){assert.equal(get(data,id).status,'ready');assert.equal(get(data,id).total,0);}
});
test('more than 500 source rows are counted completely; only the first 20 are rendered',async()=>{
 const programs=Array.from({length:501},(_,i)=>({id:uuid(i),client_id:client,status:'draft',name:'Synthetic',updated_at:now.toISOString(),data:{}}));
 const h=harness({tables:{programs}}),result=await h.run();assert.equal(get(result,'programs').total,501);assert.equal(get(result,'programs').rows.length,20);assert.equal(h.calls.filter(c=>c.table==='programs').length,3);
});
test('a capped source page does not produce a plausible partial count',async()=>{
 const programs=[{id:uuid(1),client_id:client,status:'draft',data:{}}];const d=await harness({tables:{programs},truncated:'programs'}).run();assert.equal(get(d,'programs').total,null);
});
test('trainer queries are scoped before pagination and never read owner financial or lead tables',async()=>{
 const tables={clients:[...base.clients,{id:otherClient,primary_trainer_id:owner,status:'active',last_session_at:null}],programs:[{id:uuid(1),client_id:otherClient,status:'draft',data:{}},{id:uuid(2),client_id:client,status:'draft',data:{}}],client_media:[{id:mediaId,client_id:client,review_status:'awaiting_review',archived_at:null,created_at:now.toISOString()}]};
 const h=harness({tables,messages:[{id:'other-message',client_id:otherClient,body:'Hidden'}]}),d=await h.run('trainer');
 assert.equal(get(d,'programs').total,1);assert.equal(get(d,'messages').total,0);assert.equal(get(d,'form-video-actions').rows[0].href,'/coaching/media/'+mediaId);
 assert.equal(d.queues.length,6);assert(!h.helperCalls.includes('leads'));assert(!h.calls.some(c=>['payments','plans','leads'].includes(c.table)));
 for(const c of h.calls.filter(c=>['programs','client_media'].includes(c.table)))assert(c.ops.some(op=>op[0]==='in'&&op[1]==='client_id'&&op[2].includes(client)&&!op[2].includes(otherClient)));
 for(const c of h.calls.filter(c=>['sessions','class_occurrences'].includes(c.table)))assert(c.ops.some(op=>op[0]==='eq'&&op[1]==='trainer_id'&&op[2]===trainer));
});
test('unavailable assigned roster fails its dependent queues closed but retains trainer schedule queues',async()=>{
 const h=harness({fail:['clients']}),d=await h.run('trainer');for(const id of ['programs','messages','form-video-actions','quiet'])assert.equal(get(d,id).total,null);
 assert.equal(get(d,'requests').status,'ready');assert.equal(get(d,'classes').status,'ready');assert(!h.helperCalls.includes('messages'));assert(!h.calls.some(c=>['programs','client_media'].includes(c.table)));
});
test('known empty trainer roster does not issue an unscoped client-data query',async()=>{
 const h=harness({tables:{clients:[]}}),d=await h.run('trainer');assert.equal(get(d,'programs').total,0);assert.equal(get(d,'form-video-actions').total,0);assert(!h.calls.some(c=>['programs','client_media'].includes(c.table)));
});
test('missing package counters are a review action, not zero/depleted; verified zero is retained',async()=>{
 const plans=[{id:uuid(1),client_id:client,status:'active',kind:'package',total_sessions:null,sessions_used:0},{id:uuid(2),client_id:client,status:'active',kind:'package',total_sessions:6,sessions_used:6,current_session_number:6},{id:uuid(3),client_id:client,status:'active',kind:'package',total_sessions:24,sessions_used:1,current_session_number:1}];
 const q=get(await harness({tables:{plans}}).run(),'packages');assert.equal(q.total,2);assert.match(q.rows[0].meta,/balance needs review/);assert.doesNotMatch(q.rows[0].meta,/0 remaining|Depleted/);assert.match(q.rows[1].meta,/0 sessions remaining/);
});
test('message and lead lookup failures stay separate from known pending payments',async()=>{
 const h=harness({messageError:true,leadError:true,tables:{payments:[{id:uuid(1),client_id:client,status:'pending'}]}}),d=await h.run();assert.equal(get(d,'messages').total,null);assert.equal(get(d,'leads').total,null);assert.equal(get(d,'payments').total,1);
});
test('missing client names are labeled unavailable without losing valid record identities',async()=>{
 const h=harness({fail:['profiles'],tables:{sessions:[{id:uuid(1),client_id:client,trainer_id:trainer,status:'requested',scheduled_at:'bad-date'}]}}),d=await h.run();assert.equal(d.namesUnavailable,true);const q=get(d,'requests');assert.equal(q.total,1);assert.equal(q.rows[0].title,'Client name unavailable');assert.equal(q.rows[0].meta,'Date needs review');
});
test('invalid date presentation and deleted/cancelled-type exclusions do not crash the Action Center',async()=>{
 const f=load('lib/action-center/load.ts',harness().mocks).actionDate;for(const v of [null,undefined,'not-a-date',{},123])assert.equal(f(v),'Date needs review');assert.match(f('2026-09-26T00:30:00Z'),/Sep 25/);
 const tables={programs:[{id:uuid(1),client_id:client,status:'draft',data:{source:'ims_exercise_set'}}],class_occurrences:[{id:uuid(2),trainer_id:trainer,starts_at:'2026-09-28T10:00:00Z',status:'cancelled',class_program_id:null}]};
 const d=await harness({tables}).run();assert.equal(get(d,'programs').total,0);assert.equal(get(d,'classes').total,0);
});
test('invalid role is refused before even the roster read',async()=>{const h=harness();await assert.rejects(h.run('client'),/staff context/);assert.equal(h.calls.length,0);});
function expand(node){if(Array.isArray(node))return node.map(expand);if(!node||typeof node!=='object')return node;if(typeof node.type==='function')return expand(node.type(node.props));return{...node,props:{...node.props,children:expand(node.props?.children)}};}
function text(node){if(Array.isArray(node))return node.map(text).join(' ');if(node&&typeof node==='object')return text(node.props?.children);return node==null||typeof node==='boolean'?'':String(node);}
function nodes(node){if(Array.isArray(node))return node.flatMap(nodes);if(node&&typeof node==='object')return[node,...nodes(node.props?.children)];return[];}
function pageHarness({role='owner',user=true,deleted=null,profileError=null,result=null}={}){
 const calls=[];const db={auth:{getUser:async()=>({data:{user:user?{id:owner}:null}})},from(table){calls.push(table);const q={select:()=>q,eq:()=>q,maybeSingle:async()=>({data:{role,deleted_at:deleted},error:profileError})};return q;}};
 const module=load('app/action-center/page.tsx',{'@/lib/supabase/server':{createClient:async()=>db},'next/navigation':{redirect:to=>{throw Error('redirect:'+to)}},'@/lib/action-center/load':{loadActionCenter:async()=>{calls.push('queues');return result;}}});return{calls,run:module.default};
}
for(const [title,options] of [['anonymous',{user:false}],['client',{role:'client'}],['deleted owner',{deleted:'2026-01-01'}],['failed authorization',{profileError:{}}]])test('actual page blocks '+title+' before queue reads',async()=>{const h=pageHarness(options);await assert.rejects(h.run());assert(!h.calls.includes('queues'));});
test('actual Action Center renders unknown counts, scoped partial warning and an available message',async()=>{
 const result=await harness({fail:['client_media'],messages:[{id:'m',client_id:client,body:'Keep this available.'}]}).run();const tree=expand(await pageHarness({result}).run()),visible=text(tree);
 assert.match(visible,/total incomplete/);assert.match(visible,/Queue unavailable/);assert.match(visible,/unknown—not zero/);assert.match(visible,/Keep this available/);assert.doesNotMatch(visible,/No client form videos are awaiting review/);
 assert(nodes(tree).some(n=>n.type==='button'&&text(n)==='Retry loading queues'));assert(nodes(tree).some(n=>n.props?.role==='alert'));
});
test('app and root error boundaries use an explicitly readable, private-safe recovery screen',()=>{
 const error=Object.assign(new Error('SECRET SQL OR CLIENT DETAILS'),{digest:'581160021'});
 const app=expand(load('app/error.tsx').default({error,reset:()=>{}})),global=expand(load('app/global-error.tsx').default({error,reset:()=>{}}));
 for(const tree of [app,global]){const visible=text(tree);assert.match(visible,/This page could not finish loading/);assert.match(visible,/581160021/);assert.doesNotMatch(visible,/SECRET SQL/);assert.match(visible,/does not confirm whether that save completed/);assert(nodes(tree).some(n=>n.type==='main'&&n.props.style.background==='#f4f6f8'&&n.props.style.colorScheme==='light'));assert(nodes(tree).some(n=>n.type==='a'&&n.props.href==='/dashboard'));}
 assert.equal(global.type,'html');assert.equal(global.props.children.type,'body');
});
test('recovery never reflects unvalidated digest text and loading state does not fabricate counts',()=>{
 const recovery=expand(load('components/ui/recovery-screen.tsx').RecoveryScreen({digest:'<unsafe private details>'}));assert.doesNotMatch(text(recovery),/unsafe private/);
 const loading=load('app/action-center/loading.tsx').default();assert.equal(loading.props['aria-busy'],true);assert.match(text(loading),/after their evidence loads/);
});

function fuelHarness({authThrows=false,authError=false,role='owner',profileError=false,failure=null,entries=[],reviews=[]}={}) {
 const calls=[];
 const db={auth:{getUser:async()=>{calls.push('getUser');if(authThrows)throw Error('private auth failure');return{data:{user:{id:owner}},error:authError?{}:null};}},from(table){calls.push(table);let ids=[];const q={};for(const method of ['select','eq','gte','order'])q[method]=()=>q;q.in=(key,value)=>{ids=value;return q;};q.maybeSingle=async()=>({data:{role,deleted_at:null},error:profileError?{}:null});q.range=async(a,b)=>{const all=table==='fuel_journal_entries'?entries:table==='fuel_coach_reviews'?reviews.filter(r=>ids.includes(r.entry_id)):ids.map(id=>({id,full_name:'Synthetic Client'}));return{data:failure===table?null:all.slice(a,b+1),count:all.length,error:failure===table?{}:null};};return q;}};
 const mocks={'@/lib/supabase/server':{createClient:async()=>db},'@/lib/fuel/model':{fuelDate:()=> '2026-09-26',shiftDate:()=> '2026-08-30',pendingCheckins:(entries,reviews)=>entries.filter(e=>!reviews.some(r=>r.entry_id===e.id))}};
 return{calls,run:()=>load('components/fuel/review-queue.tsx',mocks).FuelReviewQueue()};
}
test('Fuel authorization and transport exceptions remain a local unavailable queue, not a crashed Action Center',async()=>{
 for(const options of [{authThrows:true},{authError:true},{profileError:true}]){const h=fuelHarness(options),tree=expand(await h.run());assert.match(text(tree),/Fuel check-ins unavailable/);assert.doesNotMatch(text(tree),/No unanswered|private auth/);assert(!h.calls.includes('fuel_journal_entries'));}
});
test('Fuel does not issue a second authentication read or query all historical reviews for an empty window',async()=>{
 const h=fuelHarness(),tree=expand(await h.run());assert.equal(h.calls.filter(x=>x==='getUser').length,1);assert(!h.calls.includes('fuel_coach_reviews'));assert.match(text(tree),/No unanswered fuel check-ins/);
});
test('Fuel client roles are denied and failed journals or review reads do not yield a zero review count',async()=>{
 const c=fuelHarness({role:'client'});assert.equal(await c.run(),null);assert(!c.calls.includes('fuel_journal_entries'));
 const entries=[{id:mediaId,client_id:client,entry_date:'2026-09-25',revision:1,payload:{contact_requested:true}}];
 for(const failure of ['fuel_journal_entries','fuel_coach_reviews','profiles']){const h=fuelHarness({entries,failure}),tree=expand(await h.run());assert.match(text(tree),/Fuel check-ins unavailable/);assert.doesNotMatch(text(tree),/No unanswered/);}
});
test('Fuel pending entry produces its scoped coach link and a real matching review clears it',async()=>{
 const entry={id:mediaId,client_id:client,entry_date:'2026-09-25',revision:1,payload:{contact_requested:true}};
 let tree=expand(await fuelHarness({entries:[entry]}).run());assert.match(text(tree),/Contact requested/);assert(nodes(tree).some(n=>n.props?.href===`/clients/${client}/fuel#fuel-checkins`));
 tree=expand(await fuelHarness({entries:[entry],reviews:[{id:uuid(1),entry_id:mediaId}]}).run());assert.match(text(tree),/No unanswered fuel check-ins/);
});
