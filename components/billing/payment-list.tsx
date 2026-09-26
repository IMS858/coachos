import Link from "next/link";
import { CheckCircle2, Clock3, RotateCcw, AlertCircle, XCircle } from "lucide-react";
import { formatPaymentAmount, formatPaymentDate, paymentState, type PaymentRecord } from "@/lib/billing/payment-display";

const styles = {
  success: { icon: CheckCircle2, className: "bg-emerald-50 text-emerald-800" },
  pending: { icon: Clock3, className: "bg-amber-50 text-amber-900" },
  failed: { icon: XCircle, className: "bg-red-50 text-red-800" },
  refund: { icon: RotateCcw, className: "bg-sky/10 text-sky-deep" },
  review: { icon: AlertCircle, className: "bg-amber-50 text-amber-900" },
};

/** Shared mobile-safe ledger list. State is always written out, not color-only. */
export function PaymentList({ rows, clientNames }: {
  rows: readonly PaymentRecord[];
  clientNames?: Readonly<Record<string, string>>;
}) {
  return <ul className="divide-y divide-divider" aria-label="Recorded payments">
    {rows.map((row) => {
      const state = paymentState(row);
      const style = styles[state.tone];
      const Icon = style.icon;
      const name = row.client_id ? clientNames?.[row.client_id] : undefined;
      return <li key={row.id} className="grid min-w-0 grid-cols-1 gap-3 p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start sm:p-5">
        <div className="min-w-0">
          {name && row.client_id && <Link href={`/clients/${row.client_id}`} className="mb-1 inline-flex min-h-11 items-center break-words font-semibold text-sky-deep underline-offset-4 hover:underline">{name}</Link>}
          <p className="break-words text-sm font-semibold text-cream">{row.description || "IMS payment"}</p>
          <p className="mt-1 text-xs text-cream-dim">
            {row.paid_at ? "Recorded paid " : "Recorded "}{formatPaymentDate(row.paid_at || row.created_at)}
            {row.source ? ` · ${row.source}` : ""}
          </p>
        </div>
        <div className="flex min-w-0 flex-wrap items-center justify-between gap-2 sm:flex-col sm:items-end">
          <p className="break-all text-base font-semibold tabular text-cream">{formatPaymentAmount(row.amount_cents, row.currency)}</p>
          <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${style.className}`}>
            <Icon aria-hidden="true" className="h-3.5 w-3.5" />{state.label}
          </span>
        </div>
      </li>;
    })}
  </ul>;
}
