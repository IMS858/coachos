import Link from "next/link";
import type {ReactNode} from "react";
import {formatPaymentAmount} from "@/lib/billing/payment-display";
import type {FinancialEvidence} from "@/lib/financials/load";
import type {ContractValue, Evidence} from "@/lib/financials/evidence";
const box = "min-w-0 rounded-2xl border border-divider bg-white p-5";
const amount = (value: number | null) => value === null ? "Not established" : formatPaymentAmount(value, "USD");
function Tile({title, children}: {title: string; children: ReactNode}) {
  return <section className={box}><h2 className="text-xs font-semibold uppercase tracking-wider text-cream-dim">{title}</h2><div className="mt-3 space-y-2 text-sm leading-6">{children}</div></section>;
}
function Contract({title, evidence}: {title: string; evidence: Evidence<ContractValue>}) {
  return <Tile title={title}>{evidence.status === "unavailable" ? <p role="alert">{evidence.message}</p> : <>
    <p className="break-words text-xl font-semibold">{evidence.value.unknownRecords ? "Needs review" : amount(evidence.value.completeCents)}</p>
    <p className="text-xs text-cream-dim">{evidence.value.knownRecords} recorded rates; {evidence.value.unknownRecords} missing or invalid rates.</p>
    {evidence.value.unknownRecords > 0 && evidence.value.knownCents !== null && <p className="text-xs">Known-rate subtotal only: {amount(evidence.value.knownCents)}. Not a complete contract total.</p>}
    <p className="text-xs text-cream-dim">Contracted monthly value, not collected cash or money owed.</p>
  </>}</Tile>;
}
export function FinancialEvidencePanel({data}: {data: FinancialEvidence}) {
  const {window, training, payments} = data;
  const totals = training.status === "ready" ? training.value.analysis.totals : null;
  const summary = payments.status === "ready" ? payments.value.summary : null;
  const collected = summary?.currencies.filter(row => row.collectedRecords > 0) ?? [];
  const refunds = summary?.currencies.filter(row => row.refundRecords > 0) ?? [];
  return <div className="space-y-4">
    <p className="text-xs leading-5 text-cream-dim">{window.label} · Pacific time. Observed {new Date(window.asOf).toLocaleString("en-US", {timeZone: "America/Los_Angeles", timeZoneName: "short"})}. These categories are separate evidence, not numbers to add together.</p>
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <Tile title="Estimated training value">
        <p className="break-words text-2xl font-bold text-sky">{totals ? amount(totals.historical_estimate_cents) : "Unavailable"}</p>
        {training.status === "unavailable" ? <p role="alert">{training.message}</p> : <p>{totals!.historical_count} explicitly completed private-training sessions this month × $93. Not collected revenue, a package price or payroll.</p>}
        <Link href="/reports/training-value" className="inline-flex min-h-11 items-center font-semibold text-sky">Review training evidence →</Link>
      </Tile>
      <Tile title="Known collected">
        {payments.status === "unavailable" ? <p role="alert">{payments.message}</p> : <>
          {collected.length ? collected.map(row => <p key={row.currency} className="break-words text-2xl font-bold">{formatPaymentAmount(row.collectedCents, row.currency)}<span className="block text-xs font-normal text-cream-dim">{row.collectedRecords} successful payment records</span></p>) : <p className="text-2xl font-bold">Not established</p>}
          <p>Valid successful payment records with a recorded payment date this month. Source-recorded, not independently bank-reconciled. Currencies are never combined.</p>
          {refunds.map(row => <p key={row.currency} className="text-xs">Recorded refunds: {formatPaymentAmount(row.refundedCents, row.currency)} ({row.refundRecords} records). Shown separately, not counted as income.</p>)}
        </>}
      </Tile>
      <Tile title="Known outstanding">
        <p className="text-2xl font-bold">Not established</p>
        <p>A verified receivables ledger is not connected to this report. Failed payments, package prices, remaining sessions and $93 estimates are not evidence of client debt.</p>
        <Link href="/settings/migration/review?type=package" className="inline-flex min-h-11 items-center font-semibold text-sky">Review opening evidence →</Link>
      </Tile>
      <Tile title="Unknown / needs reconciliation">
        {summary ? <><p>{summary.issues.length} payment records need review across the loaded ledger.</p><p>{summary.pendingRecords} pending and {summary.failedRecords} failed attempts across that ledger; neither is a receipt or a receivable.</p></> : <p role="alert">Payment review coverage is unavailable. No zero count was assumed.</p>}
        {totals ? <p>{totals.review_count} session records in this month need valuation review.</p> : <p role="alert">Training review coverage is unavailable.</p>}
        <p>Cash, checks, Apple Pay, Venmo, Vagaro and QuickBooks history may still be incomplete. No unreconciled-dollar total is guessed.</p>
        <Link href="/settings/migration" className="inline-flex min-h-11 items-center font-semibold text-sky">Open Migration Center →</Link>
      </Tile>
    </div>
    <section className={box}><h2 className="text-sm font-semibold">Upcoming schedule estimate · separate from completed work</h2>
      {totals ? <p className="mt-2 text-sm leading-6">{amount(totals.scheduled_estimate_cents)} · {totals.scheduled_count} scheduled/confirmed private-training sessions remaining in this Pacific month × $93. This is not guaranteed income and has not been added to the completed estimate.</p> : <p role="alert" className="mt-2 text-sm">Schedule valuation could not be established.</p>}
      {training.status === "ready" && <p className="mt-2 text-xs text-cream-dim">{training.value.loadedRecords} operational session records loaded; {totals!.excluded_count} excluded. Staged Vagaro evidence is not imported training or proof of attendance.</p>}
    </section>
    <div className="grid gap-3 sm:grid-cols-2"><Contract title="Active subscription value" evidence={data.subscriptions}/><Contract title="Active rental value" evidence={data.renters.status === "ready" ? {status: "ready", value: data.renters.value.value} : data.renters}/></div>
    {summary && <section className={box}><h2 className="text-sm font-semibold">Payment evidence coverage</h2><p className="mt-2 text-xs leading-5 text-cream-dim">All {summary.loadedRecords} stored payment rows were loaded for duplicate and missing-date checks. Receipt/refund amounts above use paid_at in this Pacific month through the observation time; created_at is never substituted. {summary.outsideWindow} dated payment records are outside this month. This is Coach OS coverage, not proof that external financial history is complete.</p>
      {summary.issues.length > 0 && <details className="mt-3"><summary className="min-h-11 cursor-pointer text-sm font-semibold text-sky">Review held payment evidence ({summary.issues.length})</summary><div className="divide-y divide-divider">{summary.issues.slice(0, 20).map(issue => <p key={issue.id} className="break-words py-3 text-xs leading-5"><span className="font-semibold">Record {issue.id}</span> · {issue.reason}</p>)}</div>{summary.issues.length > 20 && <p className="text-xs">Showing 20 of {summary.issues.length} held records.</p>}</details>}
    </section>}
  </div>;
}
