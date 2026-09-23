import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowUpRight, ChevronRight, ClipboardCheck, FileText, Plus, ShieldAlert } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/layout/app-shell";
import { Badge } from "@/components/ui/badge";

export const dynamic = "force-dynamic";

const STATUS_TONE: Record<string, "neutral" | "moderate" | "optimal"> = {
  draft: "moderate",
  published: "optimal",
  active: "optimal",
  completed: "neutral",
  archived: "neutral",
};

type ProgramFilter = "all" | "draft" | "published";
const FILTERS: { value: ProgramFilter; label: string }[] = [
  { value: "all", label: "All programs" },
  { value: "draft", label: "Needs review" },
  { value: "published", label: "Client-visible" },
];

export default async function ProgramsPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/programs");
  const { data: me } = await supabase
    .from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (!me || !["owner", "trainer"].includes(me.role)) redirect("/dashboard");

  const { data: programs, error } = await supabase
    .from("programs")
    .select("id, name, status, weeks, created_at, client_id")
    .order("created_at", { ascending: false });

  const all = programs ?? [];
  const clientIds = Array.from(new Set(all.map((p) => p.client_id).filter(Boolean)));
  let names: Record<string, string> = {};
  if (clientIds.length > 0) {
    const { data: profiles } = await supabase
      .from("profiles").select("id, full_name").in("id", clientIds);
    names = Object.fromEntries((profiles ?? []).map((p) => [p.id, p.full_name]));
  }

  const draft = all.filter((p) => p.status === "draft").length;
  const visible = all.filter((p) => ["published", "active", "completed"].includes(p.status)).length;
  const requested = (await searchParams).view;
  const view: ProgramFilter = requested === "draft" || requested === "published" ? requested : "all";
  const shown = all.filter((p) =>
    view === "all" ? true : view === "draft" ? p.status === "draft"
      : ["published", "active", "completed"].includes(p.status)
  );

  return (
    <AppShell>
      <main className="mx-auto flex w-full max-w-6xl flex-col gap-7 pb-12">
        <header className="relative overflow-hidden rounded-2xl border border-divider bg-navy-soft p-6 sm:p-8">
          <div className="pointer-events-none absolute -right-12 -top-20 h-64 w-64 rounded-full bg-sky/10 blur-3xl" />
          <div className="relative flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
            <div className="max-w-xl">
              <p className="mb-2 text-xs font-semibold uppercase tracking-[0.22em] text-sky">IMS / Coach workspace</p>
              <h1 className="text-3xl font-semibold tracking-tight text-cream sm:text-4xl">Program Studio</h1>
              <p className="mt-3 text-sm leading-6 text-cream-dim">
                From assessment to coach-reviewed programming. Drafts stay private until published.
              </p>
            </div>
            <Link href="/assessments" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-sky px-5 py-3 text-sm font-semibold text-navy transition hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky">
              <Plus className="h-4 w-4" /> New from assessment
            </Link>
          </div>
        </header>

        <section aria-label="Program overview" className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-divider bg-navy-soft/70 p-5">
            <p className="text-xs uppercase tracking-widest text-cream-faint">Total programs</p>
            <p className="mt-3 text-3xl font-semibold tabular-nums text-cream">{all.length}</p>
            <p className="mt-2 text-xs text-cream-faint">All statuses</p>
          </div>
          <div className="rounded-2xl border border-divider bg-navy-soft/70 p-5">
            <div className="flex items-center justify-between">
              <p className="text-xs uppercase tracking-widest text-cream-faint">Needs coach review</p>
              <ClipboardCheck className="h-5 w-5 text-sky" />
            </div>
            <p className="mt-3 text-3xl font-semibold tabular-nums text-cream">{draft}</p>
            <p className="mt-2 text-xs text-cream-faint">Unpublished drafts</p>
          </div>
          <div className="rounded-2xl border border-divider bg-navy-soft/70 p-5">
            <p className="text-xs uppercase tracking-widest text-cream-faint">Client-visible</p>
            <p className="mt-3 text-3xl font-semibold tabular-nums text-cream">{visible}</p>
            <p className="mt-2 text-xs text-cream-faint">Published, active or completed</p>
          </div>
        </section>

        <aside className="flex items-start gap-3 rounded-xl border border-sky/30 bg-sky/5 p-4 text-sm" aria-label="Safety review notice">
          <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-sky" />
          <div>
            <p className="font-semibold text-cream">Safety review before publishing</p>
            <p className="mt-1 leading-6 text-cream-dim">
              Confirm exercise restrictions, unreviewed safety tags, four-week progression and the client PDF.
              A draft status does not certify that an exercise is safe. Only publish after a qualified coach reviews the plan.
            </p>
          </div>
        </aside>

        <section aria-label="Program list" className="overflow-hidden rounded-2xl border border-divider bg-navy-soft/50">
          <div className="flex flex-col gap-4 border-b border-divider px-5 py-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-cream">Programs</h2>
              <p className="mt-1 text-xs text-cream-faint">{shown.length} shown</p>
            </div>
            <nav aria-label="Filter programs" className="flex flex-wrap gap-1 rounded-xl bg-navy p-1">
              {FILTERS.map((filter) => (
                <Link key={filter.value} href={filter.value === "all" ? "/programs" : `/programs?view=${filter.value}`}
                  aria-current={view === filter.value ? "page" : undefined}
                  className={`rounded-lg px-3 py-2 text-xs font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky ${view === filter.value ? "bg-sky text-navy" : "text-cream-dim hover:bg-navy-elev hover:text-cream"}`}>
                  {filter.label}
                </Link>
              ))}
            </nav>
          </div>
          {error ? (
            <div role="alert" className="p-8 text-sm text-status-limited">Programs could not be loaded. Refresh or contact an administrator.</div>
          ) : shown.length > 0 ? (
            <div className="divide-y divide-divider">
              {shown.map((program) => (
                <Link key={program.id} href={`/programs/${program.id}`}
                  className="group flex min-h-20 items-center justify-between gap-3 px-5 py-4 transition hover:bg-navy-elev focus-visible:outline focus-visible:outline-2 focus-visible:outline-inset focus-visible:outline-sky">
                  <div className="flex min-w-0 items-center gap-4">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-sky/10">
                      <FileText className="h-5 w-5 text-sky" />
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-cream">{program.name}</p>
                      <p className="mt-1 truncate text-xs text-cream-faint">
                        {names[program.client_id] ?? "Client"} · {program.weeks}-week program
                      </p>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <Badge tone={STATUS_TONE[program.status] ?? "neutral"}>{program.status}</Badge>
                    <span className="hidden text-xs text-cream-faint sm:inline">{program.status === "draft" ? "Review draft" : "Open program"}</span>
                    <ChevronRight className="h-4 w-4 text-cream-faint transition group-hover:translate-x-0.5" />
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center px-6 py-14 text-center">
              <ClipboardCheck className="mb-4 h-9 w-9 text-sky" />
              <p className="font-medium text-cream">{view === "draft" ? "No drafts awaiting review" : view === "published" ? "No client-visible programs" : "Your program studio is ready"}</p>
              <p className="mt-2 max-w-sm text-sm leading-6 text-cream-faint">
                {view === "all" ? "Complete an assessment to generate your first program." : "Switch filters or start a new program from an assessment."}
              </p>
              <Link href="/assessments" className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-sky hover:underline">Open assessments <ArrowUpRight className="h-4 w-4" /></Link>
            </div>
          )}
        </section>
        <p className="text-xs leading-5 text-cream-faint">Workflow: Assessment → generated draft → coach review and edits → client PDF verification → publish.</p>
      </main>
    </AppShell>
  );
}
