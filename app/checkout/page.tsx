import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { ShieldCheck, ReceiptText, CreditCard } from "lucide-react";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { CheckoutView } from "@/components/checkout/checkout-view";
import { SeedStripeButton } from "@/components/checkout/seed-stripe-button";

export const dynamic = "force-dynamic";

export default async function CheckoutPage({ searchParams }: {
  searchParams: Promise<{ success?: string; canceled?: string; client_id?: string }>;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/checkout");
  const { data: me, error: profileError } = await supabase.from("profiles")
    .select("role, deleted_at").eq("id", user.id).maybeSingle();
  // Authorize BEFORE reading the roster through the service client. AppShell
  // is presentation; it must not be the only guard on privileged data fetching.
  if (profileError || !me || me.deleted_at || me.role !== "owner") redirect("/dashboard");

  const { success, canceled, client_id } = await searchParams;
  const svc = createServiceClient();
  const { data: clients, error } = await svc.from("profiles")
    .select("id, full_name").eq("role", "client").is("deleted_at", null)
    .order("full_name", { ascending: true });
  const selectedId = !error && clients?.some((client) => client.id === client_id) ? client_id : undefined;

  return <AppShell expectedRole="owner">
    <div className="mx-auto max-w-3xl py-4 sm:py-6">
      <header className="mb-5 rounded-3xl bg-band px-5 py-7 text-white shadow-lg sm:px-6">
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/65">Billing</p>
        <h1 className="mt-2 text-4xl font-bold text-white">Checkout</h1>
        <p className="mt-2 text-sm text-white/80">Select a client and review the final price in Stripe. Returning here does not confirm payment or plan activation.</p>
      </header>
      <div className="mb-6 grid grid-cols-3 gap-2">
        <div className="rounded-2xl border border-divider bg-white p-3 text-center"><CreditCard aria-hidden="true" className="mx-auto h-5 w-5 text-sky" /><p className="mt-2 text-xs font-medium text-cream">Stripe checkout</p></div>
        <div className="rounded-2xl border border-divider bg-white p-3 text-center"><ReceiptText aria-hidden="true" className="mx-auto h-5 w-5 text-sky" /><p className="mt-2 text-xs font-medium text-cream">Payment record</p></div>
        <div className="rounded-2xl border border-divider bg-white p-3 text-center"><ShieldCheck aria-hidden="true" className="mx-auto h-5 w-5 text-sky" /><p className="mt-2 text-xs font-medium text-cream">Verified activation</p></div>
      </div>
      {error ? <section role="alert" className="rounded-2xl border border-amber-300 bg-amber-50 p-5 text-amber-950"><h2 className="font-semibold">Client list unavailable</h2><p className="mt-1 text-sm">Reload this page before starting checkout. No checkout was created by opening this page.</p></section> : <>
        <SeedStripeButton />
        <CheckoutView key={selectedId || "choose-client"} clients={clients ?? []} initialClientId={selectedId}
          flash={success === "1" ? "success" : canceled === "1" ? "canceled" : null} />
      </>}
    </div>
  </AppShell>;
}
