const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs");
const s=fs.readFileSync("packages/db/migrations/0080_migration_staging_receipt.sql","utf8");
test("staging completion requires exact counts and checksum",()=>{
 assert.match(s,/Source count mismatch/);assert.match(s,/manifest checksum required/i);
 assert.match(s,/migration\.staging_completed/);assert.doesNotMatch(s,/insert into public\.(sessions|payments|plans)/i);
});
