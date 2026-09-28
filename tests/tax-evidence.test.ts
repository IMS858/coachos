import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {summarizeTaxEvidence, loadTaxEvidence, validReportYear} from "../lib/financials/tax-evidence";
import type {MoneyPayment} from "../lib/financials/evidence";
const now = new Date("2026-09-28T01:00:00Z");
const row = (id: string, patch: Partial<MoneyPayment> = {}): MoneyPayment => ({id, amount_cents: 10000, currency: "usd", status: "succeeded", source: "stripe", source_id: id, paid_at: "2026-09-15T16:00:00Z", description: null, ...patch});
test("empty receipts remain unestablished and future months are not zero collections", () => {
  const report = summarizeTaxEvidence([], 2026, now);
  assert.equal(report.summary?.currencies.length, 0);
  assert.ok(report.months[8].summary);
  assert.equal(report.months[9].summary, null);
  assert.equal(summarizeTaxEvidence([], 2027, now).summary, null);
});
test("known zero is retained, currencies and refunds stay separate", () => {
  const report = summarizeTaxEvidence([row("zero", {amount_cents: 0}), row("usd"), row("eur", {currency: "eur"}), row("refund", {status: "refunded", amount_cents: -1000})], 2026, now);
  assert.equal(report.summary?.currencies.length, 2);
  const usd = report.summary!.currencies.find(g => g.currency === "USD")!;
  assert.equal(usd.collectedRecords, 2);assert.equal(usd.collectedCents, 10000);assert.equal(usd.refundedCents, 1000);
});
test("Pacific receipt date controls the year, not UTC midnight or creation time", () => {
  const report = summarizeTaxEvidence([row("previous-year", {paid_at: "2026-01-01T07:59:00Z"}), row("new-year", {paid_at: "2026-01-01T08:00:00Z"})], 2026, now);
  assert.equal(report.summary?.currencies[0].collectedRecords, 1);
  assert.equal(report.months[0].summary?.currencies[0].collectedCents, 10000);
});
test("duplicates, undated and future payments are held instead of inflating totals", () => {
  const report = summarizeTaxEvidence([row("a", {source_id: "dup"}), row("b", {source_id: "dup"}), row("missing", {paid_at: null}), row("future", {paid_at: "2026-12-01T18:00:00Z"}), row("valid")], 2026, now);
  assert.equal(report.summary?.issues.length, 4);
  assert.equal(report.summary?.currencies[0].collectedCents, 10000);
});
test("invalid report years and partial database reads cannot produce a report", async () => {
  for (const year of [NaN, 2026.5, -1, 10000]) assert.equal(validReportYear(year), false);
  assert.throws(() => summarizeTaxEvidence([], NaN, now));
  const q = {select: () => q, order: () => q, range: async () => ({data: [], count: 1, error: null})};
  await assert.rejects(loadTaxEvidence({from: () => q} as any, 2026, now), /incomplete/);
});
test("financial print routes authorize before reads and do not bypass RLS or aggregate contract-plus-cash totals", () => {
  for (const path of ["app/reports/tax/page.tsx", "app/reports/financials/page.tsx"]) {
    const source = readFileSync(path, "utf8");
    assert.match(source, /await requireOwnerData\(\)/);assert.doesNotMatch(source, /createServiceClient|totalMonthlyRevenueCents/);
  }
  const guard = readFileSync("lib/auth/require-owner.ts", "utf8");
  assert.match(guard, /deleted_at/);assert.match(guard, /role !== "owner"/);
});

test("closed months and years do not mislabel later valid receipts as future errors", () => {
  const report = summarizeTaxEvidence([row("jan", {paid_at: "2026-01-15T18:00:00Z"}), row("sep")], 2026, now);
  assert.equal(report.months[0].summary?.issues.length, 0);
  assert.equal(report.months[0].summary?.outsideWindow, 1);
  const previous = summarizeTaxEvidence([row("current-year")], 2025, now);
  assert.equal(previous.summary?.issues.length, 0);
  assert.equal(previous.summary?.outsideWindow, 1);
});
