import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {performanceChanged,sessionPlanRows} from "../lib/coaching/session-execution";

test("quick programming dosage becomes executable session rows without changing identity",()=>{
 const rows=sessionPlanRows({source:"ims_library_program",exercises:[{canonical_id:"EX-0001",name:"Split Squat",matched_exercise_id:"11111111-1111-4111-8111-111111111111",sets:3,reps:"8",load:"20 lb",rpe:7,rest_seconds:60,tempo:"3-1-1-0",cue:"Own the bottom"}]},[]);
 assert.equal(rows.length,1);assert.equal(rows[0].key,"quick:0:EX-0001");assert.equal(rows[0].exercise_id,"11111111-1111-4111-8111-111111111111");assert.equal(rows[0].prescription.rpe,7);assert.equal(rows[0].prescription.cue,"Own the bottom");
});
test("structured assignments preserve prescription as session evidence",()=>{
 const rows=sessionPlanRows({},[{id:"22222222-2222-4222-8222-222222222222",exercise_id:"11111111-1111-4111-8111-111111111111",block:"main",position:2,sets:4,reps:"6",load_prescription:"95 lb",rest_seconds:90,tempo:"controlled",notes:"Brace",exercises:{name:"Trap Bar Deadlift",ims_label:null}}]);
 assert.equal(rows[0].key,"assignment:22222222-2222-4222-8222-222222222222");assert.equal(rows[0].name,"Trap Bar Deadlift");assert.equal(rows[0].prescription.load,"95 lb");
});
test("performed evidence stays separate from planned prescription",()=>{
 assert.equal(performanceChanged({sets_completed:null,reps_completed:"",load_performed:"",rpe_actual:null,coach_note:""}),false);
 assert.equal(performanceChanged({sets_completed:3,reps_completed:"8",load_performed:"20 lb",rpe_actual:7.5,coach_note:"clean"}),true);
});
test("session workflow links program prescription to performed exercise evidence",()=>{
 const page=readFileSync("app/sessions/[id]/page.tsx","utf8"),wrapper=readFileSync("components/sessions/session-training-execution.tsx","utf8"),route=readFileSync("app/api/sessions/[id]/performance/route.ts","utf8");
 assert.match(page,/SessionTrainingExecution/);assert.match(wrapper,/Prescription → performed/);assert.match(wrapper,/without rewriting the program prescription/);
 assert.match(route,/session_exercise_performance/);assert.match(route,/prescription_snapshot/);assert.match(route,/recordAudit/);
 assert.doesNotMatch(route,/programs"\)\.update|program_exercises"\)\.update/);
});

test("client history shows coached performed evidence without exposing edit controls",()=>{
 const page=readFileSync("app/workouts/page.tsx","utf8");
 assert.match(page,/session_exercise_performance/);assert.match(page,/What you actually performed with your coach/);assert.match(page,/original program prescription stays intact/);
 assert.doesNotMatch(page,/\\.update\\(|\\.insert\\(|Save performed result/);
});
