import { AppShell } from "@/components/layout/app-shell";
import { ComingSoon } from "@/components/dashboard/coming-soon";

export default function ReportsPage() {
  return (
    <AppShell expectedRole="owner">
      <ComingSoon
        title="Reports"
        description="Owner-only business intelligence surface."
        next={[
          "Monthly P&L (revenue, refunds, MRR change, net new members)",
          "Trainer utilization (sessions per trainer per week + capacity)",
          "Churn analysis (cancellations by reason, retention cohorts)",
          "CSV exports (members list, payments register, session history)",
          "Tax-ready summary for end-of-year filings",
        ]}
      />
    </AppShell>
  );
}
