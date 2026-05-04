import { AppShell } from "@/components/layout/app-shell";
import { ComingSoon } from "@/components/dashboard/coming-soon";

export default function AssessmentsPage() {
  return (
    <AppShell>
      <ComingSoon
        title="Assessments"
        description="The 10-step Coach OS assessment wizard."
        next={[
          "Port the existing wizard from /coach-os DELIVERABLES_REDESIGN.md",
          "Persistent client snapshot header + stepper + sticky action bar",
          "Live summary panel with section status (complete/partial/skipped)",
          "Save-as-you-go to assessments.data (preserves Python contract)",
          "Generate Program button → calls /api/generate → creates draft program",
        ]}
      />
    </AppShell>
  );
}
