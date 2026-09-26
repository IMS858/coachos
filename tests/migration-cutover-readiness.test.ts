import test from "node:test";
import assert from "node:assert/strict";
import {cutoverReadiness,cutoverRecordState,latestReviewsByRecord} from "../lib/migration/cutover-readiness";

const source=(overrides:Record<string,unknown>={})=>({
  id:"record-1",
  record_type:"appointment",
  source_hash:"a".repeat(64),
  reconciliation_status:"needs_review",
  dry_run_status:"hold",
  ...overrides,
});
const review=(overrides:Record<string,unknown>={})=>({
  record_id:"record-1",
  record_type:"appointment",
  source_hash:"a".repeat(64),
  revision:1,
  decision:"reviewed" as const,
  ...overrides,
});

test("a reviewed appointment is not cutover-ready until its fresh preflight is ready",()=>{
  assert.equal(cutoverRecordState(source(),review()),"reviewed_needs_preflight");
  assert.equal(cutoverRecordState(source({dry_run_status:"ready"}),review()),"reviewed_preflight_ready");
});

test("source checksum or type drift makes an old review stale",()=>{
  assert.equal(cutoverRecordState(source({source_hash:"b".repeat(64)}),review()),"stale_review");
  assert.equal(cutoverRecordState(source({record_type:"package"}),review()),"stale_review");
});

test("latest revision wins without mutating old review history",()=>{
  const latest=latestReviewsByRecord([review(),review({revision:2,decision:"hold"}) as any]);
  assert.equal(latest.get("record-1")?.revision,2);
  assert.equal(latest.get("record-1")?.decision,"hold");
});

test("summary only reports complete when every source record is explicitly excluded or reviewed and preflight-ready",()=>{
  const records=[
    source({id:"a",dry_run_status:"ready"}),
    source({id:"b",record_type:"package",source_hash:"b".repeat(64)}),
  ];
  const reviews=[
    review({record_id:"a"}),
    review({record_id:"b",record_type:"package",source_hash:"b".repeat(64),decision:"excluded"}),
  ] as any;
  const summary=cutoverReadiness(records as any,reviews);
  assert.equal(summary.complete,true);
  assert.equal(summary.preflightReady,1);
  assert.equal(summary.excluded,1);
});

test("no source rows is never declared complete",()=>{
  assert.equal(cutoverReadiness([],[]).complete,false);
});
