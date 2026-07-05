import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { createServiceClient } from "@/lib/supabase/server";
import { getFinancialSnapshot } from "@/lib/queries/financials";
import { PrintButton } from "@/components/reports/print-button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function FinancialsReportPage() {
  const svc = createServiceClient();
  const f = await getFinancialSnapshot(svc);

  const monthLabel = new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
  });

  const rows: { label: string; value: number; muted?: boolean }[] = [
    { label: "Membership MRR (recurring)", value: f.membershipMrrCents },
    { label: "Renter rent (recurring)", value: f.renterRentCents },
    { label: "Package revenue earned this month", value: f.packageEarnedThisMonthCents },
  ];

  return (
    <AppShell expectedRole="owner">
      <div className="max-w-2xl mx-auto py-6 print-area">
        <div className="flex items-center justify-between mb-4 no-print">
          <Link href="/reports" className="text-sm text-cream-faint hover:text-cream flex items-center gap-1">
            <ArrowLeft className="h-4 w-4" /> Reports
          </Link>
          <PrintButton label="Print / Save PDF" />
        </div>

        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-cream">Monthly Revenue</h1>
            <p className="text-sm text-cream-faint">
              Innovative Movement Solutions · {monthLabel}
            </p>
          </div>
        </div>

        <Card className="mb-4">
          <CardHeader>
            <CardTitle className="text-base">Revenue Breakdown</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {rows.map((r) => (
              <div key={r.label} className="flex justify-between text-sm border-b border-divider/40 pb-2 last:border-0">
                <span className="text-cream-dim">{r.label}</span>
                <span className="text-cream font-medium">{formatCurrency(r.value)}</span>
              </div>
            ))}
            <div className="flex justify-between text-base pt-2 mt-1 border-t border-divider">
              <span className="text-cream font-semibold">Total monthly revenue</span>
              <span className="text-sky font-semibold">
                {formatCurrency(f.totalMonthlyRevenueCents)}
              </span>
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-2 gap-3 mb-4">
          <Card>
            <CardContent className="py-4">
              <div className="text-xs text-cream-faint">Recurring (MRR)</div>
              <div className="text-xl text-cream font-semibold">
                {formatCurrency(f.recurringMonthlyCents)}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-4">
              <div className="text-xs text-cream-faint">Packages sold this month</div>
              <div className="text-xl text-cream font-semibold">
                {formatCurrency(f.packageBookedThisMonthCents)}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-4">
              <div className="text-xs text-cream-faint">Sessions this month</div>
              <div className="text-xl text-cream font-semibold">{f.sessionsThisMonth}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-4">
              <div className="text-xs text-cream-faint">Sessions this week</div>
              <div className="text-xl text-cream font-semibold">{f.sessionsThisWeek}</div>
            </CardContent>
          </Card>
        </div>

        <div className="mt-6 text-xs text-cream-faint text-center">
          Generated {new Date().toLocaleDateString()} · Confidential
        </div>
      </div>
    </AppShell>
  );
}
