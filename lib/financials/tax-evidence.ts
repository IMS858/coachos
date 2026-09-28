import type {SupabaseClient} from "@supabase/supabase-js";
import {readCompleteEvidence} from "../migration/complete-read";
import {ptWallClockToUtc} from "../recurring";
import {summarizeCollected, type MoneyPayment, type PaymentEvidence} from "./evidence";

export function validReportYear(year: number): boolean {
  return Number.isSafeInteger(year) && year >= 1900 && year <= 9998;
}
function boundary(year: number, month: number): string {
  return ptWallClockToUtc(`${year}-${String(month).padStart(2, "0")}-01`, "00:00").toISOString();
}
/** Same validated, currency-separated receipt model used by Financials. */
export function summarizeTaxEvidence(rows: readonly MoneyPayment[], year: number, now = new Date()) {
  if (!validReportYear(year) || !Number.isFinite(now.getTime())) throw new Error("Invalid tax report period.");
  const start = boundary(year, 1), end = boundary(year + 1, 1);
  const summarize = (from: string, to: string): PaymentEvidence | null => {
    if (now.getTime() < Date.parse(from)) return null; // future period, not a zero collection
    const asOf = now.toISOString();
    return summarizeCollected(rows, {start: from, end: to, asOf, label: String(year)});
  };
  return {
    year, observedAt: now.toISOString(), summary: summarize(start, end),
    months: Array.from({length: 12}, (_, index) => ({
      label: new Intl.DateTimeFormat("en-US", {timeZone: "UTC", month: "short"}).format(new Date(Date.UTC(year, index, 15))),
      summary: summarize(boundary(year, index + 1), index === 11 ? end : boundary(year, index + 2)),
    })),
  };
}
/** Caller must already be authorized as an active owner. No service-role bypass. */
export async function loadTaxEvidence(db: SupabaseClient, year: number, now = new Date()) {
  if (!validReportYear(year) || !Number.isFinite(now.getTime())) throw new Error("Invalid tax report period.");
  const rows = await readCompleteEvidence<MoneyPayment>((from, to) => db.from("payments")
    .select("id,client_id,amount_cents,currency,status,source,source_id,description,paid_at,created_at", {count: "exact"})
    .order("id").range(from, to));
  return summarizeTaxEvidence(rows, year, now);
}
