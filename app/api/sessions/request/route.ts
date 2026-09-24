import { type NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { sendEmail, emailShell } from "@/lib/mailer";

/**
 * POST /api/sessions/request
 * Client self-booking: a signed-in client requests a session slot.
 * Creates a session with status 'requested' assigned to their primary
 * trainer, and emails the owner so nothing sits unseen.
 *
 * Staff approve or decline via /api/sessions/[id]/respond.
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const scheduledAt = String(body.scheduled_at ?? "");
  const sessionType = String(body.session_type ?? "training");
  const note = String(body.note ?? "").slice(0, 500);
  const allowedSessionTypes = new Set(["training", "mobility", "pilates", "massage", "recovery"]);
  if (!allowedSessionTypes.has(sessionType)) {
    return NextResponse.json({ error: "Choose a valid session type." }, { status: 400 });
  }
  const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[ch] ?? ch);

  const when = new Date(scheduledAt);
  if (!scheduledAt || isNaN(when.getTime())) {
    return NextResponse.json({ error: "Pick a valid date and time." }, { status: 400 });
  }
  if (when.getTime() < Date.now() + 60 * 60 * 1000) {
    return NextResponse.json(
      { error: "Requests need at least 1 hour of notice." },
      { status: 400 }
    );
  }

  const local = new Intl.DateTimeFormat("en-US", { timeZone: "America/Los_Angeles", weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(when);
  const part = (type: string) => local.find((p) => p.type === type)?.value ?? "";
  const day = part("weekday");
  const minute = Number(part("minute"));
  const minutes = Number(part("hour")) * 60 + minute;
  if (day === "Sun" || minutes < (day === "Sat" ? 480 : 360) || minutes > (day === "Sat" ? 720 : 1080) || ![0, 30].includes(minute)) {
    return NextResponse.json({ error: "Choose a valid IMS studio time. Sundays are by appointment." }, { status: 400 });
  }
  const svc = createServiceClient();

  // Must be an actual client (staff should use the schedule directly)
  const { data: clientRow } = await svc
    .from("clients")
    .select("id, primary_trainer_id")
    .eq("id", user.id)
    .maybeSingle();
  if (!clientRow) {
    return NextResponse.json({ error: "Client account required." }, { status: 403 });
  }

  // Cap open requests to prevent spam
  const { count } = await svc
    .from("sessions")
    .select("id", { count: "exact", head: true })
    .eq("client_id", user.id)
    .eq("status", "requested");
  if ((count ?? 0) >= 5) {
    return NextResponse.json(
      { error: "You already have 5 pending requests. We'll respond soon!" },
      { status: 429 }
    );
  }

  const { data: session, error } = await svc
    .from("sessions")
    .insert({
      client_id: user.id,
      trainer_id: clientRow.primary_trainer_id,
      scheduled_at: when.toISOString(),
      duration_minutes: 60,
      session_type: sessionType,
      status: "requested",
      notes_pre: note || null,
    } as never)
    .select("id")
    .single();

  if (error || !session) {
    return NextResponse.json(
      { error: "Couldn't create the request.", detail: error?.message },
      { status: 500 }
    );
  }

  // A request is not a confirmed booking; staff must check the authoritative calendar.
  // Notify the owner (best effort)
  try {
    const { data: me } = await svc
      .from("profiles")
      .select("full_name")
      .eq("id", user.id)
      .maybeSingle();
    const ownerEmail = process.env.OWNER_EMAIL;
    if (ownerEmail) {
      const whenStr = when.toLocaleString("en-US", {
        weekday: "short", month: "short", day: "numeric",
        hour: "numeric", minute: "2-digit", timeZone: "America/Los_Angeles",
      });
      await sendEmail({
        to: ownerEmail,
        subject: `Session request — ${me?.full_name ?? "Client"} · ${whenStr}`,
        html: emailShell({
          heading: "New session request",
          bodyHtml: `
            <p><strong>${escapeHtml(me?.full_name ?? "A client")}</strong> requested a ${sessionType} session for <strong>${whenStr}</strong>.</p>
            ${note ? `<p style="color:#8a94a3;">Note: "${escapeHtml(note)}"</p>` : ""}
            <p>Approve or decline it from the Schedule page in Coach OS.</p>
          `,
        }),
      });
    }
  } catch (err) {
    console.warn("[sessions/request] owner email failed:", err);
  }

  return NextResponse.json({ ok: true, id: session.id });
}
