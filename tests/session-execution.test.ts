import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {EMPTY_PERFORMED,executionRows,parsePerformedValues,performanceChanged,sessionPlanRows,type PerformanceRecord} from "../lib/coaching/session-execution";
import {repeatedPerformance} from "../lib/coaching/performance-evidence";
const ex="11111111-1111-4111-8111-111111111111";
test("quick dosage becomes executable without identity changes",()=>{
 const rows=sessionPlanRows({source:"ims_library_program",exercises:[{canonical_id:"EX-0001",name:"Split Squat",matched_exercise_id:ex,sets:3,reps:"8",load:"20 lb",rpe:7,rest_seconds:60,tempo:"3-1-1-0",cue:"Own the bottom"}]},[]);
 assert.equal(rows[0].key,"quick:0:EX-0001");assert.equal(rows[0].exercise_id,ex);assert.equal(rows[0].prescription.rpe,7);assert.equal(rows[0].prescription.cue,"Own the bottom");
});
test("assignment normalization preserves block order without mutating source",()=>{
 const base={id:"a",exercise_id:ex,block:"main",position:0,sets:3,reps:"8",load_prescription:"25 lb",rest_seconds:60,tempo:null,notes:null,exercises:{name:"Squat"}};
 const source=[base,{...base,id:"b",block:"warmup"}];const rows=sessionPlanRows({},source);
 assert.equal(rows[0].block,"warmup");assert.equal(source[0],base);assert.deepEqual(sessionPlanRows({source:"ims_exercise_set"},source),[]);
});
test("actual values reject invented blanks, boolean coercion and non-finite inputs; explicit zero survives",()=>{
 assert.equal(performanceChanged(EMPTY_PERFORMED),false);assert.throws(()=>parsePerformedValues(EMPTY_PERFORMED),/empty row/);
 assert.equal(parsePerformedValues({...EMPTY_PERFORMED,sets_completed:0}).sets_completed,0);
 for(const value of [true,"3",NaN,Infinity,-1,31])assert.throws(()=>parsePerformedValues({...EMPTY_PERFORMED,sets_completed:value}));
 for(const value of [true,"7",0,11,7.123])assert.throws(()=>parsePerformedValues({...EMPTY_PERFORMED,rpe_actual:value}));
 assert.equal(parsePerformedValues({...EMPTY_PERFORMED,rpe_actual:7.5}).rpe_actual,7.5);
 assert.throws(()=>parsePerformedValues({...EMPTY_PERFORMED,sets_completed:3,exercise_id:ex}),/Only actual/);
});
const saved:PerformanceRecord={id:"r",session_id:"s",prescription_key:"quick:0:EX-0001",exercise_id:ex,exercise_name:"Original squat",prescription_snapshot:{sets:3,reps:"8",load:"25 lb",rpe:7,rest_seconds:60,tempo:"",cue:"",block:"main"},updated_at:"2020-01-02T00:00:00Z",performed_at:"2020-01-01T18:00:00Z",sets_completed:3,reps_completed:"8",load_performed:"25 lb",rpe_actual:7,coach_note:"Private"};
test("old results always reopen the original prescription, including removed rows",()=>{
 const current=sessionPlanRows({source:"ims_library_program",exercises:[{canonical_id:"EX-0001",exercise_id:ex,name:"Changed",sets:5,reps:"6",load:"50 lb"}]},[]);
 const rows=executionRows(current,[saved]);assert.equal(rows[0].name,"Original squat");assert.equal(rows[0].prescription.load,"25 lb");assert.equal(executionRows([],[saved])[0].key,saved.prescription_key);
});
test("progress evidence compares identity across different sessions and uses performed dates",()=>{
 const values=[saved,{...saved,id:"duplicate",performed_at:"2020-01-01T19:00:00Z"},{...saved,id:"old",session_id:"prior",performed_at:"2019-12-01T18:00:00Z"},{...saved,id:"missing",exercise_id:null},{...saved,id:"future",session_id:"future",performed_at:"2999-01-01T00:00:00Z"}];
 const result=repeatedPerformance(values,new Date("2020-02-01"));assert.equal(result.groups.length,1);assert.equal(result.groups[0].records.length,2);assert.equal(result.groups[0].prior.session_id,"prior");assert.equal(result.excluded,2);
});
test("client surfaces use the allowlisted RPC, not private coach observations",()=>{
 for(const file of ["app/workouts/page.tsx","app/progress/page.tsx"]){const page=readFileSync(file,"utf8");assert.ok(page.includes('rpc("get_my_coached_performance")'));assert.equal(page.includes('from("session_exercise_performance")'),false);assert.equal(page.includes("row.coach_note"),false);assert.ok(page.includes('role="alert"'));}
});
test("session cockpit preserves unsaved results and uses atomic performance writes",()=>{
 const page=readFileSync("app/sessions/[id]/page.tsx","utf8"),route=readFileSync("app/api/sessions/[id]/performance/route.ts","utf8"),logger=readFileSync("components/sessions/session-exercise-log.tsx","utf8"),close=readFileSync("components/sessions/session-detail.tsx","utf8");
 assert.match(page,/SessionWorkspace/);assert.match(page,/SessionTrainingExecution/);assert.match(route,/save_session_performance/);assert.equal(route.includes('.from("session_exercise_performance").insert'),false);
 assert.match(logger,/Save edited results/);assert.match(logger,/Private coach observation/);assert.match(close,/hasUnsavedResults/);assert.match(close,/await persistNotes/);assert.equal(close.includes('"massage"'),false);
});
