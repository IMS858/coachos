import { AppShell } from "@/components/layout/app-shell";
import { ComingSoon } from "@/components/dashboard/coming-soon";

export default function ProgressPage() {
  return (
    <AppShell>
      <ComingSoon
        title="Progress"
        description="What's changed since you started."
        next={[
          "Body composition trend chart (weight, body fat %, lean mass)",
          "Strength markers (deadlift, squat, press 1RMs over time)",
          "Range of motion changes (FRC assessments)",
          "Session adherence streak",
          "Photos timeline (your own only — private)",
        ]}
      />
    </AppShell>
  );
}
