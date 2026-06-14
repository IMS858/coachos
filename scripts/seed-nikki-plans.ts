/**
 * Seeds Nikki's three concurrent plans into the new plans table:
 *   1. Custom subscription — $3,550/month (label: "Nikki Custom")
 *   2. 12-pack training package — current session #24
 *   3. 12-pack massage package — fresh, session #0
 *
 * Run after migration 0005:
 *   pnpm tsx apps/web/scripts/seed-nikki-plans.ts
 *
 * Idempotent — checks existing plans before inserting.
 */

import { createClient } from "@supabase/supabase-js";
import type { Database } from "../lib/types/database";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error("❌ Missing env vars");
  process.exit(1);
}

const supabase = createClient<Database>(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function main() {
  // Find Nikki by placeholder email
  const { data: nikkiProfile } = await supabase
    .from("profiles")
    .select("id, full_name")
    .eq("email", "nikki@ims-roster.local")
    .maybeSingle();

  if (!nikkiProfile) {
    console.error("❌ Nikki not found. Run the main client seed first.");
    process.exit(1);
  }

  const nikkiId = nikkiProfile.id;
  console.log(`Found Nikki (${nikkiId}). Setting up her plans...\n`);

  // 1. Cancel any existing migrated training package — we'll replace with the
  //    correct 12-pack at session #24 (the migration assumed a single membership)
  const { data: existing } = await supabase
    .from("plans")
    .select("id, kind, tier, service_type, current_session_number")
    .eq("client_id", nikkiId);

  console.log(`Existing plans: ${existing?.length ?? 0}`);

  // Soft-cancel any existing plans for a clean slate
  if (existing && existing.length > 0) {
    await supabase
      .from("plans")
      .update({ status: "cancelled", end_date: new Date().toISOString().slice(0, 10) })
      .eq("client_id", nikkiId);
    console.log(`  Cancelled ${existing.length} existing plan(s) for clean reseed\n`);
  }

  // 2. Insert the three plans
  const today = new Date().toISOString().slice(0, 10);

  const plans = [
    {
      client_id: nikkiId,
      kind: "subscription" as const,
      tier: "custom" as const,
      custom_label: "Nikki Custom",
      monthly_rate_cents: 355000,
      status: "active",
      start_date: today,
    },
    {
      client_id: nikkiId,
      kind: "package" as const,
      tier: "package_12" as const,
      service_type: "training" as const,
      total_sessions: 12,
      current_session_number: 24,  // her running count from the spreadsheet
      sessions_used: 24,
      package_total_cents: 114000,
      status: "active",
      start_date: today,
    },
    {
      client_id: nikkiId,
      kind: "package" as const,
      tier: "package_12" as const,
      service_type: "massage" as const,
      total_sessions: 12,
      current_session_number: 0,
      sessions_used: 0,
      package_total_cents: 114000,
      status: "active",
      start_date: today,
    },
  ];

  const { error } = await supabase.from("plans").insert(plans);
  if (error) {
    console.error("❌ Insert failed:", error.message);
    process.exit(1);
  }

  // Update billing_type on clients (subscription present → 'membership')
  await supabase
    .from("clients")
    .update({ billing_type: "membership" })
    .eq("id", nikkiId);

  console.log("✓ Nikki Custom subscription — $3,550/month");
  console.log("✓ Training 12-pack — session #24");
  console.log("✓ Massage 12-pack — session #0\n");
  console.log("Open /clients/" + nikkiId + " to see her three stacked plans.");
}

main().catch((err) => {
  console.error("❌ Failed:", err);
  process.exit(1);
});
