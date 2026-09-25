import test from "node:test";
import assert from "node:assert/strict";
import {readdirSync,readFileSync} from "node:fs";
import {CLASS_BOOKING_ENABLED,inventoryEvidence,inventoryLabel,participationSummary,type ClassParticipation} from "../lib/classes/launch";
test("repository migration versions are unique across simultaneous feature work",()=>{
 const names=readdirSync("packages/db/migrations").filter(name=>/^\d+_.*\.sql$/.test(name));const versions=new Set<string>();
 for(const name of names){const version=name.split("_")[0];assert.equal(versions.has(version),false,`Duplicate migration version ${version}: ${name}`);versions.add(version);}
});
test("record inventory never converts an error, null or malformed count to zero",()=>{
 for(const count of [null,-1,NaN,1.5])assert.deepEqual(inventoryEvidence({error:null,count}),{state:"unavailable",count:null});
 assert.deepEqual(inventoryEvidence({error:{message:"failed"},count:0}),{state:"unavailable",count:null});
 assert.equal(inventoryLabel(inventoryEvidence({error:null,count:0})),"0");assert.equal(inventoryLabel(inventoryEvidence({error:true,count:null})),"Unavailable");assert.equal(CLASS_BOOKING_ENABLED,false);
});
test("attendance requires completed occurrence and plausible recorded time, not just enrollment status",()=>{
 const row:ClassParticipation={enrollment_id:"e",occurrence_id:"c",class_name:"Strength",category:"strength",starts_at:"2020-01-01T17:00:00Z",ends_at:"2020-01-01T18:00:00Z",enrollment_status:"attended",class_status:"completed",attendance_marked_at:"2020-01-01T18:05:00Z"};
 const rows=[row,{...row,enrollment_id:"duplicate"},{...row,occurrence_id:"unfinished",class_status:"scheduled"},{...row,occurrence_id:"unverified",attendance_marked_at:null},{...row,occurrence_id:"impossible",attendance_marked_at:"2019-12-01"},{...row,occurrence_id:"wait",enrollment_status:"waitlisted"}];
 assert.deepEqual(participationSummary(rows,"2020-02-01T00:00:00Z"),{attended:1,needsReview:3,loadedOccurrences:5});
});
test("owner launch page checks authorization before compensation inventory and has no launch write",()=>{
 const page=readFileSync("app/classes/manage/launch/page.tsx","utf8");assert.ok(page.indexOf('me.data.role!=="owner"')<page.indexOf('table:"class_compensation_rules"'));assert.match(page,/Not verified for launch/);assert.equal(page.includes(".insert("),false);assert.equal(page.includes(".update("),false);assert.equal(page.includes(".rpc("),false);
});
test("client catalog never fabricates aggregate seats from client-only enrollment rows",()=>{
 const page=readFileSync("app/classes/page.tsx","utf8"),list=readFileSync("components/classes/class-booking-list.tsx","utf8");assert.doesNotMatch(page,/countsQ|counts\.get|booked:counts/);assert.match(list,/not a count of remaining spots/);assert.match(list,/Registration not launched/);
});
