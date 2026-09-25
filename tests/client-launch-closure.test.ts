import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
const root=path.join(import.meta.dirname,"..");
test("client booking discovery and submission share a database-enforced conflict policy",()=>{
  const a=fs.readFileSync(path.join(root,"app/api/sessions/availability/route.ts"),"utf8"),r=fs.readFileSync(path.join(root,"app/api/sessions/request/route.ts"),"utf8"),sql=fs.readFileSync(path.join(root,"packages/db/migrations/0069_client_training_requests.sql"),"utf8");
  assert.match(a,/get_my_training_availability/);assert.match(r,/request_client_training_session/);
  for(const source of ["class_occurrences","trainer_time_blocks","trainer_availability_rules"])assert.ok(sql.includes(source));
  assert.match(sql,/lock table public.sessions/);assert.match(sql,/client_training_slot_available/);assert.match(r,/Invalid request origin/);
  assert.doesNotMatch(r,/createServiceClient/);
});
test("client account update is origin checked allowlisted client-only and receipt verified",()=>{
  const route=fs.readFileSync(path.join(root,"app/api/account/route.ts"),"utf8"),contract=fs.readFileSync(path.join(root,"lib/account/profile-contract.ts"),"utf8");
  assert.match(route,/Invalid request origin/);assert.match(contract,/Unsupported account fields/);assert.match(route,/role !== "client"/);
  assert.match(route,/maybeSingle/);assert.match(route,/saved.id!==user.id/);assert.match(contract,/confirmProfileReceipt/);
  assert.doesNotMatch(route,/createServiceClient/);
});
