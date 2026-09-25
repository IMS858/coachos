import test from "node:test";import assert from "node:assert/strict";import {readFileSync} from "node:fs";import {buildTrainerCapacity} from "../lib/coaching/capacity";
test("capacity uses declared Pacific availability, blocks and actual booked overlap",()=>{
 const trainer="11111111-1111-4111-8111-111111111111";
 const result=buildTrainerCapacity(new Date("2026-09-24T19:00:00Z"),
  [{trainer_id:trainer,weekday:1,start_time:"09:00:00",end_time:"17:00:00",active:true}],
  [{trainer_id:trainer,starts_at:"2026-09-21T19:00:00Z",ends_at:"2026-09-21T20:00:00Z"}],
  [{trainer_id:trainer,scheduled_at:"2026-09-21T16:00:00Z",duration_minutes:60,status:"completed"},{trainer_id:trainer,scheduled_at:"2026-09-22T01:00:00Z",duration_minutes:60,status:"scheduled"}]
 )[0];
 assert.equal(result.declared_minutes,480);assert.equal(result.blocked_minutes,60);assert.equal(result.usable_minutes,420);assert.equal(result.booked_minutes,60);assert.equal(result.open_minutes,360);assert.equal(result.outside_declared_sessions,1);
});
test("capacity page states its evidence boundary and connects to the IMS OS",()=>{
 const page=readFileSync("app/capacity/page.tsx","utf8"),os=readFileSync("app/operating-system/page.tsx","utf8");
 assert.match(page,/not a staffing recommendation or revenue forecast/);assert.match(page,/does not estimate demand/);assert.match(os,/href="\/capacity"/);
});
