import { type NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { sendEmail, emailShell } from "@/lib/mailer";
import { pushClient } from "@/lib/mobile/push-client";

/** Staff booking decisions; notification failures never reverse a saved decision. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data: me, error: profileError } = await supabase.from("profiles").select("role,deleted_at").eq("id", user.id).maybeSingle();
  if (profileError) return NextResponse.json({ error: "Staff authorization unavailable" }, { status: 503 });
  if (!me || me.deleted_at || !["owner", "trainer"].includes(me.role)) return NextResponse.json({ error: "Staff only" }, { status: 403 });
  const body = await request.json().catch(() => ({}));
  const action = body.action === "approve" ? "approve" : body.action === "decline" ? "decline" : null;
  if (!action) return NextResponse.json({ error: "action must be approve or decline" }, { status: 400 });
  const svc = createServiceClient();
  const { data: session, error: sessionError } = await svc.from("sessions").select("id, client_id, scheduled_at, session_type, status").eq("id", id).maybeSingle();
  if (sessionError) return NextResponse.json({ error: "Session lookup unavailable" }, { status: 503 });
  if (!session) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (session.status !== "requested") return NextResponse.json({ error: "This request was already handled." }, { status: 409 });
  const newStatus = action === "approve" ? "scheduled" : "cancelled";
  const assignedTrainer = body.trainer_id ?? user.id;
  if (action === "approve") {
    const start = new Date(session.scheduled_at).getTime();
    const { data: conflicts, error: conflictError } = await svc.from("sessions").select("id, scheduled_at, duration_minutes")
      .eq("trainer_id", assignedTrainer).in("status", ["scheduled", "confirmed"])
      .gte("scheduled_at", new Date(start - 4 * 60 * 60 * 1000).toISOString())
      .lt("scheduled_at", new Date(start + 60 * 60 * 1000).toISOString());
    if (conflictError) return NextResponse.json({ error: "Availability check failed" }, { status: 503 });
    if ((conflicts ?? []).some(other => new Date(other.scheduled_at).getTime() < start + 60 * 60 * 1000 && new Date(other.scheduled_at).getTime() + (other.duration_minutes ?? 60) * 60000 > start)) return NextResponse.json({ error: "Trainer already has a session at this time." }, { status: 409 });
  }
  const updates: Record<string, unknown> = { status: newStatus };
  if (action === "approve") updates.trainer_id = assignedTrainer;
  else { updates.cancelled_at = new Date().toISOString(); updates.cancelled_by = user.id; updates.cancellation_reason = "declined_by_staff"; }
  const { data: updated, error } = await svc.from("sessions").update(updates as never).eq("id", id).eq("status", "requested").select("id").maybeSingle();
  if (!error && !updated) return NextResponse.json({ error: "This request was already handled." }, { status: 409 });
  if (error?.code === "40P01") return NextResponse.json({ error: "Another booking changed at the same time. Refresh availability and retry." }, { status: 409 });
  if (error?.code === "23P01") return NextResponse.json({ error: "Trainer already has a session at this time." }, { status: 409 });
  if (error) return NextResponse.json({ error: "Update failed" }, { status: 500 });

  try {
    const { data: clientProfile } = await svc.from("profiles").select("full_name,email").eq("id", session.client_id).maybeSingle();
    if (clientProfile?.email) {
      const whenStr = new Date(session.scheduled_at).toLocaleString("en-US", { weekday: "long", month: "long", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/Los_Angeles" });
      const escape = (value: string) => value.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
      const firstName = escape((clientProfile.full_name ?? "").split(" ")[0] || "there");
      await sendEmail({
        to: clientProfile.email, idempotencyKey: `session-response/${session.id}/${action}`,
        subject: action === "approve" ? `Confirmed — your IMS session on ${whenStr}` : "About your IMS session request",
        html: emailShell({ heading: action === "approve" ? "Your training is confirmed" : "Let's find another time",
          bodyHtml: action === "approve" ? `<p>Hi ${firstName},</p><p>Your ${escape(session.session_type)} session is confirmed for <strong>${whenStr}</strong>.</p><p>We're at 10625 Scripps Ranch Blvd, Suite D. See you then!</p><p>Need to reschedule? Contact IMS at (619) 937-1434.</p>` : `<p>Hi ${firstName},</p><p>We couldn't fit your requested slot on <strong>${whenStr}</strong>.</p><p>Request another time in the app, or call/text us at (619) 937-1434.</p>` }),
      });
    }
  } catch { console.warn("[sessions/respond] client email failed"); }
  try {
    const result = await pushClient(session.client_id, action === "approve" ? { kind: "booking_confirmed", title: "Training confirmed", body: "Your IMS training session is confirmed.", sessionId: session.id } : { kind: "booking_declined", title: "Training request update", body: "Your coach sent an update about your training request.", sessionId: session.id });
    if (!result.ok) console.warn("[sessions/respond] push delivery unavailable");
  } catch { console.warn("[sessions/respond] push delivery unavailable"); }
  return NextResponse.json({ ok: true, status: newStatus });
}
