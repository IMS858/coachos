const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs");
const s=fs.readFileSync("packages/db/migrations/0081_migration_cutover_hardening.sql","utf8");
test("calendar import requires complete staging and explicit owner batch approval",()=>{
 assert.match(s,/status is distinct from 'approved'/);assert.match(s,/staging_completed_at/);assert.match(s,/source_manifest_sha256/);
 assert.match(s,/All six declared source counts/);assert.match(s,/Staging count changed/);assert.match(s,/approved_by/);
});
test("calendar import requires the current confirmed review from before approval",()=>{
 assert.match(s,/order by revision desc limit 1/);assert.match(s,/Current owner review revision required/);assert.match(s,/owner_confirmed is distinct from true/);
 assert.match(s,/source_hash is distinct from r\.source_hash/);assert.match(s,/v\.created_at>batch\.approved_at/);
});
test("calendar import still revalidates future delivery and all coach collisions at write time",()=>{
 assert.match(s,/Historical appointments require separate delivery reconciliation/);assert.match(s,/scheduled','confirmed/);
 assert.match(s,/Trainer session collision/);assert.match(s,/Trainer class collision/);assert.match(s,/Trainer blocked-time collision/);
 assert.match(s,/vagaro_event_id/);assert.match(s,/package_inferred',false/);assert.match(s,/payment_inferred',false/);
});
test("an imported retry must agree with the reviewed destination receipt",()=>{
 assert.match(s,/Imported source and destination receipt do not agree/);assert.match(s,/client_id=client/);assert.match(s,/trainer_id=trainer/);
 assert.match(s,/scheduled_at=starts/);assert.match(s,/duration_minutes=duration/);
});
