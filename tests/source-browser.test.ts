import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {filterSourceRows, sourceFields, sourceLabel, sourceObservation, type SourceBrowserRow} from "../lib/migration/source-browser";
const row = (patch: Partial<SourceBrowserRow> = {}): SourceBrowserRow => ({id: "synthetic-row", source_id: "source-1", record_type: "client", source_payload: {fields: {"Source Name": "Synthetic Person", "Source remaining": 0}}, reconciliation_status: "unmatched", destination_id: null, ...patch});
test("source search finds later rows, retains real zero, and never mutates evidence", () => {
  const rows = Array.from({length: 301}, (_, i) => row({id: String(i), source_id: `source-${i}`}));
  const original = JSON.stringify(rows);
  assert.equal(filterSourceRows(rows, "source-300").length, 1);
  assert.equal(filterSourceRows(rows, "synthetic person").length, 301);
  assert.equal(sourceFields(rows[0])["Source remaining"], 0);
  assert.equal(JSON.stringify(rows), original);
});
test("source labels ignore malformed name values and invalid payload shapes", () => {
  assert.equal(sourceLabel(row({source_payload: {fields: {"Source Name": {bad: true}}}})), "source-1");
  for (const source_payload of [null, [], "bad", {fields: []}]) assert.deepEqual(sourceFields(row({source_payload})), {});
  assert.throws(() => filterSourceRows([], "a".repeat(201)), /Invalid/);
});
test("stored imported status does not resurrect an original source HOLD as a current blocker", () => {
  assert.equal(sourceObservation(row({reconciliation_status: "imported", review_note: "Original hold"}), "2026-09-28"), null);
  assert.equal(sourceObservation(row({dry_run_reason: "Specific conflict"}), "2026-09-28"), "Specific conflict");
});
test("identity provisioning, historical evidence and recurrence are distinct from source verification", () => {
  assert.match(sourceObservation(row({record_type: "appointment"}), "2026-09-28")!, /export does not need to be verified again/);
  assert.match(sourceObservation(row({record_type: "appointment", destination_id: "client", source_payload: {fields: {"Raw date": "2026-09-22"}}}), "2026-09-28")!, /scheduled is not completed/);
  assert.match(sourceObservation(row({record_type: "series"}), "2026-09-28")!, /no extra appointments/);
});
test("source money does not become balances, charges or operational subscription activation", () => {
  assert.match(sourceObservation(row({record_type: "package", source_payload: {fields: {"Owner provenance / limitation": "Conflicting source balance"}}}), "2026-09-28")!, /Conflicting source balance/);
  assert.match(sourceObservation(row({record_type: "transaction"}), "2026-09-28")!, /not a new Coach OS payment/);
  assert.match(sourceObservation(row({record_type: "membership"}), "2026-09-28")!, /not a newly activated/);
});
test("source browser stays owner-authorized, fully paged and read-only", () => {
  const page = readFileSync("app/settings/migration/evidence/page.tsx", "utf8");
  assert.match(page, /await requireOwnerData\(\)/);
  assert.match(page, /readCompleteEvidence<SourceBrowserRow>/);
  assert.match(page, /method="get"/);
  assert.doesNotMatch(page, /createServiceClient|\.insert\(|\.update\(|\.delete\(|\.rpc\(|sendLoginInvite/);
});
