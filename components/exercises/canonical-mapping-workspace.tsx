"use client";
import {useMemo,useState} from "react";
import {useRouter} from "next/navigation";
import Link from "next/link";

type Canonical={canonical_id:string;canonical_name:string;source_status:string;source_confidence:string;source_primary_joints:string;mapping_status:string;matched_exercise_id:string|null;review_notes:string;review_priority:number;review_priority_reason:string;exact_candidate_id:string|null;exact_candidate_name:string|null;exact_candidate_count:number;safety_data_gap:string};
type Exercise={id:string;name:string;ims_label:string|null;primary_joints:string[]|null};
export function CanonicalMappingWorkspace({rows,exercises}:{rows:Canonical[];exercises:Exercise[]}) {
 const router=useRouter();
 const [search,setSearch]=useState("");
 const [priority,setPriority]=useState(1);
 const [selected,setSelected]=useState<Canonical|null>(null);
 const [candidate,setCandidate]=useState("");
 const [candidateSearch,setCandidateSearch]=useState("");
 const [notes,setNotes]=useState("");
 const [busy,setBusy]=useState(false);
 const [message,setMessage]=useState("");
 const matched=rows.filter(r=>r.mapping_status==="coach_confirmed").length;
 const filtered=rows.filter(r=>r.review_priority===priority&&(r.canonical_name+" "+r.canonical_id).toLowerCase().includes(search.toLowerCase())).sort((a,b)=>Number(a.mapping_status==="coach_confirmed")-Number(b.mapping_status==="coach_confirmed")||b.exact_candidate_count-a.exact_candidate_count||a.canonical_id.localeCompare(b.canonical_id));
 const suggestions=useMemo(()=>{if(!selected)return [];let q=selected.canonical_name.toLowerCase().trim();let tokens=q.split(/\s+/).filter(t=>t.length>2);return exercises.map(e=>({e,score:(e.name.toLowerCase()===q?100:0)+tokens.filter(t=>e.name.toLowerCase().includes(t)).length})).filter(x=>x.score>0).sort((a,b)=>b.score-a.score).slice(0,12).map(x=>x.e)},[selected,exercises]);
 const options=candidateSearch.trim()?exercises.filter(e=>(e.name+" "+(e.ims_label??"")).toLowerCase().includes(candidateSearch.toLowerCase())).slice(0,30):suggestions;
 async function save(){if(!selected||!candidate)return;setBusy(true);setMessage("");try{let res=await fetch("/api/exercise-reviews/canonical",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({canonical_id:selected.canonical_id,exercise_id:candidate,review_notes:notes})});let data=await res.json();if(!res.ok){setMessage(data.error||"Unable to save");return;}setMessage("Mapping saved. Safety approval remains separate.");router.refresh();}catch{setMessage("Connection error. No mapping saved.")}finally{setBusy(false)}}
 return <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(320px,420px)]">
  <section className="overflow-hidden rounded-2xl border border-divider bg-navy-soft">
   <div className="space-y-3 border-b border-divider p-4"><div className="grid grid-cols-3 gap-2">{[1,2,3].map(p=><button type="button" key={p} onClick={()=>{setPriority(p);setSelected(null)}} aria-pressed={priority===p} className={`rounded-lg border px-2 py-2 text-xs ${priority===p?"border-sky bg-sky/10 text-sky":"border-divider text-cream-dim"}`}>Wave {p} · {rows.filter(r=>r.review_priority===p).length}</button>)}</div><p className="text-sm text-cream-dim">{matched} of {rows.length} coach-confirmed canonical mappings. Unconfirmed entries cannot receive safety approval.</p><input aria-label="Search canonical exercises" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search canonical ID or exercise" className="min-h-11 w-full rounded-lg border border-divider bg-navy px-3 text-sm text-cream"/></div>
   <div className="max-h-[650px] divide-y divide-divider overflow-auto">{filtered.map(r=><button key={r.canonical_id} type="button" onClick={()=>{setSelected(r);setCandidate(r.matched_exercise_id??r.exact_candidate_id??"");setCandidateSearch("");setNotes(r.review_notes);setMessage("")}} aria-pressed={selected?.canonical_id===r.canonical_id} className="flex w-full items-center justify-between gap-3 p-4 text-left hover:bg-navy-elev"><div><p className="text-sm font-semibold text-cream">{r.canonical_name}</p><p className="mt-1 text-xs text-cream-faint">{r.canonical_id} · {r.exact_candidate_count===1?"Exact-name suggestion":r.exact_candidate_count>1?"Ambiguous names":"Manual search needed"}</p></div><span className={`shrink-0 text-xs ${r.mapping_status==="coach_confirmed"?"text-sky":"text-cream-faint"}`}>{r.mapping_status==="coach_confirmed"?"Confirmed":"Pending"}</span></button>)}</div>
  </section>
  <section className="h-fit space-y-4 rounded-2xl border border-divider bg-navy-soft p-5 lg:sticky lg:top-5">{!selected?<p className="text-sm text-cream-dim">Select a canonical source exercise to confirm its matching library entry.</p>:<>
   <div><h2 className="text-lg font-semibold text-cream">{selected.canonical_name}</h2><p className="mt-1 text-xs text-cream-faint">{selected.canonical_id} · {selected.source_status}</p><p className="mt-2 text-xs text-cream-dim">{selected.source_confidence}</p><p className="mt-2 rounded-lg border border-divider p-2 text-xs text-sky">{selected.review_priority_reason} · {selected.exact_candidate_count===1?"One exact-name candidate (not yet confirmed)":selected.exact_candidate_count===0?"No exact-name candidate":"Multiple exact-name candidates"} · {selected.safety_data_gap||"Safety data must be verified"}</p><p className="mt-2 text-xs text-cream-dim">{selected.review_priority_reason}</p><p role="note" className="mt-2 rounded-lg border border-divider p-3 text-xs text-cream-dim">Safety review gaps: {selected.safety_data_gap||"No source gaps flagged; coach verification still required."}</p>{selected.exact_candidate_name&&<p className="mt-2 text-xs text-sky">Exact-name candidate: {selected.exact_candidate_name} (not approved)</p>}</div>
   <p className="text-xs text-cream-dim">Suggestions are name-based only and are never automatic identity or safety approvals.</p>
   <label className="block text-xs text-cream-dim">Search all 604 library entries<input value={candidateSearch} onChange={e=>setCandidateSearch(e.target.value)} placeholder="Search by exercise name" className="mt-2 min-h-11 w-full rounded-lg border border-divider bg-navy px-3 text-sm text-cream"/></label>
   <label className="block text-xs text-cream-dim">Library match<select value={candidate} onChange={e=>setCandidate(e.target.value)} className="mt-2 min-h-11 w-full rounded-lg border border-divider bg-navy px-3 text-sm text-cream"><option value="">Choose verified match</option>{options.map(e=><option key={e.id} value={e.id}>{e.name}</option>)}{candidate&&!options.some(e=>e.id===candidate)&&<option value={candidate}>Existing mapped exercise</option>}</select></label>
   <Link href="/exercise-reviews" className="block text-xs text-sky underline">Inspect full exercise library and safety metadata</Link>
   <label className="block text-xs text-cream-dim">Identity verification rationale<textarea value={notes} onChange={e=>setNotes(e.target.value)} rows={4} maxLength={3000} placeholder="Explain how you verified these are the same exercise." className="mt-2 w-full rounded-lg border border-divider bg-navy p-3 text-sm text-cream"/></label>
   <button type="button" disabled={busy||!candidate||notes.trim().length<15} onClick={save} className="min-h-11 w-full rounded-lg bg-sky px-4 text-sm font-semibold text-navy disabled:opacity-40">{busy?"Saving…":"Confirm identity mapping"}</button>
   {message&&<p role="status" className="text-xs text-cream-dim">{message}</p>}
  </>}</section>
 </div>;
}
