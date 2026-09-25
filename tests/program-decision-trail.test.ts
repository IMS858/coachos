import test from "node:test";import assert from "node:assert/strict";import {readFileSync} from "node:fs";
test("program decision trail is staff-only, immutable and program-scoped",()=>{
 const migration=readFileSync("packages/db/migrations/0046_program_decision_notes.sql","utf8"),route=readFileSync("app/api/programs/[id]/decision-notes/route.ts","utf8");
 assert.match(migration,/enable row level security/);assert.match(migration,/staff reads scoped program decisions/);assert.match(migration,/staff inserts scoped program decisions/);
 assert.match(migration,/grant select,insert/);assert.doesNotMatch(migration,/grant .*update|grant .*delete/i);
 assert.match(route,/\["owner","trainer"\]/);assert.match(route,/program_decision_notes/);assert.match(route,/\.insert\(/);assert.doesNotMatch(route,/\.update\(|\.delete\(/);
});
test("program reasoning is visible to coaches on both programming paths, never a publication action",()=>{
 const quick=readFileSync("app/programs/[id]/library/page.tsx","utf8"),legacy=readFileSync("components/programs/legacy-program-page.tsx","utf8"),log=readFileSync("components/programs/program-decision-log.tsx","utf8");
 assert.match(quick,/ProgramDecisionLog/);assert.match(legacy,/isStaff && <ProgramDecisionLog/);assert.match(log,/staff-only notes/);
 assert.doesNotMatch(log,/publish|client_visible|sendEmail|pushClient/);
});
