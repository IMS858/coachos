import { pushClient } from "@/lib/mobile/push-client";
import { type NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { sendEmail, emailShell } from "@/lib/mailer";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

/**
 * GET /api/cron/session-reminders
 * Scheduled daily on the current Vercel plan, but safe to invoke more often
 * from an external scheduler. Sends a 24h reminder and a short-notice reminder
 * when a booking is created too late for the daily pass.
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

  const now = new Date();
  const from = now.toISOString();
  const toDate = new Date(now);
  toDate.setHours(toDate.getHours() + 30);
  const to = toDate.toISOString();

  const { data: sessions, error: sessionError } = await svc
    .from("sessions")
    .select("id, client_id, trainer_id, scheduled_at, session_type")
    .in("status", ["scheduled", "confirmed"])
    .gte("scheduled_at", from)
    .lte("scheduled_at", to);

  if (sessionError) return NextResponse.json({ error: "Session lookup failed" }, { status: 503 });
  if (!sessions || sessions.length === 0) {
    return NextResponse.json({ ok: true, reminded: 0 });
  }

  // Fetch client + trainer names/emails in two batched queries
  const ids = [
    ...new Set(
      sessions.flatMap((s: any) => [s.client_id, s.trainer_id].filter(Boolean))
    ),
  ];
  const { data: profiles, error: profileError } = await svc
    .from("profiles")
    .select("id, full_name, email")
    .in("id", ids);
  if(profileError) return NextResponse.json({error:"Recipient lookup failed"},{status:503});
  const escapeHtml=(value:string)=>value.replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[ch] ?? ch);
  const byId = new Map((profiles ?? []).map((p: any) => [p.id, p]));

  let reminded = 0;
  let failed = 0;
  let skipped = 0;
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

    const hoursUntil = (new Date(s.scheduled_at).getTime() - now.getTime()) / 3600000;
    // Daily execution normally catches the 24h window. A more frequent external
    // scheduler can also catch bookings made inside 12h without duplicating mail.
    const reminderWindow = hoursUntil <= 12 ? "short-notice" : "24h";
    const dedupeKey = `session-reminder-${reminderWindow}:${s.id}:${s.scheduled_at}`;
    const payload = {
      to: client.email,
      subject: `${reminderWindow === "short-notice" ? "Coming up" : "Reminder"} — your IMS session ${whenStr}`,
      html: emailShell({
        heading: "Your upcoming IMS session",
        bodyHtml: `
          <p>Hi ${escapeHtml(firstName)},</p>
          <p>Quick reminder: your <strong>${escapeHtml(s.session_type)}</strong> session is <strong>${whenStr}</strong>${trainer?.full_name ? ` with ${escapeHtml(trainer.full_name.split(" ")[0])}` : ""}.</p>
          <p>10625 Scripps Ranch Blvd, Suite D · wear something you can move in.</p>
          <p style="color:#8a94a3;font-size:13px;">Need to reschedule? 24 hours notice, please — (619) 937-1434.</p>
        `,
      }),
    };
    const {data:claim,error:claimError}=await svc.rpc("claim_notification",{
      p_key:dedupeKey,p_recipient:s.client_id,p_template:"session-reminder",p_payload:payload,
    });
    if(claimError) return NextResponse.json({error:"Notification ledger unavailable",reminded,failed},{status:503});
    if(!claim){skipped++;continue;}
    const result=await sendEmail({...claim.payload,idempotencyKey:dedupeKey});
    const {data:saved,error:saveError}=await svc.rpc("finish_notification",{
      p_key:dedupeKey,p_token:claim.token,p_provider:result.ok?result.id:null,p_error:result.ok?null:result.error,
    });
    if(saveError || !saved) return NextResponse.json({error:"Delivery acknowledgement failed",reminded,failed},{status:503});
    if(result.ok) {
      reminded++;
      const pushResult=await pushClient(s.client_id,{kind:"session_reminder",title:reminderWindow==="short-notice"?"Training coming up":"Training reminder",body:`Your IMS training session is ${whenStr}.`,sessionId:s.id});
      if(!pushResult.ok && pushResult.reason!=="no_registered_devices") console.warn("[session-reminders] push failed",s.id,pushResult);
    } else failed++;
  }
  return NextResponse.json({ok:failed===0,reminded,failed,skipped,total:sessions.length},{status:failed?502:200});
}
