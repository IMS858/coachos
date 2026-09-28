import Link from "next/link";
import {ArrowLeft} from "lucide-react";
import {AppShell} from "@/components/layout/app-shell";
import {requireOwnerData} from "@/lib/auth/require-owner";
import {loadFinancialEvidence} from "@/lib/financials/load";
import {formatPaymentAmount} from "@/lib/billing/payment-display";
import {formatCurrency} from "@/lib/utils";
import {PrintButton} from "@/components/reports/print-button";
import {Card, CardContent, CardHeader, CardTitle} from "@/components/ui/card";

export const dynamic = "force-dynamic";
export default async function FinancialsReportPage() {
  const db = await requireOwnerData();
  const f = await loadFinancialEvidence(db);
  const contracts = [
    {label: "Membership contract value", evidence: f.subscriptions.status === "ready" ? f.subscriptions.value : null},
    {label: "Renter contract value", evidence: f.renters.status === "ready" ? f.renters.value.value : null},
  ];
  return <AppShell expectedRole="owner"><main className="mx-auto max-w-2xl py-6 print-area">
    <div className="mb-4 flex items-center justify-between no-print">
      <Link href="/reports" className="flex items-center gap-1 text-sm text-cream-faint"><ArrowLeft className="h-4 w-4"/>Reports</Link>
      <PrintButton label="Print / Save PDF"/>
    </div>
    <h1 className="text-2xl font-semibold text-cream">Monthly Operating Evidence</h1>
    <p className="mb-5 mt-1 text-sm text-cream-dim">Innovative Movement Solutions · {f.window.label} · Pacific business dates</p>
    <Card className="mb-4"><CardHeader><CardTitle>Recurring contract values — not collected cash</CardTitle></CardHeader><CardContent>
      {contracts.map(({label, evidence}) => <div key={label} className="border-b border-divider py-3 text-sm">
        <div className="flex justify-between gap-3"><span>{label}</span><span className="font-semibold">{evidence === null ? "Unavailable" : evidence.completeCents === null ? "Not established" : formatCurrency(evidence.completeCents)}</span></div>
        {evidence && <p className="mt-1 text-xs text-cream-dim">{evidence.knownRecords} known rates · {evidence.unknownRecords} unknown rates{evidence.unknownRecords > 0 && evidence.knownCents !== null ? ` · known subtotal ${formatCurrency(evidence.knownCents)}` : ""}</p>}
      </div>)}
    </CardContent></Card>
    <Card className="mb-4"><CardHeader><CardTitle>Recorded payment receipts</CardTitle></CardHeader><CardContent>
      {f.payments.status === "unavailable" ? <p role="alert" className="text-sm text-status-limited">{f.payments.message}</p> : <>
        {f.payments.value.summary.currencies.length === 0 ? <p className="text-sm">Collections are not established. No eligible payment receipts were found for this period; external history is not inferred to be $0.</p> : f.payments.value.summary.currencies.map(group => <div key={group.currency} className="mb-3 text-sm">
          <p className="font-semibold">{group.currency} · {group.collectedRecords} collected receipts</p>
          <p>Collected evidence: {group.collectedCents === null ? "Not established" : formatPaymentAmount(group.collectedCents, group.currency)}</p>
          <p>Refund evidence: {group.refundedCents === null ? "No refund receipts recorded" : formatPaymentAmount(group.refundedCents, group.currency)}</p>
        </div>)}
        {f.payments.value.summary.issues.length > 0 && <p role="alert" className="mt-3 text-sm text-status-limited">{f.payments.value.summary.issues.length} ledger records need reconciliation and were excluded from totals.</p>}
      </>}
    </CardContent></Card>
    <p className="text-sm leading-6 text-cream-dim">Contracted value, recorded collections, refunds, estimated training value and imported Vagaro evidence are different measures. This report does not add them into an asserted revenue total. It does not establish earned revenue, customer debt or tax liability.</p>
    <div className="mt-5 flex flex-wrap gap-4 text-sm font-semibold text-sky no-print"><Link href="/financials">Full financial evidence →</Link><Link href="/reports/training-value">Training value estimates →</Link><Link href="/settings/migration/evidence?type=transaction">Vagaro source transactions →</Link></div>
  </main></AppShell>;
}
