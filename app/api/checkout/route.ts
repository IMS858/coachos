import { type NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { createClient, createServiceClient } from "@/lib/supabase/server";

/**
 * POST /api/checkout
 * Body: { client_id, lookup_key }
 * Creates a Stripe Checkout Session for a membership (subscription) or package (one-time).
 * The webhook (already built) records the plan/payment when checkout completes.
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: me } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  if (!me || !["owner", "trainer"].includes(me.role)) {
    return NextResponse.json({ error: "Staff only" }, { status: 403 });
  }

  const secret = process.env.STRIPE_SECRET_KEY;
  if (!secret) {
    return NextResponse.json(
      { error: "Stripe not configured", detail: "STRIPE_SECRET_KEY missing in Vercel." },
      { status: 503 }
    );
  }

  const { client_id, lookup_key } = await request.json().catch(() => ({}));
  if (!client_id || !lookup_key) {
    return NextResponse.json({ error: "client_id and lookup_key required" }, { status: 400 });
  }

  const stripe = new Stripe(secret);
  const svc = createServiceClient();

  // Look up the client + their profile (for name/email) and stripe customer
  const { data: client } = await svc
    .from("clients")
    .select("id, stripe_customer_id")
    .eq("id", client_id)
    .maybeSingle();
  if (!client) {
    return NextResponse.json({ error: "Client not found" }, { status: 404 });
  }

  const { data: profile } = await svc
    .from("profiles")
    .select("full_name")
    .eq("id", client_id)
    .maybeSingle();

  // Resolve the price by lookup key
  const prices = await stripe.prices.list({
    lookup_keys: [lookup_key],
    expand: ["data.product"],
    limit: 1,
  });
  const price = prices.data[0];
  if (!price) {
    return NextResponse.json(
      { error: "Price not found", detail: `No Stripe price with lookup key "${lookup_key}". Run the catalog seed.` },
      { status: 404 }
    );
  }

  const isSubscription = price.type === "recurring";

  // Ensure a Stripe customer exists for this client
  let customerId = client.stripe_customer_id;
  if (!customerId) {
    const customer = await stripe.customers.create({
      name: profile?.full_name ?? undefined,
      metadata: { client_id },
    });
    customerId = customer.id;
    await svc.from("clients").update({ stripe_customer_id: customerId }).eq("id", client_id);
  }

  const origin = process.env.NEXT_PUBLIC_SITE_URL ?? request.nextUrl.origin;

  const session = await stripe.checkout.sessions.create({
    mode: isSubscription ? "subscription" : "payment",
    customer: customerId,
    line_items: [{ price: price.id, quantity: 1 }],
    metadata: { client_id, lookup_key },
    ...(isSubscription
      ? { subscription_data: { metadata: { client_id, lookup_key } } }
      : { payment_intent_data: { metadata: { client_id, lookup_key } } }),
    success_url: `${origin}/checkout?success=1`,
    cancel_url: `${origin}/checkout?canceled=1`,
  });

  return NextResponse.json({ url: session.url });
}
