"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, ShieldAlert, CheckCircle2, Save } from "lucide-react";

type Exercise = { id: string; name: string; ims_label: string | null; primary_joints: string[] | null; category: string | null; client_visible: boolean };
type Review = { exercise_id: string; canonical_id: string | null; mapping_status: string; safety_status: string; primary_joints_confirmed: boolean; contraindications_confirmed: boolean; review_notes: string; reviewed_at: string | null };
type Draft = { canonical_id: string; mapping_status: string; safety_status: string; primary_joints_confirmed: boolean; contraindications_confirmed: boolean; review_notes: string };
const defaults: Draft = { canonical_id: "", mapping_status: "unmatched", safety_status: "pending", primary_joints_confirmed: false, contraindications_confirmed: false, review_notes: "" };

export function ExerciseReviewWorkspace({ exercises, reviews }: { exercises: Exercise[]; reviews: Review[] }) {
  const router = useRouter();
  const reviewMap = useMemo(() => new Map(reviews.map(r => [r.exercise_id, r])), [reviews]);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("pending");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(defaults);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const approved = reviews.filter(r => r.safety_status === "approved").length;
  const visible = exercises.filter(e => e.client_visible).length;
  const filtered = exercises.filter(e => {
    const r = reviewMap.get(e.id);
    return (filter === "all" || (filter === "approved" ? r?.safety_status === "approved" : r?.safety_status !== "approved")) &&
      (e.name.toLowerCase().includes(query.toLowerCase()) || (e.ims_label ?? "").toLowerCase().includes(query.toLowerCase()));
  });
  const selected = exercises.find(e => e.id === selectedId);
  function open(e: Exercise) {
    const r = reviewMap.get(e.id);
    setSelectedId(e.id);
    setDraft(r ? { canonical_id: r.canonical_id ?? "", mapping_status: r.mapping_status, safety_status: r.safety_status, primary_joints_confirmed: r.primary_joints_confirmed, contraindications_confirmed: r.contraindications_confirmed, review_notes: r.review_notes } : { ...defaults });
    setMessage("");
  }
  async function save() {
    if (!selectedId) return;
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/exercise-reviews", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ exercise_id: selectedId, ...draft }) });
      const result = await response.json();
      if (!response.ok) { setMessage(result.error || "Review not saved"); return; }
      setMessage("Review saved. Client visibility is unchanged.");
      router.refresh();
    } catch { setMessage("Connection failed. Review was not saved."); }
    finally { setBusy(false); }
  }
  return <div className="space-y-5">
    <section className="grid grid-cols-2 gap-3 sm:grid-cols-4" aria-label="Review totals">
      {[[exercises.length,"Library entries"],[approved,"Coach approved"],[exercises.length-approved,"Not approved"],[visible,"Client visible"]].map(([n,label]) =>
        <div key={label} className="rounded-xl border border-divider bg-navy-soft p-4"><p className="text-2xl font-semibold text-cream">{n}</p><p className="mt-1 text-xs text-cream-dim">{label}</p></div>)}
    </section>
    <div className="rounded-xl border border-sky/30 bg-sky/5 p-4 text-sm text-cream-dim"><ShieldAlert className="mr-2 inline h-4 w-4 text-sky"/> This workspace reviews Coach OS library entries. The 423 canonical source IDs and 604 generator entries are not yet automatically mapped. Similar names are not safety approval.</div>
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(320px,420px)]">
      <section className="overflow-hidden rounded-2xl border border-divider bg-navy-soft/50">
        <div className="space-y-3 border-b border-divider p-4">
          <label className="flex items-center gap-2 rounded-lg border border-divider bg-navy px-3"><Search className="h-4 w-4 text-cream-dim"/><input aria-label="Search exercises" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search exercise library" className="min-h-11 w-full bg-transparent text-sm text-cream outline-none placeholder:text-cream-faint"/></label>
          <div className="flex gap-2">{[["pending","Needs review"],["approved","Approved"],["all","All"]].map(([value,label])=><button key={value} type="button" onClick={()=>setFilter(value)} aria-pressed={filter===value} className={`rounded-lg px-3 py-2 text-xs font-semibold ${filter===value?"bg-sky text-navy":"bg-navy text-cream-dim"}`}>{label}</button>)}</div>
          <p className="text-xs text-cream-faint">{filtered.length} results</p>
        </div>
        <div className="max-h-[620px] divide-y divide-divider overflow-auto">
          {filtered.map(e=>{const r=reviewMap.get(e.id);return <button type="button" key={e.id} onClick={()=>open(e)} aria-pressed={selectedId===e.id} className={`flex w-full items-center justify-between gap-3 p-4 text-left hover:bg-navy-elev ${selectedId===e.id?"bg-sky/10":""}`}><div><p className="text-sm font-semibold text-cream">{e.ims_label||e.name}</p><p className="mt-1 text-xs text-cream-faint">{e.primary_joints?.join(" · ")||"Primary joints missing"} · {r?.canonical_id||"No canonical ID confirmed"}</p></div><span className={`shrink-0 text-xs ${r?.safety_status==="approved"?"text-status-optimal":"text-cream-faint"}`}>{r?.safety_status==="approved"?"Approved":"Review"}</span></button>})}
          {filtered.length===0&&<p className="p-6 text-sm text-cream-dim">No matching exercises.</p>}
        </div>
      </section>
      <section className="h-fit rounded-2xl border border-divider bg-navy-soft p-5 lg:sticky lg:top-5" aria-label="Exercise review editor">
        {!selected?<p className="text-sm text-cream-dim">Select an exercise to review its mapping and safety metadata.</p>:<div className="space-y-4">
          <div><h2 className="text-lg font-semibold text-cream">{selected.name}</h2><p className="mt-1 text-xs text-cream-faint">Primary joints: {selected.primary_joints?.join(", ")||"Not tagged"}</p></div>
          <label className="block text-xs text-cream-dim">Verified canonical ID<input value={draft.canonical_id} onChange={e=>setDraft({...draft,canonical_id:e.target.value})} placeholder="EX-0001" className="mt-2 min-h-11 w-full rounded-lg border border-divider bg-navy px-3 text-sm text-cream"/></label>
          <label className="block text-xs text-cream-dim">Identity mapping<select value={draft.mapping_status} onChange={e=>setDraft({...draft,mapping_status:e.target.value})} className="mt-2 min-h-11 w-full rounded-lg border border-divider bg-navy px-3 text-sm text-cream"><option value="unmatched">Unmatched</option><option value="exact_normalized">Exact name verified</option><option value="coach_confirmed">Coach confirmed mapping</option><option value="rejected">Rejected</option></select></label>
          <label className="flex items-start gap-3 text-sm text-cream-dim"><input type="checkbox" checked={draft.primary_joints_confirmed} onChange={e=>setDraft({...draft,primary_joints_confirmed:e.target.checked})} className="mt-1"/> I verified the primary joint tags against the actual movement.</label>
          <label className="flex items-start gap-3 text-sm text-cream-dim"><input type="checkbox" checked={draft.contraindications_confirmed} onChange={e=>setDraft({...draft,contraindications_confirmed:e.target.checked})} className="mt-1"/> I reviewed contraindications and client restrictions.</label>
          <label className="block text-xs text-cream-dim">Review rationale<textarea value={draft.review_notes} onChange={e=>setDraft({...draft,review_notes:e.target.value})} rows={4} maxLength={3000} placeholder="Document the mapping, restrictions and decision." className="mt-2 w-full rounded-lg border border-divider bg-navy p-3 text-sm text-cream"/></label>
          <label className="block text-xs text-cream-dim">Safety decision<select value={draft.safety_status} onChange={e=>setDraft({...draft,safety_status:e.target.value})} className="mt-2 min-h-11 w-full rounded-lg border border-divider bg-navy px-3 text-sm text-cream"><option value="pending">Pending</option><option value="approved">Approve after verification</option><option value="rejected">Reject</option></select></label>
          <p className="text-xs leading-5 text-cream-faint">Approval requires confirmed identity, populated primary joints, both verification checks and at least 15 characters of rationale. It does not publish to clients.</p>
          <button type="button" disabled={busy} onClick={save} className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-sky px-4 font-semibold text-navy disabled:opacity-50">{draft.safety_status==="approved"?<CheckCircle2 className="h-4 w-4"/>:<Save className="h-4 w-4"/>}{busy?"Saving…":"Save coach review"}</button>
          {message&&<p role="status" className="text-sm text-cream-dim">{message}</p>}
        </div>}
      </section>
    </div>
  </div>;
}
