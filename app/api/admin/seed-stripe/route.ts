import { type NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { createClient } from "@/lib/supabase/server";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

/**
 * POST /api/admin/seed-stripe
 * One-time: creates the IMS product catalog in Stripe (idempotent).
 * Owner-only. Uses STRIPE_SECRET_KEY from env.
 */

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
  { name: "IMS Essentials Membership", description: "2 sessions/week, includes recovery services", metadata: { tier: "essentials_2x", category: "training_membership" }, prices: [{ unit_amount: 78000, currency: "usd", recurring: { interval: "month" }, lookup_key: "essentials_2x_monthly" }] },
  { name: "IMS Standard Membership", description: "3 sessions/week, includes recovery services", metadata: { tier: "standard_3x", category: "training_membership" }, prices: [{ unit_amount: 116900, currency: "usd", recurring: { interval: "month" }, lookup_key: "standard_3x_monthly" }] },
  { name: "IMS Premium Membership", description: "4 sessions/week with priority access", metadata: { tier: "premium_4x", category: "training_membership" }, prices: [{ unit_amount: 155900, currency: "usd", recurring: { interval: "month" }, lookup_key: "premium_4x_monthly" }] },
  { name: "IMS Recovery Membership", description: "Unlimited recovery. No training sessions.", metadata: { tier: "recovery_monthly", category: "recovery_membership" }, prices: [{ unit_amount: 10000, currency: "usd", recurring: { interval: "month" }, lookup_key: "recovery_monthly" }] },
  { name: "IMS 6-Session Package", description: "6 sessions at $100 each", metadata: { tier: "package_6", category: "package" }, prices: [{ unit_amount: 60000, currency: "usd", lookup_key: "package_6" }] },
  { name: "IMS 12-Session Package", description: "12 sessions at $95 each", metadata: { tier: "package_12", category: "package" }, prices: [{ unit_amount: 114000, currency: "usd", lookup_key: "package_12" }] },
  { name: "IMS 24-Session Package", description: "24 sessions at $90 each", metadata: { tier: "package_24", category: "package" }, prices: [{ unit_amount: 216000, currency: "usd", lookup_key: "package_24" }] },
];

export async function POST(_request: NextRequest) {
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
  if (me?.role !== "owner") {
    return NextResponse.json({ error: "Owner only" }, { status: 403 });
  }

  const secret = process.env.STRIPE_SECRET_KEY;
  if (!secret) {
    return NextResponse.json(
      { error: "STRIPE_SECRET_KEY missing in Vercel." },
      { status: 503 }
    );
  }

  const stripe = new Stripe(secret);
  const results: string[] = [];

  try {
    for (const item of catalog) {
      // find or create product
      const search = await stripe.products.search({
        query: `metadata['tier']:'${item.metadata.tier}' OR name:'${item.name}'`,
        limit: 1,
      });
      let productId: string;
      if (search.data.length > 0) {
        productId = search.data[0].id;
        await stripe.products.update(productId, {
          description: item.description,
          metadata: item.metadata,
        });
      } else {
        const p = await stripe.products.create({
          name: item.name,
          description: item.description,
          metadata: item.metadata,
        });
        productId = p.id;
      }

      // ensure price by lookup key
      for (const pd of item.prices) {
        const existing = await stripe.prices.list({
          lookup_keys: [pd.lookup_key],
          active: true,
          limit: 1,
        });
        if (existing.data.length > 0 && existing.data[0].unit_amount === pd.unit_amount) {
          results.push(`✓ ${item.name} — already set (${pd.lookup_key})`);
          continue;
        }
        if (existing.data.length > 0) {
          await stripe.prices.update(existing.data[0].id, { active: false, lookup_key: undefined as any });
        }
        await stripe.prices.create({
          product: productId,
          unit_amount: pd.unit_amount,
          currency: pd.currency,
          recurring: pd.recurring,
          lookup_key: pd.lookup_key,
          transfer_lookup_key: true,
        });
        results.push(`✓ ${item.name} — created (${pd.lookup_key})`);
      }
    }
  } catch (err: any) {
    return NextResponse.json(
      { error: "Seed failed", detail: String(err?.message ?? err).slice(0, 300), results },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, count: results.length, results });
}
