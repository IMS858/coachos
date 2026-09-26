/** Owner-approved valuation assumption, never a price, payment, receivable or credit. */
export const HISTORICAL_SESSION_ESTIMATE_CENTS = 9300;
export const TRAINING_VALUE_RULE_VERSION = "ims-training-value-v2";
export type HistoricalSessionEvidence = {
  source_id: string;
  starts_at: string;
  status: string;
  service: string;
  duration_minutes: number | null;
  client_id?: string | null;
  trainer_id?: string | null;
};
export type HistoricalValueRow = {
  source_id: string;
  estimated_value_cents: number;
  basis: "historical_session_estimate";
  rate_cents: number;
};
export type ValueState = "historical_completed" | "future_scheduled" | "needs_review" | "excluded";
export type TrainingValueDecision = HistoricalSessionEvidence & {
  state: ValueState;
  reason: string | null;
  estimated_value_cents: number | null;
};
export type ValueTotals = {
  historical_count: number;
  historical_estimate_cents: number | null;
  scheduled_count: number;
  scheduled_estimate_cents: number | null;
  review_count: number;
  excluded_count: number;
};
const normalized = (value: string) => value.trim().toLowerCase();

/** Require an explicit offset and a real calendar date; never infer a device timezone. */
export function evidenceInstant(value: string): number {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,6})?(Z|[+-]\d{2}:\d{2})$/.exec(value);
  if (!match) return NaN;
  const [, y, m, d, h, minute, second, offset] = match;
  const year = Number(y), month = Number(m), day = Number(d);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (month < 1 || month > 12 || day < 1 || day > days[month - 1] || Number(h) > 23 || Number(minute) > 59 || Number(second) > 59) return NaN;
  if (offset !== "Z") {
    const hours = Number(offset.slice(1, 3)), minutes = Number(offset.slice(4));
    if (hours > 14 || minutes > 59 || (hours === 14 && minutes !== 0)) return NaN;
  }
  return Date.parse(value);
}

function classify(row: HistoricalSessionEvidence, asOf: number): TrainingValueDecision {
  const decision = (state: ValueState, reason: string | null): TrainingValueDecision => ({
    ...row, state, reason,
    estimated_value_cents: state === "historical_completed" || state === "future_scheduled" ? HISTORICAL_SESSION_ESTIMATE_CENTS : null,
  });
  if (!row.source_id.trim()) return decision("needs_review", "missing_identity");
  const service = normalized(row.service), status = normalized(row.status);
  const title = /^personal training(?: (\d{1,3}) (?:min|minute|minutes) session)?$/.exec(service);
  if (service !== "training" && !title) {
    return ["assessment", "massage", "pilates", "recovery", "body_comp", "mobility", "class"].includes(service)
      ? decision("excluded", "not_private_training") : decision("needs_review", "unmapped_service");
  }
  if (["cancelled", "canceled", "late_cancelled", "late_canceled", "no_show", "declined"].includes(status)) return decision("excluded", "not_delivered_or_scheduled");
  const instant = evidenceInstant(row.starts_at);
  if (!Number.isFinite(instant)) return decision("needs_review", "time_or_timezone_unknown");
  const minutes = row.duration_minutes;
  if (minutes === null || !Number.isInteger(minutes) || minutes < 1 || minutes > 480) return decision("needs_review", "duration_unknown");
  if (title?.[1] && Number(title[1]) !== minutes) return decision("needs_review", "duration_conflict");
  if (status === "completed") return instant + minutes * 60000 <= asOf
    ? decision("historical_completed", null) : decision("needs_review", "completion_before_session_end");
  if (status === "scheduled" || status === "confirmed") return instant >= asOf
    ? decision("future_scheduled", null) : decision("needs_review", "past_booking_without_completion");
  return decision("needs_review", status === "requested" ? "awaiting_confirmation" : "unmapped_status");
}

export function trainingValueTotals(rows: TrainingValueDecision[]): ValueTotals {
  const historical = rows.filter(row => row.state === "historical_completed").length;
  const scheduled = rows.filter(row => row.state === "future_scheduled").length;
  return {
    historical_count: historical,
    historical_estimate_cents: historical ? historical * HISTORICAL_SESSION_ESTIMATE_CENTS : null,
    scheduled_count: scheduled,
    scheduled_estimate_cents: scheduled ? scheduled * HISTORICAL_SESSION_ESTIMATE_CENTS : null,
    review_count: rows.filter(row => row.state === "needs_review").length,
    excluded_count: rows.filter(row => row.state === "excluded").length,
  };
}

export function analyzeTrainingValue(rows: HistoricalSessionEvidence[], asOfIso: string) {
  const asOf = evidenceInstant(asOfIso);
  if (!Number.isFinite(asOf)) throw new Error("A valid offset-aware analysis timestamp is required.");
  const groups = new Map<string, HistoricalSessionEvidence[]>();
  rows.forEach((row, index) => {
    const key = row.source_id.trim() ? "id:" + row.source_id : "missing:" + index;
    groups.set(key, [...(groups.get(key) ?? []), row]);
  });
  let exactDuplicates = 0;
  const decisions: TrainingValueDecision[] = [];
  for (const items of groups.values()) {
    const row = items[0];
    const fingerprint = (item: HistoricalSessionEvidence) => JSON.stringify([
      item.starts_at, item.status, item.service, item.duration_minutes, item.client_id ?? null, item.trainer_id ?? null,
    ]);
    if (new Set(items.map(fingerprint)).size > 1) {
      decisions.push({...row, state: "needs_review", reason: "conflicting_duplicate_identity", estimated_value_cents: null});
    } else {
      exactDuplicates += items.length - 1;
      decisions.push(classify(row, asOf));
    }
  }
  return {rule_version: TRAINING_VALUE_RULE_VERSION, rate_cents: HISTORICAL_SESSION_ESTIMATE_CENTS,
    as_of: asOfIso, exact_duplicates_ignored: exactDuplicates, rows: decisions, totals: trainingValueTotals(decisions)};
}

/** Compatibility entrypoint; accepted/confirmed history is deliberately NOT completion evidence. */
export function estimateHistoricalTrainingValue(rows: HistoricalSessionEvidence[], cutoverIso: string): HistoricalValueRow[] {
  return analyzeTrainingValue(rows, cutoverIso).rows.filter(row => row.state === "historical_completed").map(row => ({
    source_id: row.source_id, estimated_value_cents: HISTORICAL_SESSION_ESTIMATE_CENTS,
    basis: "historical_session_estimate", rate_cents: HISTORICAL_SESSION_ESTIMATE_CENTS,
  }));
}
export function sumHistoricalEstimate(rows: HistoricalValueRow[]): number | null {
  return rows.length ? rows.reduce((total, row) => total + row.estimated_value_cents, 0) : null;
}
