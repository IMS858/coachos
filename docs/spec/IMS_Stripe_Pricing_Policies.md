# IMS Coach OS — Stripe Integration, Pricing & Policies

**Addendum to IMS_Ultimate_Build_Spec.md**
**Replaces Vagaro billing with Stripe. Locks in 24-hour cancellation and refund policies.**

---

## 0. Read This First — The Policy Change Flag

**Current policy (live on imsmethod.com and Vagaro right now):** 12-hour cancellation window. Late cancellations and no-shows forfeit the session.

**New policy (this document):** 24-hour cancellation window.

This is a **stricter** policy than what your current 55+ clients agreed to. Three things you need to do before flipping the switch:

1. **Grandfather existing clients for 30 days** — give them notice that the policy changes on a specific date. Don't penalize them retroactively.
2. **Update every public-facing surface in one coordinated move:** website FAQ, Vagaro booking page, intake waiver text, automated reminder emails, any printed signage in the studio.
3. **Talk to your attorney before publishing.** This is template language. Specific contract language for fitness studios in California has nuance around CA Civil Code § 1812.80–1812.97 (the Health Studio Services Contract Law). A 30-minute consult with a fitness-industry attorney is worth the $200-400.

With that flagged, here's the build.

---

## 1. The Stripe Product Catalog

You will create one Stripe Product per service offering, with one or more Prices attached to each Product. Stripe's data model:

```
Product (e.g. "IMS Standard Membership")
  └── Price (e.g. "$1169/month, recurring")
  └── Price (e.g. "$1169/month, recurring, 6-month commit")
  └── Price (e.g. "$0.00 trial → $1169/mo")
```

This separation means you can change pricing without breaking historical purchases. Old subscriptions stay on old Prices; new signups land on new Prices.

### 1.1 Memberships (Recurring Subscriptions)

| Product | Price ID Slug | Amount | Interval | Stripe Type |
|---|---|---|---|---|
| Essentials Membership | `price_essentials_2x_monthly` | $780.00 | month | recurring |
| Standard Membership | `price_standard_3x_monthly` | $1,169.00 | month | recurring |
| Premium Membership | `price_premium_4x_monthly` | $1,559.00 | month | recurring |

All memberships:
- Billed on the same day each month (anchored to first session date)
- Auto-renew unless cancelled with 30 days written notice
- 30-day cancellation notice clause stored as metadata
- Pause option (up to 60 days/year, see §6.3)

### 1.2 Session Packages (One-Time Payments)

| Product | Price ID Slug | Amount | Sessions | Per-Session |
|---|---|---|---|---|
| 6-Session Package | `price_package_6` | $600.00 | 6 | $100 |
| 12-Session Package | `price_package_12` | $1,140.00 | 12 | $95 |
| 24-Session Package | `price_package_24` | $2,160.00 | 24 | $90 |

All packages:
- Single charge at purchase
- Sessions expire 12 months after purchase (industry standard, prevents indefinite obligation)
- Non-transferable between clients
- Sessions count down via the `memberships` table (`sessions_used` field)

### 1.3 Recovery & Specialty Services (One-Time, A La Carte)

These are placeholders — fill in your actual prices:

| Product | Price ID Slug | Amount | Notes |
|---|---|---|---|
| 60-min Therapeutic Massage | `price_massage_60` | $TBD | Kara, LMT |
| 90-min Therapeutic Massage | `price_massage_90` | $TBD | Kara, LMT |
| Compression Therapy Session | `price_compression` | $TBD | 30 min |
| Sauna Session | `price_sauna` | $TBD | 30 min |
| Body Composition Test | `price_bodycomp` | $TBD | ~15 min |
| Late Cancellation Fee (non-member) | `price_late_cancel_fee` | $50.00 | Charged if no card on file |

### 1.4 Add-Ons (Subscription Modifiers)

| Product | Price ID Slug | Amount | Interval |
|---|---|---|---|
| Monthly Massage Add-On | `price_addon_massage_monthly` | $TBD | month |
| Quarterly Body Comp Test | `price_addon_bodycomp_quarterly` | $TBD | every 3 months |

These attach to membership subscriptions as additional line items.

---

## 2. Cancellation & Reschedule Policy (24-Hour Window)

### 2.1 The Policy (Customer-Facing Language)

Use this exact text on the website, in the intake/waiver, and in booking confirmation emails:

> **IMS Cancellation & Rescheduling Policy**
>
> Your training time is reserved exclusively for you. To respect your coach's schedule and keep slots available for all clients, the following applies to every appointment:
>
> **24-Hour Cancellation Window.** All cancellations and reschedules must be made at least 24 hours before your scheduled session.
>
> **Late Cancellations (less than 24 hours notice).** The session is forfeited. For members, the session counts against your weekly allotment. For package clients, one session is deducted from your remaining balance. For non-members or clients without an active membership/package, a $50 late cancellation fee is charged to the card on file.
>
> **No-Shows.** Treated identically to late cancellations.
>
> **Rescheduling Within the Window.** Reschedules made 24+ hours in advance are free and unlimited. Reschedules requested within the 24-hour window are treated as a late cancellation unless approved by your coach.
>
> **Coach-Initiated Changes.** If IMS cancels or reschedules a session, your session is preserved at no penalty.
>
> **Emergencies.** We're human. If you have a medical emergency, family emergency, or genuine unavoidable conflict, contact your coach directly. We make exceptions for real emergencies — but the policy holds for routine schedule changes.

### 2.2 The Policy Logic (How Code Enforces It)

When a client clicks "Cancel" on a session in the dashboard, the system runs this logic:

```typescript
async function cancelSession(sessionId: string, cancelledBy: 'client' | 'trainer') {
  const session = await getSession(sessionId);
  const now = new Date();
  const hoursUntilSession =
    (session.scheduled_at.getTime() - now.getTime()) / (1000 * 60 * 60);

  // Coach-initiated cancellations never penalize the client
  if (cancelledBy === 'trainer') {
    return updateSession(sessionId, {
      status: 'cancelled',
      cancelled_at: now,
      cancellation_reason: 'trainer_initiated',
    });
  }

  // Client-initiated, 24+ hours notice — clean cancel
  if (hoursUntilSession >= 24) {
    return updateSession(sessionId, {
      status: 'cancelled',
      cancelled_at: now,
      cancellation_reason: 'client_advance_notice',
    });
  }

  // Client-initiated, less than 24 hours — late cancel, session forfeit
  await updateSession(sessionId, {
    status: 'late_cancelled',
    cancelled_at: now,
    cancellation_reason: 'client_late_notice',
  });

  // Apply consequences based on client's billing relationship
  const membership = await getActiveMembership(session.client_id);

  if (membership && membership.tier.startsWith('package_')) {
    // Package client — decrement session count
    await incrementSessionsUsed(membership.id);
  } else if (!membership) {
    // No active membership/package — charge the late cancel fee
    await createStripeCharge({
      client_id: session.client_id,
      amount_cents: 5000,
      description: 'Late cancellation fee — session within 24 hours',
      metadata: { session_id: sessionId },
    });
  }
  // For weekly memberships, the session simply counts against that week's allotment
  // (it's already scheduled, no additional action needed)
}
```

### 2.3 Reminder Cadence (Reduces Late Cancels)

To prevent late cancels rather than just penalize them, automate reminders:

| Time Before Session | Channel | Message |
|---|---|---|
| 48 hours | Email | "Looking forward to seeing you on [day]. Reply CONFIRM or RESCHEDULE." |
| 26 hours | SMS | "Hey [Name] — IMS session tomorrow at [time]. Need to cancel? You have 2 hours before our 24-hour window closes. [Reschedule link]" |
| 2 hours | SMS | "[Name] — see you in 2 hours at IMS. [Directions link]" |

The 26-hour text is the key one. It gives the client a clear last chance to reschedule cleanly before they hit the late-cancel zone. This single message will reduce late cancels by 30-50% based on industry data.

---

## 3. Refund Policy

### 3.1 The Policy (Customer-Facing Language)

> **IMS Refund Policy**
>
> **Memberships.** Memberships are billed monthly and provide access to a set number of sessions per week. Memberships are non-refundable for any partial month. To stop billing, you must provide 30 days written notice (email is fine). Your membership remains active and accessible during the notice period.
>
> **Session Packages.** Package purchases are refundable within 7 days of purchase, provided no sessions have been used. After 7 days, or once any session has been used, packages are non-refundable but remaining sessions remain valid for 12 months from purchase. Unused sessions may be applied to recovery services (massage, compression, sauna) at the equivalent dollar value.
>
> **Recovery Services (Massage, Compression, Sauna, Body Composition).** Single-session purchases are refundable up to 24 hours before the scheduled appointment. Within the 24-hour window, services are non-refundable but rescheduleable subject to coach availability.
>
> **Free Movement Assessments.** No charge, no refund applicable.
>
> **Disputed Charges.** If you believe you were charged in error, contact us at (619) 937-1434 or jason@imsfitnesscenter.com within 30 days of the charge. We resolve disputes directly before any chargeback process. We document every transaction and will provide records on request.
>
> **Medical Exceptions.** If you suffer a serious medical condition, injury, or relocation that prevents you from training for 60+ days, contact us. We offer membership pause (up to 60 days/year at no cost), credit toward a future return, or in genuine hardship cases a partial refund. Documentation may be requested.
>
> **Membership Cancellation.** Cancel anytime with 30 days written notice. Final billing date is 30 days from notice. No partial-month refunds.

### 3.2 Refund Logic (Code-Enforced)

```typescript
async function processRefundRequest(membershipId: string, reason: string) {
  const membership = await getMembership(membershipId);
  const daysSincePurchase = daysBetween(membership.created_at, new Date());

  // Memberships — never refundable for partial month, only cancellable forward
  if (membership.tier.startsWith('essentials_') ||
      membership.tier.startsWith('standard_') ||
      membership.tier.startsWith('premium_')) {
    return {
      refundable: false,
      message: 'Memberships cancel forward with 30 days notice. Submit a cancellation request instead.',
    };
  }

  // Packages — 7-day window, must have zero usage
  if (membership.tier.startsWith('package_')) {
    if (daysSincePurchase <= 7 && membership.sessions_used === 0) {
      return {
        refundable: true,
        amount_cents: membership.package_total_cents,
        method: 'full_refund',
      };
    }
    return {
      refundable: false,
      message: 'Package refunds available within 7 days of purchase, no sessions used. Sessions remain valid for 12 months.',
    };
  }

  // Recovery single-session — 24+ hours before appointment
  // (handled at session level, not membership level)
  return { refundable: false, message: 'No refund policy applies.' };
}
```

All refunds require owner approval (Jason) before being processed. Build a "Refund Requests" queue in the owner dashboard.

---

## 4. Stripe Implementation — Step by Step

### 4.1 Initial Setup

```bash
# Install Stripe SDK
pnpm add stripe @stripe/stripe-js

# Environment variables (.env.local)
STRIPE_SECRET_KEY=sk_test_xxxxx
STRIPE_PUBLISHABLE_KEY=pk_test_xxxxx
STRIPE_WEBHOOK_SECRET=whsec_xxxxx
```

### 4.2 Create Products & Prices via Script

Write a one-time setup script to create the catalog. Run it once against your Stripe account, save the returned IDs.

```typescript
// scripts/seed-stripe-catalog.ts
import Stripe from 'stripe';
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

const catalog = [
  // Memberships
  {
    name: 'IMS Essentials Membership',
    description: '2 sessions/week with personalized programming',
    type: 'service',
    metadata: { tier: 'essentials_2x', sessions_per_week: '2' },
    prices: [{
      unit_amount: 78000,
      currency: 'usd',
      recurring: { interval: 'month' },
      lookup_key: 'essentials_2x_monthly',
    }],
  },
  {
    name: 'IMS Standard Membership',
    description: '3 sessions/week with personalized programming',
    type: 'service',
    metadata: { tier: 'standard_3x', sessions_per_week: '3' },
    prices: [{
      unit_amount: 116900,
      currency: 'usd',
      recurring: { interval: 'month' },
      lookup_key: 'standard_3x_monthly',
    }],
  },
  {
    name: 'IMS Premium Membership',
    description: '4 sessions/week with priority access',
    type: 'service',
    metadata: { tier: 'premium_4x', sessions_per_week: '4' },
    prices: [{
      unit_amount: 155900,
      currency: 'usd',
      recurring: { interval: 'month' },
      lookup_key: 'premium_4x_monthly',
    }],
  },

  // Packages
  {
    name: 'IMS 6-Session Package',
    description: '6 personal training sessions, 12-month expiry',
    type: 'service',
    metadata: { tier: 'package_6', total_sessions: '6' },
    prices: [{
      unit_amount: 60000,
      currency: 'usd',
      lookup_key: 'package_6',
    }],
  },
  {
    name: 'IMS 12-Session Package',
    description: '12 personal training sessions, 12-month expiry',
    type: 'service',
    metadata: { tier: 'package_12', total_sessions: '12' },
    prices: [{
      unit_amount: 114000,
      currency: 'usd',
      lookup_key: 'package_12',
    }],
  },
  {
    name: 'IMS 24-Session Package',
    description: '24 personal training sessions, 12-month expiry',
    type: 'service',
    metadata: { tier: 'package_24', total_sessions: '24' },
    prices: [{
      unit_amount: 216000,
      currency: 'usd',
      lookup_key: 'package_24',
    }],
  },

  // Late cancel fee
  {
    name: 'Late Cancellation Fee',
    description: 'Session cancelled within 24 hours of scheduled time',
    type: 'service',
    metadata: { fee_type: 'late_cancel' },
    prices: [{
      unit_amount: 5000,
      currency: 'usd',
      lookup_key: 'late_cancel_fee',
    }],
  },
];

async function seed() {
  for (const item of catalog) {
    const product = await stripe.products.create({
      name: item.name,
      description: item.description,
      metadata: item.metadata,
    });
    for (const priceData of item.prices) {
      const price = await stripe.prices.create({
        product: product.id,
        ...priceData,
      });
      console.log(`Created ${item.name} → ${price.id} (lookup: ${priceData.lookup_key})`);
    }
  }
}

seed();
```

Run with `pnpm tsx scripts/seed-stripe-catalog.ts`. Save the output to your repo as documentation.

### 4.3 Stripe Customer per Client

Every client gets a Stripe Customer object. Store the Stripe Customer ID on the client record.

```typescript
// Add to clients table:
ALTER TABLE clients ADD COLUMN stripe_customer_id text UNIQUE;

// Create on first paid action:
async function ensureStripeCustomer(client: Client): Promise<string> {
  if (client.stripe_customer_id) return client.stripe_customer_id;

  const customer = await stripe.customers.create({
    email: client.email,
    name: client.full_name,
    phone: client.phone,
    metadata: { ims_client_id: client.id },
  });

  await db.from('clients').update({
    stripe_customer_id: customer.id,
  }).eq('id', client.id);

  return customer.id;
}
```

### 4.4 Checkout Flow (Client Buys a Membership/Package)

```typescript
// app/api/checkout/route.ts
export async function POST(req: Request) {
  const { client_id, lookup_key } = await req.json();
  const client = await getClient(client_id);
  const customerId = await ensureStripeCustomer(client);

  const prices = await stripe.prices.list({ lookup_keys: [lookup_key] });
  const price = prices.data[0];

  const isSubscription = !!price.recurring;

  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: isSubscription ? 'subscription' : 'payment',
    line_items: [{ price: price.id, quantity: 1 }],
    success_url: `${process.env.NEXT_PUBLIC_URL}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${process.env.NEXT_PUBLIC_URL}/billing/cancelled`,
    metadata: {
      client_id,
      lookup_key,
    },
    subscription_data: isSubscription ? {
      metadata: { client_id, lookup_key },
    } : undefined,
  });

  return Response.json({ url: session.url });
}
```

The client gets redirected to Stripe Checkout (hosted by Stripe, fully PCI-compliant), pays, gets redirected back. The webhook (next section) creates the matching Supabase records.

### 4.5 Webhook Handler (Stripe → Supabase Sync)

This is the brain. Every Stripe event becomes a database update.

```typescript
// app/api/webhooks/stripe/route.ts
import Stripe from 'stripe';
import { headers } from 'next/headers';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET!;

export async function POST(req: Request) {
  const body = await req.text();
  const signature = (await headers()).get('stripe-signature')!;

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, signature, endpointSecret);
  } catch (err) {
    return new Response('Webhook signature verification failed', { status: 400 });
  }

  switch (event.type) {
    case 'checkout.session.completed':
      await handleCheckoutComplete(event.data.object as Stripe.Checkout.Session);
      break;
    case 'customer.subscription.created':
    case 'customer.subscription.updated':
      await handleSubscriptionChange(event.data.object as Stripe.Subscription);
      break;
    case 'customer.subscription.deleted':
      await handleSubscriptionCancelled(event.data.object as Stripe.Subscription);
      break;
    case 'invoice.payment_succeeded':
      await handlePaymentSucceeded(event.data.object as Stripe.Invoice);
      break;
    case 'invoice.payment_failed':
      await handlePaymentFailed(event.data.object as Stripe.Invoice);
      break;
    case 'charge.refunded':
      await handleRefund(event.data.object as Stripe.Charge);
      break;
  }

  return new Response('ok', { status: 200 });
}
```

The handler functions update the `memberships` and `payments` tables in Supabase. This is the single bridge between Stripe and your app.

### 4.6 Customer Portal (Self-Service)

Stripe provides a hosted portal where clients can update cards, view invoices, and download receipts. Embed it in the client dashboard:

```typescript
// app/api/billing-portal/route.ts
export async function POST(req: Request) {
  const { client_id } = await req.json();
  const client = await getClient(client_id);

  const portalSession = await stripe.billingPortal.sessions.create({
    customer: client.stripe_customer_id!,
    return_url: `${process.env.NEXT_PUBLIC_URL}/account/billing`,
  });

  return Response.json({ url: portalSession.url });
}
```

In the client dashboard, "Manage Billing" button → POST to this endpoint → redirect to Stripe-hosted portal. They handle UI updates, card management, and invoice downloads.

---

## 5. Failed Payment & Dunning Workflow

When a card fails (declined, expired, insufficient funds), Stripe retries automatically:
- Day 1: charge fails, Stripe sends email
- Day 3: Stripe retries
- Day 5: Stripe retries
- Day 7: Stripe retries
- Day 7+: subscription marked unpaid

Your job is to handle the human side via Inngest:

```typescript
inngest.createFunction(
  { id: 'failed-payment-followup' },
  { event: 'stripe/invoice.payment_failed' },
  async ({ event, step }) => {
    const { client_id, invoice_id, attempt_count } = event.data;
    const client = await step.run('fetch-client', () => getClient(client_id));

    if (attempt_count === 1) {
      // First failure — soft, friendly
      await step.run('soft-email', () => resend.emails.send({
        to: client.email,
        subject: 'Quick heads up about your IMS membership',
        body: `Hi ${client.first_name}, the card on file didn't go through. No big deal — just update your card here: [portal link]. Your sessions stay scheduled.`,
      }));
    } else if (attempt_count === 3) {
      // Second failure — escalate slightly
      await step.run('text-followup', () => twilio.messages.create({
        to: client.phone,
        body: `Hey ${client.first_name} — IMS payment didn't go through this week. Update card: [portal link]. We don't want to interrupt your training.`,
      }));
    } else if (attempt_count >= 4) {
      // Final failure — pause membership, notify trainer
      await step.run('pause-membership', () => pauseMembership(client_id, 'payment_failure'));
      await step.run('notify-trainer', () => slackNotify(`@jason ${client.full_name}'s payment failed 4x. Membership paused, please follow up.`));
    }
  }
);
```

This recovers ~60% of failed payments before they become churned clients.

---

## 6. Schema Additions for Billing

Add these to the existing `supabase_schema.sql`:

```sql
-- 1. Stripe customer ID on clients
ALTER TABLE clients ADD COLUMN IF NOT EXISTS stripe_customer_id text UNIQUE;
CREATE INDEX IF NOT EXISTS idx_clients_stripe_customer ON clients(stripe_customer_id);

-- 2. Cancellation tracking on sessions
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS cancelled_at timestamptz;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS cancelled_by uuid REFERENCES profiles(id);
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS cancellation_reason text;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS late_cancel_fee_charged boolean DEFAULT false;

-- 3. Pause tracking on memberships
ALTER TABLE memberships ADD COLUMN IF NOT EXISTS paused_at timestamptz;
ALTER TABLE memberships ADD COLUMN IF NOT EXISTS pause_resumes_at timestamptz;
ALTER TABLE memberships ADD COLUMN IF NOT EXISTS pause_days_used_ytd int DEFAULT 0;
ALTER TABLE memberships ADD COLUMN IF NOT EXISTS cancellation_requested_at timestamptz;
ALTER TABLE memberships ADD COLUMN IF NOT EXISTS cancellation_effective_at timestamptz;

-- 4. Refund requests queue
CREATE TABLE IF NOT EXISTS refund_requests (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id       uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  membership_id   uuid REFERENCES memberships(id) ON DELETE SET NULL,
  payment_id      uuid REFERENCES payments(id) ON DELETE SET NULL,
  requested_amount_cents int NOT NULL,
  reason          text NOT NULL,
  status          text NOT NULL DEFAULT 'pending', -- pending, approved, denied, processed
  reviewed_by     uuid REFERENCES profiles(id),
  reviewed_at     timestamptz,
  reviewer_notes  text,
  stripe_refund_id text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_refund_requests_status ON refund_requests(status);
CREATE INDEX IF NOT EXISTS idx_refund_requests_client ON refund_requests(client_id);

ALTER TABLE refund_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY refund_owner_all ON refund_requests FOR ALL TO authenticated USING (is_owner());
CREATE POLICY refund_self_insert ON refund_requests FOR INSERT TO authenticated WITH CHECK (client_id = auth.uid());
CREATE POLICY refund_self_read ON refund_requests FOR SELECT TO authenticated USING (client_id = auth.uid());

-- 5. Stripe webhook event log (idempotency + audit)
CREATE TABLE IF NOT EXISTS stripe_events (
  id              text PRIMARY KEY, -- Stripe event ID
  type            text NOT NULL,
  data            jsonb NOT NULL,
  processed_at    timestamptz,
  processing_error text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_stripe_events_unprocessed ON stripe_events(created_at) WHERE processed_at IS NULL;

ALTER TABLE stripe_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY stripe_events_owner_only ON stripe_events FOR ALL TO authenticated USING (is_owner());
```

---

## 6.3 Membership Pause Policy

A clean pause policy reduces churn by giving clients a graceful "off-ramp" instead of cancellation.

> **Pause Policy.** Active members can pause their membership for up to 60 cumulative days per calendar year. Pauses must be requested at least 7 days in advance and last a minimum of 14 days. During a pause, no billing occurs and no sessions are credited. Membership reactivates automatically on the scheduled return date. Pauses beyond 60 days/year may be requested for medical or relocation reasons with documentation.

Implementation:
```typescript
async function pauseMembership(membershipId: string, resumesAt: Date) {
  const membership = await getMembership(membershipId);
  const pauseDuration = daysBetween(new Date(), resumesAt);

  if (membership.pause_days_used_ytd + pauseDuration > 60) {
    throw new Error('Annual pause limit (60 days) would be exceeded.');
  }

  // Pause the Stripe subscription
  if (membership.stripe_subscription_id) {
    await stripe.subscriptions.update(membership.stripe_subscription_id, {
      pause_collection: { behavior: 'void', resumes_at: Math.floor(resumesAt.getTime() / 1000) },
    });
  }

  // Mark in Supabase
  await db.from('memberships').update({
    status: 'paused',
    paused_at: new Date(),
    pause_resumes_at: resumesAt,
    pause_days_used_ytd: membership.pause_days_used_ytd + pauseDuration,
  }).eq('id', membershipId);

  // Schedule resume
  await inngest.send({
    name: 'membership.resume',
    data: { membership_id: membershipId },
    ts: resumesAt.getTime(),
  });
}
```

---

## 7. The Migration Plan (Vagaro → Stripe)

You have ~55 active clients on Vagaro. Don't migrate them all at once. Two-phase rollout:

### Phase A — Parallel Run (Months 1-2)
- New clients sign up via Stripe (Coach OS)
- Existing Vagaro clients stay on Vagaro
- Coach OS reads Vagaro webhooks for existing clients
- Owner dashboard shows unified MRR (Stripe + Vagaro combined)

### Phase B — Migration (Month 3)
1. Email all Vagaro members 30 days before migration: "We're upgrading our billing. Your rate stays the same. Click here to switch."
2. Each client gets a one-click migration link (auth-protected)
3. Click → Stripe Checkout → first month charged via Stripe → Vagaro subscription cancelled by Jason
4. For non-responsive clients after 14 days, follow-up text. After 30 days, in-person conversation.
5. Once all members are migrated, cancel the Vagaro subscription itself

**Important:** Most Vagaro members will resist if there's any friction. Make it brain-dead simple. Same price, same schedule, one click. If you can frame it as a tangible improvement ("now you can manage everything in one place, see your program, message your coach"), adoption goes up.

### Phase C — Vagaro Sunset (Month 4)
- Coach OS handles all billing
- Vagaro account remains for historical data export only
- Ultimately cancel Vagaro entirely (~$30/month savings + cleaner ops)

---

## 8. Tax & Compliance Notes

**Sales tax:** California does not currently tax personal training services or fitness memberships. Massage therapy is also generally exempt. Body composition testing is non-taxable. **You don't need to collect sales tax.** (Verify with your CPA — this is general guidance.)

**1099 reporting:** Stripe handles 1099-K issuance for you automatically once you cross the threshold ($20,000+ and 200+ transactions, or whatever the current IRS rule is — verify yearly).

**California Health Studio Services Contract Law (Civil Code § 1812.80–1812.97):** This applies to fitness contracts in California. Key points:
- Maximum prepaid membership length: 3 years
- Right to cancel within 3 days of signing (cooling-off period)
- Death/disability cancellation rights are protected
- Specific disclosure requirements on contract documents

Your waiver and membership agreement should comply with this. Have an attorney review before launch.

**PCI compliance:** Stripe handles this entirely. As long as card numbers never touch your servers (and they won't with Stripe Checkout / Elements), you're compliant by default.

**GDPR / CCPA:** California clients have right to access and delete their data. Build a "Download my data" and "Delete my account" function in the client dashboard. Deletion should anonymize (preserve session/payment records for tax purposes, but strip PII).

---

## 9. What This Replaces

| Old | New |
|---|---|
| Vagaro membership billing | Stripe Subscriptions |
| Vagaro package sales | Stripe one-time payments |
| Vagaro card management | Stripe Customer Portal |
| Vagaro receipts/invoices | Stripe automatic invoicing |
| 12-hour cancellation policy | 24-hour cancellation policy |
| Manual late-cancel tracking | Automated session status + fee enforcement |
| Manual refund processing | Refund requests queue with owner approval |
| No pause option (Vagaro doesn't pause cleanly) | Native pause with auto-resume |
| Vagaro fee: $30/mo + transaction fees | Stripe: 2.9% + 30¢ per transaction (~$50/mo at IMS volume) |

The Stripe transaction fee is slightly higher than Vagaro's effective rate, but you save the $30/mo Vagaro fee, and the operational gain — auto-pause, refund queue, customer portal, programmatic late-cancel — is worth orders of magnitude more than the marginal fee difference.

---

## 10. Decision Checklist Before You Build

Lock these answers before writing code:

- [ ] Is the 24-hour cancellation policy final, or should we go back to 12-hour and just enforce it programmatically? (12 hours is the current published policy — sticking with 12 has zero migration friction.)
- [ ] Late cancel fee for non-members: $50 confirmed, or different number?
- [ ] Recovery service prices (massage 60/90, sauna, compression, body comp): need actual numbers
- [ ] Membership commitment: month-to-month, or do you want a 3-month or 6-month initial commit option?
- [ ] Package expiry: 12 months confirmed, or shorter/longer?
- [ ] Pause limit: 60 days/year confirmed?
- [ ] First-month discount or trial pricing for new members? (Common in fitness — "$99 first month")
- [ ] Family/spouse discount? (Some studios offer 10% off for second member in same household)
- [ ] Refund window for packages: 7 days unused confirmed?

Each yes/no above shapes a few hundred dollars worth of code or a few thousand dollars worth of revenue policy. Worth answering deliberately.

---

*IMS Coach OS · Stripe Integration & Policies Addendum · 2026*
*Companion to IMS_Ultimate_Build_Spec.md and supabase_schema.sql.*
*All policy language is template — review with attorney before publishing.*
