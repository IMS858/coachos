import { type NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { sendEmail, emailShell } from "@/lib/mailer";

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

  const { data: me } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  if (!me || !["owner", "trainer"].includes(me.role)) {
    return NextResponse.json({ error: "Staff only" }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const action = body.action === "approve" ? "approve" : body.action === "decline" ? "decline" : null;
  if (!action) {
    return NextResponse.json({ error: "action must be approve or decline" }, { status: 400 });
  }

  const svc = createServiceClient();
  const { data: session } = await svc
    .from("sessions")
    .select("id, client_id, scheduled_at, session_type, status")
    .eq("id", id)
    .maybeSingle();
  if (!session) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (session.status !== "requested") {
    return NextResponse.json({ error: "This request was already handled." }, { status: 409 });
  }

  const newStatus = action === "approve" ? "scheduled" : "cancelled";
  const updates: Record<string, unknown> = { status: newStatus };
  if (action === "approve") {
    // Requests may come in unassigned — the approver picks them up
    updates.trainer_id = body.trainer_id ?? user.id;
  } else {
    updates.cancelled_at = new Date().toISOString();
    updates.cancelled_by = user.id;
    updates.cancellation_reason = "declined_by_staff";
  }

  const { error } = await svc.from("sessions").update(updates as never).eq("id", id);
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

  return NextResponse.json({ ok: true, status: newStatus });
}
