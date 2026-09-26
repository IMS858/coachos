/** Read-only operating evidence. This module never creates payments or client debt. */
import {paymentState, type PaymentRecord} from "../billing/payment-display";
import {evidenceInstant} from "../migration/historical-value";

export type Evidence<T> = {status: "ready"; value: T} | {status: "unavailable"; message: string};
export async function captureFinancialEvidence<T>(read: () => Promise<T>, message: string): Promise<Evidence<T>> {
  try { return {status: "ready", value: await read()}; }
  catch { return {status: "unavailable", message}; }
}
export type MoneyWindow = {start: string; end: string; asOf: string; label: string};
export type MoneyPayment = PaymentRecord & {source_id: string | null};
export type MoneyIssue = {id: string; reason: string};
export type CollectedCurrency = {
  currency: string; collectedCents: number | null; collectedRecords: number;
  refundedCents: number | null; refundRecords: number;
};
export type PaymentEvidence = {
  currencies: CollectedCurrency[]; issues: MoneyIssue[]; loadedRecords: number;
  outsideWindow: number; pendingRecords: number; failedRecords: number;
};
const text = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;
function addMoney(total: number | null, value: number) {
  const sum = (total === null ? 0 : total) + value;
  if (!Number.isSafeInteger(sum)) throw new Error("Money total exceeds safe integer precision.");
  return sum;
}

/** Validate before aggregation. A source collision is a hold, never an extra receipt. */
export function summarizeCollected(rows: readonly MoneyPayment[], window: MoneyWindow): PaymentEvidence {
  const start = evidenceInstant(window.start), end = evidenceInstant(window.end), asOf = evidenceInstant(window.asOf);
  if (![start, end, asOf].every(Number.isFinite) || start >= end || asOf < start || asOf >= end) {
    throw new Error("Invalid financial evidence window.");
  }
  const rowIds = new Set<string>(), references = new Map<string, number>();
  for (const row of rows) {
    if (!text(row.id) || rowIds.has(row.id)) throw new Error("Duplicate or missing payment identity.");
    rowIds.add(row.id);
    if (text(row.source) && text(row.source_id)) {
      const key = JSON.stringify([row.source, row.source_id.trim()]);
      references.set(key, (references.get(key) ?? 0) + 1);
    }
  }
  const result: PaymentEvidence = {currencies: [], issues: [], loadedRecords: rows.length, outsideWindow: 0, pendingRecords: 0, failedRecords: 0};
  const currencies = new Map<string, CollectedCurrency>();
  for (const row of rows) {
    const hold = (reason: string) => result.issues.push({id: row.id, reason});
    if (text(row.source) && text(row.source_id) && references.get(JSON.stringify([row.source, row.source_id.trim()]))! > 1) {
      hold("Duplicate source reference; reconcile before totaling"); continue;
    }
    const state = paymentState(row);
    if (state.tone === "review") { hold("Amount, currency or status needs review"); continue; }
    // Attempts are not receipts or receivables. These counts cover the loaded ledger, not a paid-date window.
    if (state.tone === "pending") { result.pendingRecords++; continue; }
    if (state.tone === "failed") { result.failedRecords++; continue; }
    if (!text(row.source) || !["stripe", "vagaro", "manual"].includes(row.source)) {
      hold("Accounting source is not established"); continue;
    }
    if (row.source !== "manual" && !text(row.source_id)) { hold("External receipt reference is missing"); continue; }
    if (text(row.source_id) && row.source_id !== row.source_id.trim()) { hold("Source reference has unreviewed whitespace"); continue; }
    const paid = typeof row.paid_at === "string" ? evidenceInstant(row.paid_at) : NaN;
    if (!Number.isFinite(paid)) { hold("Payment date is missing or invalid; creation time was not substituted"); continue; }
    if (paid > asOf) { hold("Payment date is in the future"); continue; }
    if (paid < start || paid >= end) { result.outsideWindow++; continue; }
    const code = row.currency.toUpperCase();
    const group = currencies.get(code) ?? {currency: code, collectedCents: null, collectedRecords: 0, refundedCents: null, refundRecords: 0};
    if (state.tone === "success") {
      group.collectedCents = addMoney(group.collectedCents, row.amount_cents); group.collectedRecords++;
    } else {
      group.refundedCents = addMoney(group.refundedCents, -row.amount_cents); group.refundRecords++;
    }
    currencies.set(code, group);
  }
  result.currencies = [...currencies.values()].sort((a, b) => a.currency.localeCompare(b.currency));
  return result;
}

export type ContractValue = {knownCents: number | null; completeCents: number | null; knownRecords: number; unknownRecords: number};
/** Null and invalid rates do not become zero-priced contracts. A recorded zero remains zero. */
export function summarizeContractValues(values: readonly unknown[]): ContractValue {
  let knownCents: number | null = null, knownRecords = 0, unknownRecords = 0;
  for (const value of values) {
    if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) { unknownRecords++; continue; }
    knownCents = addMoney(knownCents, value); knownRecords++;
  }
  return {knownCents, completeCents: unknownRecords ? null : knownCents, knownRecords, unknownRecords};
}
