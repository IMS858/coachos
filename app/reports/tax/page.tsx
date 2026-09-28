import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";

export const dynamic = "force-dynamic";

import { createServiceClient } from "@/lib/supabase/server";
import { getPaymentsSummary } from "@/lib/queries/reports-extra";
import { PrintButton } from "@/components/reports/print-button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils";

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

export default async function TaxReportPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string }>;
}) {
  const { year: yearParam } = await searchParams;
  const year = yearParam ? parseInt(yearParam, 10) : new Date().getFullYear();
  const svc = createServiceClient();
  const t = await getPaymentsSummary(svc, year);

  return (
    <AppShell expectedRole="owner">
      <div className="max-w-2xl mx-auto py-6 print-area">
        <div className="flex items-center justify-between mb-4 no-print">
          <Link href="/reports" className="text-sm text-cream-faint hover:text-cream flex items-center gap-1">
            <ArrowLeft className="h-4 w-4" /> Reports
          </Link>
          <PrintButton label="Print / Save PDF" />
        </div>

        <h1 className="text-2xl font-semibold text-cream mb-1">Tax Summary — {year}</h1>
        <p className="text-sm text-cream-faint mb-6">
          {t.paymentCount > 0
            ? `Coach OS succeeded payment receipts for the year. ${t.paymentCount} transactions.`
            : "No Coach OS succeeded payment receipts are recorded for this year. External/Vagaro history is not treated as $0 collected."}
        </p>

        <Card className="mb-4">
          <CardContent className="py-5 text-center">
            <div className="text-xs text-cream-faint">Coach OS collected evidence {year}</div>
            <div className="text-3xl text-sky font-semibold">
              {t.paymentCount > 0 ? formatCurrency(t.totalCents) : "Not established"}
            </div>
          </CardContent>
        </Card>

        <Card className="mb-4">
          <CardHeader><CardTitle className="text-base">By Month</CardTitle></CardHeader>
          <CardContent className="flex flex-col gap-1.5">
            {t.byMonthCents.map((cents, i) => (
              <div key={i} className="flex justify-between text-sm border-b border-divider/40 pb-1.5 last:border-0">
                <span className="text-cream-dim">{MONTHS[i]}</span>
                <span className="text-cream">{t.paymentCount > 0 ? formatCurrency(cents) : "—"}</span>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">By Source</CardTitle></CardHeader>
          <CardContent className="flex flex-col gap-2">
            {t.bySource.length === 0 ? (
              <p className="text-sm text-cream-faint">No Coach OS payment receipts recorded for {year}; external payment history remains unreconciled.</p>
            ) : (
              t.bySource.map((s) => (
                <div key={s.source} className="flex justify-between text-sm">
                  <span className="text-cream-dim capitalize">{s.source}</span>
                  <span className="text-cream font-medium">{formatCurrency(s.cents)}</span>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <p className="text-xs text-cream-faint mt-4 no-print">
          Not tax advice. This view reports Coach OS payment receipts only; imported source transactions and external accounting remain separate until reconciled. Add ?year=2025 to the URL for prior years.
        </p>
      </div>
    </AppShell>
  );
}
