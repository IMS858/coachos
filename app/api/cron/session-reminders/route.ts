import { type NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { sendEmail, emailShell } from "@/lib/mailer";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

/**
 * GET /api/cron/session-reminders
 * Runs daily (see vercel.json). Emails every client with a session in the
 * next 20–30 hours a friendly reminder — the single biggest no-show killer.
 *
 * Protected by CRON_SECRET (fail closed).
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "CRON_SECRET not configured" },
      { status: 503 }
    );
  }
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const svc = createServiceClient();

  // Sessions 20–30 hours out (daily run catches "tomorrow" cleanly)
  const from = new Date(Date.now() + 20 * 60 * 60 * 1000).toISOString();
  const to = new Date(Date.now() + 30 * 60 * 60 * 1000).toISOString();

  const { data: sessions } = await svc
    .from("sessions")
    .select("id, client_id, trainer_id, scheduled_at, session_type")
    .in("status", ["scheduled", "confirmed"])
    .gte("scheduled_at", from)
    .lte("scheduled_at", to);

  if (!sessions || sessions.length === 0) {
    return NextResponse.json({ ok: true, reminded: 0 });
  }

  // Fetch client + trainer names/emails in two batched queries
  const ids = [
    ...new Set(
      sessions.flatMap((s: any) => [s.client_id, s.trainer_id].filter(Boolean))
    ),
  ];
  const { data: profiles } = await svc
    .from("profiles")
    .select("id, full_name, email")
    .in("id", ids);
  const byId = new Map((profiles ?? []).map((p: any) => [p.id, p]));

  let reminded = 0;
  for (const s of sessions as any[]) {
    const client = byId.get(s.client_id);
    if (!client?.email) continue;
    const trainer = s.trainer_id ? byId.get(s.trainer_id) : null;
    const whenStr = new Date(s.scheduled_at).toLocaleString("en-US", {
      weekday: "long",
      hour: "numeric",
      minute: "2-digit",
      timeZone: "America/Los_Angeles",
    });
    const firstName = (client.full_name ?? "").split(" ")[0] || "there";

    const result = await sendEmail({
      to: client.email,
      subject: `Reminder — your IMS session ${whenStr}`,
      html: emailShell({
        heading: "See you tomorrow! 💪",
        bodyHtml: `
          <p>Hi ${firstName},</p>
          <p>Quick reminder: your <strong>${s.session_type}</strong> session is <strong>${whenStr}</strong>${trainer?.full_name ? ` with ${trainer.full_name.split(" ")[0]}` : ""}.</p>
          <p>10625 Scripps Ranch Blvd, Suite D · wear something you can move in.</p>
          <p style="color:#8a94a3;font-size:13px;">Need to reschedule? 12 hours notice, please — (619) 937-1434.</p>
        `,
      }),
    });
    if (result.ok) reminded++;
  }

  return NextResponse.json({ ok: true, reminded, total: sessions.length });
}
