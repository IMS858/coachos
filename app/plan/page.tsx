import { AppShell } from "@/components/layout/app-shell";
import { ComingSoon } from "@/components/dashboard/coming-soon";

export default function PlanPage() {
  return (
    <AppShell>
      <ComingSoon
        title="My Plan"
        description="Your current 4-week training program."
        next={[
          "Week-by-week view of every scheduled session",
          "Tap a session for exercise list with demo videos",
          "Per-exercise notes from your coach",
          "Mark exercises complete + log RPE during/after the session",
        ]}
      />
    </AppShell>
  );
}
