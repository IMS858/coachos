export const EVIDENCE_KINDS = ["client", "appointment", "series", "package", "membership", "transaction"] as const;
export type EvidenceKind = typeof EVIDENCE_KINDS[number];
export type PreflightBatch = {
  id: string; label: string; status: string; expected_counts: unknown;
  source_manifest_sha256: string | null; staging_completed_at: string | null;
  approved_by: string | null; approved_at: string | null;
};
export type PreflightRecord = {
  id: string; record_type: string; source_id: string; source_hash: string;
  reconciliation_status: string; dry_run_status: string | null;
};
export type PreflightReview = {
  id: string; record_id: string; record_type: string; source_hash: string;
  revision: number; decision: string; owner_confirmed: boolean;
};
export type CalendarReviewState = "unreviewed" | "held" | "stale" | "reviewed" | "excluded" | "imported";
const HASH = /^[a-f0-9]{64}$/;
const states: CalendarReviewState[] = ["unreviewed", "held", "stale", "reviewed", "excluded", "imported"];
const object = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value);

/** Counts describe source coverage only. A matching receipt is never import permission. */
export function calendarPreflight(batch: PreflightBatch, records: PreflightRecord[], reviews: PreflightReview[], observedAt: string) {
  const instant = Date.parse(observedAt);
  if (!Number.isFinite(instant)) throw new Error("Invalid observation time.");
  const ids = new Set<string>(), sourceKeys = new Set<string>();
  for (const row of records) {
    const key = JSON.stringify([row.record_type, row.source_id]);
    if (!row.id || ids.has(row.id) || !EVIDENCE_KINDS.includes(row.record_type as EvidenceKind)
      || !row.source_id?.trim() || sourceKeys.has(key) || !HASH.test(row.source_hash)) {
      throw new Error("Source identities or hashes are incomplete. No preflight total was inferred.");
    }
    ids.add(row.id); sourceKeys.add(key);
  }
  const byRecord = new Map<string, PreflightReview>();
  for (const review of reviews) {
    if (!review.id || !ids.has(review.record_id) || byRecord.has(review.record_id)
      || !Number.isSafeInteger(review.revision) || review.revision < 1
      || !["hold", "reviewed", "excluded"].includes(review.decision) || typeof review.owner_confirmed !== "boolean") {
      throw new Error("Latest review evidence is inconsistent. Refresh before using this report.");
    }
    byRecord.set(review.record_id, review);
  }
  const raw = batch.expected_counts;
  const validCounts = object(raw) && Object.keys(raw).length === EVIDENCE_KINDS.length
    && EVIDENCE_KINDS.every(kind => Number.isSafeInteger(raw[kind]) && (raw[kind] as number) >= 0 && (raw[kind] as number) <= 2147483647);
  const counts = validCounts ? raw as Record<EvidenceKind, number> : null;
  const coverage = EVIDENCE_KINDS.map(kind => {
    const staged = records.filter(row => row.record_type === kind).length, expected = counts?.[kind] ?? null;
    return {kind, staged, expected, missing: expected === null ? null : Math.max(0, expected - staged), excess: expected === null ? null : Math.max(0, staged - expected)};
  });
  const completedAt = batch.staging_completed_at === null ? NaN : Date.parse(batch.staging_completed_at);
  const receiptRecorded = Boolean(counts && batch.source_manifest_sha256 && HASH.test(batch.source_manifest_sha256)
    && Number.isFinite(completedAt) && completedAt <= instant);
  const coverageMatches = Boolean(counts && coverage.every(row => row.staged === row.expected));
  const coverageState = raw !== null && !validCounts ? "invalid_declaration"
    : !counts ? "undeclared" : !coverageMatches ? "count_mismatch" : !receiptRecorded ? "receipt_missing" : "declared_counts_match";
  const calendar = records.filter(row => row.record_type === "appointment");
  const reviewCounts = Object.fromEntries(states.map(state => [state, 0])) as Record<CalendarReviewState, number>;
  let storedReadyMarkers = 0;
  for (const row of calendar) {
    const review = byRecord.get(row.id);
    let state: CalendarReviewState;
    if (row.reconciliation_status === "imported") state = "imported";
    else if (!review) state = "unreviewed";
    else if (review.record_type !== row.record_type || review.source_hash !== row.source_hash
      || (review.decision !== "hold" && review.owner_confirmed !== true)) state = "stale";
    else if (review.decision === "hold") state = "held";
    else if (review.decision === "excluded") state = "excluded";
    else {state = "reviewed"; if (row.dry_run_status === "ready") storedReadyMarkers++;}
    reviewCounts[state]++;
  }
  return {
    observedAt, coverage, coverageState, calendarRows: calendar.length, reviewCounts, storedReadyMarkers,
    // Legacy ready markers carry no collision-check timestamp/review revision.
    // They must never be promoted to current schedule clearance here.
    importAuthorized: false as const,
  };
}
