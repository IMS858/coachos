import type {SupabaseClient} from "@supabase/supabase-js";
import {readCompleteEvidence} from "../migration/complete-read";
import {analyzeTrainingValue} from "../migration/historical-value";
import {ptWallClockToUtc} from "../recurring";
import {pacificDate} from "../time/pacific";
import {captureFinancialEvidence, summarizeCollected, summarizeContractValues, type MoneyPayment, type MoneyWindow} from "./evidence";

type Session = {id: string; client_id: string; trainer_id: string | null; scheduled_at: string; duration_minutes: number | null; session_type: string; status: string};
type Plan = {id: string; monthly_rate_cents: number | null};
export type FinancialRenter = {id: string; name: string; discipline: string | null; monthly_rent_cents: number | null};
export function financialWindow(now: Date): MoneyWindow {
  if (!Number.isFinite(now.getTime())) throw new Error("Financial observation time is invalid.");
  const date = pacificDate(now), start = date.slice(0, 8) + "01";
  const next = new Date(start + "T12:00:00Z"); next.setUTCMonth(next.getUTCMonth() + 1);
  return {start: ptWallClockToUtc(start, "00:00").toISOString(), end: ptWallClockToUtc(next.toISOString().slice(0, 10), "00:00").toISOString(),
    asOf: now.toISOString(), label: new Intl.DateTimeFormat("en-US", {timeZone: "America/Los_Angeles", month: "long", year: "numeric"}).format(now)};
}

/** Caller must authorize the owner first. Use their RLS client; never bypass financial permissions. */
export async function loadFinancialEvidence(db: SupabaseClient, now = new Date()) {
  const window = financialWindow(now);
  const [training, payments, subscriptions, renters] = await Promise.all([
    captureFinancialEvidence(async () => {
      const rows = await readCompleteEvidence<Session>((a, b) => db.from("sessions")
        .select("id,client_id,trainer_id,scheduled_at,duration_minutes,session_type,status", {count: "exact"})
        .gte("scheduled_at", window.start).lt("scheduled_at", window.end).order("id").range(a, b));
      const analysis = analyzeTrainingValue(rows.map(row => ({source_id: row.id, client_id: row.client_id, trainer_id: row.trainer_id,
        starts_at: row.scheduled_at, duration_minutes: row.duration_minutes, service: row.session_type, status: row.status})), window.asOf);
      return {loadedRecords: rows.length, analysis};
    }, "Training evidence could not be loaded completely. No partial or zero-dollar estimate was substituted."),
    captureFinancialEvidence(async () => {
      // Read every page before a total. Undated rows and duplicate source references must not disappear in a date filter.
      const rows = await readCompleteEvidence<MoneyPayment>((a, b) => db.from("payments")
        .select("id,client_id,amount_cents,currency,status,source,source_id,description,paid_at,created_at", {count: "exact"})
        .order("id").range(a, b));
      return {rows, summary: summarizeCollected(rows, window)};
    }, "Payment evidence is unavailable or exceeds this report's safe limit. No empty or zero-balance ledger was inferred."),
    captureFinancialEvidence(async () => {
      const rows = await readCompleteEvidence<Plan>((a, b) => db.from("plans")
        .select("id,monthly_rate_cents", {count: "exact"}).eq("kind", "subscription").eq("status", "active").order("id").range(a, b));
      return summarizeContractValues(rows.map(row => row.monthly_rate_cents));
    }, "Subscription contract values could not be loaded completely."),
    captureFinancialEvidence(async () => {
      const rows = await readCompleteEvidence<FinancialRenter>((a, b) => db.from("renters")
        .select("id,name,discipline,monthly_rent_cents", {count: "exact"}).eq("status", "active").order("id").range(a, b));
      return {rows, value: summarizeContractValues(rows.map(row => row.monthly_rent_cents))};
    }, "Renter records could not be loaded completely. Editing is unavailable until the records can be read."),
  ]);
  return {window, training, payments, subscriptions, renters};
}
export type FinancialEvidence = Awaited<ReturnType<typeof loadFinancialEvidence>>;
