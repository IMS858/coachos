"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Search } from "lucide-react";
import { sourceLabel, type LeadRecord } from "@/lib/leads/workspace";

const control = "min-h-11 rounded-xl border border-divider bg-white px-3 py-2 text-base text-cream focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky";
export function LeadWorkspaceView({ rows, contacts = false, research = false }: { rows: LeadRecord[]; contacts?: boolean; research?: boolean }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [draft, setDraft] = useState({ full_name: "", email: "", phone: "", interest: "Personal Training", notes: "" });
  const filtered = useMemo(() => rows.filter(row => [row.full_name,row.email,row.phone,row.interest].join(" ").toLowerCase().includes(query.toLowerCase().trim())), [rows, query]);
  async function updateStage(id: string, stage: string) {
    setBusy(id); setError(null);
    try {
      const response = await fetch(`/api/leads/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ stage }) });
      const result = await response.json().catch(() => null);
      if (!response.ok) throw new Error(result?.error || "Could not update the inquiry.");
      router.refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Connection lost. Try again."); }
    finally { setBusy(null); }
  }
  async function create(event: React.FormEvent) {
    event.preventDefault(); setBusy("new"); setError(null);
    try {
      const response = await fetch("/api/leads", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(draft) });
      const result = await response.json().catch(() => null);
      if (!response.ok) throw new Error(result?.error || "Could not save this inquiry.");
      setShowForm(false); setDraft({ full_name: "", email: "", phone: "", interest: "Personal Training", notes: "" }); router.refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Connection lost. Try again."); }
    finally { setBusy(null); }
  }
  return <section className="space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-3"><div className="relative min-w-0 flex-1"><Search aria-hidden="true" className="absolute left-3 top-3.5 h-4 w-4 text-cream-faint"/><input type="search" aria-label={contacts ? "Search contacts" : research ? "Search research candidates" : "Search new business inquiries"} className={`${control} w-full pl-10`} placeholder={contacts ? "Search your existing contacts" : "Search this workspace"} value={query} onChange={e => setQuery(e.target.value)}/></div>{!contacts && !research && <button className={`${control} inline-flex items-center gap-2 text-sm font-semibold`} onClick={() => setShowForm(value => !value)}><Plus className="h-4 w-4"/>Add inquiry</button>}</div>
    {error && <p role="alert" className="rounded-xl border border-status-limited/40 bg-white p-4 text-sm text-status-limited">{error}</p>}
    {showForm && <form onSubmit={create} className="space-y-3 rounded-2xl border border-divider bg-white p-5"><h2 className="font-semibold text-cream">New training inquiry</h2><p className="text-sm text-cream-dim">Add someone with a current inquiry or documented referral—not the historical contact list. Saving does not send an invitation.</p><div className="grid gap-3 sm:grid-cols-2"><label className="text-xs font-medium text-cream-dim">Name<input required maxLength={160} className={`${control} mt-1 w-full`} value={draft.full_name} onChange={e => setDraft({ ...draft, full_name: e.target.value })}/></label><label className="text-xs font-medium text-cream-dim">Email<input type="email" className={`${control} mt-1 w-full`} value={draft.email} onChange={e => setDraft({ ...draft, email: e.target.value })}/></label><label className="text-xs font-medium text-cream-dim">Phone<input type="tel" className={`${control} mt-1 w-full`} value={draft.phone} onChange={e => setDraft({ ...draft, phone: e.target.value })}/></label><label className="text-xs font-medium text-cream-dim">Interest<input className={`${control} mt-1 w-full`} value={draft.interest} onChange={e => setDraft({ ...draft, interest: e.target.value })}/></label></div><label className="block text-xs font-medium text-cream-dim">Inquiry or referral context<textarea rows={3} maxLength={4000} className={`${control} mt-1 w-full`} value={draft.notes} onChange={e => setDraft({ ...draft, notes: e.target.value })}/></label><button disabled={busy !== null} className="min-h-11 rounded-xl bg-sky px-5 text-sm font-semibold text-white disabled:opacity-50">{busy === "new" ? "Saving…" : "Save inquiry"}</button></form>}
    <p className="text-xs text-cream-faint">{filtered.length} of {rows.length} {contacts ? "contacts" : research ? "research candidates" : "inquiries"}</p>
    {filtered.length === 0 && <div className="rounded-2xl border border-divider bg-white p-7"><h2 className="font-semibold text-cream">{query ? "No matching records" : contacts ? "No contacts in this view" : research ? "Research queue is clear" : "A fresh pipeline starts here"}</h2><p className="mt-2 max-w-xl text-sm leading-6 text-cream-dim">{contacts ? "Contact history has not been deleted or changed." : research ? "Research candidates need source evidence and owner review. A research match is not proof of interest in training." : "Your older list is preserved under Contacts. New website inquiries, referrals and manually added prospects belong here."}</p></div>}
    <div className="grid gap-3 lg:grid-cols-2">{filtered.map(row => <article key={row.id} className="min-w-0 rounded-2xl border border-divider bg-white p-5 shadow-sm"><div className="flex flex-wrap items-start justify-between gap-2"><h2 className="text-base font-semibold text-cream">{row.full_name}</h2><span className="rounded-full bg-surface px-3 py-1.5 text-xs text-cream-dim">{contacts ? "Contact history" : research ? "Unqualified research" : row.stage.replaceAll("_", " ")}</span></div><p className="mt-2 text-xs text-cream-faint">{sourceLabel(row.source)}</p>{row.interest && <p className="mt-2 text-sm text-cream-dim">{row.interest}</p>}<div className="mt-3 flex flex-col gap-2 text-sm text-cream-dim">{row.email && <a className="break-all underline decoration-divider underline-offset-4" href={`mailto:${row.email}`}>{row.email}</a>}{row.phone && <a href={`tel:${row.phone}`}>{row.phone}</a>}</div>
      {contacts && <p className="mt-3 text-xs leading-5 text-cream-faint">{row.appointments_booked > 0 ? `${row.appointments_booked} historical visits · ` : ""}{row.last_visited ? `Last recorded visit ${row.last_visited}` : "Historical record—not a current buying signal"}</p>}
      {!contacts && !research && <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-divider pt-3"><label htmlFor={`stage-${row.id}`} className="text-xs text-cream-dim">Stage</label><select id={`stage-${row.id}`} className={`${control} flex-1 text-sm`} value={row.stage} disabled={busy !== null} onChange={e => void updateStage(row.id, e.target.value)}>{["new","contacted","nurturing","booked","converted","not_interested"].map(stage => <option key={stage} value={stage}>{stage.replaceAll("_", " ")}</option>)}</select></div>}
      {row.notes && <details className="mt-3 border-t border-divider pt-1"><summary className="cursor-pointer py-3 text-xs font-medium text-cream-dim">{research ? "Evidence & proposed next step" : "Notes & inquiry history"}</summary><p className="whitespace-pre-wrap break-words text-sm leading-6 text-cream-dim">{row.notes}</p></details>}
    </article>)}</div>
  </section>;
}
