import Link from "next/link";
import {notFound} from "next/navigation";
import {ArrowLeft} from "lucide-react";
import {AppShell} from "@/components/layout/app-shell";
import {requireOwnerData} from "@/lib/auth/require-owner";
import {loadTaxEvidence, validReportYear} from "@/lib/financials/tax-evidence";
import {formatPaymentAmount} from "@/lib/billing/payment-display";
import {pacificDate} from "@/lib/time/pacific";
import {PrintButton} from "@/components/reports/print-button";
import {Card, CardContent, CardHeader, CardTitle} from "@/components/ui/card";

export const dynamic = "force-dynamic";
export default async function TaxReportPage({searchParams}: {searchParams: Promise<{year?: string}>}) {
  const db = await requireOwnerData();
  const {year: value} = await searchParams;
  if (value !== undefined && !/^\d{4}$/.test(value)) notFound();
  const now = new Date(), year = value === undefined ? Number(pacificDate(now).slice(0, 4)) : Number(value);
  if (!validReportYear(year)) notFound();
  // A failed/capped read throws rather than printing empty-ledger totals.
  const t = await loadTaxEvidence(db, year, now);
  return <AppShell expectedRole="owner"><main className="mx-auto max-w-2xl py-6 print-area">
    <div className="mb-4 flex items-center justify-between no-print">
      <Link href="/reports" className="flex items-center gap-1 text-sm text-cream-faint"><ArrowLeft className="h-4 w-4"/>Reports</Link>
      <PrintButton label="Print / Save PDF"/>
    </div>
    <h1 className="mb-1 text-2xl font-semibold text-cream">Tax Summary — {year}</h1>
    <p className="mb-5 text-sm text-cream-dim">Recorded Coach OS payment evidence · America/Los_Angeles. This is not a reconciled tax return or a complete statement of business collections.</p>
    <Card className="mb-4"><CardHeader><CardTitle>Recorded receipts by currency</CardTitle></CardHeader><CardContent>
      {t.summary === null ? <p>Future period — collections are not established.</p> : t.summary.currencies.length === 0 ? <p>No eligible receipts in this period. Collections are not established; missing external history is not $0.</p> : t.summary.currencies.map(group => <div key={group.currency} className="mb-3 border-b border-divider pb-3 text-sm">
        <p className="font-semibold">{group.currency} · {group.collectedRecords} collected receipts</p>
        <p>Recorded collected: {group.collectedCents === null ? "Not established" : formatPaymentAmount(group.collectedCents, group.currency)}</p>
        <p>Recorded refunds: {group.refundedCents === null ? "No refund receipts recorded" : formatPaymentAmount(group.refundedCents, group.currency)}</p>
      </div>)}
      {t.summary && t.summary.issues.length > 0 && <p role="alert" className="mt-3 text-sm text-status-limited">{t.summary.issues.length} ledger records need reconciliation and are excluded from totals. Inspect Financials before relying on this report.</p>}
    </CardContent></Card>
    <Card className="mb-4"><CardHeader><CardTitle>By month · recorded collected evidence</CardTitle></CardHeader><CardContent>
      {t.months.map(month => <div key={month.label} className="flex justify-between gap-4 border-b border-divider py-2 text-sm">
        <span>{month.label}</span><div className="text-right">{month.summary === null ? "Future period" : month.summary.currencies.some(g => g.collectedRecords > 0) ? month.summary.currencies.filter(g => g.collectedRecords > 0).map(group => <p key={group.currency}>{formatPaymentAmount(group.collectedCents, group.currency)} · {group.collectedRecords} receipts</p>) : "No eligible receipts recorded"}</div>
      </div>)}
    </CardContent></Card>
    <p className="text-xs leading-5 text-cream-dim">Refunds remain separate; different currencies are never added together. Figures use receipt dates, not contract values or appointment dates. No payment is created or reconciled by viewing this report.</p>
    <div className="mt-4 flex flex-wrap gap-4 text-sm font-semibold text-sky no-print"><Link href="/financials">Inspect payment evidence →</Link><Link href="/settings/migration/evidence?type=transaction">View Vagaro source transactions →</Link></div>
    <p className="mt-5 text-xs text-cream-faint">Observed {pacificDate(now)} · Pacific business dates · External accounting remains separate. Not tax advice.</p>
  </main></AppShell>;
}
