import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("client profile exposes quick and assessment-led programming paths",()=>{
 const profile=readFileSync("app/clients/[id]/page.tsx","utf8");
 const status=readFileSync("components/clients/client-programming-status.tsx","utf8");
 assert.match(profile,/ClientProgrammingStatus/);
 assert.match(status,/Quick program/);
 assert.match(status,/Assessment-led/);
});
test("saved exercise sets convert only into private draft programs",()=>{
 const route=readFileSync("app/api/library/sets/[id]/convert/route.ts","utf8");
 assert.match(route,/ims_library_program/);
 assert.match(route,/needs_prescription/);
 assert.match(route,/visibility: "coach_only"/);
 assert.match(route,/status: "draft"/);
 assert.doesNotMatch(route,/sendEmail|pushClient/);
});
test("conversion preserves source exercise set and never edits it",()=>{
 const route=readFileSync("app/api/library/sets/[id]/convert/route.ts","utf8");
 assert.match(route,/origin_exercise_set_id/);
 assert.doesNotMatch(route,/from\("programs"\)\.update/);
});

test("quick-program readiness makes assessment optional but prescription mandatory",()=>{
 const route=readFileSync("app/api/programs/[id]/readiness/route.ts","utf8");
 assert.match(route,/Assessment optional for quick programming/);
 assert.match(route,/prescription_complete/);
 assert.match(route,/client_safe_exercises/);
});
