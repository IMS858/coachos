import test from "node:test";
import assert from "node:assert/strict";
import {analyzeTrainingValue, estimateHistoricalTrainingValue, sumHistoricalEstimate, evidenceInstant} from "../lib/migration/historical-value";
import type {HistoricalSessionEvidence} from "../lib/migration/historical-value";
const now = "2026-09-25T20:00:00Z";
const row = (values: Partial<HistoricalSessionEvidence> = {}): HistoricalSessionEvidence => ({source_id: "a", starts_at: "2026-09-01T17:00:00Z", status: "completed", service: "training", duration_minutes: 60, ...values});
test("owner-approved $93 values completed training, not accepted past bookings", () => {
  const value = estimateHistoricalTrainingValue([row(), row({source_id:"b",status:"accepted"}), row({source_id:"c",status:"confirmed"})], now);
  assert.equal(value.length,1); assert.equal(value[0].rate_cents,9300); assert.equal(value[0].basis,"historical_session_estimate"); assert.equal(sumHistoricalEstimate(value),9300);
});
test("future schedule estimate is separate and never counted as delivered", () => {
  const report = analyzeTrainingValue([row(),row({source_id:"b",status:"scheduled",starts_at:"2026-10-01T17:00:00Z"})],now);
  assert.equal(report.totals.historical_estimate_cents,9300); assert.equal(report.totals.scheduled_estimate_cents,9300);
  assert.equal(estimateHistoricalTrainingValue(report.rows,now).length,1);
});
test("unknown, pending, past accepted and future completed status stay unvalued", () => {
  for (const r of [row({status:""}),row({status:"requested"}),row({status:"bg-bkg_status_accepted"}),row({status:"accepted"}),row({status:"scheduled"}),row({starts_at:"2026-10-01T17:00:00Z"})]) {
    const result=analyzeTrainingValue([r],now); assert.equal(result.rows[0].state,"needs_review"); assert.equal(result.rows[0].estimated_value_cents,null);
  }
});
test("cancelled no-show and non-training rows are not valued", () => {
  for(const r of [row({status:"cancelled"}),row({status:"no_show"}),row({status:"late_cancelled"}),row({service:"massage"}),row({service:"class"}),row({service:"assessment"})]) assert.equal(analyzeTrainingValue([r],now).rows[0].state,"excluded");
  assert.equal(analyzeTrainingValue([row({service:"not training"})],now).rows[0].state,"needs_review");
});
test("duplicates never multiply estimates and contradictory identities are held", () => {
  const exact=analyzeTrainingValue([row(),row()],now); assert.equal(exact.exact_duplicates_ignored,1);assert.equal(exact.totals.historical_estimate_cents,9300);
  const conflicting=analyzeTrainingValue([row(),row({status:"cancelled"})],now);assert.equal(conflicting.rows[0].reason,"conflicting_duplicate_identity");assert.equal(conflicting.totals.historical_estimate_cents,null);
});
test("no cohort is not represented as zero revenue",()=>{const result=analyzeTrainingValue([],now);assert.equal(result.totals.historical_estimate_cents,null);assert.equal(result.totals.scheduled_estimate_cents,null);assert.equal(sumHistoricalEstimate([]),null);});
test("invalid dates and offset-free times are not interpreted as studio time",()=>{
  for(const value of ["2026-02-30T17:00:00Z","2026-09-01 17:00:00","2026-09-01T17:00:00","2026-09-01T25:00:00Z","2026-09-01T17:00:00+15:00","garbage"]){assert.ok(Number.isNaN(evidenceInstant(value)));assert.equal(analyzeTrainingValue([row({starts_at:value})],now).rows[0].state,"needs_review");}
  assert.throws(()=>analyzeTrainingValue([row()],"bad"),/analysis timestamp/);
});
test("explicit offsets work across daylight saving time",()=>{assert.equal(evidenceInstant("2026-11-01T01:30:00-07:00"),Date.parse("2026-11-01T08:30:00Z"));assert.equal(evidenceInstant("2026-11-01T01:30:00-08:00"),Date.parse("2026-11-01T09:30:00Z"));});
test("unknown or conflicting duration and premature completion remain review",()=>{
  for(const value of [null,0,-1,1.5,481])assert.equal(analyzeTrainingValue([row({duration_minutes:value})],now).rows[0].reason,"duration_unknown");
  assert.equal(analyzeTrainingValue([row({service:"Personal Training 90 Min Session"})],now).rows[0].reason,"duration_conflict");
  assert.equal(analyzeTrainingValue([row({starts_at:"2026-09-25T19:30:00Z"})],now).rows[0].reason,"completion_before_session_end");
  assert.equal(analyzeTrainingValue([row({duration_minutes:90})],now).totals.historical_estimate_cents,9300);
});
test("analysis is deterministic and does not mutate evidence",()=>{const input=[row()];const before=JSON.stringify(input);assert.deepEqual(analyzeTrainingValue(input,now),analyzeTrainingValue(input,now));assert.equal(JSON.stringify(input),before);});
