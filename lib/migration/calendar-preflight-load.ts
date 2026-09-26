import type {SupabaseClient} from "@supabase/supabase-js";
import {readCompleteEvidence} from "./complete-read";
import {calendarPreflight, type PreflightBatch, type PreflightRecord, type PreflightReview} from "./calendar-preflight";
export const PREFLIGHT_BATCH_COLUMNS = "id,label,status,expected_counts,source_manifest_sha256,staging_completed_at,approved_by,approved_at";
const recordColumns = "id,record_type,source_id,source_hash,reconciliation_status,dry_run_status";
const reviewColumns = "id,record_id,record_type,source_hash,revision,decision,owner_confirmed";

/** Owner-scoped RLS reads only. A bounded or failed page is not an empty calendar. */
export async function loadCalendarPreflight(db: SupabaseClient, batch: PreflightBatch) {
  const records = await readCompleteEvidence<PreflightRecord>((from, to) =>
    db.from("migration_records").select(recordColumns, {count: "exact"}).eq("batch_id", batch.id).order("id").range(from, to));
  const reviews: PreflightReview[] = [];
  const appointments = records.filter(row => row.record_type === "appointment");
  for (let offset = 0; offset < appointments.length; offset += 100) {
    const scopedIds = appointments.slice(offset, offset + 100).map(row => row.id);
    const chunk = await readCompleteEvidence<PreflightReview>((from, to) =>
      db.from("migration_latest_record_reviews").select(reviewColumns, {count: "exact"})
        .in("record_id", scopedIds).order("record_id").range(from, to));
    if (chunk.some(review => !scopedIds.includes(review.record_id))) throw new Error("Review scope changed during loading.");
    reviews.push(...chunk);
  }
  const after = await db.from("migration_batches").select(PREFLIGHT_BATCH_COLUMNS).eq("id", batch.id).maybeSingle();
  const latest = after.data as PreflightBatch | null;
  if (after.error || !latest || (PREFLIGHT_BATCH_COLUMNS.split(",") as (keyof PreflightBatch)[]).some(key =>
    JSON.stringify(latest[key]) !== JSON.stringify(batch[key]))) {
    throw new Error("Migration batch changed during loading. Refresh before using this report.");
  }
  // These are paged observations, not a transaction-isolated snapshot or a live collision check.
  return calendarPreflight(batch, records, reviews, new Date().toISOString());
}
