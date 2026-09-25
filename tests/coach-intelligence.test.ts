import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {buildCoachActions,coachingMode,sessionPrepSummary} from "../lib/coaching/intelligence";

const now="2026-09-25T04:00:00.000Z";
test("coach intelligence is deterministic evidence, not a churn or medical prediction",()=>{
 const actions=buildCoachActions("22222222-2222-4222-8222-222222222222",{now,packageRemaining:1,nextSessionAt:null,lastCompletedAt:"2026-09-01T17:00:00Z",latestAssessmentAt:"2026-05-01",assessmentStatus:"complete",draftPrograms:1,activePrograms:0,savedExerciseSets:1});
 assert.ok(actions.some(a=>a.key==="package"));
 assert.ok(actions.some(a=>a.key==="quiet"));
 assert.ok(actions.length>=3);
 const draftOnly=buildCoachActions("22222222-2222-4222-8222-222222222222",{now,packageRemaining:null,nextSessionAt:"2026-09-26T17:00:00Z",lastCompletedAt:"2026-09-24T17:00:00Z",latestAssessmentAt:"2026-09-20",assessmentStatus:"complete",draftPrograms:1,activePrograms:0,savedExerciseSets:1});
 assert.ok(draftOnly.some(a=>a.key==="draft"));
 assert.doesNotMatch(JSON.stringify(actions),/churn|diagnos|probability|risk score/i);
});
test("coaching mode reflects recorded delivery and programming pathways",()=>{
 const base={now,packageRemaining:null,nextSessionAt:null,lastCompletedAt:null,latestAssessmentAt:null,assessmentStatus:null,draftPrograms:0,activePrograms:0,savedExerciseSets:0};
 assert.equal(coachingMode(base),"Getting started");
 assert.equal(coachingMode({...base,savedExerciseSets:1}),"Programming only");
 assert.equal(coachingMode({...base,nextSessionAt:"2026-09-26T17:00:00Z"}),"In-person");
 assert.equal(coachingMode({...base,nextSessionAt:"2026-09-26T17:00:00Z",activePrograms:1}),"Hybrid");
});
test("session prep uses only package program and assessment evidence",()=>{
 assert.deepEqual(sessionPrepSummary({now,packageRemaining:2,activePrograms:1,latestAssessmentAt:"2026-09-20"}),["2 package sessions left","1 active program","assessment 5d ago"]);
});
test("client profile makes coach intelligence and durable history primary",()=>{
 const page=readFileSync("app/clients/[id]/page.tsx","utf8");
 assert.match(page,/ClientCoachBrief/);assert.match(page,/ClientCoachingTimeline/);
});
test("owner has a connected operating system distinct from Action Center",()=>{
 const page=readFileSync("app/operating-system/page.tsx","utf8"),side=readFileSync("components/layout/app-sidebar.tsx","utf8"),mobile=readFileSync("components/layout/staff-bottom-nav.tsx","utf8");
 assert.match(page,/Action Center handles tasks; this page shows whether the operating loops are connected/);
 assert.match(page,/evidence states/);assert.match(side,/IMS Operating System/);assert.match(mobile,/IMS OS/);
 assert.match(page,/not AI guesses, accounting totals or churn predictions/);
});
test("trainer Today surfaces session-prep evidence without owner finance data",()=>{
 const today=readFileSync("components/dashboard/trainer-dashboard.tsx","utf8");
 assert.match(today,/sessionPrepSummary/);assert.match(today,/prepPlansQ/);
 assert.doesNotMatch(today,/growth_campaigns|trainer_compensation_rules|payment exceptions/i);
});
