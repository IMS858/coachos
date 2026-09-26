const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),ts=require('typescript');
const root=path.join(__dirname,'..'),client='11111111-1111-4111-8111-111111111111',entry='22222222-2222-4222-8222-222222222222',versionId='33333333-3333-4333-8333-333333333333',request='44444444-4444-4444-8444-444444444444';
function load(file,deps={}){const out={},code=ts.transpileModule(fs.readFileSync(path.join(root,file),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;new Function('require','exports',code)(name=>{if(!(name in deps))throw Error('Unexpected dependency '+name);return deps[name];},out);return out;}
const model=load('lib/fuel/model.ts'),helper=load('lib/fuel/adjustment.ts',{'./model':model});
const version=(extra={})=>({id:versionId,client_id:client,revision:2,content:model.blankPlan('2026-09-21'),origin:'ai_proposed',source_reference:'PRIVATE ORIGINAL SOURCE NOTE',created_at:'2026-09-21T12:00:00Z',...extra});
const context=(extra={})=>{const current=version();return{clientId:client,entryId:entry,current,latest:current,...extra};};
test('adjustment copies the prescription without mutating the release or laundering AI provenance',()=>{
 const input=context(),command=helper.fuelAdjustmentDraft(input,request);
 assert.equal(command.action,'save_plan');assert.equal(command.expected_revision,2);assert.equal(command.origin,'ai_proposed');assert.deepEqual(command.content,input.current.content);
 command.content.guidance='Modified private draft';assert.equal(input.current.content.guidance,'');
 assert.match(command.source_reference,new RegExp(entry));assert.match(command.source_reference,new RegExp(versionId));assert.doesNotMatch(command.source_reference,/PRIVATE ORIGINAL SOURCE NOTE/);
 assert.equal('confirmed' in command,false);assert.equal('version_id' in command,false);
});
test('newer private drafts are continued, not overwritten with an older release',()=>{
 const input=context({latest:version({id:request,revision:3})});assert.deepEqual(helper.fuelAdjustmentState(input),{kind:'existing_draft',revision:3});
 assert.throws(()=>helper.fuelAdjustmentDraft(input,request),/latest private draft/);
});
test('missing, cross-client and inconsistent version evidence blocks candidate creation',()=>{
 for(const change of [{current:null},{latest:null},{entryId:'bad-id'},{latest:version({client_id:entry})},{current:version({client_id:entry})},{latest:version({revision:1})},{latest:version({revision:3})},{current:version({id:'bad-id'})},{current:version({origin:'unknown'})},{latest:version({id:request,revision:2})}]){
  assert.equal(helper.fuelAdjustmentState(context(change)).kind,'unavailable');assert.throws(()=>helper.fuelAdjustmentDraft(context(change),request));
 }
});
function nodes(tree){if(Array.isArray(tree))return tree.flatMap(nodes);if(tree&&typeof tree==='object')return[tree,...nodes(tree.props?.children)];return[];}
function harness(){let open=false;const mutation={disabled:false,uncertain:false,message:null,submit:async()=>{},retry:async()=>{}};
 const runtime={jsx:(type,props)=>({type,props}),jsxs:(type,props)=>({type,props})};
 const view=load('components/fuel/adjustment-candidate.tsx',{'react':{useState:()=>[open,value=>{open=value;}]},'react/jsx-runtime':runtime,'@/lib/fuel/adjustment':helper,'./controls':{useFuelMutation:()=>mutation,MutationStatus:'MutationStatus',primaryClass:'primary',secondaryClass:'secondary'}}).FuelAdjustmentCandidate;
 return {mutation,render:(props=context())=>view(props),open:()=>{open=true;}};
}
test('ambiguous candidate saves cannot be dismissed and preserve retry UI after context changes',()=>{
 const h=harness();h.open();h.mutation.disabled=true;h.mutation.uncertain=true;
 const tree=h.render();assert.equal(nodes(tree).find(n=>n.type==='fieldset').props.disabled,true);
 assert.equal(nodes(tree).filter(n=>n.type==='MutationStatus').length,1);
 for(const props of [context({current:null}),context({latest:version({id:request,revision:3})})])assert.equal(nodes(h.render(props)).filter(n=>n.type==='MutationStatus').length,1);
 assert.equal(nodes(tree).filter(n=>n.type==='textarea').length,0);
});
test('workspace passes latest evidence only to staff after a reviewed check-in; candidate cannot publish',()=>{
 const workspace=fs.readFileSync(path.join(root,'components/fuel/workspace.tsx'),'utf8'),candidate=fs.readFileSync(path.join(root,'components/fuel/adjustment-candidate.tsx'),'utf8');
 assert.match(workspace,/staff&&review\.disposition==="reviewed"&&<FuelAdjustmentCandidate/);assert.match(workspace,/current=\{active\} latest=\{latest\}/);
 assert.doesNotMatch(candidate,/action:\s*["']release_plan["']/);assert.doesNotMatch(candidate,/Private adjustment rationale/);
});
