/** Read-only presentation of the existing payments ledger. No money is moved here. */
export interface PaymentRecord {
  id: string;
  client_id?: string | null;
  amount_cents: number;
  currency: string;
  status: string | null;
  source?: string | null;
  description: string | null;
  paid_at: string | null;
  created_at?: string | null;
}

export type PaymentTone = "success" | "pending" | "failed" | "refund" | "review";
export interface CurrencySummary {
  currency: string;
  received: number;
  refunded: number;
  net: number;
}

// Stripe stores charge amounts in minor units. ISK/UGX retain a two-decimal
// API representation; HUF/TWD also use two decimals for charges, not payouts.
// Reference: https://docs.stripe.com/currencies#special-cases
function currencyDetails(value: unknown): { code: string; digits: number } | null {
  if (typeof value !== "string" || !/^[a-z]{3}$/i.test(value)) return null;
  const code = value.toUpperCase();
  if (!Intl.supportedValuesOf("currency").includes(code)) return null;
  const digits = ["ISK", "UGX", "HUF", "TWD"].includes(code)
    ? 2
    : new Intl.NumberFormat("en-US", { style: "currency", currency: code })
      .resolvedOptions().maximumFractionDigits ?? 2;
  return { code, digits };
}

export function formatPaymentAmount(amount: unknown, currency: unknown): string {
  const details = currencyDetails(currency);
  if (!Number.isSafeInteger(amount) || !details) return "Amount needs review";
  return new Intl.NumberFormat("en-US", {
    style: "currency", currency: details.code, currencyDisplay: "code",
    minimumFractionDigits: details.digits, maximumFractionDigits: details.digits,
  }).format(Number(amount) / 10 ** details.digits);
}

export function paymentState(row: Pick<PaymentRecord, "amount_cents" | "currency" | "status">): {
  label: string; tone: PaymentTone;
} {
  if (!Number.isSafeInteger(row.amount_cents) || !currencyDetails(row.currency)) {
    return { label: "Needs review", tone: "review" };
  }
  if (row.status === "refunded" && row.amount_cents <= 0) return { label: "Refund", tone: "refund" };
  if (row.amount_cents < 0) return { label: "Needs review", tone: "review" };
  if (row.status === "succeeded") return { label: "Successful", tone: "success" };
  if (row.status === "pending") return { label: "Pending", tone: "pending" };
  if (row.status === "failed") return { label: "Failed", tone: "failed" };
  return { label: "Needs review", tone: "review" };
}

export function summarizePayments(rows: readonly PaymentRecord[]) {
  const groups = new Map<string, CurrencySummary>();
  let succeeded = 0;
  let failed = 0;
  let pending = 0;
  let needsReview = 0;
  for (const row of rows) {
    const { tone } = paymentState(row);
    if (tone === "review") { needsReview++; continue; }
    if (tone === "failed") { failed++; continue; }
    if (tone === "pending") { pending++; continue; }
    const code = row.currency.toUpperCase();
    const group = groups.get(code) ?? { currency: code, received: 0, refunded: 0, net: 0 };
    if (tone === "success") { succeeded++; group.received += row.amount_cents; }
    else group.refunded += -row.amount_cents;
    group.net = group.received - group.refunded;
    groups.set(code, group);
  }
  return { succeeded, failed, pending, needsReview,
    currencies: [...groups.values()].sort((a, b) => a.currency.localeCompare(b.currency)) };
}

export function formatPaymentDate(value: string | null | undefined): string {
  if (!value) return "Date unavailable";
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value);
  const parsed = new Date(dateOnly ? `${value}T12:00:00Z` : value);
  if (!Number.isFinite(parsed.getTime()) || (dateOnly && parsed.toISOString().slice(0, 10) !== value)) {
    return "Date unavailable";
  }
  return new Intl.DateTimeFormat("en-US", {
    timeZone: dateOnly ? "UTC" : "America/Los_Angeles", month: "short", day: "numeric", year: "numeric",
  }).format(parsed);
}
