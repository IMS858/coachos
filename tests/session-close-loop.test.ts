import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {closeSessionLoop,saveResultBatch,requireConfirmedAction,parseSessionNotes,sameSessionNotes,remainingRestSeconds} from "../lib/coaching/session-close";

test("finish saves actual results, then notes, then requests completion",async()=>{
 const calls:string[]=[];
 const result=await closeSessionLoop({saveResults:async()=>{calls.push("results");return {ok:true,saved:2,failed:0};},persistNotes:async()=>{calls.push("notes");return true;},complete:async()=>{calls.push("complete");return {ok:true,deduped:false};}});
 assert.deepEqual(calls,["results","notes","complete"]);assert.equal(result.ok,true);assert.equal(result.savedResults,2);assert.equal(result.notesSaved,true);
});
test("partial result saves preserve successful rows and stop notes and completion",async()=>{
 const saved=new Set<number>(),failures:number[]=[];let laterCalls=0;
 const result=await closeSessionLoop({saveResults:()=>saveResultBatch([1,2,3],async n=>{if(n===2)throw new Error("offline");saved.add(n);},n=>failures.push(n)),persistNotes:async()=>{laterCalls++;return true;},complete:async()=>{laterCalls++;return {ok:true};}});
 assert.equal(result.ok,false);assert.equal(result.stage,"results");assert.equal(result.savedResults,2);assert.equal(laterCalls,0);assert.deepEqual([...saved],[1,3]);assert.deepEqual(failures,[2]);
 const retry=await saveResultBatch([1,2,3].filter(n=>!saved.has(n)),async n=>{saved.add(n);},()=>assert.fail("retry failed"));assert.equal(retry.saved,1);assert.deepEqual([...saved],[1,3,2]);
});
test("notes conflict leaves results saved without completing the session",async()=>{
 let called=false;const result=await closeSessionLoop({saveResults:async()=>({ok:true,saved:1,failed:0}),persistNotes:async()=>{throw new Error("Notes changed in another tab");},complete:async()=>{called=true;return {ok:true};}});
 assert.equal(result.ok,false);assert.equal(result.stage,"notes");assert.equal(result.savedResults,1);assert.equal(called,false);
});
test("lost completion response is not reported as success or retried automatically",async()=>{
 let attempts=0;const result=await closeSessionLoop({saveResults:async()=>({ok:true,saved:0,failed:0}),persistNotes:async()=>true,complete:async()=>{attempts++;throw new Error("Response lost");}});
 assert.equal(result.ok,false);assert.equal(result.stage,"completion");assert.equal(result.notesSaved,true);assert.equal(attempts,1);
});
test("success must be explicitly confirmed, never inferred from a truthy HTTP payload",()=>{
 for(const value of [null,undefined,true,[],{},"ok",{ok:false},{ok:1},{ok:"true"}])assert.throws(()=>requireConfirmedAction(value));
 assert.equal(requireConfirmedAction({ok:true}).ok,true);
});
test("notes snapshots preserve null and exact text for compare-and-swap and retry",()=>{
 const expected=parseSessionNotes({notes_pre:null,notes_post:"Keep this cue"});assert.equal(sameSessionNotes(expected,{...expected}),true);assert.equal(sameSessionNotes(expected,{notes_pre:"",notes_post:"Keep this cue"}),false);
 for(const bad of [{notes_post:"one"},{notes_pre:null,notes_post:"x",status:"completed"},{notes_pre:5,notes_post:null},{notes_pre:null,notes_post:"x".repeat(4001)}])assert.throws(()=>parseSessionNotes(bad));
});
test("rest timer uses elapsed time, including time spent with the phone backgrounded",()=>{
 assert.equal(remainingRestSeconds(61000,1000),60);assert.equal(remainingRestSeconds(61000,30500),31);assert.equal(remainingRestSeconds(61000,95000),0);assert.throws(()=>remainingRestSeconds(NaN,1));
});
test("session loop uses existing performance and completion domains without class or payment writes",()=>{
 const close=readFileSync("components/sessions/session-detail.tsx","utf8"),log=readFileSync("components/sessions/session-exercise-log.tsx","utf8"),workspace=readFileSync("components/sessions/session-workspace.tsx","utf8"),route=readFileSync("app/api/sessions/[id]/route.ts","utf8"),complete=readFileSync("app/api/sessions/[id]/complete/route.ts","utf8");
 assert.match(close,/closeSessionLoop/);assert.match(close,/Save & finish session/);assert.match(workspace,/hasUnsavedNotes/);assert.match(workspace,/beforeunload/);assert.match(log,/Use previous load/);assert.match(log,/load_performed:last.load_performed/);assert.match(log,/SessionRestTimer/);assert.match(route,/expected_notes/);assert.match(route,/sameSessionNotes/);assert.match(route,/update.is\(key,null\)/);assert.match(complete,/requireConfirmedAction/);assert.match(complete,/COMPLETION_UNAVAILABLE/);
 assert.equal(close.includes("class_enrollments"),false);assert.equal(complete.includes("process_stripe_event"),false);
});
test("next-session prep carries an actual debrief, not a generated assessment or prescription",()=>{
 const page=readFileSync("app/sessions/[id]/page.tsx","utf8"),source=readFileSync("components/sessions/session-last-debrief.tsx","utf8");
 assert.match(page,/SessionLastDebrief/);assert.match(source,/notes_post/);assert.match(source,/primary_trainer_id/);assert.match(source,/status","completed/);assert.equal(source.includes(".insert("),false);assert.equal(source.includes(".update("),false);
});
