import { NextResponse, type NextRequest } from "next/server";
import { findLowBalancePackages } from "@/lib/queries/low-balance";

/**
 * GET /api/cron/low-balance
 *
 * Runs daily (see crons in vercel.json — 15:00 UTC ≈ 7–8 AM Pacific).
 * Scans for packages at or below 2 sessions remaining.
 *
 * Today it returns a structured digest (visible in Vercel cron logs and
 * callable manually). When an email/SMS channel is wired up — Resend or
 * GoHighLevel — send it from the marked spot below; the data shape is ready.
 *
 * Protected by CRON_SECRET: Vercel automatically sends
 * `Authorization: Bearer <CRON_SECRET>` when the env var is set. Manual
 * callers must send the same header.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = request.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const lowBalance = await findLowBalancePackages(2);
  const depleted = lowBalance.filter((c) => c.state === "depleted");
  const low = lowBalance.filter((c) => c.state === "low");

  // ---------------------------------------------------------------------------
  // EMAIL/SMS HOOK — wire a channel here when ready. For each entry in
  // `lowBalance` you have: name, planLabel, remaining, state, clientId.
  //
  // Example (Resend):
  //   await resend.emails.send({
  //     from: "IMS <hello@imsmethod.com>",
  //     to: "admin@imsfitnesscenter.com",
  //     subject: `${lowBalance.length} client(s) need a package renewal`,
  //     text: summaryText,
  //   });
  // ---------------------------------------------------------------------------

  const summary = {
    ran_at: new Date().toISOString(),
    total_flagged: lowBalance.length,
    depleted: depleted.map((c) => ({ name: c.name, plan: c.planLabel })),
    low: low.map((c) => ({
      name: c.name,
      plan: c.planLabel,
      remaining: c.remaining,
    })),
  };

  // Logged in Vercel cron output for now
  console.log("[cron:low-balance]", JSON.stringify(summary));

  return NextResponse.json(summary);
}
