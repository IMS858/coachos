/**
 * Jerry's plans — same pattern as Nikki:
 *   - Custom $3,550/mo subscription
 *   - Training 12-pack (currently at session #24, his count from the spreadsheet)
 *   - Massage 12-pack (currently at #0; bump in his profile if he's already had massages)
 *
 * Run:
 *   pnpm tsx apps/web/scripts/seed-jerry-plans.ts
 *
 * Idempotent: cancels any existing active plans first, then inserts these three.
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
  const { data: jerryProfile } = await supabase
    .from("profiles")
    .select("id, full_name")
    .eq("email", "jerry@ims-roster.local")
    .maybeSingle();

  if (!jerryProfile) {
    console.error("❌ Jerry not found. Run scripts/seed-clients.ts first.");
    process.exit(1);
  }

  const jerryId = jerryProfile.id;
  console.log(`Found Jerry (${jerryId}). Setting up plans...\n`);

  // Cancel any existing active plans for clean reseed
  const { data: existing } = await supabase
    .from("plans")
    .select("id")
    .eq("client_id", jerryId)
    .eq("status", "active");

  if (existing && existing.length > 0) {
    await supabase
      .from("plans")
      .update({ status: "cancelled", end_date: new Date().toISOString().slice(0, 10) })
      .eq("client_id", jerryId)
      .eq("status", "active");
    console.log(`  Cancelled ${existing.length} existing active plan(s)\n`);
  }

  const today = new Date().toISOString().slice(0, 10);

  const plans = [
    {
      client_id: jerryId,
      kind: "subscription" as const,
      tier: "custom" as const,
      custom_label: "Jerry Custom",
      monthly_rate_cents: 355000,
      status: "active",
      start_date: today,
    },
    {
      client_id: jerryId,
      kind: "package" as const,
      tier: "package_12" as const,
      service_type: "training" as const,
      total_sessions: 12,
      current_session_number: 24,
      sessions_used: 24,
      package_total_cents: 114000,
      status: "active",
      start_date: today,
    },
    {
      client_id: jerryId,
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

  await supabase
    .from("clients")
    .update({ billing_type: "membership" })
    .eq("id", jerryId);

  console.log("✓ Jerry Custom subscription — $3,550/month");
  console.log("✓ Training 12-pack — session #24");
  console.log("✓ Massage 12-pack — session #0");
  console.log(`\nOpen /clients/${jerryId} to verify.`);
  console.log("(Bump his massage counter in the editor if he's already had massage sessions.)");
}

main().catch((err) => {
  console.error("❌", err);
  process.exit(1);
});
