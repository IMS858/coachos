import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { createServiceClient } from "@/lib/supabase/server";
import { getFinancialSnapshot } from "@/lib/queries/financials";
import { PrintButton } from "@/components/reports/print-button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const dynamic = "force-dynamic";

export default async function TrainerReportPage() {
  const svc = createServiceClient();
  const f = await getFinancialSnapshot(svc);

  const monthLabel = new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
  });

  const totalSessions = f.sessionsByTrainer.reduce((s, t) => s + t.count, 0);

  return (
    <AppShell expectedRole="owner">
      <div className="max-w-2xl mx-auto py-6 print-area">
        <div className="flex items-center justify-between mb-4 no-print">
          <Link href="/reports" className="text-sm text-cream-faint hover:text-cream flex items-center gap-1">
            <ArrowLeft className="h-4 w-4" /> Reports
          </Link>
          <PrintButton label="Print / Save PDF" />
        </div>

        <div className="mb-6">
          <h1 className="text-2xl font-semibold text-cream">Trainer Utilization</h1>
          <p className="text-sm text-cream-faint">
            Sessions delivered · {monthLabel}
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Sessions by Trainer (this month)</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {f.sessionsByTrainer.length === 0 ? (
              <p className="text-sm text-cream-faint">No sessions recorded this month.</p>
            ) : (
              <>
                {f.sessionsByTrainer.map((t) => {
                  const pct = totalSessions > 0 ? Math.round((t.count / totalSessions) * 100) : 0;
                  return (
                    <div key={t.trainer_id} className="border-b border-divider/40 pb-2 last:border-0">
                      <div className="flex justify-between text-sm">
                        <span className="text-cream">{t.name}</span>
                        <span className="text-cream-dim">
                          {t.count} sessions · {pct}%
                        </span>
                      </div>
                      <div className="h-1.5 bg-navy-deep rounded mt-1 overflow-hidden">
                        <div className="h-full bg-sky" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
                <div className="flex justify-between text-sm pt-2 mt-1 border-t border-divider">
                  <span className="text-cream font-semibold">Total</span>
                  <span className="text-cream font-semibold">{totalSessions} sessions</span>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <p className="text-xs text-cream-faint mt-4">
          Use this for trainer payouts and capacity planning. Sessions counted are
          completed sessions in {monthLabel}.
        </p>
      </div>
    </AppShell>
  );
}
