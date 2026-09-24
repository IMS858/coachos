import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/layout/app-shell";
import { ExerciseDetailActions } from "@/components/library/exercise-detail-actions";
import { ExerciseVideo } from "@/components/library/exercise-video";
export const dynamic = "force-dynamic";
export default async function ExercisePage({ params }: { params: Promise<{ id: string }> }) {
  const { id: slug } = await params;
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) redirect("/login");
  const me = await db.from("profiles").select("role,deleted_at").eq("id", user.id).maybeSingle();
  if (me.error || !me.data || me.data.deleted_at) notFound();
  const isStaff = ["owner", "trainer"].includes(me.data.role);
  const result = await db.from("exercises_with_favorite").select("*").eq("slug", slug).maybeSingle();
  if (result.error) throw new Error("Exercise could not be loaded.");
  const exercise = result.data;
  if (!exercise || (!isStaff && (!exercise.client_visible || exercise.status !== "published"))) notFound();
  if (!isStaff) {
    const review = await createServiceClient().from("exercise_reviews").select("safety_status").eq("exercise_id", exercise.id).maybeSingle();
    if (review.error || review.data?.safety_status !== "approved") notFound();
  }
  let load = "";
  let setup = exercise.setup_notes ?? "";
  try { const metadata = JSON.parse(setup); if (metadata.kind === "ims_capture_v1") { load = typeof metadata.default_load === "string" ? metadata.default_load : ""; setup = ""; } } catch { /* Historical setup is plain text. */ }
  const label = (value: unknown) => typeof value === "string" ? value.replaceAll("_", " ") : "Not set";
  return <AppShell><main className="mx-auto w-full max-w-5xl space-y-5 pb-12">
    <Link href="/library" className="inline-flex min-h-11 items-center font-semibold text-sky">← Exercise Library</Link>
    <header className="rounded-3xl bg-band p-6 text-white"><p className="text-xs uppercase tracking-widest text-white/70">IMS / Exercise detail</p><h1 className="mt-2 text-3xl font-bold">{exercise.ims_label || exercise.name}</h1><p className="mt-2 text-sm text-white/80">{label(exercise.category)} · {label(exercise.level)} · {label(exercise.status)}</p></header>
    <ExerciseDetailActions exerciseId={exercise.id} initialFavorite={!!exercise.is_favorite} slug={exercise.slug} isStaff={isStaff}/>
    {isStaff && exercise.status === "draft" && <p className="rounded-xl border border-divider bg-white p-4 text-sm">Private library draft. Saving does not create a safety approval or enable client visibility.</p>}
    <div className="grid gap-5 lg:grid-cols-[2fr_1fr]"><div className="space-y-5">
      <section className="rounded-2xl border border-divider bg-white p-5"><h2 className="mb-3 text-xl font-semibold">Demonstration</h2>{exercise.video_guid ? <ExerciseVideo exerciseId={exercise.id}/> : <p className="text-sm text-cream-dim">No video attached.</p>}</section>
      <section className="rounded-2xl border border-divider bg-white p-5"><h2 className="text-xl font-semibold">Coaching</h2>{exercise.short_description && <p className="mt-3 whitespace-pre-wrap text-sm leading-6">{exercise.short_description}</p>}{setup && <p className="mt-3 whitespace-pre-wrap text-sm leading-6">{setup}</p>}<ul className="mt-3 space-y-2">{(exercise.coaching_cues ?? []).map((cue: string, i: number) => <li key={i} className="text-sm leading-6">{cue}</li>)}</ul></section>
    </div><aside className="space-y-5"><section className="rounded-2xl border border-divider bg-white p-5"><h2 className="text-xl font-semibold">Default prescription</h2><dl className="mt-4 grid grid-cols-2 gap-3 text-sm"><dt>Sets</dt><dd>{exercise.default_sets ?? "Not set"}</dd><dt>Reps / time</dt><dd>{exercise.default_reps || "Not set"}</dd><dt>Load / RPE</dt><dd>{load || "Set per client"}</dd><dt>Rest</dt><dd>{exercise.default_rest_seconds == null ? "Not set" : `${exercise.default_rest_seconds}s`}</dd><dt>Tempo</dt><dd>{exercise.default_tempo || "Not set"}</dd></dl><p className="mt-4 text-xs leading-5 text-cream-faint">Defaults are starting points, not an individualized prescription.</p></section><section className="rounded-2xl border border-divider bg-white p-5"><h2 className="text-xl font-semibold">Movement context</h2><p className="mt-3 text-sm">{(exercise.primary_joints ?? []).map(label).join(" · ") || "Joints not set"}</p><p className="mt-2 text-sm">{label(exercise.movement_pattern)}</p><p className="mt-2 text-sm">{(exercise.equipment ?? []).map(label).join(" · ") || "Equipment not set"}</p></section></aside></div>
  </main></AppShell>;
}
