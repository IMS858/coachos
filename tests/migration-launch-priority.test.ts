import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {launchPriority,type LaunchSourceRecord} from "../lib/migration/launch-priority";
const hash="a".repeat(64);
const client=(id:string,name:string,email:string|null=null,phone:string|null=null,row=1):LaunchSourceRecord=>({id:"00000000-0000-4000-8000-"+String(row).padStart(12,"0"),source_id:id,source_parent_id:null,source_hash:hash,reconciliation_status:"unmatched",source_payload:{fields:{"Vagaro Client ID":id,"Source Name":name,"Email":email??"---","Phones":phone?`Cell Phone\\n${phone}`:"Cell Phone\\n---"}}});
const appt=(id:string,parent:string,date:string,time:string,trainer="Jason Patterson"):LaunchSourceRecord=>({id,source_id:id,source_parent_id:parent,source_hash:hash,reconciliation_status:"unmatched",source_payload:{fields:{"Appointment ID":id,"Vagaro Client ID candidate":parent,"Raw date":date,"Raw time":time,"Trainer":trainer,"Client Name":"Source Client"}}});
test("future-calendar priority keeps contact proposals conservative and ignores past rows",()=>{
 const source=[client("1","Exact Person","x@example.com","619-555-1000",1),appt("a","1","2026-09-25","09:00"),appt("b","1","2026-09-26","10:00"),appt("c","1","2026-09-27","11:00","Gabriel Madrid")];
 const result=launchPriority(source,[{id:"d1",name:"Exact Person",email:"x@example.com",phone:"6195551000"}],"2026-09-26");
 assert.equal(result.rows.length,1);assert.equal(result.rows[0].futureAppointments,2);assert.equal(result.rows[0].jason,1);assert.equal(result.rows[0].gabriel,1);assert.equal(result.rows[0].matchStatus,"matched");assert.equal(result.rows[0].destinationId,"d1");
 assert.equal(result.rows[0].firstWall,"2026-09-26T10:00");assert.equal(result.rows[0].lastWall,"2026-09-27T11:00");
});
test("shared contact and name-only evidence stay needs review; unmatched stays unmatched",()=>{
 const rows=[client("1","Household A","shared@example.com",null,1),client("2","Household B","shared@example.com",null,2),client("3","Name Only",null,null,3),client("4","Nobody",null,null,4),appt("a","1","2026-10-01","09:00"),appt("b","2","2026-10-01","10:00"),appt("c","3","2026-10-01","11:00"),appt("d","4","2026-10-01","12:00")];
 const dest=[{id:"d1",name:"Household A",email:"shared@example.com",phone:null},{id:"d2",name:"Name Only",email:"different@example.com",phone:null}];
 const out=launchPriority(rows,dest,"2026-09-26").rows;
 assert.equal(out.find(x=>x.sourceClientId==="1")?.matchStatus,"needs_review");
 assert.match(out.find(x=>x.sourceClientId==="1")?.matchBasis.join(",")??"",/shared_source_contact/);
 assert.equal(out.find(x=>x.sourceClientId==="2")?.matchStatus,"needs_review");
 assert.equal(out.find(x=>x.sourceClientId==="3")?.matchStatus,"needs_review");
 assert.match(out.find(x=>x.sourceClientId==="3")?.matchBasis.join(",")??"",/name_only/);
 assert.equal(out.find(x=>x.sourceClientId==="4")?.matchStatus,"unmatched");
});
test("orphan identities and malformed dates are counted rather than treated as a clean calendar",()=>{
 const rows=[client("1","One",null,null,1),appt("a","missing","2026-10-01","09:00"),appt("b","1","bad-date","09:00")];
 const result=launchPriority(rows,[],"2026-09-26");assert.equal(result.orphanAppointments,1);assert.equal(result.invalidDates,1);assert.equal(result.rows.length,0);
});
test("review page number follows the same source-id ordering as owner review",()=>{
 const rows=Array.from({length:26},(_,i)=>client(String(i+1).padStart(3,"0"),"Client "+i,null,null,i+1));
 rows.push(appt("future","026","2026-10-01","09:00"));
 const result=launchPriority(rows,[],"2026-09-26");assert.equal(result.rows[0].reviewPage,2);
});
test("invalid comparison date fails closed",()=>{assert.throws(()=>launchPriority([],[],"09/26/2026"),/Pacific date/);});
test("launch-priority page preserves source-time and no-auto-import language",()=>{
 const page=fs.readFileSync(path.join(process.cwd(),"app/settings/migration/priority/page.tsx"),"utf8");
 assert.match(page,/not converted to UTC/);assert.match(page,/not appointment-import clearance/);assert.match(page,/Matches are proposals/);assert.doesNotMatch(page,/import_reviewed_migration_appointment/);
});
