import { AppShell } from "@/components/layout/app-shell";
import { ComingSoon } from "@/components/dashboard/coming-soon";

export default function SchedulePage() {
  return (
    <AppShell>
      <ComingSoon
        title="Schedule"
        description="Multi-trainer week view of every session."
        next={[
          "Week grid: rows = time slots, columns = trainers (Jason / Gabriel / Kara)",
          "Drag-to-reschedule with 12-hour cancel policy enforcement",
          "Color coding by session type (training / assessment / recovery)",
          "Vagaro webhook → Supabase sync (Phase 1) or native Stripe (Phase 2)",
        ]}
      />
    </AppShell>
  );
}
