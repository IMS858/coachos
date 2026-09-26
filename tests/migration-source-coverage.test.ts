import test from "node:test";
import assert from "node:assert/strict";
import {migrationSourceCoverage} from "../lib/migration/source-coverage";

test("partial source coverage stays blocked",()=>{
  const result=migrationSourceCoverage([{record_type:"client"},{record_type:"membership"}],true);
  assert.equal(result.reconciliationMayProceed,false);
  assert.equal(result.missing.includes("appointment"),true);
  assert.equal(result.missing.includes("package"),true);
});

test("counts do not prove completeness",()=>{
  const rows=[{record_type:"client"},{record_type:"appointment"},{record_type:"package"}];
  assert.equal(migrationSourceCoverage(rows,false).reconciliationMayProceed,false);
  assert.equal(migrationSourceCoverage(rows,true).reconciliationMayProceed,true);
});
