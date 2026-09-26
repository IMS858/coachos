import Link from "next/link";
import { Dumbbell, Plus, ClipboardCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { allCatalogPages, exerciseSetIds, isExerciseSet } from "@/lib/exercises/catalog";
import { savedPrescriptions, prescriptionSummary } from "@/lib/exercises/prescription";
import { ConvertExerciseSetButton } from "@/components/clients/convert-exercise-set-button";

export async function ClientExerciseSets({ clientId }: { clientId: string }) {
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return null;
  const { data: profile, error } = await db.from("profiles").select("role,deleted_at").eq("id", user.id).maybeSingle();
  if (error || !profile || profile.deleted_at || !["owner", "trainer"].includes(profile.role)) return null;
  let failed = false;
  let sets: { id: string; name: string; data: unknown; updated_at: string }[] = [];
  try {
    sets = await allCatalogPages((from, to) => db.from("programs").select("id,name,data,updated_at", { count: "exact" })
      .eq("client_id", clientId).eq("status", "draft").eq("data->>source", "ims_exercise_set")
      .order("updated_at", { ascending: false }).order("id").range(from, to));
  } catch { failed = true; }
  return <section id="exercise-sets" className="scroll-mt-24 overflow-hidden rounded-2xl border border-divider bg-white shadow-sm" aria-label="Client exercise sets">
    <div className="border-b border-divider p-5"><h2 className="flex items-center gap-2 text-lg font-semibold text-cream"><Dumbbell className="h-5 w-5 text-sky"/>Programming workspace</h2><p className="mt-1 text-sm text-cream-dim">Two valid starting points. Select and prescribe directly when you know the client; use an assessment when you want programming anchored to current in-gym findings.</p><div className="mt-4 grid gap-3 sm:grid-cols-2"><Link href={`/library?client_id=${clientId}`} className="rounded-2xl border border-sky/25 bg-sky/5 p-4 transition hover:border-sky"><Plus className="h-5 w-5 text-sky"/><p className="mt-2 font-semibold text-cream">Quick Programming</p><p className="mt-1 text-xs leading-5 text-cream-dim">Pick exercises and add sets, reps, load, RPE, rest, tempo and cues. No full IMS assessment required.</p></Link><Link href={`/assessments/new?client_id=${clientId}`} className="rounded-2xl border border-divider bg-surface-soft p-4 transition hover:border-sky"><ClipboardCheck className="h-5 w-5 text-sky"/><p className="mt-2 font-semibold text-cream">Assessment-led program</p><p className="mt-1 text-xs leading-5 text-cream-dim">Capture findings first, then build from that evidence.</p></Link></div></div>
    {failed ? <p role="alert" className="p-5 text-sm text-status-limited">Saved exercise sets could not be loaded. Refresh to retry.</p> : sets.length === 0 ? <p className="p-5 text-sm leading-6 text-cream-dim">Pick exercises from your IMS database and save private prescriptions here for the next session.</p> : <div className="divide-y divide-divider">{sets.map(set => {
      const ids = exerciseSetIds(set.data), data = isExerciseSet(set.data) ? set.data : {};
      const exercises = Array.isArray(data.exercises) ? data.exercises : [];
      const names = new Map<string,string>();
      for (const item of exercises) if (item && typeof item === "object" && typeof item.canonical_id === "string" && typeof item.name === "string") names.set(item.canonical_id,item.name);
      let doseError = false, details: {id:string;name:string;summary:string;cue:string}[] = [];
      try { const saved = savedPrescriptions(data); details = ids.map(id => ({id,name:names.get(id)??id,summary:prescriptionSummary(saved[id]),cue:saved[id]?.cue??""})); }
      catch { doseError = true; }
      return <article key={set.id} className="p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="font-semibold text-cream">{set.name}</h3><p className="mt-1 text-xs text-cream-faint">{ids.length} exercises · Coach-only draft</p></div><div className="flex flex-wrap gap-2"><Link href={`/library?collection_id=${set.id}`} className="inline-flex min-h-11 items-center rounded-xl border border-divider px-4 text-sm font-semibold text-sky">Open & edit</Link><ConvertExerciseSetButton setId={set.id} setName={set.name}/></div></div>
        {doseError ? <p role="alert" className="mt-3 text-sm text-status-limited">Saved prescription data needs review. It has not been replaced with defaults.</p> : <div className="mt-3 space-y-3 rounded-xl bg-surface-soft p-3">{details.slice(0,6).map(row => <div key={row.id}><p className="text-sm font-semibold text-cream">{row.name}</p><p className="mt-1 text-xs text-cream-dim">{row.summary || "Prescription not entered yet"}</p>{row.cue && <p className="mt-1 whitespace-pre-wrap text-xs text-cream-dim">Cue: {row.cue}</p>}</div>)}{details.length>6 && <p className="text-xs text-cream-faint">+{details.length-6} more exercises · open to view all</p>}</div>}
        {typeof data.note === "string" && data.note && <p className="mt-2 whitespace-pre-wrap text-sm text-cream-dim">{data.note}</p>}
      </article>;
    })}</div>}
  </section>;
}
