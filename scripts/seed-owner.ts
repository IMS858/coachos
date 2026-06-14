/**
 * One-shot script to create or promote the IMS owner account.
 *
 * Without an owner account you can't sign in to your own app. Run this
 * once against the production Supabase project.
 *
 *   pnpm tsx apps/web/scripts/seed-owner.ts jason@imsfitnesscenter.com
 *
 * What it does:
 *   1. If the email already exists in auth.users → promotes profile.role to 'owner'
 *   2. If new → creates the auth user with email_confirm=true (so magic link
 *      sign-in works immediately) + sets profile.role = 'owner'
 *
 * After it runs, sign in at /login. Magic link will be emailed to the address.
 */

import { createClient } from "@supabase/supabase-js";
import type { Database } from "../lib/types/database";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error("❌ Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  console.error("    Make sure .env.local has them set, then re-run.");
  process.exit(1);
}

const email = process.argv[2]?.trim().toLowerCase();
if (!email || !email.includes("@")) {
  console.error("Usage: pnpm tsx apps/web/scripts/seed-owner.ts <email>");
  process.exit(1);
}

const fullName = process.argv[3]?.trim() || "IMS Owner";

const supabase = createClient<Database>(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function main() {
  console.log(`Looking up ${email}...`);

  const { data: existing } = await supabase
    .from("profiles")
    .select("id, role")
    .eq("email", email)
    .maybeSingle();

  if (existing) {
    if (existing.role === "owner") {
      console.log(`✓ ${email} is already the owner. Nothing to do.`);
      return;
    }
    console.log(`Promoting existing user to owner...`);
    const { error } = await supabase
      .from("profiles")
      .update({ role: "owner" })
      .eq("id", existing.id);
    if (error) {
      console.error("❌ Promote failed:", error.message);
      process.exit(1);
    }
    console.log(`✓ ${email} is now the owner.`);
    return;
  }

  console.log(`Creating new owner account for ${email}...`);

  // Random password — they sign in via magic link, never type this
  const tempPassword = Array.from(crypto.getRandomValues(new Uint8Array(24)))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  const { data: authData, error: authError } = await supabase.auth.admin.createUser({
    email,
    password: tempPassword,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  });

  if (authError || !authData.user) {
    console.error("❌ Could not create auth user:", authError?.message);
    process.exit(1);
  }

  const userId = authData.user.id;

  // The profile row is auto-created by a trigger on auth.users.
  // We update it to set the owner role + correct name.
  const { error: profileError } = await supabase
    .from("profiles")
    .update({
      full_name: fullName,
      role: "owner",
    })
    .eq("id", userId);

  if (profileError) {
    console.error("❌ Could not set role:", profileError.message);
    process.exit(1);
  }

  console.log(`\n✓ Owner account created.\n`);
  console.log(`  Email:  ${email}`);
  console.log(`  Name:   ${fullName}`);
  console.log(`  Role:   owner`);
  console.log(`\nNow go to /login and sign in. Magic link email will be sent.`);
}

main().catch((err) => {
  console.error("❌", err);
  process.exit(1);
});
