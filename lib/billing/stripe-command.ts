import type Stripe from "stripe";

interface LookupKeyMapping {
  kind: "subscription" | "package";
  tier: string;
  service_type?: "training" | "massage" | "pilates";
  sessions_per_week?: number;
  total_sessions?: number;
}

export const LOOKUP_KEY_MAP: Record<string, LookupKeyMapping> = {
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


function id(value: unknown): string | null {
  if (typeof value === 'string') return value;
  return value && typeof value === 'object' && 'id' in value ? String(value.id) : null;
}
function money(value: unknown): number {
  if (!Number.isSafeInteger(value) || Number(value) < 0 || Number(value) > 2147483647) throw new Error('Invalid Stripe amount');
  return Number(value);
}
function currency(value: unknown): string {
  if (typeof value !== 'string' || !/^[a-z]{3}$/.test(value)) throw new Error('Invalid currency');
  return value;
}

/** No writes here. Normalize verified events; subscription snapshots are refreshed. */
export async function stripeCommand(event: Stripe.Event, stripe: Stripe): Promise<Record<string, unknown>> {
  const object = event.data.object as unknown as Record<string, any>;
  if (['checkout.session.completed', 'checkout.session.async_payment_succeeded'].includes(event.type)) {
    if (!['paid','no_payment_required'].includes(object.payment_status)) return {action:'ignore'};
    const mapping = LOOKUP_KEY_MAP[object.metadata?.lookup_key];
    const client = object.metadata?.client_id;
    if (!mapping || typeof client !== 'string' || !/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(client)) throw new Error('Checkout metadata requires reconciliation');
    const amount = money(object.amount_total);
    const subscription = id(object.subscription);
    if (mapping.kind === 'subscription' && !subscription) throw new Error('Subscription identifier missing');
    if (mapping.kind === 'package' && object.mode !== 'payment') throw new Error('Checkout mode mismatch');
    return {action:'checkout',client_id:client,checkout_id:object.id,subscription_id:subscription,
      ...mapping,amount_cents:amount,currency:currency(object.currency),payment_intent_id:id(object.payment_intent),
      monthly_rate_cents:mapping.kind==='subscription'?amount:null,package_total_cents:mapping.kind==='package'?amount:null};
  }
  if (event.type.startsWith('customer.subscription.')) {
    if (!['customer.subscription.created','customer.subscription.updated','customer.subscription.deleted'].includes(event.type)) return {action:'ignore'};
    const current = await stripe.subscriptions.retrieve(object.id);
    const status = ['active','trialing'].includes(current.status) ? 'active' : current.status==='canceled' ? 'cancelled' : 'paused';
    return {action:'subscription',subscription_id:current.id,status};
  }
  if (['invoice.payment_succeeded','invoice.payment_failed'].includes(event.type)) {
    const subscription = id(object.subscription) ?? id(object.parent?.subscription_details?.subscription);
    if (!subscription) return {action:'ignore'}; // Non-subscription invoices are outside this app's plan model.
    const succeeded = event.type==='invoice.payment_succeeded';
    return {action:'invoice',subscription_id:subscription,invoice_id:object.id,status:succeeded?'succeeded':'failed',
      amount_cents:money(succeeded?object.amount_paid:object.amount_due),currency:currency(object.currency),payment_intent_id:id(object.payment_intent)};
  }
  if (event.type==='charge.refunded' || event.type==='refund.created' || event.type==='refund.updated') {
    const chargeId = event.type==='charge.refunded' ? object.id : id(object.charge);
    if (!chargeId) throw new Error('Refund charge missing');
    const charge = await stripe.charges.retrieve(chargeId);
    const refunds=[];
    // Paginate: a charge snapshot may contain only the first page of partial refunds.
    for await (const refund of stripe.refunds.list({charge:chargeId,limit:100})) {
      if (refund.status !== 'succeeded') continue;
      refunds.push({refund_id:refund.id,amount_cents:money(refund.amount),currency:currency(refund.currency),
        created:refund.created,payment_intent_id:id(refund.payment_intent) ?? id(charge.payment_intent),customer_id:id(charge.customer)});
      if (refunds.length>1000) throw new Error('Refund history requires reconciliation');
    }
    return {action:'refunds',refunds};
  }
  return {action:'ignore'};
}
