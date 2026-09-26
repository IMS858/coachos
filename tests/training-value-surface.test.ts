import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const page = readFileSync("app/reports/training-value/page.tsx", "utf8");
const migration = readFileSync("app/settings/migration/page.tsx", "utf8");
test("training value is owner-gated before any operational query",()=>{
  assert.ok(page.indexOf('me.data.role !== "owner"') < page.indexOf('db.from("sessions")'));
  assert.doesNotMatch(page,/createServiceClient|\.insert\(|\.update\(|\.upsert\(|\.rpc\(/);
  assert.match(page,/readCompleteEvidence<SessionRow>/); assert.match(page,/No partial or zero-dollar/);
});
test("staged estimates are not silently zeroed or combined with operational training",()=>{
  assert.doesNotMatch(migration,/estimated_value_cents|valuation_rate_cents/);
  assert.match(migration,/\.eq\("batch_id", batch!\.id\)/);
  assert.match(migration,/source export has been fully uploaded/);
  assert.match(migration,/\/reports\/training-value/);
});
test("report exposes estimate basis, window, separate schedule and actual records",()=>{
  for(const label of ["$93", "90 days back", "60 days ahead", "Upcoming schedule estimate", "not guaranteed revenue", "not collected revenue", "QuickBooks reconciliation is separate", "By coach", "By client", "By Pacific month"]) assert.ok(page.includes(label),label);
});
