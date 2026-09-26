const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const ts=require('typescript');
const root=path.join(__dirname,'..');
function load(relative,mocks={}){
  const file=path.join(root,relative),source=fs.readFileSync(file,'utf8'),out=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText,loaded={exports:{}};
  new Function('require','module','exports',out)(name=>Object.hasOwn(mocks,name)?mocks[name]:name.startsWith('@/')?load(name.slice(2)+'.ts',mocks):name.startsWith('.')?load(path.relative(root,path.resolve(path.dirname(file),name))+'.ts',mocks):require(name),loaded,loaded.exports);return loaded.exports;
}
// A controlled hook harness executes the real form event handlers. This is not a
// substitute for an authenticated browser/device test; it isolates async races.
function mount(relative,exportName,props={}){
  const values=[],effects=[];let cursor=0,tree,refreshes=0;
  const hooks={useRef:initial=>{const index=cursor++;values[index]??={current:initial};return values[index];},useState:initial=>{const index=cursor++;if(!(index in values))values[index]=typeof initial==='function'?initial():initial;return [values[index],v=>{values[index]=typeof v==='function'?v(values[index]):v;}];},useEffect:(effect,deps)=>{const index=cursor++,old=values[index];if(!old||deps.some((d,i)=>d!==old.deps[i])){old?.cleanup?.();values[index]={deps};effects.push(()=>{values[index].cleanup=effect();});}}};
  const jsx=(type,p)=>({type,props:p??{}}),mocks={'react':hooks,'react/jsx-runtime':{jsx,jsxs:jsx,Fragment:'fragment'},'next/link':{default:'link'},'next/navigation':{useRouter:()=>({refresh:()=>refreshes++})},'lucide-react':{CalendarPlus:'icon',Loader2:'spinner',Check:'icon'},'@/components/ui/button':{Button:'button'},'@/components/ui/card':{Card:'card',CardContent:'content',CardHeader:'header',CardTitle:'title'},'@/components/ui/input':{Input:'input'}};
  const Component=load(relative,mocks)[exportName];
  function render(){cursor=0;tree=Component(props);while(effects.length)effects.shift()();return tree;}
  function all(node){if(Array.isArray(node))return node.flatMap(x=>all(x));if(!node||typeof node!=='object')return [];return [node,...all(node.props?.children)];}
  function text(node){if(Array.isArray(node))return node.map(x=>text(x)).join('');if(node==null||typeof node==='boolean')return '';if(typeof node!=='object')return String(node);return text(node.props?.children);}
  const find=predicate=>all(tree).find(predicate);
  render();return {render,find,text:()=>text(tree),get refreshes(){return refreshes;},dispose(){for(const v of values)v?.cleanup?.();}};
}
const flush=()=>new Promise(resolve=>setImmediate(resolve));
const response=(body,status=200)=>({ok:status>=200&&status<300,status,json:async()=>body});
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};
function windowMock(){return {addEventListener(){},removeEventListener(){}};}
async function choose(h,date='2026-10-05'){h.find(x=>x.props.id==='booking-date').props.onChange({target:{value:date}});await flush();h.render();h.find(x=>x.props.id==='booking-time').props.onChange({target:{value:'09:00'}});h.render();}
async function submit(h){h.find(x=>x.type==='form').props.onSubmit({preventDefault(){}});await flush();h.render();}
test('availability failure never exposes unverified fallback slots and retry stays visible',async()=>{
  const before=global.fetch,win=global.window;global.window=windowMock();global.fetch=async()=>response({error:'offline'},503);let h;
  try{h=mount('components/booking/booking-form.tsx','BookingForm');h.find(x=>x.props.id==='booking-date').props.onChange({target:{value:'2026-10-05'}});await flush();h.render();assert.equal(h.find(x=>x.props.id==='booking-time').props.disabled,true);assert.ok(h.text().includes('Retry availability'));assert.ok(!h.text().includes('9:00 AM'));assert.equal(h.find(x=>x.type==='button'&&x.props.type==='submit').props.disabled,true);}finally{h?.dispose();global.fetch=before;global.window=win;}
});
test('an older availability response cannot replace the newly selected date',async()=>{
  const before=global.fetch,win=global.window,first=deferred(),second=deferred();global.window=windowMock();let count=0;global.fetch=()=>++count===1?first.promise:second.promise;let h;
  try{h=mount('components/booking/booking-form.tsx','BookingForm');h.find(x=>x.props.id==='booking-date').props.onChange({target:{value:'2026-10-05'}});h.render();h.find(x=>x.props.id==='booking-date').props.onChange({target:{value:'2026-10-06'}});second.resolve(response({ok:true,date:'2026-10-06',duration_minutes:60,slots:['10:00']}));await flush();h.render();first.resolve(response({ok:true,date:'2026-10-05',duration_minutes:60,slots:['09:00']}));await flush();h.render();assert.ok(h.text().includes('10:00 AM'));assert.ok(!h.text().includes('9:00 AM'));assert.equal(h.find(x=>x.props.id==='booking-date').props.value,'2026-10-06');}finally{h?.dispose();global.fetch=before;global.window=win;}
});
test('ambiguous network save retains the exact request ID; duplicate tap does not create a second request',async()=>{
  const before=global.fetch,win=global.window,requests=[],network=deferred();global.window=windowMock();
  global.fetch=async(url,init)=>{if(url.includes('availability'))return response({ok:true,date:'2026-10-05',duration_minutes:60,slots:['09:00']});const body=JSON.parse(init.body);requests.push(body);if(requests.length===1)return network.promise;return response({ok:true,id:body.request_id,status:'requested',deduped:true});};let h;
  try{h=mount('components/booking/booking-form.tsx','BookingForm');await choose(h);const submitHandler=h.find(x=>x.type==='form').props.onSubmit;submitHandler({preventDefault(){}});submitHandler({preventDefault(){}});assert.equal(requests.length,1);network.reject(new Error('Connection lost'));await flush();h.render();assert.ok(h.text().includes('Retry the same request'));assert.equal(h.find(x=>x.type==='fieldset').props.disabled,true);await submit(h);assert.equal(requests.length,2);assert.deepEqual(requests[0],requests[1]);assert.equal(requests[0].scheduled_at,'2026-10-05T16:00:00.000Z');assert.ok(h.text().includes('awaiting coach confirmation'));assert.ok(h.text().includes('not a confirmed booking'));assert.equal(h.refreshes,1);}finally{h?.dispose();global.fetch=before;global.window=win;}
});
test('invalid success receipt does not clear the booking or claim confirmation',async()=>{
  const before=global.fetch,win=global.window;global.window=windowMock();global.fetch=async url=>url.includes('availability')?response({ok:true,date:'2026-10-05',duration_minutes:60,slots:['09:00']}):response({ok:true});let h;
  try{h=mount('components/booking/booking-form.tsx','BookingForm');await choose(h);await submit(h);assert.equal(h.refreshes,0);assert.ok(h.text().includes('Retry the same request'));assert.ok(!h.text().includes('Request saved —'));}finally{h?.dispose();global.fetch=before;global.window=win;}
});
test('account save keeps edits on an invalid receipt and normalizes baseline only after confirmed persistence',async()=>{
  const before=global.fetch,win=global.window;global.window=windowMock();let valid=false;global.fetch=async()=>valid?response({ok:true,profile:{full_name:'Updated Client',phone:null}}):response({ok:true});let h;
  try{h=mount('components/account/account-profile-form.tsx','AccountProfileForm',{initialName:'Client',initialPhone:'',email:'synthetic@example.invalid'});h.find(x=>x.props.id==='acct-name').props.onChange({target:{value:' Updated Client '}});h.render();await submit(h);assert.equal(h.find(x=>x.props.role==='status'),undefined);assert.equal(h.find(x=>x.props.id==='acct-name').props.value,' Updated Client ');valid=true;await submit(h);assert.ok(h.find(x=>x.props.role==='status'));assert.equal(h.find(x=>x.props.id==='acct-name').props.value,'Updated Client');assert.equal(h.find(x=>x.type==='button'&&x.props.type==='submit').props.disabled,true);}finally{h?.dispose();global.fetch=before;global.window=win;}
});
test('a later rejected attempt cannot erase an earlier ambiguous request identity',async()=>{
  const before=global.fetch,win=global.window,payloads=[];global.window=windowMock();
  global.fetch=async(url,init)=>{if(url.includes('availability'))return response({ok:true,date:'2026-10-05',duration_minutes:60,slots:['09:00']});payloads.push(JSON.parse(init.body));if(payloads.length===1)throw new Error('Lost response');if(payloads.length===2)return response({saved:false,error:'Sign in required'},401);return response({ok:true,id:payloads[0].request_id,status:'requested',deduped:true});};let h;
  try{h=mount('components/booking/booking-form.tsx','BookingForm');await choose(h);await submit(h);await submit(h);assert.equal(h.find(x=>x.type==='fieldset').props.disabled,true);assert.ok(h.text().includes('Retry the same request'));await submit(h);assert.equal(new Set(payloads.map(p=>p.request_id)).size,1);assert.equal(h.refreshes,1);}finally{h?.dispose();global.fetch=before;global.window=win;}
});
