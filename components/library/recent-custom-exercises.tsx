import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
export async function RecentCustomExercises() {
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return null;
  const me = await db.from("profiles").select("role,deleted_at").eq("id", user.id).maybeSingle();
  if (me.error || !me.data || me.data.deleted_at || !["owner", "trainer"].includes(me.data.role)) return null;
  const result = await db.from("exercises").select("id,name,slug,status,default_sets,default_reps,video_guid").contains("tags", ["ims_custom"]).order("created_at", { ascending: false }).order("id").limit(12);
  if (result.error) return <p role="alert" className="rounded-xl border border-divider bg-white p-4 text-sm">Custom exercise drafts could not be loaded. Refresh to retry.</p>;
  if (!result.data?.length) return null;
  return <section className="rounded-2xl border border-divider bg-white p-5"><h2 className="text-xl font-semibold">Your custom exercises</h2><p className="mt-1 text-sm text-cream-dim">Latest 12 captures. These do not change or replace the canonical source catalog below.</p><div className="mt-4 grid gap-3 sm:grid-cols-2">{result.data.map(exercise => <Link key={exercise.id} href={`/library/${exercise.slug}`} className="rounded-xl border border-divider p-4 hover:border-sky"><h3 className="text-lg font-semibold">{exercise.name}</h3><p className="mt-2 text-xs text-cream-dim">{exercise.status} · {exercise.video_guid ? "Demo attached" : "No demo"}{exercise.default_sets != null && exercise.default_reps ? ` · ${exercise.default_sets} × ${exercise.default_reps}` : ""}</p></Link>)}</div></section>;
}
