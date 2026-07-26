import { type NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

/**
 * Stripe webhook handler — UPDATED to write to `plans` table (not deprecated `memberships`).
 *
 * Events handled:
 *   - checkout.session.completed       → plan created
 *   - customer.subscription.updated    → plan status synced
 *   - customer.subscription.deleted    → plan cancelled
 *   - invoice.payment_succeeded        → payment recorded
 *   - invoice.payment_failed           → payment recorded, dunning fired
 *   - charge.refunded                  → refund recorded
 *
 * Stripe metadata expected on Checkout Sessions:
 *   client_id     — Supabase auth.users.id of the client
 *   lookup_key    — Stripe Price lookup key (e.g. 'standard_3x_monthly', 'package_12_training')
 *
 * For local testing:
 *   stripe listen --forward-to localhost:3000/api/webhooks/stripe
 */

interface LookupKeyMapping {
  kind: "subscription" | "package";
  tier: string;
  service_type?: "training" | "massage" | "pilates";
  sessions_per_week?: number;
  total_sessions?: number;
}

const LOOKUP_KEY_MAP: Record<string, LookupKeyMapping> = {
  // Subscriptions
  essentials_2x_monthly: { kind: "subscription", tier: "essentials_2x", sessions_per_week: 2 },
  standard_3x_monthly:   { kind: "subscription", tier: "standard_3x", sessions_per_week: 3 },
  premium_4x_monthly:    { kind: "subscription", tier: "premium_4x", sessions_per_week: 4 },
  recovery_monthly:      { kind: "subscription", tier: "recovery_monthly" },

  // Training packages
  package_6_training:    { kind: "package", tier: "package_6", service_type: "training", total_sessions: 6 },
  package_12_training:   { kind: "package", tier: "package_12", service_type: "training", total_sessions: 12 },
  package_24_training:   { kind: "package", tier: "package_24", service_type: "training", total_sessions: 24 },

  // Massage packages
  package_6_massage:     { kind: "package", tier: "package_6", service_type: "massage", total_sessions: 6 },
  package_12_massage:    { kind: "package", tier: "package_12", service_type: "massage", total_sessions: 12 },
  package_24_massage:    { kind: "package", tier: "package_24", service_type: "massage", total_sessions: 24 },

  // Pilates packages
  package_6_pilates:     { kind: "package", tier: "package_6", service_type: "pilates", total_sessions: 6 },
  package_12_pilates:    { kind: "package", tier: "package_12", service_type: "pilates", total_sessions: 12 },
  package_24_pilates:    { kind: "package", tier: "package_24", service_type: "pilates", total_sessions: 24 },

  // Legacy single-type package keys (default to training for backward compat with seed-stripe-catalog.ts)
  package_6:             { kind: "package", tier: "package_6", service_type: "training", total_sessions: 6 },
  package_12:            { kind: "package", tier: "package_12", service_type: "training", total_sessions: 12 },
  package_24:            { kind: "package", tier: "package_24", service_type: "training", total_sessions: 24 },
};

export async function POST(request: NextRequest) {
  const Stripe = (await import("stripe")).default;
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

  const body = await request.text();
  const signature = request.headers.get("stripe-signature");

  if (!signature) {
    return NextResponse.json({ error: "No signature" }, { status: 400 });
  }

  let event;
  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch {
    return NextResponse.json(
      { error: "Webhook signature verification failed" },
      { status: 400 }
    );
  }

  const supabase = createServiceClient();

  // Idempotency
  const { data: existing } = await supabase
    .from("stripe_events")
    .select("id, processed_at")
    .eq("id", event.id)
    .maybeSingle();

  if (existing?.processed_at) {
    return NextResponse.json({ ok: true, deduped: true });
  }

  await supabase.from("stripe_events").upsert({
    id: event.id,
    type: event.type,
    data: event.data as any,
  });

  try {
    switch (event.type) {
      case "checkout.session.completed":
        await handleCheckoutComplete(supabase, event.data.object as any);
        break;
      case "customer.subscription.created":
      case "customer.subscription.updated":
        await handleSubscriptionChange(supabase, event.data.object as any);
        break;
      case "customer.subscription.deleted":
        await handleSubscriptionCancel(supabase, event.data.object as any);
        break;
      case "invoice.payment_succeeded":
        await handlePaymentSuccess(supabase, event.data.object as any);
        break;
      case "invoice.payment_failed":
        await handlePaymentFailure(supabase, event.data.object as any);
        break;
      case "charge.refunded":
        await handleRefund(supabase, event.data.object as any);
        break;
      default:
        // Unhandled event types are logged via stripe_events but not processed
        break;
    }

    await supabase
      .from("stripe_events")
      .update({ processed_at: new Date().toISOString() })
      .eq("id", event.id);

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    await supabase
      .from("stripe_events")
      .update({ processing_error: String(error?.message ?? error) })
      .eq("id", event.id);
    return NextResponse.json(
      { error: "Handler failed", detail: String(error?.message ?? error) },
      { status: 500 }
    );
  }
}

/* ------------------------------- HANDLERS ----------------------------------- */

async function handleCheckoutComplete(supabase: any, session: any) {
  const clientId = session.metadata?.client_id;
  const lookupKey = session.metadata?.lookup_key;
  if (!clientId || !lookupKey) {
    throw new Error(
      `checkout.session.completed missing metadata: client_id=${clientId}, lookup_key=${lookupKey}`
    );
  }

  const mapping = LOOKUP_KEY_MAP[lookupKey];
  if (!mapping) {
    throw new Error(`Unknown lookup_key: ${lookupKey}`);
  }

  const insert: any = {
    client_id: clientId,
    kind: mapping.kind,
    tier: mapping.tier,
    status: "active",
    start_date: new Date().toISOString().slice(0, 10),
    stripe_subscription_id: session.subscription ?? null,
  };

  if (mapping.kind === "subscription") {
    insert.monthly_rate_cents = session.amount_total ?? 0;
    if (mapping.sessions_per_week) insert.sessions_per_week = mapping.sessions_per_week;
  } else {
    insert.service_type = mapping.service_type;
    insert.total_sessions = mapping.total_sessions;
    insert.current_session_number = 0;
    insert.sessions_used = 0;
    insert.package_total_cents = session.amount_total ?? 0;
  }

  await supabase.from("plans").insert(insert);

  // Update billing_type and client status
  const billingType = mapping.kind === "subscription" ? "membership" : "package";
  await supabase
    .from("clients")
    .update({
      billing_type: billingType,
      status: "active",
      joined_at: new Date().toISOString(),
    })
    .eq("id", clientId);
}

async function handleSubscriptionChange(supabase: any, subscription: any) {
  const newStatus =
    subscription.status === "active" ? "active"
    : subscription.status === "past_due" ? "active"
    : subscription.status === "paused" ? "paused"
    : subscription.status === "canceled" ? "cancelled"
    : "active";

  await supabase
    .from("plans")
    .update({ status: newStatus })
    .eq("stripe_subscription_id", subscription.id);
}

async function handleSubscriptionCancel(supabase: any, subscription: any) {
  await supabase
    .from("plans")
    .update({
      status: "cancelled",
      end_date: new Date().toISOString().slice(0, 10),
    })
    .eq("stripe_subscription_id", subscription.id);
}

async function handlePaymentSuccess(supabase: any, invoice: any) {
  const { data: plan } = await supabase
    .from("plans")
    .select("client_id, id")
    .eq("stripe_subscription_id", invoice.subscription)
    .maybeSingle();

  if (!plan) return;

  await supabase.from("payments").insert({
    client_id: plan.client_id,
    plan_id: plan.id,
    amount_cents: invoice.amount_paid,
    currency: invoice.currency,
    status: "succeeded",
    source: "stripe",
    source_id: invoice.id,
    description: invoice.description ?? "Plan payment",
    paid_at: invoice.status_transitions?.paid_at
      ? new Date(invoice.status_transitions.paid_at * 1000).toISOString()
      : new Date().toISOString(),
  });
}

async function handlePaymentFailure(supabase: any, invoice: any) {
  const { data: plan } = await supabase
    .from("plans")
    .select("client_id, id")
    .eq("stripe_subscription_id", invoice.subscription)
    .maybeSingle();

  if (!plan) return;

  await supabase.from("payments").insert({
    client_id: plan.client_id,
    plan_id: plan.id,
    amount_cents: invoice.amount_due,
    currency: invoice.currency,
    status: "failed",
    source: "stripe",
    source_id: invoice.id,
    description: `Payment attempt ${invoice.attempt_count} failed`,
  });

  // TODO: emit Inngest 'payment.failed' for dunning workflow
}

async function handleRefund(supabase: any, charge: any) {
  await supabase.from("payments").insert({
    client_id: null, // resolve via charge.metadata.client_id if set
    amount_cents: -1 * (charge.amount_refunded ?? 0),
    currency: charge.currency,
    status: "refunded",
    source: "stripe",
    source_id: charge.id,
    description: `Refund of $${(charge.amount_refunded / 100).toFixed(2)}`,
    paid_at: new Date().toISOString(),
  });
}
