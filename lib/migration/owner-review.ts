/** Owner review proposals are not imports, payment receipts or verified provider records. */
export const REVIEW_KINDS = ["client", "appointment", "package"] as const;
export type ReviewKind = typeof REVIEW_KINDS[number];
export type ReviewDecision = "hold" | "reviewed" | "excluded";
export type Proposal = Record<string, string | number | null>;
export type OwnerReviewRequest = {
  request_id: string; expected_revision: number; source_hash: string;
  record_type: ReviewKind; decision: ReviewDecision; proposal: Proposal;
  reason: string; owner_confirmed: boolean;
};
export type ReviewReceipt = {ok: true; request_id: string; record_id: string; revision: number; source_hash: string; decision: ReviewDecision};
export const REVIEW_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const PROPOSAL_KEYS: Record<ReviewKind, string[]> = {
  client: ["client_id"],
  appointment: ["client_id", "trainer_id", "starts_at", "duration_minutes", "session_status"],
  package: ["client_id", "as_of_date", "sessions_remaining", "package_price_cents", "amount_paid_cents", "amount_owed_cents", "credit_cents"],
};
export function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
export function validDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const ms = Date.parse(value + "T00:00:00Z");
  return Number.isFinite(ms) && new Date(ms).toISOString().slice(0, 10) === value;
}
export function validInstant(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,3})?(?:Z|[+-](?:0\d|1[0-4]):[0-5]\d)$/.test(value)) return false;
  if (!validDate(value.slice(0, 10)) || /[+-]14:(?!00)/.test(value)) return false;
  return Number.isFinite(Date.parse(value));
}
export function parseOwnerReview(input: unknown, now = Date.now()): OwnerReviewRequest {
  const keys = ["request_id", "expected_revision", "source_hash", "record_type", "decision", "proposal", "reason", "owner_confirmed"];
  if (!object(input) || Object.keys(input).length !== keys.length || Object.keys(input).some(key => !keys.includes(key))) throw new Error("Unsupported review fields.");
  if (typeof input.request_id !== "string" || !REVIEW_UUID.test(input.request_id)) throw new Error("A valid review request ID is required.");
  if (!Number.isSafeInteger(input.expected_revision) || (input.expected_revision as number) < 0 || (input.expected_revision as number) > 1000000) throw new Error("Invalid review revision.");
  if (typeof input.source_hash !== "string" || !/^[a-f0-9]{64}$/.test(input.source_hash)) throw new Error("A source checksum is required.");
  if (!REVIEW_KINDS.includes(input.record_type as ReviewKind)) throw new Error("This evidence type is read-only in this review workflow.");
  if (!["hold", "reviewed", "excluded"].includes(String(input.decision)) || typeof input.owner_confirmed !== "boolean") throw new Error("Invalid review decision.");
  if (typeof input.reason !== "string" || input.reason.trim().length < 10 || input.reason.length > 2000) throw new Error("Explain this decision in 10–2,000 characters.");
  if (input.decision !== "hold" && !input.owner_confirmed) throw new Error("Explicit owner confirmation is required.");
  const kind = input.record_type as ReviewKind, allowed = PROPOSAL_KEYS[kind];
  if (!object(input.proposal) || Object.keys(input.proposal).length !== allowed.length || Object.keys(input.proposal).some(key => !allowed.includes(key))) throw new Error("Unsupported proposal fields.");
  const p = input.proposal;
  for (const key of allowed) {
    const v = p[key];
    if (v === null) continue;
    if (key.endsWith("_id") && (typeof v !== "string" || !REVIEW_UUID.test(v))) throw new Error("Select a valid destination identity.");
    if ((key.endsWith("_cents") || key === "sessions_remaining" || key === "duration_minutes") && (!Number.isSafeInteger(v) || (v as number) < 0 || (v as number) > (key.endsWith("_cents") ? 1000000000 : key === "duration_minutes" ? 480 : 10000))) throw new Error("Amounts and quantities must be valid non-negative whole units.");
    if (key === "duration_minutes" && (v as number) < 15) throw new Error("Appointment duration must be 15–480 minutes.");
    if (key === "starts_at" && !validInstant(v)) throw new Error("Appointment time requires a valid explicit timezone offset.");
    if (key === "as_of_date" && !validDate(v)) throw new Error("Enter a valid opening-balance date.");
    if (key === "session_status" && !["scheduled", "confirmed", "completed"].includes(String(v))) throw new Error("Invalid proposed appointment status.");
  }
  if (input.decision === "reviewed") {
    if (!p.client_id) throw new Error("An existing destination client is required; a name match alone is not approval.");
    if (kind === "appointment" && (!p.trainer_id || !p.starts_at || p.duration_minutes === null || !p.session_status)) throw new Error("Confirm the coach, time, duration and status before marking reviewed.");
    if (kind === "package" && (!p.as_of_date || p.sessions_remaining === null)) throw new Error("A verified opening date and remaining session count are required.");
  }
  if (kind === "appointment" && p.session_status === "completed" && p.starts_at !== null && p.duration_minutes !== null && Date.parse(p.starts_at as string) + Number(p.duration_minutes) * 60000 > now) throw new Error("Future or ongoing appointments cannot be reviewed as completed.");
  const pacificToday = new Intl.DateTimeFormat("en-CA", {timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit", day: "2-digit"}).format(new Date(now));
  if (kind === "package" && p.as_of_date !== null && String(p.as_of_date) > pacificToday) throw new Error("An opening balance cannot be dated in the future.");
  if (kind === "package" && Number(p.amount_owed_cents) > 0 && Number(p.credit_cents) > 0) throw new Error("Resolve simultaneous debt and credit before recording one opening position.");
  return {request_id: input.request_id, expected_revision: input.expected_revision as number, source_hash: input.source_hash, record_type: kind, decision: input.decision as ReviewDecision, proposal: {...p} as Proposal, reason: input.reason.trim(), owner_confirmed: input.owner_confirmed};
}
export function validReviewReceipt(value: unknown, request: OwnerReviewRequest, recordId: string): value is ReviewReceipt {
  return object(value) && value.ok === true && value.request_id === request.request_id && value.record_id === recordId && value.revision === request.expected_revision + 1 && value.source_hash === request.source_hash && value.decision === request.decision;
}
export function dollarsToCents(text: string): number | null {
  if (!text.trim()) return null;
  if (!/^\d{1,8}(?:\.\d{1,2})?$/.test(text.trim())) throw new Error("Enter dollars using no more than two decimal places; leave unknown values blank.");
  const [whole, fraction = ""] = text.trim().split("."), cents = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  if (!Number.isSafeInteger(cents) || cents > 1000000000) throw new Error("Amount exceeds the review limit.");
  return cents;
}
/** Unlike ordinary new bookings, migration review must not silently pick a repeated DST hour. */
export function reviewPacificInstant(date: string, time: string, offset: "auto" | "-07:00" | "-08:00" = "auto"): string {
  if (!validDate(date) || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time)) throw new Error("Enter a valid Pacific date and time.");
  const format = new Intl.DateTimeFormat("en-CA", {timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23"});
  const matches = ["-07:00", "-08:00"].filter(zone => offset === "auto" || zone === offset).map(zone => new Date(date + "T" + time + ":00" + zone)).filter(d => {
    const p = Object.fromEntries(format.formatToParts(d).map(x => [x.type, x.value]));
    return `${p.year}-${p.month}-${p.day}` === date && `${p.hour}:${p.minute}` === time;
  });
  if (matches.length !== 1) throw new Error(matches.length ? "This time occurs twice. Choose PDT or PST explicitly." : "This Pacific time/offset does not exist. Check daylight saving time.");
  return matches[0].toISOString();
}
export function sourceTitle(payload: unknown, fallback: string): string {
  if (!object(payload) || !object(payload.fields)) return fallback;
  for (const key of ["Source Name", "Client Name", "Owner", "Client"]) {
    const value = payload.fields[key]; if (typeof value === "string" && value.trim()) return value;
  }
  return fallback;
}
