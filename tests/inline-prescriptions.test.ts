import test from "node:test";
import assert from "node:assert/strict";
import { parsePrescription, parsePrescriptionMap, savedPrescriptions, prescriptionSignature, prescriptionSummary } from "../lib/exercises/prescription";
import { exerciseSetData, parseExerciseSetInput, type CatalogExercise } from "../lib/exercises/catalog";
import { libraryDraftRows, applyDraftPrescription } from "../lib/programs/library-draft";
import { saveExerciseSet } from "../lib/exercises/collections-server";
const actor="11111111-1111-4111-8111-111111111111", client="22222222-2222-4222-8222-222222222222", request="33333333-3333-4333-8333-333333333333";
const row:CatalogExercise={canonical_id:"EX-0001",canonical_name:"Synthetic exercise",aliases:null,category:"strength",movement_pattern:null,source_primary_joints:null,equipment:null,matched_exercise_id:actor,mapping_status:"pending"};
const prescription={sets:3,reps:"8–10",load:"25 lb",rpe:7.5,rest_seconds:0,tempo:"3-1-1-0",cue:"Move with control"};
const input={request_id:request,client_id:client,name:"Synthetic set",note:"",canonical_ids:[row.canonical_id],prescriptions:{[row.canonical_id]:prescription}};
test("all dosage fields survive selection, reopen and quick-program conversion without approving an exercise",()=>{
  const parsed=parseExerciseSetInput(input), data=exerciseSetData(parsed,[row],actor);
  assert.deepEqual(savedPrescriptions(data)[row.canonical_id],prescription);
  assert.equal(data.visibility,"coach_only");assert.equal(data.exercises[0].matched_exercise_id,null);
  assert.equal("client_visible" in data,false);assert.equal("safety_status" in data,false);
  const draft={...data,source:"ims_library_program"}, rows=libraryDraftRows(draft);
  assert.equal(rows[0].rpe,7.5);assert.equal(rows[0].cue,prescription.cue);
  const edited=applyDraftPrescription(draft,[{key:"0",...prescription,rpe:8}]);
  assert.equal(libraryDraftRows(edited)[0].rpe,8);assert.equal(edited.visibility,"coach_only");
});
test("blank dosage is unspecified, explicit zero rest survives, and RPE is separate from load",()=>{
  const blank=parsePrescription({});assert.equal(blank.sets,null);assert.equal(blank.rpe,null);assert.equal(blank.rest_seconds,null);
  assert.match(prescriptionSummary(prescription),/0s rest/);assert.match(prescriptionSummary(prescription),/RPE 7.5/);
  assert.equal(parsePrescription(prescription).load,"25 lb");
  assert.deepEqual(savedPrescriptions({exercises:[{canonical_id:"EX-0001",name:"Legacy"}]})["EX-0001"],blank);
});
test("dosage rejects non-finite, out-of-range, identity and publication overrides",()=>{
  for(const change of [{sets:0},{sets:2.5},{rpe:11},{rpe:NaN},{rest_seconds:-1},{load:42},{cue:"x".repeat(501)},{exercise_id:actor},{client_visible:true},{status:"published"}])assert.throws(()=>parsePrescription({...prescription,...change}));
  assert.throws(()=>parsePrescriptionMap({"EX-0002":prescription},["EX-0001"]));
  assert.throws(()=>parseExerciseSetInput({...input,status:"published"}));
  assert.notEqual(prescriptionSignature([row.canonical_id],input.prescriptions),prescriptionSignature([row.canonical_id],{[row.canonical_id]:{...prescription,rpe:8}}));
});
test("older program editor preserves RPE/cue but cannot alter identity or omit required legacy fields",()=>{
  const original={source:"ims_library_program",exercises:[{name:"Synthetic",exercise_id:actor,...prescription}]};
  const legacy={key:"0",sets:3,reps:"10",load:"25 lb",rest_seconds:60,tempo:"3-1-1-0"};
  const edited=libraryDraftRows(applyDraftPrescription(original,[legacy]))[0];assert.equal(edited.rpe,7.5);assert.equal(edited.cue,prescription.cue);assert.equal(edited.exercise_id,actor);
  assert.throws(()=>applyDraftPrescription(original,[{...legacy,exercise_id:client}]));
  assert.throws(()=>applyDraftPrescription(original,[{key:"0"}]));
});
function mockDb(){
  const programs:Record<string,any>[]=[];
  const db={from(table:string){const filters:((r:Record<string,any>)=>boolean)[]=[];let action="read",payload:Record<string,any>={};
    const stores:Record<string,Record<string,any>[]>={profiles:[{id:client,role:"client",deleted_at:null}],clients:[{id:client}],canonical_exercise_queue:[row],programs};
    const finish=(single=false)=>{let matches=stores[table].filter(r=>filters.every(f=>f(r)));if(action==="insert"){const record={...payload,updated_at:"2026-01-01T00:00:00Z"};programs.push(record);matches=[record];}if(action==="update")matches.forEach(r=>Object.assign(r,payload));return {data:single?matches[0]??null:matches,error:null};};
    const q:any={select:()=>q,eq:(key:string,v:unknown)=>{filters.push(r=>(key==="data->>source"?r.data.source:r[key])===v);return q;},is:(k:string,v:unknown)=>{filters.push(r=>r[k]===v);return q;},in:(k:string,v:unknown[])=>{filters.push(r=>v.includes(r[k]));return q;},insert:(v:Record<string,any>)=>{action="insert";payload=v;return q;},update:(v:Record<string,any>)=>{action="update";payload=v;return q;},maybeSingle:async()=>finish(true),single:async()=>finish(true),then:(resolve:(v:unknown)=>unknown,reject:(e:unknown)=>unknown)=>Promise.resolve(finish()).then(resolve,reject)};return q;}};
  return {db:db as never,programs};
}
test("persistent saves include dosage in replay identity and preserve it on legacy PATCH",async()=>{
  const env=mockDb();await saveExerciseSet(env.db,actor,input,false);
  assert.equal((await saveExerciseSet(env.db,actor,input,false)).deduped,true);assert.equal(env.programs.length,1);
  await assert.rejects(saveExerciseSet(env.db,actor,{...input,prescriptions:{"EX-0001":{...prescription,rpe:9}}},false),/already in use/);
  const {prescriptions:omitted,...legacy}=input;assert.ok(omitted);
  await saveExerciseSet(env.db,actor,{...legacy,expected_updated_at:env.programs[0].updated_at,note:"Updated context"},true);
  assert.deepEqual(savedPrescriptions(env.programs[0].data)["EX-0001"],prescription);
  assert.equal(env.programs[0].status,"draft");
});
