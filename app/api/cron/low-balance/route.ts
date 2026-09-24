import { NextResponse, type NextRequest } from "next/server";
import { findLowBalancePackages } from "@/lib/queries/low-balance";
import { sendEmail, emailShell } from "@/lib/mailer";
import { createServiceClient } from "@/lib/supabase/server";

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
  if (!secret) {
    // Fail closed: without a configured secret this endpoint is not callable.
    return NextResponse.json(
      { error: "CRON_SECRET not configured" },
      { status: 503 }
    );
  }
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const lowBalance = await findLowBalancePackages(2);
  const svc = createServiceClient();
  const depleted = lowBalance.filter((c) => c.state === "depleted");
  const low = lowBalance.filter((c) => c.state === "low");

  // ---------------------------------------------------------------------------
  // Owner digest email — sends only if there's something to report AND
  // an owner email is configured. No-ops silently if Resend isn't set up yet.
  // ---------------------------------------------------------------------------
  const ownerEmail = process.env.OWNER_EMAIL || "admin@imsfitnesscenter.com";
  let emailed = false;

  if (lowBalance.length > 0) {
    const rows = lowBalance
      .map(
        (c) =>
          `<tr>
             <td style="padding:6px 0;color:#dfe7f0;font-family:Arial,sans-serif;font-size:14px;">${c.name}</td>
             <td style="padding:6px 0;color:#b8c4d2;font-family:Arial,sans-serif;font-size:13px;">${c.planLabel}</td>
             <td style="padding:6px 0;text-align:right;font-family:Arial,sans-serif;font-size:13px;color:${
               c.state === "depleted" ? "#f08a8a" : "#f0b46a"
             };">${c.state === "depleted" ? "Depleted" : `${c.remaining} left`}</td>
           </tr>`
      )
      .join("");

    const { data: owner } = await svc.from("profiles").select("id").eq("role", "owner").limit(1).maybeSingle();
    if (!owner?.id) return NextResponse.json({ error: "Owner recipient unavailable" }, { status: 503 });
    const day = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles" }).format(new Date());
    const dedupeKey = `owner-low-balance:${day}`;
    const { data: claim, error: claimError } = await svc.rpc("claim_notification", {
      p_key: dedupeKey, p_recipient: owner.id, p_template: "owner-low-balance", p_payload: { to: ownerEmail, count: lowBalance.length },
    });
    if (claimError) return NextResponse.json({ error: "Notification ledger unavailable" }, { status: 503 });
    if (!claim) return NextResponse.json({ ran_at: new Date().toISOString(), total_flagged: lowBalance.length, emailed: false, duplicate_suppressed: true });
    const result = await sendEmail({
      to: ownerEmail,
      subject: `${lowBalance.length} client${lowBalance.length === 1 ? "" : "s"} need a package renewal`,
      text: lowBalance
        .map((c) => `${c.name} — ${c.planLabel} — ${c.state === "depleted" ? "depleted" : `${c.remaining} left`}`)
        .join("\n"),
      html: emailShell({
        heading: "Packages running low",
        bodyHtml:
          `These clients are at or below 2 sessions remaining. Reach out to ` +
          `renew before they run out:` +
          `<table role="presentation" width="100%" style="margin-top:16px;border-collapse:collapse;">${rows}</table>`,
        footnote: "Daily automatic scan from IMS Coach OS.",
      }),
    });
    const { data: saved, error: saveError } = await svc.rpc("finish_notification", { p_key: dedupeKey, p_token: claim.token, p_provider: result.ok ? result.id : null, p_error: result.ok ? null : result.error });
    if (saveError || !saved) return NextResponse.json({ error: "Delivery acknowledgement failed" }, { status: 503 });
    emailed = result.ok;
  }

  const summary = {
    ran_at: new Date().toISOString(),
    total_flagged: lowBalance.length,
    emailed,
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
