import Link from "next/link";
import {redirect} from "next/navigation";
import {createClient} from "@/lib/supabase/server";
import {AppShell} from "@/components/layout/app-shell";

export const dynamic = "force-dynamic";

export default async function ExerciseCatalogDashboard() {
  const supabase = await createClient();
  const {data: {user}} = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/exercise-reviews/catalog");
  const {data: profile} = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (profile?.role !== "owner") redirect("/exercise-reviews");

  const [queue, library, review, attestation] = await Promise.all([
    supabase.from("canonical_exercise_queue").select("canonical_id,canonical_name,category,review_priority,review_priority_reason,mapping_status,exact_candidate_count,safety_data_gap").order("review_priority").order("canonical_id").limit(1000),
    supabase.from("exercises").select("id,client_visible,primary_joints").limit(1000),
    supabase.from("exercise_reviews").select("exercise_id,safety_status").limit(1000),
    supabase.from("exercise_catalog_attestations").select("reviewed_count,reviewed_at").eq("reviewed_by",user.id).order("reviewed_at",{ascending:false}).limit(1).maybeSingle(),
  ]);
  if (queue.error || library.error || review.error || attestation.error) {
    return <AppShell><main className="mx-auto max-w-6xl space-y-6 pb-16"><h1 className="text-3xl font-semibold text-cream">Exercise Catalog</h1><p role="alert" className="rounded-xl border border-status-limited p-5 text-status-limited">Catalog audit unavailable. No approvals or publication settings were changed.</p><Link href="/exercise-reviews" className="text-sky underline">Back to reviews</Link></main></AppShell>;
  }

  const rows = queue.data ?? [];
  const exercises = library.data ?? [];
  const reviews = review.data ?? [];
  const mapped = rows.filter(row => row.mapping_status === "coach_confirmed");
  const pending = rows.filter(row => row.mapping_status !== "coach_confirmed");
  const uniqueExact = pending.filter(row => row.exact_candidate_count === 1);
  const gaps = pending.filter(row => row.safety_data_gap);
  const reviewedSafety = reviews.filter(row => row.safety_status === "approved").length;
  const visible = exercises.filter(row => row.client_visible).length;
  const missingJoints = exercises.filter(row => !Array.isArray(row.primary_joints) || row.primary_joints.length === 0).length;
  const reviewedCount = attestation.data?.reviewed_count ?? 0;
  const cards = [
    {label:"Canonical source names",value:rows.length,detail:`${reviewedCount} owner-attested`},
    {label:"Verified identity mappings",value:mapped.length,detail:`${pending.length} awaiting verified mapping`},
    {label:"Library entries",value:exercises.length,detail:`${missingJoints} missing primary joints`},
    {label:"Exercise safety review records",value:reviewedSafety,detail:"Separate from source catalog attestation"},
  ];

  return <AppShell><main className="mx-auto max-w-6xl space-y-6 pb-16">
    <Link href="/exercise-reviews" className="text-sm text-sky underline">← Coach Review Center</Link>
    <header className="rounded-2xl border border-divider bg-navy-soft p-6">
      <p className="text-xs uppercase tracking-widest text-sky">IMS / Owner workspace</p>
      <h1 className="mt-2 text-3xl font-semibold text-cream">Exercise catalog readiness</h1>
      <p className="mt-3 max-w-3xl text-sm leading-6 text-cream-dim">Live counts from your exercise database. Your source catalog acknowledgment, verified identity mappings, exercise-specific safety reviews, and client publication are tracked independently.</p>
    </header>
    <section aria-label="Catalog metrics" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {cards.map(card => <div key={card.label} className="rounded-xl border border-divider bg-navy-soft p-5">
        <p className="text-xs uppercase tracking-wider text-cream-dim">{card.label}</p>
        <p className="mt-2 text-3xl font-semibold text-cream">{card.value}</p>
        <p className="mt-2 text-sm text-cream-dim">{card.detail}</p>
      </div>)}
    </section>
    <section className="rounded-xl border border-divider bg-navy-soft p-5">
      <h2 className="text-xl font-semibold text-cream">What needs attention</h2>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <p className="rounded-lg border border-divider p-4 text-sm text-cream"><strong>{uniqueExact.length}</strong> pending unique exact-name matches</p>
        <p className="rounded-lg border border-divider p-4 text-sm text-cream"><strong>{gaps.length}</strong> pending source rows with flagged safety metadata gaps</p>
        <p className="rounded-lg border border-divider p-4 text-sm text-cream"><strong>{missingJoints}</strong> library entries without primary-joint metadata</p>
        <p className="rounded-lg border border-divider p-4 text-sm text-cream"><strong>{visible}</strong> exercises currently visible to clients</p>
      </div>
      <div className="mt-5 flex flex-wrap gap-3">
        <Link href="/exercise-reviews/canonical" className="inline-flex min-h-11 items-center rounded-xl bg-sky px-5 font-semibold text-navy">Open mapping workspace →</Link>
        <Link href="/exercise-reviews" className="inline-flex min-h-11 items-center rounded-xl border border-divider px-5 text-cream">Exercise safety reviews →</Link>
      </div>
    </section>
    <section className="rounded-xl border border-divider bg-navy-soft p-5">
      <h2 className="text-xl font-semibold text-cream">Next unmatched exercises</h2>
      <p className="mt-1 text-sm text-cream-dim">First 20 in existing review-priority order. This list does not automatically approve or import any exercise.</p>
      {pending.length === 0 ? <p className="mt-4 text-cream">All source identities are matched.</p> : <ul className="mt-4 divide-y divide-divider">
        {pending.slice(0,20).map(row => <li key={row.canonical_id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
          <div><p className="font-medium text-cream">{row.canonical_name}</p><p className="text-xs text-cream-dim">{row.category ?? "Uncategorized"} · {row.canonical_id}</p></div>
          <span className="rounded-full border border-divider px-3 py-1 text-xs text-cream-dim">{row.exact_candidate_count === 1 ? "Unique exact candidate" : "Needs identity match"}</span>
        </li>)}
      </ul>}
    </section>
    <p className="text-xs text-cream-dim">Source attestation does not itself verify exercise-specific contraindications or turn on client publication. No changes are made by viewing this page.</p>
  </main></AppShell>;
}
