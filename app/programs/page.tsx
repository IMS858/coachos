import { redirect } from "next/navigation";
import Link from "next/link";
import { ChevronRight, Dumbbell, FileText, Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/layout/app-shell";
import { Badge } from "@/components/ui/badge";
import { isExerciseSet } from "@/lib/exercises/catalog";

export const dynamic = "force-dynamic";
const tones: Record<string, "neutral" | "moderate" | "optimal"> = { draft: "moderate", published: "optimal", active: "optimal" };
export default async function ProgramsPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) redirect("/login?next=/programs");
  const profile = await db.from("profiles").select("role,deleted_at").eq("id", user.id).maybeSingle();
  if (profile.error || !profile.data || profile.data.deleted_at || !["owner","trainer"].includes(profile.data.role)) redirect("/dashboard");
  const result = await db.from("programs").select("id,name,status,weeks,client_id,data,created_at").order("created_at", { ascending: false }).limit(1000);
  const programs = (result.data ?? []).filter(program => !isExerciseSet(program.data));
  const ids = [...new Set(programs.map(program => program.client_id))];
  const profiles = ids.length ? await db.from("profiles").select("id,full_name").in("id", ids) : { data: [], error: null };
  const names = new Map((profiles.data ?? []).map(row => [row.id, row.full_name]));
  const filter = (await searchParams).view;
  const shown = programs.filter(program => filter === "draft" ? program.status === "draft" : filter === "published" ? ["published","active","completed"].includes(program.status) : true);
  const actions = "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-divider bg-white px-4 py-2 text-sm font-semibold text-cream";
  return <AppShell><main className="mx-auto flex w-full max-w-6xl flex-col gap-5 pb-12">
    <header className="rounded-3xl bg-band p-6 text-white sm:p-8"><p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/65">IMS / Coaching</p><h1 className="mt-2 text-4xl font-bold">Program Studio</h1><p className="mt-3 max-w-2xl text-sm leading-6 text-white/80">Build around the client. Start with your exercise database or an assessment, then shape the finished program.</p><div className="mt-5 flex flex-wrap gap-3"><Link href="/library" className={actions}><Dumbbell className="h-4 w-4"/>Pick from exercise library</Link><Link href="/assessments" className={actions}><Plus className="h-4 w-4"/>Create from assessment</Link></div></header>
    <nav aria-label="Program filters" className="flex flex-wrap gap-2">{[{href:"/programs",label:"All programs",value:undefined},{href:"/programs?view=draft",label:"Drafts",value:"draft"},{href:"/programs?view=published",label:"Client-visible",value:"published"}].map(tab => <Link key={tab.href} href={tab.href} className={`${actions} ${filter === tab.value ? "ring-1 ring-sky" : ""}`}>{tab.label}</Link>)}</nav>
    <p className="text-sm text-cream-dim">Exercise sets are saved separately on each client&apos;s profile. They are not counted as finished programs.</p>
    <section className="overflow-hidden rounded-2xl border border-divider bg-white shadow-sm" aria-label="Programs">
      {result.error || profiles.error ? <p role="alert" className="p-6 text-sm text-status-limited">Programs could not be loaded. Refresh to retry.</p> : shown.length === 0 ? <div className="p-8"><h2 className="font-semibold text-cream">No programs in this view.</h2><p className="mt-2 text-sm text-cream-dim">Build an exercise set from your library or create a program from an assessment.</p></div> : <div className="divide-y divide-divider">{shown.map(program => <Link key={program.id} href={`/programs/${program.id}`} className="flex min-h-20 items-center justify-between gap-3 p-5 transition hover:bg-surface"><div className="flex min-w-0 items-center gap-3"><FileText className="h-5 w-5 shrink-0 text-sky"/><div className="min-w-0"><h2 className="truncate font-semibold text-cream">{program.name}</h2><p className="mt-1 text-xs text-cream-faint">{names.get(program.client_id) ?? "Client"} · {program.weeks}-week program</p></div></div><div className="flex shrink-0 items-center gap-2"><Badge tone={tones[program.status] ?? "neutral"}>{program.status}</Badge><ChevronRight className="h-4 w-4 text-cream-faint"/></div></Link>)}</div>}
    </section>
    {result.data?.length === 1000 && <p className="text-xs text-cream-faint">This view is limited to the latest 1,000 program records.</p>}
    <details className="rounded-2xl border border-divider px-5"><summary className="cursor-pointer py-4 text-sm text-cream-dim">Publication checks & library management</summary><p className="pb-3 text-sm leading-6 text-cream-dim">Drafts stay private. Exercise identity, contraindications, complete prescriptions and the client-facing plan must pass the existing release checks before publication.</p><Link href="/exercise-reviews" className="mb-4 inline-flex min-h-11 items-center font-semibold text-sky">Open mapping & safety tools →</Link></details>
  </main></AppShell>;
}
