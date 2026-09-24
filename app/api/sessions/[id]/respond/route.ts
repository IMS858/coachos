import { type NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { sendEmail, emailShell } from "@/lib/mailer";
import { pushClient } from "@/lib/mobile/push-client";

/**
 * POST /api/sessions/[id]/respond
 * Staff only. Body: { action: "approve" | "decline" }
 * approve → status 'scheduled'; decline → status 'cancelled'.
 * Emails the client the decision either way.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: me, error: profileError } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  if (profileError) return NextResponse.json({ error: "Staff authorization unavailable" }, { status: 503 });
  if (!me || !["owner", "trainer"].includes(me.role)) {
    return NextResponse.json({ error: "Staff only" }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const action = body.action === "approve" ? "approve" : body.action === "decline" ? "decline" : null;
  if (!action) {
    return NextResponse.json({ error: "action must be approve or decline" }, { status: 400 });
  }

  const svc = createServiceClient();
  const { data: session, error: sessionError } = await svc
    .from("sessions")
    .select("id, client_id, scheduled_at, session_type, status")
    .eq("id", id)
    .maybeSingle();
  if (sessionError) return NextResponse.json({ error: "Session lookup unavailable" }, { status: 503 });
  if (!session) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (session.status !== "requested") {
    return NextResponse.json({ error: "This request was already handled." }, { status: 409 });
  }

  const newStatus = action === "approve" ? "scheduled" : "cancelled";
  const assignedTrainer = body.trainer_id ?? user.id;
  if (action === "approve") {
    // Reject a known conflicting appointment before assigning the trainer.
    const start = new Date(session.scheduled_at).getTime();
    const { data: conflicts, error: conflictError } = await svc.from("sessions")
      .select("id, scheduled_at, duration_minutes")
      .eq("trainer_id", assignedTrainer)
      .in("status", ["scheduled", "confirmed"])
      .gte("scheduled_at", new Date(start - 4 * 60 * 60 * 1000).toISOString())
      .lt("scheduled_at", new Date(start + 60 * 60 * 1000).toISOString());
    if (conflictError) return NextResponse.json({ error: "Availability check failed" }, { status: 503 });
    if ((conflicts ?? []).some((other) => new Date(other.scheduled_at).getTime() < start + 60 * 60 * 1000 && new Date(other.scheduled_at).getTime() + (other.duration_minutes ?? 60) * 60000 > start))
      return NextResponse.json({ error: "Trainer already has a session at this time." }, { status: 409 });
  }
  const updates: Record<string, unknown> = { status: newStatus };
  if (action === "approve") {
    // Requests may come in unassigned — the approver picks them up
    updates.trainer_id = assignedTrainer;
  } else {
    updates.cancelled_at = new Date().toISOString();
    updates.cancelled_by = user.id;
    updates.cancellation_reason = "declined_by_staff";
  }

  const { data: updated, error } = await svc.from("sessions").update(updates as never).eq("id", id).eq("status", "requested").select("id").maybeSingle();
  if (!error && !updated) return NextResponse.json({ error: "This request was already handled." }, { status: 409 });
  if(error?.code === "40P01") return NextResponse.json({error:"Another booking changed at the same time. Refresh availability and retry."},{status:409});
  if (error?.code === "23P01") return NextResponse.json({error:"Trainer already has a session at this time."},{status:409});
  if (error) {
    return NextResponse.json({ error: "Update failed", detail: error.message }, { status: 500 });
  }

  // Email the client the decision (best effort)
  try {
    const { data: clientProfile } = await svc
      .from("profiles")
      .select("full_name, email")
      .eq("id", session.client_id)
      .maybeSingle();
    if (clientProfile?.email) {
      const whenStr = new Date(session.scheduled_at).toLocaleString("en-US", {
        weekday: "long", month: "long", day: "numeric",
        hour: "numeric", minute: "2-digit", timeZone: "America/Los_Angeles",
      });
      const firstName = (clientProfile.full_name ?? "").split(" ")[0] || "there";
      if (action === "approve") {
        await sendEmail({
          to: clientProfile.email,
          idempotencyKey: `session-response/${session.id}/approve`,
          subject: `Confirmed — your IMS session on ${whenStr}`,
          html: emailShell({
            heading: "You're booked! ✓",
            bodyHtml: `
              <p>Hi ${firstName},</p>
              <p>Your ${session.session_type} session is confirmed for <strong>${whenStr}</strong>.</p>
              <p>We're at 10625 Scripps Ranch Blvd, Suite D. See you then!</p>
              <p style="color:#8a94a3;font-size:13px;">Need to reschedule? Give us 12 hours notice — (619) 937-1434.</p>
            `,
          }),
        });
      } else {
        await sendEmail({
          to: clientProfile.email,
          idempotencyKey: `session-response/${session.id}/decline`,
          subject: "About your IMS session request",
          html: emailShell({
            heading: "Let's find another time",
            bodyHtml: `
              <p>Hi ${firstName},</p>
              <p>We couldn't fit your requested slot on <strong>${whenStr}</strong> — sorry about that.</p>
              <p>Request another time in the app, or call/text us at (619) 937-1434 and we'll find something that works.</p>
            `,
          }),
        });
      }
    }
  } catch (err) {
    console.warn("[sessions/respond] client email failed:", err);
  }

  const pushResult = await pushClient(session.client_id, action === "approve" ? { kind: "booking_confirmed", title: "Training confirmed", body: "Your IMS training session is confirmed.", sessionId: session.id } : { kind: "booking_declined", title: "Training request update", body: "Your coach sent an update about your training request.", sessionId: session.id });
  if (!pushResult.ok && pushResult.reason !== "no_registered_devices") console.warn("[sessions/respond] client push failed:", pushResult);

  return NextResponse.json({ ok: true, status: newStatus });
}
