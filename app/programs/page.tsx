import { AppShell } from "@/components/layout/app-shell";
import { ComingSoon } from "@/components/dashboard/coming-soon";

export default function ProgramsPage() {
  return (
    <AppShell>
      <ComingSoon
        title="Programs"
        description="The Plan Review surface — edit generated programs before publishing."
        next={[
          "3-pane editor (week navigator · session detail · coach logic)",
          "Generate via the Python service (calls /api/generate)",
          "Edit-track changes saved to programs.coach_edits",
          "Export PDFs (client / coach / full modes)",
          "Publish → makes program visible to client + creates session series",
        ]}
      />
    </AppShell>
  );
}
