import { AppShell } from "@/components/layout/app-shell";
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
        <h1 className="text-2xl font-semibold text-cream mb-1">Checkout</h1>
        <p className="text-sm text-cream-faint mb-6">
          Sell a membership or session package. Payment runs through Stripe; the
          plan activates automatically when paid.
        </p>
        <SeedStripeButton />
        <CheckoutView
          clients={clients ?? []}
          flash={success ? "success" : canceled ? "canceled" : null}
        />
      </div>
    </AppShell>
  );
}
