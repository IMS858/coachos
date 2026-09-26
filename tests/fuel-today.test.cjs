const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const ts=require('typescript');
const root=path.join(__dirname,'..');
function load(file,deps={}) {
 const source=ts.transpileModule(fs.readFileSync(path.join(root,file),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 const out={};new Function('require','exports',source)(name=>{if(!(name in deps))throw Error('Unexpected dependency '+name);return deps[name]},out);return out;
}
const model=load('lib/fuel/model.ts');
const today=load('lib/fuel/today.ts',{'./model':model});
const validation=load('lib/fuel/validation.ts',{'zod':require('zod'),'./model':model});
const complete=load('lib/migration/complete-read.ts');
const recurring=load('lib/recurring.ts');
const loader=load('lib/fuel/today-load.ts',{'zod':require('zod'),'@/lib/migration/complete-read':complete,'@/lib/recurring':recurring,'./model':model,'./validation':validation,'./today':today});
const id=n=>`${String(n).padStart(8,'0')}-1111-4111-8111-111111111111`;
const client=id(1),versionId=id(2),date='2026-09-26',now=new Date('2026-09-26T16:00:00Z');
const ready=value=>({status:'ready',value}),failed=()=>({status:'unavailable',message:'Evidence unavailable'});
function plan(){const p=model.blankPlan(date);p.mode='targets';p.habits=[...model.HABITS];p.phases[0].training={kcal:2100,protein_g:130,carbs_g:245,fat_g:60};p.phases[0].rest={kcal:1900,protein_g:130,carbs_g:195,fat_g:60};p.guidance='Only the exact coach-approved guidance.';return p;}
const version=()=>({id:versionId,client_id:client,revision:1,content:plan()});
const release=()=>({id:id(3),client_id:client,version_id:versionId,sequence:1});
const session=()=>({id:id(4),client_id:client,scheduled_at:'2026-09-26T23:00:00Z',status:'confirmed',session_type:'training',duration_minutes:60});
function daily(day='unclassified'){return {id:id(5),client_id:client,kind:'daily',entry_date:date,revision:1,plan_version_id:versionId,created_at:now.toISOString(),payload:{day_type:day,habits:Object.fromEntries(model.HABITS.map(h=>[h,null])),weight_lb:null,steps:null,sleep_hours:null,energy:null,hunger:null,note:''}};}
function data(){return {clientId:client,date,now:now.toISOString(),plan:ready({kind:'released',sequence:1,version:version()}),daily:ready(null),sessions:ready([]),nextSession:ready(null),checkin:ready(null)};}
test('no booking is not rest; only an explicit report selects rest targets',()=>{
 let d=data(),t=today.buildFuelToday(d);assert.equal(t.context.day,'unclassified');assert.equal(t.targets,null);assert.equal(t.action.href,'/fuel#fuel-daily');
 d.daily=ready(daily('rest'));t=today.buildFuelToday(d);assert.equal(t.targets.kcal,1900);assert.equal(t.context.source,'client_reported');
});
test('calendar selects released training targets but never marks a habit or appointment complete',()=>{
 const d=data();d.sessions=ready([session()]);d.nextSession=ready(session());const t=today.buildFuelToday(d);
 assert.equal(t.targets.kcal,2100);assert.equal(t.context.source,'calendar_planned');assert.equal(t.score.reported,0);assert.equal(t.score.met,0);assert.equal(t.action.href,'/plan');assert.equal(d.sessions.value[0].status,'confirmed');
});
test('explicit rest overrides planned training visibly; failed journals cannot be overridden by a booking',()=>{
 const d=data();d.sessions=ready([session()]);d.daily=ready(daily('rest'));let t=today.buildFuelToday(d);assert.equal(t.targets.kcal,1900);assert.equal(t.context.conflict,true);
 d.daily=failed();t=today.buildFuelToday(d);assert.equal(t.targets,null);assert.equal(t.score,null);assert.equal(t.action.reload,true);
});
test('canceled, non-training and other Pacific-day appointments never infer training',()=>{
 for(const change of [{status:'canceled'},{session_type:'assessment'},{scheduled_at:'2026-09-27T07:00:00Z'}]) {const d=data();d.sessions=ready([{...session(),...change}]);assert.equal(today.buildFuelToday(d).context.day,'unclassified');}
});
test('paused, absent, failed, future and out-of-phase plans never surface targets or guidance',()=>{
 for(const p of [ready({kind:'none'}),ready({kind:'paused',sequence:2}),failed()]) {const d=data();d.plan=p;d.daily=ready(daily('training'));const t=today.buildFuelToday(d);assert.equal(t.targets,null);assert.equal(t.guidance,'');}
 for(const targetDate of ['2026-09-25','2027-01-01']) {const d=data();d.date=targetDate;d.daily=ready(daily('training'));assert.equal(today.buildFuelToday(d).targets,null);assert.equal(today.buildFuelToday(d).guidance,'');}
 const d=data();d.plan.value.version.content.phases[0].start='2026-09-27';assert.equal(today.buildFuelToday(d).active,null);
});
test('habits count only reports, exclude not-due, and preserve unknown and verified zero targets',()=>{
 const d=data(),entry=daily('training');entry.payload.habits={protein:'met',fuel:'missed',water:'not_due',steps:null,sleep:'met',training:null};d.daily=ready(entry);
 d.plan.value.version.content.phases[0].training.fat_g=0;d.plan.value.version.content.phases[0].training.carbs_g=null;
 const t=today.buildFuelToday(d);assert.deepEqual(t.score,{assigned:6,reported:3,met:2,notDue:1,unreported:2});assert.equal(t.targets.fat_g,0);assert.equal(t.targets.carbs_g,null);assert.equal(t.guidance,plan().guidance);
});
test('a newly released version does not judge an earlier plan report against new targets',()=>{
 const d=data();d.daily=ready(daily('training'));d.daily.value.plan_version_id=id(9);const t=today.buildFuelToday(d);assert.equal(t.earlierPlan,true);assert.equal(t.score,null);assert.equal(t.action.href,'/fuel#fuel-plan');
});
test('failed check-in lookup is not an overdue client task or a pending review',()=>{
 const d=data();d.checkin=failed();d.plan.value.version.content.review_on=date;const t=today.buildFuelToday(d);assert.equal(t.reviewDue,false);assert.equal(t.checkin,null);
});
test('captureEvidence preserves real absence and turns thrown reads into visible failure',async()=>{
 assert.deepEqual(await today.captureEvidence(async()=>null,'error'),ready(null));assert.deepEqual(await today.captureEvidence(async()=>{throw Error('private details')},'Visible error'),{status:'unavailable',message:'Visible error'});
});
function harness(options={}) {
 const calls=[];let releaseReads=0;
 const db={from(table){const call={table,filters:[],columns:null,range:null};calls.push(call);const q={select(columns){call.columns=columns;return q},eq(k,v){call.filters.push(['eq',k,v]);return q},gte(k,v){call.filters.push(['gte',k,v]);return q},lte(k,v){call.filters.push(['lte',k,v]);return q},lt(k,v){call.filters.push(['lt',k,v]);return q},in(k,v){call.filters.push(['in',k,v]);return q},order(){return q},limit(){return q},range(a,b){call.range=[a,b];return q},maybeSingle(){return run()},then(resolve,reject){return run().then(resolve,reject)}};
 async function run(){
  if(options.throwTable===table)throw Error('backend offline');
  if(options.failTable===table)return {data:null,error:{message:'offline'},count:null};
  let value=null;
  if(table==='fuel_plan_releases'){releaseReads++;value=options.noPlan?null:options.paused?{...release(),version_id:null}:options.changeRelease&&releaseReads>1?{...release(),id:id(99),sequence:2}:release();}
  if(table==='fuel_plan_versions')value=options.badPlan?{...version(),content:{schema_version:99}}:version();
  if(table==='fuel_journal_entries'){
   const kind=call.filters.find(f=>f[1]==='kind')?.[2];value=kind==='daily'?(options.daily??null):(options.weekly??null);
  }
  if(table==='fuel_coach_reviews')value=options.response??null;
  if(table==='sessions')value=call.range?(options.sessions??[]):(options.next??null);
  return {data:value,error:null,count:Array.isArray(value)?value.length:undefined};
 }return q;}};
 return {calls,run:()=>loader.loadFuelToday(db,client,options.now??now)};
}
test('actual Today loader scopes every query to self and fetches only the exact released version',async()=>{
 const h=harness({daily:daily('training'),sessions:[session()],next:session()});const d=await h.run();assert.equal(d.plan.status,'ready');assert.equal(d.plan.value.version.id,versionId);
 for(const call of h.calls)assert.ok(call.filters.some(f=>f[0]==='eq'&&f[1]==='client_id'&&f[2]===client));
 const v=h.calls.find(c=>c.table==='fuel_plan_versions');assert.ok(v.filters.some(f=>f[1]==='id'&&f[2]===versionId));assert.equal(v.columns,'id,client_id,revision,content');assert.ok(!h.calls.some(c=>/sources|documents|payments/.test(c.table)));
});
test('actual loader rechecks the release pointer, rejects malformed plans and never falls back to drafts',async()=>{
 for(const options of [{changeRelease:true},{badPlan:true},{failTable:'fuel_plan_versions'}]){const d=await harness(options).run();assert.equal(d.plan.status,'unavailable');assert.equal(d.sessions.status,'ready');}
 for(const options of [{noPlan:true},{paused:true}]){const h=harness(options);const d=await h.run();assert.equal(d.plan.status,'ready');assert.ok(!h.calls.some(c=>c.table==='fuel_plan_versions'));}
});
test('actual loader isolates failures and rejects cross-client, wrong-day and canceled next-session evidence',async()=>{
 let d=await harness({throwTable:'sessions'}).run();assert.equal(d.plan.status,'ready');assert.equal(d.sessions.status,'unavailable');assert.equal(d.nextSession.status,'unavailable');
 for(const entry of [{...daily(),client_id:id(90)},{...daily(),entry_date:'2026-09-25'},{...daily(),payload:{}}]){d=await harness({daily:entry}).run();assert.equal(d.daily.status,'unavailable');assert.equal(d.plan.status,'ready');}
 for(const next of [{...session(),client_id:id(90)},{...session(),status:'canceled'},{...session(),scheduled_at:'2026-09-25T23:00:00Z'}])assert.equal((await harness({next}).run()).nextSession.status,'unavailable');
});
test('actual loader uses Pacific calendar-day boundaries through spring and fall daylight saving',async()=>{
 for(const [instant,hours] of [['2026-03-08T17:00:00Z',23],['2026-11-01T17:00:00Z',25]]){const h=harness({noPlan:true,now:new Date(instant)});await h.run();const c=h.calls.find(c=>c.table==='sessions'&&c.range);const start=c.filters.find(f=>f[0]==='gte')[2],end=c.filters.find(f=>f[0]==='lt')[2];assert.equal((Date.parse(end)-Date.parse(start))/3600000,hours);}
});
test('Today is placed inside the dashboard before secondary tools and uses existing retry-safe daily submission',()=>{
 const page=fs.readFileSync(path.join(root,'app/dashboard/page.tsx'),'utf8'),dashboard=fs.readFileSync(path.join(root,'components/dashboard/client-dashboard.tsx'),'utf8'),card=fs.readFileSync(path.join(root,'components/fuel/today-card.tsx'),'utf8');
 assert.match(page,/<ClientDashboard[^>]*>\s*<FuelTodayCard\s*\/>\s*<\/ClientDashboard>/);
 assert.ok(dashboard.indexOf('{children}')<dashboard.indexOf('My IMS tools'));assert.doesNotMatch(dashboard,/mobilityTarget\s*=\s*5/);assert.match(card,/FuelDailyForm/);assert.match(card,/data\.daily\.status === "ready"/);assert.doesNotMatch(card,/createServiceClient/);
});
const jsx={jsx:(type,props)=>({type,props}),jsxs:(type,props)=>({type,props})};
const view=load('components/fuel/today-view.tsx',{'react/jsx-runtime':jsx,'next/link':{default:({children})=>children},'@/lib/fuel/model':model,'@/lib/fuel/today':today,'@/components/sessions/cancel-session-button':{CancelSessionButton:()=>null}});
function textOf(node){if(node===null||node===undefined||typeof node==='boolean')return '';if(Array.isArray(node))return node.map(textOf).join(' ');if(typeof node!=='object')return String(node);if(typeof node.type==='function')return textOf(node.type(node.props));return textOf(node.props?.children);}
test('actual Today render distinguishes failed sections from absent evidence and never shows draft provenance',()=>{
 const d=data();d.daily=failed();d.nextSession=failed();d.checkin=failed();const output=textOf(view.FuelTodayView({data:d}));assert.match(output,/Evidence unavailable/);assert.doesNotMatch(output,/No upcoming booked session was found|Awaiting coach review|Not reported yet/);assert.doesNotMatch(output,/source_reference|Private draft|payroll/i);
});
test('actual Today render preserves zero, distinguishes unassigned fields and has one primary next step',()=>{
 const d=data();d.daily=ready(daily('training'));d.plan.value.version.content.phases[0].training.fat_g=0;d.plan.value.version.content.phases[0].training.carbs_g=null;
 const output=textOf(view.FuelTodayView({data:d}));assert.match(output,/0\s+g/);assert.match(output,/Not assigned/);assert.equal((output.match(/Your next step/g)||[]).length,1);assert.match(output,/not a health score/);
});
