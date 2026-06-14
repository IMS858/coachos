/**
 * Seed the IMS Stripe product catalog.
 *
 * Run once after Stripe account setup:
 *   pnpm tsx apps/web/scripts/seed-stripe-catalog.ts
 *
 * Idempotent: re-running will create new Prices on existing Products without
 * deleting old ones. Old Prices are archived. Subscriptions on old Prices keep
 * working — only new signups land on the new Price.
 *
 * Set STRIPE_SECRET_KEY in your environment before running. Use TEST keys
 * unless you mean it.
 */

import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

interface CatalogItem {
  name: string;
  description: string;
  metadata: Record<string, string>;
  prices: Array<{
    unit_amount: number;
    currency: string;
    recurring?: { interval: "month" | "year" };
    lookup_key: string;
  }>;
}

const catalog: CatalogItem[] = [
  // === TRAINING MEMBERSHIPS ===
  {
    name: "IMS Essentials Membership",
    description: "2 sessions/week with personalized programming, includes all recovery services",
    metadata: { tier: "essentials_2x", sessions_per_week: "2", category: "training_membership" },
    prices: [{
      unit_amount: 78000,
      currency: "usd",
      recurring: { interval: "month" },
      lookup_key: "essentials_2x_monthly",
    }],
  },
  {
    name: "IMS Standard Membership",
    description: "3 sessions/week with personalized programming, includes all recovery services",
    metadata: { tier: "standard_3x", sessions_per_week: "3", category: "training_membership" },
    prices: [{
      unit_amount: 116900,
      currency: "usd",
      recurring: { interval: "month" },
      lookup_key: "standard_3x_monthly",
    }],
  },
  {
    name: "IMS Premium Membership",
    description: "4 sessions/week with priority access, includes all recovery services",
    metadata: { tier: "premium_4x", sessions_per_week: "4", category: "training_membership" },
    prices: [{
      unit_amount: 155900,
      currency: "usd",
      recurring: { interval: "month" },
      lookup_key: "premium_4x_monthly",
    }],
  },

  // === RECOVERY MEMBERSHIP ===
  {
    name: "IMS Recovery Membership",
    description: "Unlimited recovery: sauna, compression, massage, body comp. No training sessions.",
    metadata: { tier: "recovery_monthly", category: "recovery_membership" },
    prices: [{
      unit_amount: 10000,
      currency: "usd",
      recurring: { interval: "month" },
      lookup_key: "recovery_monthly",
    }],
  },

  // === SESSION PACKAGES ===
  {
    name: "IMS 6-Session Package",
    description: "6 personal training sessions at $100 each. Sessions expire 12 months from purchase.",
    metadata: { tier: "package_6", total_sessions: "6", category: "package" },
    prices: [{ unit_amount: 60000, currency: "usd", lookup_key: "package_6" }],
  },
  {
    name: "IMS 12-Session Package",
    description: "12 personal training sessions at $95 each. Sessions expire 12 months from purchase.",
    metadata: { tier: "package_12", total_sessions: "12", category: "package" },
    prices: [{ unit_amount: 114000, currency: "usd", lookup_key: "package_12" }],
  },
  {
    name: "IMS 24-Session Package",
    description: "24 personal training sessions at $90 each. Sessions expire 12 months from purchase.",
    metadata: { tier: "package_24", total_sessions: "24", category: "package" },
    prices: [{ unit_amount: 216000, currency: "usd", lookup_key: "package_24" }],
  },

  // === DROP-IN ===
  {
    name: "IMS Recovery Drop-In",
    description: "Single recovery session: sauna, compression, or 30-min massage at promo rate",
    metadata: { category: "drop_in" },
    prices: [{ unit_amount: 2500, currency: "usd", lookup_key: "recovery_dropin" }],
  },

  // === FEES ===
  {
    name: "Late Cancellation Fee",
    description: "Charged when a session is cancelled within 12 hours of scheduled time",
    metadata: { category: "fee", fee_type: "late_cancel" },
    prices: [{ unit_amount: 5000, currency: "usd", lookup_key: "late_cancel_fee" }],
  },
];

async function findOrCreateProduct(item: CatalogItem): Promise<Stripe.Product> {
  // Search by metadata.tier or name
  const existing = await stripe.products.search({
    query: `metadata['tier']:'${item.metadata.tier ?? ""}' OR name:'${item.name}'`,
    limit: 1,
  });

  if (existing.data.length > 0) {
    const product = existing.data[0]!;
    console.log(`   ↻ Found existing product: ${product.name} (${product.id})`);
    // Update description / metadata in case it changed
    await stripe.products.update(product.id, {
      description: item.description,
      metadata: item.metadata,
    });
    return product;
  }

  const product = await stripe.products.create({
    name: item.name,
    description: item.description,
    metadata: item.metadata,
  });
  console.log(`   ✓ Created product: ${product.name} (${product.id})`);
  return product;
}

async function ensurePrice(
  productId: string,
  priceData: CatalogItem["prices"][number]
): Promise<Stripe.Price> {
  // Look for existing price with this lookup_key
  const existing = await stripe.prices.list({
    lookup_keys: [priceData.lookup_key],
    active: true,
    limit: 1,
  });

  if (existing.data.length > 0) {
    const price = existing.data[0]!;
    if (price.unit_amount === priceData.unit_amount) {
      console.log(`     · Price unchanged: ${priceData.lookup_key} ($${priceData.unit_amount / 100})`);
      return price;
    }
    // Amount changed: archive old, create new
    console.log(`     ⚠ Price changed for ${priceData.lookup_key} — archiving old, creating new`);
    await stripe.prices.update(price.id, { active: false, lookup_key: undefined });
  }

  const price = await stripe.prices.create({
    product: productId,
    unit_amount: priceData.unit_amount,
    currency: priceData.currency,
    recurring: priceData.recurring,
    lookup_key: priceData.lookup_key,
    transfer_lookup_key: true,
  });
  console.log(`     ✓ Created price: ${priceData.lookup_key} ($${priceData.unit_amount / 100}${priceData.recurring ? `/${priceData.recurring.interval}` : ""})`);
  return price;
}

async function main() {
  console.log("🌱 Seeding IMS Stripe catalog...\n");

  for (const item of catalog) {
    console.log(`📦 ${item.name}`);
    const product = await findOrCreateProduct(item);
    for (const priceData of item.prices) {
      await ensurePrice(product.id, priceData);
    }
    console.log();
  }

  console.log("✅ Catalog seeded.");
  console.log("\nNext steps:");
  console.log("  1. Verify in Stripe dashboard: https://dashboard.stripe.com/products");
  console.log("  2. Create webhook endpoint pointing to /api/webhooks/stripe");
  console.log("     and subscribe to: checkout.session.completed, customer.subscription.*,");
  console.log("     invoice.payment_succeeded, invoice.payment_failed, charge.refunded");
  console.log("  3. Copy STRIPE_WEBHOOK_SECRET into apps/web/.env.local");
}

main().catch((err) => {
  console.error("❌ Seed failed:", err);
  process.exit(1);
});
