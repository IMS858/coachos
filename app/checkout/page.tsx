import { AppShell } from "@/components/layout/app-shell";
import { ShieldCheck, ReceiptText, CreditCard } from "lucide-react";
import { createServiceClient } from "@/lib/supabase/server";
import { CheckoutView } from "@/components/checkout/checkout-view";
import { SeedStripeButton } from "@/components/checkout/seed-stripe-button";

export const dynamic = "force-dynamic";

export default async function CheckoutPage({
  searchParams,
}: {
  searchParams: Promise<{ success?: string; canceled?: string }>;
}) {
  const { success, canceled } = await searchParams;
  const svc = createServiceClient();

  const { data: clients } = await svc
    .from("profiles")
    .select("id, full_name")
    .eq("role", "client")
    .order("full_name", { ascending: true });

  return (
    <AppShell expectedRole="owner">
      <div className="max-w-3xl mx-auto py-6">
        <div className="rounded-3xl bg-band px-6 py-7 text-white shadow-lg mb-5"><p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/60">Billing</p><h1 className="mt-2 text-4xl font-bold text-white">Checkout</h1><p className="mt-2 text-sm text-white/75">Start a secure Stripe checkout for a client. Coach OS activates the plan only after verified payment.</p></div>
        <div className="mb-6 grid grid-cols-3 gap-2"><div className="rounded-2xl border border-divider bg-white p-3 text-center"><CreditCard className="mx-auto h-5 w-5 text-sky"/><p className="mt-2 text-xs font-medium text-cream">Stripe checkout</p></div><div className="rounded-2xl border border-divider bg-white p-3 text-center"><ReceiptText className="mx-auto h-5 w-5 text-sky"/><p className="mt-2 text-xs font-medium text-cream">Payment record</p></div><div className="rounded-2xl border border-divider bg-white p-3 text-center"><ShieldCheck className="mx-auto h-5 w-5 text-sky"/><p className="mt-2 text-xs font-medium text-cream">Verified activation</p></div></div>
        <SeedStripeButton />
        <CheckoutView
          clients={clients ?? []}
          flash={success ? "success" : canceled ? "canceled" : null}
        />
      </div>
    </AppShell>
  );
}
