// Synthetic, read-only tests. No hosted credentials, network, Stripe or emails.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const jsx = { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }), Fragment: 'fragment' };
function load(relative, mocks = {}, cache = new Map()) {
  const filename = path.resolve(root, relative);
  if (cache.has(filename)) return cache.get(filename).exports;
  const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    fileName: filename, reportDiagnostics: true,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  });
  assert.equal((compiled.diagnostics || []).filter(d => d.category === ts.DiagnosticCategory.Error).length, 0, relative);
  const module = { exports: {} }; cache.set(filename, module);
  const localRequire = (name) => {
    if (Object.hasOwn(mocks, name)) return mocks[name];
    if (name === 'react/jsx-runtime') return jsx;
    if (name === 'react') return { useState: (value) => [typeof value === 'function' ? value() : value, () => {}], useRef: (value) => ({ current: value }) };
    if (name === 'next/link') return { __esModule: true, default: 'Link' };
    if (name === 'lucide-react' || name.startsWith('@/components/')) return new Proxy({}, { get: (_, key) => String(key) });
    if (name.startsWith('@/') || name.startsWith('.')) {
      const base = name.startsWith('@/') ? path.join(root, name.slice(2)) : path.resolve(path.dirname(filename), name);
      const file = ['.ts', '.tsx', '.cjs'].map(ext => base + ext).find(fs.existsSync);
      if (file) return load(path.relative(root, file), mocks, cache);
    }
    throw new Error(`Unmocked dependency: ${name}`);
  };
  vm.runInThisContext(`(function(require,module,exports){${compiled.outputText}\n})`, { filename })(localRequire, module, module.exports);
  return module.exports;
}
function nodes(tree) {
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  if (tree && typeof tree === 'object') return [tree, ...nodes(tree.props?.children)];
  return [];
}
function text(tree) {
  if (Array.isArray(tree)) return tree.map(text).join(' ');
  if (tree && typeof tree === 'object') return text(tree.props?.children);
  return tree === null || tree === undefined || typeof tree === 'boolean' ? '' : String(tree);
}
const display = load('lib/billing/payment-display.ts');
const payment = (extra = {}) => ({ id: 'synthetic', amount_cents: 10000, currency: 'usd', status: 'succeeded', description: 'Synthetic payment', paid_at: null, created_at: '2026-09-24T12:00:00Z', ...extra });

test('succeeded matches the database contract; paid is not silently accepted', () => {
  const sum = display.summarizePayments([payment(), payment({ status: 'paid' })]);
  assert.equal(sum.succeeded, 1); assert.equal(sum.needsReview, 1); assert.equal(sum.currencies[0].received, 10000);
});
test('failed and pending attempts do not inflate received money', () => {
  const sum = display.summarizePayments([payment({status:'failed'}), payment({status:'pending'})]);
  assert.equal(sum.failed, 1); assert.equal(sum.pending, 1); assert.deepEqual(sum.currencies, []);
});
test('partial refund rows subtract once and positive refund anomalies require review', () => {
  const sum = display.summarizePayments([payment(), payment({status:'refunded',amount_cents:-2500}), payment({status:'refunded',amount_cents:400})]);
  assert.deepEqual(sum.currencies, [{currency:'USD', received:10000, refunded:2500, net:7500}]);
  assert.equal(sum.needsReview, 1);
});
test('currencies never get combined or converted into a fabricated USD total', () => {
  const sum = display.summarizePayments([payment(),payment({currency:'cad',amount_cents:20000})]);
  assert.deepEqual(sum.currencies.map(x => [x.currency,x.net]), [['CAD',20000],['USD',10000]]);
});
test('minor units support USD, JPY and Stripe ISK exception without crashing', () => {
  const clean = value => value.replace(/\s/g, ' ');
  assert.equal(clean(display.formatPaymentAmount(1250,'usd')), 'USD 12.50');
  assert.equal(clean(display.formatPaymentAmount(1250,'jpy')), 'JPY 1,250');
  assert.equal(clean(display.formatPaymentAmount(500,'isk')), 'ISK 5.00');
  assert.equal(display.formatPaymentAmount(1,'bogus'), 'Amount needs review');
});
test('invalid or signed wrong-way amounts are flagged instead of coerced to zero', () => {
  assert.equal(display.paymentState(payment({amount_cents:null})).tone,'review');
  assert.equal(display.paymentState(payment({amount_cents:'100'})).tone,'review');
  assert.equal(display.paymentState(payment({amount_cents:-100})).tone,'review');
  assert.equal(display.paymentState(payment({amount_cents:0})).tone,'success');
});
test('timestamps use Pacific days; date-only and invalid values are not shifted or crashed', () => {
  assert.equal(display.formatPaymentDate('2026-09-24T00:30:00Z'), 'Sep 23, 2026');
  assert.equal(display.formatPaymentDate('2026-09-24'), 'Sep 24, 2026');
  assert.equal(display.formatPaymentDate('2026-02-30'), 'Date unavailable');
  assert.equal(display.formatPaymentDate('invalid'), 'Date unavailable');
});

function scene({ role = 'client', deleted = null, user = true, paymentsError = null, rows = [], profileError = null } = {}) {
  const calls = []; let serviceCalls = 0;
  const client = {
    auth: { getUser: async () => ({data:{user:user ? {id:'synthetic-viewer'} : null}}) },
    from(table) {
      calls.push([table,'from']);
      const builder = {};
      for (const method of ['select','eq','is','order','limit','range','in']) builder[method] = (...args) => {calls.push([table,method,...args]); return builder;};
      const result = () => table === 'profiles' ? { data:{role,deleted_at:deleted}, error:profileError }
        : { data:paymentsError ? null : rows,error:paymentsError };
      builder.maybeSingle = builder.single = async () => result();
      builder.then = (resolve,reject) => Promise.resolve(result()).then(resolve,reject);
      return builder;
    },
  };
  const mocks = {
    '@/lib/supabase/server': { createClient:async()=>client,createServiceClient:()=>{serviceCalls++;return client;} },
    'next/navigation': {redirect:destination=>{throw new Error(`redirect:${destination}`);},notFound:()=>{throw new Error('notFound');}},
  };
  return {calls,mocks,serviceCount:()=>serviceCalls};
}
for (const [title,options] of [['anonymous',{user:false}],['trainer',{role:'trainer'}],['owner',{role:'owner'}],['deleted client',{deleted:'2026-01-01'}],['profile error',{profileError:{message:'synthetic'}}]]) {
  test(`client payment page blocks ${title} before payment reads`,async()=>{
    const s=scene(options), page=load('app/account/billing/page.tsx',s.mocks).default;
    await assert.rejects(page(),/redirect:/);
    assert.equal(s.calls.some(c=>c[0]==='payments'),false); assert.equal(s.serviceCount(),0);
  });
}
test('client billing is explicitly scoped and a failed query is not an empty ledger',async()=>{
  const s=scene({paymentsError:{message:'synthetic'}});
  const tree=await load('app/account/billing/page.tsx',s.mocks).default();
  assert(s.calls.some(c=>c[0]==='payments'&&c[1]==='eq'&&c[2]==='client_id'&&c[3]==='synthetic-viewer'));
  assert.match(text(tree),/temporarily unavailable/); assert.doesNotMatch(text(tree),/No payments recorded yet|Successful payments shown/);
  assert.equal(s.serviceCount(),0);
});
test('client billing discloses its 100-row cap rather than claiming lifetime totals',async()=>{
  const s=scene({rows:Array.from({length:101},(_,i)=>payment({id:`synthetic-${i}`}))});
  const tree=await load('app/account/billing/page.tsx',s.mocks).default();
  assert.match(text(tree),/100 most recently recorded/);
  assert.equal(nodes(tree).find(n=>n.type==='PaymentList').props.rows.length,100);
});
for (const options of [{user:false},{role:'client'},{role:'trainer'},{role:'owner',deleted:'2026-01-01'},{role:'owner',profileError:{message:'synthetic'}}]) {
  test(`checkout denies unauthorized roster reads: ${JSON.stringify(options)}`,async()=>{
    const s=scene(options), page=load('app/checkout/page.tsx',s.mocks).default;
    await assert.rejects(page({searchParams:Promise.resolve({})}),/redirect:/);
    assert.equal(s.serviceCount(),0);
  });
}
test('checkout return banner does not claim that the URL proved payment',()=>{
  const view=load('components/checkout/checkout-view.tsx').CheckoutView;
  const tree=view({clients:[],flash:'success'});
  assert.match(text(tree),/not proof of payment/);
  assert.doesNotMatch(text(tree),/Payment complete|plan is now active/);
  const buttons=nodes(tree).filter(n=>n.type==='Button');
  assert.equal(buttons.length,7); assert(buttons.every(n=>n.props.disabled===true));
});
test('client-specific checkout preselection is restricted to known roster IDs',()=>{
  const view=load('components/checkout/checkout-view.tsx').CheckoutView;
  const roster=[{id:'client-a',full_name:'Synthetic Client'}];
  const valid=view({clients:roster,initialClientId:'client-a'});
  assert(nodes(valid).filter(n=>n.type==='Button').every(n=>n.props.disabled===false));
  const invalid=view({clients:roster,initialClientId:'not-in-roster'});
  assert(nodes(invalid).filter(n=>n.type==='Button').every(n=>n.props.disabled===true));
});

function financialClient({ failureTable = null, plans = [] }={}) {
  const calls=[];
  return {calls, from(table) {
    const ops=[];calls.push({table,ops}); const builder={};
    for(const method of ['select','eq','in','order','gte','lte']) builder[method]=(...args)=>{ops.push([method,...args]);return builder;};
    builder.range=async(from,to)=>{
      ops.push(['range',from,to]);
      const data=table==='plans'?plans.slice(from,to+1):[];
      return {data:failureTable===table?null:data,error:failureTable===table?{message:'synthetic'}:null};
    };return builder;
  }};
}
test('financial source failure propagates instead of becoming zero revenue',async()=>{
  const get=load('lib/queries/financials.ts').getFinancialSnapshot;
  await assert.rejects(get(financialClient({failureTable:'plans'}),new Date('2026-12-15T20:00:00Z')),/source unavailable/);
});
test('financial windows use winter Pacific midnight and stop at now',async()=>{
  const svc=financialClient(), get=load('lib/queries/financials.ts').getFinancialSnapshot;
  await get(svc,new Date('2026-12-15T20:00:00Z'));
  const ops=svc.calls.find(c=>c.table==='sessions').ops;
  assert(ops.some(x=>x[0]==='gte'&&x[2]==='2026-12-01T08:00:00.000Z'));
  assert(ops.some(x=>x[0]==='lte'&&x[2]==='2026-12-15T20:00:00.000Z'));
});
test('financial plan totals page beyond the first 500 records',async()=>{
  const plans=Array.from({length:501},(_,i)=>({id:`s-${i}`,kind:'subscription',status:'active',monthly_rate_cents:1000}));
  const svc=financialClient({plans}), get=load('lib/queries/financials.ts').getFinancialSnapshot;
  const result=await get(svc,new Date('2026-09-24T20:00:00Z'));
  assert.equal(result.membershipMrrCents,501000); assert.equal(svc.calls.filter(c=>c.table==='plans').length,2);
});

test('application TypeScript parses without malformed injected escape sequences',()=>{
  const files=[];
  function walk(folder) {for(const entry of fs.readdirSync(folder,{withFileTypes:true})) {const file=path.join(folder,entry.name);if(entry.isDirectory())walk(file);else if(/\.tsx?$/.test(file))files.push(file);}}
  for(const dir of ['app','components','lib']) walk(path.join(root,dir));
  for(const file of files) {
    const source=ts.createSourceFile(file,fs.readFileSync(file,'utf8'),ts.ScriptTarget.Latest,true,file.endsWith('.tsx')?ts.ScriptKind.TSX:ts.ScriptKind.TS);
    assert.equal(source.parseDiagnostics.length,0,`${path.relative(root,file)}: ${source.parseDiagnostics.map(d=>ts.flattenDiagnosticMessageText(d.messageText,' ')).join('; ')}`);
  }
});

test('preview cron configuration respects the verified daily-only plan',()=>{
  const config=JSON.parse(fs.readFileSync(path.join(root,'vercel.json'),'utf8'));
  for(const cron of config.crons) assert.match(cron.schedule,/^\d+ \d+ \* \* \*$/);
  assert.equal(config.crons.find(c=>c.path==='/api/cron/session-reminders').schedule,'0 16 * * *');
});
