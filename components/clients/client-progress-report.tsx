import { createServiceClient } from "@/lib/supabase/server";
import { ProgressReportView } from "@/components/progress/progress-report-view";
import { buildProgressReport } from "@/lib/queries/progress";

/**
 * Server component: loads a client's assessments + body comp + session count
 * and renders the progress report on the coach-facing client profile.
 */
export async function ClientProgressReport({
  clientId,
  clientName,
}: {
  clientId: string;
  clientName: string;
}) {
  const svc = createServiceClient();

  const [{ data: assessments }, { data: bodyComp }, { count: sessions }] =
    await Promise.all([
      svc
        .from("assessments")
        .select("id, assessment_date, data")
        .eq("client_id", clientId)
        .order("assessment_date", { ascending: true }),
      svc
        .from("body_comp_records")
        .select("recorded_at, weight_lb, body_fat_pct, lean_mass_lb")
        .eq("client_id", clientId)
        .order("recorded_at", { ascending: true }),
      svc
        .from("sessions")
        .select("*", { count: "exact", head: true })
        .eq("client_id", clientId)
        .eq("status", "completed"),
    ]);

  const report = buildProgressReport(
    assessments ?? [],
    bodyComp ?? [],
    sessions ?? 0
  );

  const hasMeasuredEvidence = report.metrics.some((m) => m.current !== null);
  if (!hasMeasuredEvidence) {
    return (
      <div className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold text-cream">Progress Report</h2>
        <div className="rounded-2xl border border-divider bg-white p-5">
          <p className="font-semibold text-cream">No measured progress evidence yet.</p>
          <p className="mt-2 text-sm leading-6 text-cream-dim">
            No assessment or body-composition measurements are available for this report. Coach OS does not invent a baseline or trend from missing evidence.
          </p>
          <a href={`/assessments?client_id=${clientId}`} className="mt-3 inline-flex min-h-11 items-center text-sm font-semibold text-sky">
            Open assessments →
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold text-cream">Progress Report</h2>
      <ProgressReportView report={report} clientName={clientName} />
    </div>
  );
}
