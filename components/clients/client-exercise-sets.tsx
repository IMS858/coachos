import Link from "next/link";
import { Dumbbell, Plus, ClipboardCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { allCatalogPages, exerciseSetIds, isExerciseSet } from "@/lib/exercises/catalog";
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
    <div className="border-b border-divider p-5"><h2 className="flex items-center gap-2 text-lg font-semibold text-cream"><Dumbbell className="h-5 w-5 text-sky"/>Programming workspace</h2><p className="mt-1 text-sm text-cream-dim">Two valid starting points. Use the library when you already know what you want to give them; use an assessment when you want the program anchored to current in-gym findings.</p><div className="mt-4 grid gap-3 sm:grid-cols-2"><Link href={`/library?client_id=${clientId}`} className="rounded-2xl border border-sky/25 bg-sky/5 p-4 transition hover:border-sky"><Plus className="h-5 w-5 text-sky"/><p className="mt-2 font-semibold text-cream">Quick program / exercise set</p><p className="mt-1 text-xs leading-5 text-cream-dim">For remote, former or familiar clients. Pick exercises now; no full IMS assessment required.</p></Link><Link href={`/assessments/new?client_id=${clientId}`} className="rounded-2xl border border-divider bg-surface-soft p-4 transition hover:border-sky"><ClipboardCheck className="h-5 w-5 text-sky"/><p className="mt-2 font-semibold text-cream">Assessment-led program</p><p className="mt-1 text-xs leading-5 text-cream-dim">For clients you are assessing in the gym. Capture findings first, then build from that evidence.</p></Link></div></div>
    {failed ? <p role="alert" className="p-5 text-sm text-status-limited">Saved exercise sets could not be loaded. Refresh to retry.</p> : sets.length === 0 ? <p className="p-5 text-sm leading-6 text-cream-dim">Pick exercises from your full IMS database and save them here—warm-ups, mobility blocks, strength selections or a starting point for the next session.</p> : <div className="divide-y divide-divider">{sets.map(set => {
      const ids = exerciseSetIds(set.data);
      const data = isExerciseSet(set.data) ? set.data : {};
      const exercises = Array.isArray(data.exercises) ? data.exercises : [];
      const names = exercises.flatMap(item => item && typeof item === "object" && typeof item.name === "string" ? [item.name] : []);const prescriptions=exercises.flatMap(item=>{if(!item||typeof item!=="object")return [];const x=item as Record<string,unknown>;const details=[x.sets?String(x.sets)+" sets":"",x.reps?String(x.reps)+" reps":"",x.load?String(x.load):"",x.rest_seconds?String(x.rest_seconds)+"s rest":"",x.tempo?String(x.tempo)+" tempo":""].filter(Boolean).join(" · ");return typeof x.name==="string"&&details?[x.name+" — "+details]:[];});
      return <article key={set.id} className="p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="font-semibold text-cream">{set.name}</h3><p className="mt-1 text-xs text-cream-faint">{ids.length} exercises · Coach-only selection</p></div><div className="flex flex-wrap gap-2"><Link href={`/library?collection_id=${set.id}`} className="inline-flex min-h-11 items-center rounded-xl border border-divider px-4 text-sm font-semibold text-sky">Open & edit</Link><ConvertExerciseSetButton setId={set.id} setName={set.name}/></div></div><p className="mt-3 text-sm leading-6 text-cream-dim">{names.slice(0, 6).join(" · ")}{names.length > 6 ? ` · +${names.length - 6} more` : ""}</p>{prescriptions.length>0&&<div className="mt-3 space-y-1 rounded-xl bg-surface-soft p-3">{prescriptions.slice(0,6).map(line=><p key={line} className="text-xs text-cream-dim">{line}</p>)}</div>}{typeof data.note === "string" && data.note && <p className="mt-2 whitespace-pre-wrap text-sm text-cream-dim">{data.note}</p>}</article>;
    })}</div>}
  </section>;
}
