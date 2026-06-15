import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/layout/app-shell";
import { ProgressReportView } from "@/components/progress/progress-report-view";
import { buildProgressReport } from "@/lib/queries/progress";

export const dynamic = "force-dynamic";

/**
 * /progress — the client's own value report: Top 5 metrics over time.
 */
export default async function ProgressPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/progress");

  const [{ data: assessments }, { data: bodyComp }, { count: sessions }] =
    await Promise.all([
      supabase
        .from("assessments")
        .select("id, assessment_date, data")
        .eq("client_id", user.id)
        .order("assessment_date", { ascending: true }),
      supabase
        .from("body_comp_records")
        .select("recorded_at, weight_lb, body_fat_pct, lean_mass_lb")
        .eq("client_id", user.id)
        .order("recorded_at", { ascending: true }),
      supabase
        .from("sessions")
        .select("*", { count: "exact", head: true })
        .eq("client_id", user.id)
        .eq("status", "completed"),
    ]);

  const report = buildProgressReport(
    assessments ?? [],
    bodyComp ?? [],
    sessions ?? 0
  );

  return (
    <AppShell>
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="text-2xl font-semibold text-cream">My Progress</h1>
          <p className="text-cream-faint text-sm">
            What&apos;s changed since you started at IMS.
          </p>
        </div>
        <ProgressReportView report={report} forClient />
      </div>
    </AppShell>
  );
}
