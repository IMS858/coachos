import Link from "next/link";
import { Dumbbell, Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { allCatalogPages, exerciseSetIds, isExerciseSet } from "@/lib/exercises/catalog";

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
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-divider p-5"><div><h2 className="flex items-center gap-2 text-lg font-semibold text-cream"><Dumbbell className="h-5 w-5 text-sky"/>Exercise sets</h2><p className="mt-1 text-sm text-cream-dim">Your saved exercise selections for this client. Private coaching drafts, separate from published programs.</p></div><Link href={`/library?client_id=${clientId}`} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-sky px-4 py-2 text-sm font-semibold text-white"><Plus className="h-4 w-4"/>Add from library</Link></div>
    {failed ? <p role="alert" className="p-5 text-sm text-status-limited">Saved exercise sets could not be loaded. Refresh to retry.</p> : sets.length === 0 ? <p className="p-5 text-sm leading-6 text-cream-dim">Pick exercises from your full IMS database and save them here—warm-ups, mobility blocks, strength selections or a starting point for the next session.</p> : <div className="divide-y divide-divider">{sets.map(set => {
      const ids = exerciseSetIds(set.data);
      const data = isExerciseSet(set.data) ? set.data : {};
      const exercises = Array.isArray(data.exercises) ? data.exercises : [];
      const names = exercises.flatMap(item => item && typeof item === "object" && typeof item.name === "string" ? [item.name] : []);
      return <article key={set.id} className="p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="font-semibold text-cream">{set.name}</h3><p className="mt-1 text-xs text-cream-faint">{ids.length} exercises · Coach-only selection</p></div><Link href={`/library?collection_id=${set.id}`} className="inline-flex min-h-11 items-center rounded-xl border border-divider px-4 text-sm font-semibold text-sky">Open & edit</Link></div><p className="mt-3 text-sm leading-6 text-cream-dim">{names.slice(0, 6).join(" · ")}{names.length > 6 ? ` · +${names.length - 6} more` : ""}</p>{typeof data.note === "string" && data.note && <p className="mt-2 whitespace-pre-wrap text-sm text-cream-dim">{data.note}</p>}</article>;
    })}</div>}
  </section>;
}
