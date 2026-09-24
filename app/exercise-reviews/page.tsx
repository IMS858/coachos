import { redirect } from "next/navigation";
import Link from "next/link";
import { ShieldCheck, ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/layout/app-shell";
import { ExerciseReviewWorkspace } from "@/components/exercises/exercise-review-workspace";

export const dynamic = "force-dynamic";

export default async function ExerciseReviewsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/exercise-reviews");
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (!profile || !["owner", "trainer"].includes(profile.role)) redirect("/dashboard");
  const [{ data: exercises, error: exerciseError }, { data: reviews, error: reviewError }] = await Promise.all([
    supabase.from("exercises").select("id,name,ims_label,primary_joints,category,client_visible").order("name").limit(1000),
    supabase.from("exercise_reviews").select("exercise_id,canonical_id,mapping_status,safety_status,primary_joints_confirmed,contraindications_confirmed,review_notes,reviewed_at").limit(1000),
  ]);
  return <AppShell>
    <main className="mx-auto w-full max-w-6xl space-y-6 pb-16">
      <Link href="/programs" className="inline-flex items-center gap-2 text-sm text-cream-dim hover:text-cream"><ArrowLeft className="h-4 w-4"/> Program Studio</Link>
      <header className="rounded-2xl border border-divider bg-navy-soft p-6 sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-[.2em] text-sky">IMS / Safety & quality</p>
        <h1 className="mt-3 flex items-center gap-3 text-3xl font-semibold text-cream"><ShieldCheck className="h-8 w-8 text-sky"/> Coach Review Center</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-cream-dim">Verify exercise identity, primary joints and contraindications. Approval records are attributed to your account. Approval never automatically publishes an exercise or client program.</p>
      </header>
      <Link href="/exercise-reviews/catalog" className="inline-flex min-h-11 items-center rounded-xl border border-sky/40 px-5 text-sm font-semibold text-sky hover:bg-sky/10">Owner catalog dashboard →</Link>
      <Link href="/exercise-reviews/canonical" className="inline-flex min-h-11 items-center rounded-xl border border-sky/40 px-5 text-sm font-semibold text-sky hover:bg-sky/10">Review 423 canonical source mappings →</Link>
      {exerciseError || reviewError ? <div role="alert" className="rounded-xl border border-status-limited p-5 text-status-limited">Unable to load review records. No approvals can be recorded until the connection is restored.</div>
        : <ExerciseReviewWorkspace exercises={exercises ?? []} reviews={reviews ?? []}/>}
    </main>
  </AppShell>;
}
