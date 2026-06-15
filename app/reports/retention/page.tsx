import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";

export const dynamic = "force-dynamic";

import { createServiceClient } from "@/lib/supabase/server";
import { getRetentionSnapshot } from "@/lib/queries/reports-extra";
import { PrintButton } from "@/components/reports/print-button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function RetentionReportPage() {
  const svc = createServiceClient();
  const r = await getRetentionSnapshot(svc);

  return (
    <AppShell expectedRole="owner">
      <div className="max-w-2xl mx-auto py-6 print-area">
        <div className="flex items-center justify-between mb-4 no-print">
          <Link href="/reports" className="text-sm text-cream-faint hover:text-cream flex items-center gap-1">
            <ArrowLeft className="h-4 w-4" /> Reports
          </Link>
          <PrintButton label="Print / Save PDF" />
        </div>

        <h1 className="text-2xl font-semibold text-cream mb-1">Retention & Churn</h1>
        <p className="text-sm text-cream-faint mb-6">Client base health snapshot.</p>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
          <Card><CardContent className="py-4"><div className="text-xs text-cream-faint">Retention</div><div className="text-2xl text-sky font-semibold">{r.retentionRate}%</div></CardContent></Card>
          <Card><CardContent className="py-4"><div className="text-xs text-cream-faint">Active</div><div className="text-2xl text-cream font-semibold">{r.active}</div></CardContent></Card>
          <Card><CardContent className="py-4"><div className="text-xs text-cream-faint">New (30d)</div><div className="text-2xl text-cream font-semibold">{r.new30}</div></CardContent></Card>
          <Card><CardContent className="py-4"><div className="text-xs text-cream-faint">Churned</div><div className="text-2xl text-cream font-semibold">{r.churned}</div></CardContent></Card>
        </div>

        <Card>
          <CardHeader><CardTitle className="text-base">Clients by Status</CardTitle></CardHeader>
          <CardContent className="flex flex-col gap-2">
            {r.statusBreakdown.map((s) => (
              <div key={s.status} className="flex justify-between text-sm border-b border-divider/40 pb-2 last:border-0">
                <span className="text-cream-dim capitalize">{s.status}</span>
                <span className="text-cream font-medium">{s.count}</span>
              </div>
            ))}
            <div className="flex justify-between text-sm pt-2 mt-1 border-t border-divider">
              <span className="text-cream font-semibold">Total clients</span>
              <span className="text-cream font-semibold">{r.totalClients}</span>
            </div>
          </CardContent>
        </Card>

        <p className="text-xs text-cream-faint mt-4">
          New in last 90 days: {r.new90}. Retention = active ÷ (active + paused + churned).
        </p>
      </div>
    </AppShell>
  );
}
