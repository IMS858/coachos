/**
 * IMS Client Roster Seed (v3 — writes to plans table)
 *
 * After audit fix: this script writes directly to `plans` instead of the
 * deprecated `memberships` table. Run AFTER migrations 0001-0007.
 *
 *   pnpm tsx apps/web/scripts/seed-clients.ts
 *
 * Idempotent — checks existing email matches and skips.
 */

import { createClient } from "@supabase/supabase-js";
import type { Database } from "../lib/types/database";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error("❌ Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient<Database>(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

interface RosterEntry {
  name: string;
  /** Package SIZE the client purchased (e.g. 24 = a 24-pack). Undefined = no package / membership TBD. Seeds with 0 sessions used (counts forward). */
  packageSize?: number;
}

const roster: RosterEntry[] = [
  // Clients with a tracked training session number
  { name: "Nikki", packageSize: 24 },
  { name: "Will", packageSize: 12 },
  { name: "Diana", packageSize: 12 },
  { name: "Dan", packageSize: 33 },
  { name: "An", packageSize: 24 },
  { name: "Delois", packageSize: 12 },
  { name: "Gabe", packageSize: 24 },
  { name: "Jim", packageSize: 12 },
  { name: "Peyton", packageSize: 6 },
  { name: "Rajan", packageSize: 12 },
  { name: "Sarah S.", packageSize: 12 },
  { name: "Sarah H.", packageSize: 4 },
  { name: "Saman", packageSize: 12 },
  { name: "Suzanne", packageSize: 12 },
  { name: "Donovan", packageSize: 24 },
  { name: "Jerry", packageSize: 24 },
  { name: "Rich W.", packageSize: 12 },
  { name: "Frank M.", packageSize: 12 },
  { name: "Mark", packageSize: 24 },
  { name: "Steve", packageSize: 12 },
  { name: "Robin", packageSize: 15 },

  // Membership clients (subscription tier set later in editor)
  { name: "Joey L." },
  { name: "AJ" },
  { name: "Colleen" },
  { name: "Matt" },
  { name: "Christian" },
  { name: "Maverick" },
  { name: "Zach" },
  { name: "Ryan" },
  { name: "Stephanie" },
  { name: "Juan" },
  { name: "Josh" },
  { name: "Olive" },
  { name: "Iris" },
  { name: "Shelby" },
  { name: "Matt Yarling" },
  { name: "Stacey" },
  { name: "Debbie" },
  { name: "Danny" },
  { name: "Nick" },
  { name: "Hailey" },
  { name: "Jen" },
  { name: "Alan" },
  { name: "Tom" },
  { name: "Tameem" },
  { name: "Gabriel" },
];

function packageTierFor(
  sessions: number
): "package_6" | "package_12" | "package_24" | "package_custom" {
  if (sessions === 6) return "package_6";
  if (sessions === 12) return "package_12";
  if (sessions === 24) return "package_24";
  // Non-standard sizes (e.g. Dan's 33, Robin's 15, Sarah H's 4)
  return "package_custom";
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/\./g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

async function seedClient(entry: RosterEntry) {
  const email = `${slugify(entry.name)}@ims-roster.local`;

  const { data: existing } = await supabase
    .from("profiles")
    .select("id")
    .eq("email", email)
    .maybeSingle();

  if (existing) return { status: "skipped" as const, reason: "exists" };

  const { data: authData, error: authError } = await supabase.auth.admin.createUser({
    email,
    password: cryptoPassword(),
    email_confirm: true,
    user_metadata: { full_name: entry.name },
  });

  if (authError || !authData.user) {
    return { status: "failed" as const, reason: authError?.message ?? "no user" };
  }

  const userId = authData.user.id;
  const hasPackage = entry.packageSize !== undefined;

  await supabase
    .from("profiles")
    .update({ full_name: entry.name, role: "client" })
    .eq("id", userId);

  await supabase.from("clients").insert({
    id: userId,
    status: "active",
    billing_type: hasPackage ? "package" : "unset",
    joined_at: new Date().toISOString(),
  });

  if (hasPackage && entry.packageSize !== undefined) {
    const tier = packageTierFor(entry.packageSize);
    await supabase.from("plans").insert({
      client_id: userId,
      kind: "package",
      tier,
      // Label custom-size packs clearly (e.g. "33-Session Package")
      custom_label:
        tier === "package_custom"
          ? `${entry.packageSize}-Session Package`
          : null,
      service_type: "training",
      status: "active",
      // The number after the name is the package SIZE they bought.
      // total_sessions = that size; sessions_used = 0 (counts forward from today).
      total_sessions: entry.packageSize,
      current_session_number: 0,
      sessions_used: 0,
      start_date: new Date().toISOString().slice(0, 10),
    });
  }

  return { status: "created" as const };
}

function cryptoPassword(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(16)))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function main() {
  console.log(`🌱 Seeding ${roster.length} clients (writing to plans table)\n`);

  let created = 0, skipped = 0, failed = 0;
  const failures: Array<{ name: string; reason: string }> = [];

  for (const entry of roster) {
    const result = await seedClient(entry);
    const tag = result.status === "created" ? "✓" : result.status === "skipped" ? "·" : "✗";
    const detail = entry.packageSize !== undefined
      ? `${entry.packageSize}-session package`
      : "membership · tier unset";
    console.log(`  ${tag} ${entry.name.padEnd(20)} ${detail}${result.reason ? ` — ${result.reason}` : ""}`);

    if (result.status === "created") created++;
    else if (result.status === "skipped") skipped++;
    else { failed++; failures.push({ name: entry.name, reason: result.reason ?? "?" }); }
  }

  console.log(`\n${created} created · ${skipped} existed · ${failed} failed`);
  if (failures.length > 0) {
    console.log("\nFailures:");
    for (const f of failures) console.log(`  - ${f.name}: ${f.reason}`);
  }

  console.log(`\nNext:`);
  console.log(`  pnpm tsx scripts/seed-nikki-plans.ts   # Nikki's stacked plans`);
  console.log(`  pnpm tsx scripts/seed-jerry-plans.ts   # Jerry's stacked plans`);
}

main().catch((err) => {
  console.error("❌", err);
  process.exit(1);
});
