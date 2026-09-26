"use client";
import {useRef, useState} from "react";
import {useRouter} from "next/navigation";
import {dollarsToCents, object, parseOwnerReview, PROPOSAL_KEYS, reviewPacificInstant, validReviewReceipt, type OwnerReviewRequest, type Proposal, type ReviewDecision, type ReviewKind} from "@/lib/migration/owner-review";

export type ReviewOption = {id: string; full_name: string; email: string};
export type SavedOwnerReview = {revision: number; source_hash: string; decision: ReviewDecision; proposal: Proposal; reason: string; created_at: string};
type Props = {recordId: string; sourceHash: string; kind: ReviewKind; latest: SavedOwnerReview | null; clients: ReviewOption[]; trainers: ReviewOption[]; frozen: boolean};
const inputClass = "mt-1 min-h-11 w-full rounded-xl border border-divider bg-white px-3 py-2 text-base text-cream disabled:opacity-60";
const MONEY_LABELS: Record<string, string> = {package_price_cents: "Package purchase price ($)", amount_paid_cents: "Owner-reported paid amount ($)", amount_owed_cents: "Owner-reported money owed ($)", credit_cents: "Owner-reported cash credit ($)"};
function initialValues(kind: ReviewKind, proposal: Proposal | null) {
  return Object.fromEntries(PROPOSAL_KEYS[kind].map(key => [key, proposal?.[key] === null || proposal?.[key] === undefined ? "" : key.endsWith("_cents") ? (Number(proposal[key]) / 100).toFixed(2) : String(proposal[key])]));
}
function pacificParts(iso: string) {
  if (!iso) return {date: "", time: "", offset: "auto" as const};
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return {date: "", time: "", offset: "auto" as const};
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", {timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZoneName: "shortOffset"}).formatToParts(d).map(x => [x.type, x.value]));
  return {date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}`, offset: p.timeZoneName === "GMT-7" ? "-07:00" as const : "-08:00" as const};
}
export function OwnerReviewForm({recordId, sourceHash, kind, latest, clients, trainers, frozen}: Props) {
  const router = useRouter();
  const proposal = latest?.source_hash === sourceHash ? latest.proposal : null;
  const initialTime = pacificParts(String(proposal?.starts_at ?? ""));
  const [values, setValues] = useState(() => initialValues(kind, proposal));
  const [date, setDate] = useState(initialTime.date), [time, setTime] = useState(initialTime.time);
  const [offset, setOffset] = useState<"auto" | "-07:00" | "-08:00">(initialTime.offset);
  const [revision, setRevision] = useState(latest?.revision ?? 0), [decision, setDecision] = useState<ReviewDecision>("hold");
  const [reason, setReason] = useState(""), [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false), [ambiguous, setAmbiguous] = useState(false), [conflict, setConflict] = useState(false), [saved, setSaved] = useState(false), [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false), attempt = useRef<OwnerReviewRequest | null>(null);
  const locked = frozen || busy || ambiguous || conflict;
  function edited() {setConfirmed(false); setSaved(false); setError(null);}
  function update(key: string, value: string) {edited(); setValues(previous => ({...previous, [key]: value}));}
  async function save() {
    if (frozen || inFlight.current || conflict || saved) return;
    let request = attempt.current;
    if (!request) {
      try {
        const draft: Proposal = {};
        for (const key of PROPOSAL_KEYS[kind]) {
          const value = values[key]?.trim() ?? "";
          draft[key] = key.endsWith("_cents") ? dollarsToCents(value) : ["duration_minutes", "sessions_remaining"].includes(key) ? value === "" ? null : /^\d+$/.test(value) ? Number(value) : NaN : value || null;
        }
        if (kind === "appointment") draft.starts_at = date || time ? reviewPacificInstant(date, time, offset) : null;
        request = parseOwnerReview({request_id: crypto.randomUUID(), expected_revision: revision, source_hash: sourceHash, record_type: kind, decision, proposal: draft, reason, owner_confirmed: confirmed});
        attempt.current = request;
      } catch (e) {setError(e instanceof Error ? e.message : "Check the review fields."); return;}
    }
    inFlight.current = true; setBusy(true); setError(null);
    try {
      const response = await fetch(`/api/migration/records/${recordId}/review`, {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify(request)});
      const data: unknown = await response.json().catch(() => null);
      if (!response.ok || !validReviewReceipt(data, request, recordId)) {
        const message = object(data) && typeof data.error === "string" ? data.error : "The review save was not confirmed.";
        if (response.status === 409) {attempt.current = null; setConflict(true); setAmbiguous(false);}
        else if ([400, 401, 403, 404].includes(response.status) && !ambiguous) {attempt.current = null;}
        else setAmbiguous(true);
        setError(message); return;
      }
      setRevision(data.revision); setSaved(true); setAmbiguous(false); attempt.current = null; router.refresh();
    } catch {setAmbiguous(true); setError("Connection interrupted. Retry this exact review to confirm whether it saved.");}
    finally {inFlight.current = false; setBusy(false);}
  }
  const identity = (key: string, label: string, options: ReviewOption[]) => <label className="block text-sm font-medium text-cream">{label}<select aria-label={label} value={values[key] ?? ""} onChange={e => update(key, e.target.value)} className={inputClass}><option value="">Unresolved — keep on hold</option>{options.map(p => <option key={p.id} value={p.id}>{p.full_name} · {p.email}</option>)}</select></label>;
  return <section className="rounded-3xl border border-sky/20 bg-white p-5">
    <h2 className="text-xl font-semibold text-cream">Your proposed correction</h2>
    <p className="mt-2 text-sm leading-6 text-cream-dim">Save what you have verified. This records an owner review only; it does not create an appointment, change a package, mark anything paid or send a notification.</p>
    {frozen && <p role="status" className="mt-3 text-sm text-cream-dim">This batch is frozen. Its saved evidence remains read-only.</p>}
    {latest && <p className="mt-3 text-xs text-cream-dim">Latest saved revision {latest.revision}: {latest.decision}. {latest.source_hash !== sourceHash ? "Source changed since that review; recheck all fields." : "New changes will create another revision, not overwrite history."}</p>}
    <fieldset disabled={locked} className="mt-5 space-y-4">
      <legend className="sr-only">Owner migration review</legend>
      {identity("client_id", "Destination client", clients)}
      <p className="text-xs text-cream-faint">Only existing active client records appear. Unmatched source contacts do not create login accounts.</p>
      {kind === "appointment" && <>
        {identity("trainer_id", "Destination coach", trainers)}
        <div className="grid grid-cols-2 gap-3"><label className="text-sm text-cream">Date (Pacific)<input aria-label="Date (Pacific)" type="date" value={date} onChange={e => {edited(); setDate(e.target.value); setOffset("auto");}} className={inputClass}/></label><label className="text-sm text-cream">Time (Pacific)<input aria-label="Time (Pacific)" type="time" value={time} onChange={e => {edited(); setTime(e.target.value); setOffset("auto");}} className={inputClass}/></label></div>
        <label className="block text-sm text-cream">Daylight-saving offset<select aria-label="Daylight-saving offset" value={offset} onChange={e => {edited(); setOffset(e.target.value as typeof offset);}} className={inputClass}><option value="auto">Resolve from Pacific date; hold ambiguous times</option><option value="-07:00">PDT (UTC−7), explicitly verified</option><option value="-08:00">PST (UTC−8), explicitly verified</option></select></label>
        <div className="grid gap-3 sm:grid-cols-2"><label className="text-sm text-cream">Verified duration (minutes)<input aria-label="Verified duration (minutes)" inputMode="numeric" value={values.duration_minutes} onChange={e => update("duration_minutes", e.target.value)} placeholder="Do not infer from calendar size" className={inputClass}/></label><label className="text-sm text-cream">Verified appointment status<select aria-label="Verified appointment status" value={values.session_status} onChange={e => update("session_status", e.target.value)} className={inputClass}><option value="">Unknown</option><option value="scheduled">Scheduled — attendance not established</option><option value="confirmed">Confirmed booking — attendance not established</option><option value="completed">Completed — attendance verified</option></select></label></div>
        <p className="text-xs leading-5 text-cream-faint">A past booking is not proof of attendance. Conflicts and duplicates still need a fresh check before operational import.</p>
      </>}
      {kind === "package" && <>
        <div className="grid gap-3 sm:grid-cols-2"><label className="text-sm text-cream">Opening balance as of<input aria-label="Opening balance as of" type="date" value={values.as_of_date} onChange={e => update("as_of_date", e.target.value)} className={inputClass}/></label><label className="text-sm text-cream">Verified sessions remaining<input aria-label="Verified sessions remaining" inputMode="numeric" value={values.sessions_remaining} onChange={e => update("sessions_remaining", e.target.value)} placeholder="Unknown — leave blank" className={inputClass}/></label></div>
        <p className="text-xs leading-5 text-cream-faint">Zero means you verified zero. Blank means unknown. This opening quantity will not replay historical session debits.</p>
        <div className="grid gap-3 sm:grid-cols-2">{Object.entries(MONEY_LABELS).map(([key, label]) => <label key={key} className="text-sm text-cream">{label}<input aria-label={label} inputMode="decimal" value={values[key]} onChange={e => update(key, e.target.value)} placeholder="Unknown — leave blank" className={inputClass}/></label>)}</div>
        <p className="text-xs leading-5 text-cream-faint">These are owner-reported opening figures, not provider-verified receipts. The $93 training estimate never fills these fields. Shared ownership must be resolved before a package is imported.</p>
      </>}
      <label className="block text-sm text-cream">Review decision<select aria-label="Review decision" value={decision} onChange={e => {edited(); setDecision(e.target.value as ReviewDecision);}} className={inputClass}><option value="hold">Hold — more evidence needed</option><option value="reviewed">Owner-reviewed proposal — not import approval</option><option value="excluded">Exclude from the proposed cutover</option></select></label>
      <label className="block text-sm text-cream">Reason and evidence checked<textarea aria-label="Reason and evidence checked" value={reason} onChange={e => {edited(); setReason(e.target.value);}} maxLength={2000} rows={4} placeholder="Explain the correction, what you checked and any remaining uncertainty." className={inputClass}/></label>
      <label className="flex min-h-11 items-start gap-3 text-sm leading-6 text-cream"><input type="checkbox" checked={confirmed} onChange={e => {setSaved(false); setConfirmed(e.target.checked);}} className="mt-1 h-5 w-5 shrink-0"/>I verified the proposed identities and values, or deliberately chose exclusion. I understand this is not an operational import or proof of payment.</label>
    </fieldset>
    {error && <p role="alert" className="mt-4 rounded-xl bg-status-limited/10 p-3 text-sm text-status-limited">{error}</p>}
    {ambiguous && <p role="status" className="mt-3 text-sm text-cream-dim">This request is preserved. Edits are locked until its save is confirmed; retry will not create a duplicate review.</p>}
    {saved && <p role="status" className="mt-3 text-sm font-semibold text-sky">Owner review saved as revision {revision}. Not imported.</p>}
    <div className="mt-4 flex flex-wrap gap-3"><button type="button" onClick={() => void save()} disabled={frozen || busy || conflict || saved} className="min-h-11 rounded-xl bg-sky px-5 py-3 text-sm font-semibold text-white disabled:opacity-50">{busy ? "Confirming save…" : ambiguous ? "Retry exact review" : "Save owner review"}</button>{(conflict || ambiguous) && <button type="button" onClick={() => router.refresh()} className="min-h-11 rounded-xl border border-divider px-4 py-3 text-sm text-cream">Check saved review</button>}</div>
  </section>;
}
