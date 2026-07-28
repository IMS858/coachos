import { type NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { sendEmail, emailShell } from "@/lib/mailer";

export const dynamic = "force-dynamic";

/**
 * POST /api/sessions/[id]/cancel
 *
 * THE POLICY, IN ONE PLACE
 *   24+ hours notice → free. Nothing is charged, whatever they're on.
 *   Under 24 hours   → package clients are charged the session; members aren't
 *                      (they've already paid for the month either way).
 *
 * Members can rebook instead of losing the slot, so a timely cancel returns
 * can_reschedule and the UI offers a new time straight away.
 *
 * GET on this route returns the same verdict WITHOUT cancelling, so the client
 * can be told what it'll cost before they confirm. Nobody should discover the
 * policy after the fact.
 */

const NOTICE_HOURS = 24;

type Verdict = {
  hours_notice: number;
  is_late: boolean;
  plan_kind: "package" | "subscription" | "none";
  will_charge_session: boolean;
  can_reschedule: boolean;
  message: string;
};

async function assess(sessionId: string, userId: string, isStaff: boolean) {
  const svc = createServiceClient();

  const { data: session } = await svc
    .from("sessions")
    .select("id, client_id, scheduled_at, status, session_type, service_type")
    .eq("id", sessionId)
    .maybeSingle();

  if (!session) return { error: "Session not found", status: 404 as const };

  const s = session as any;
  if (!isStaff && s.client_id !== userId) {
    return { error: "Session not found", status: 404 as const };
  }
  if (["completed", "cancelled", "late_cancelled", "no_show"].includes(s.status)) {
    return { error: `This session is already marked ${s.status.replace("_", " ")}.`, status: 400 as const };
  }

  const hours = (new Date(s.scheduled_at).getTime() - Date.now()) / 3_600_000;
  const isLate = hours < NOTICE_HOURS;

  // Which plan is footing this session?
  const { data: plans } = await svc
    .from("plans")
    .select("id, kind, tier, total_sessions, current_session_number")
    .eq("client_id", s.client_id)
    .eq("status", "active");

  const list = (plans ?? []) as any[];
  const pkg = list.find((p) => p.kind === "package");
  const sub = list.find((p) => p.kind === "subscription");
  const planKind: Verdict["plan_kind"] = pkg ? "package" : sub ? "subscription" : "none";

  // Only package clients can lose a session — a member has already paid for
  // the month regardless.
  const willCharge = isLate && planKind === "package";

  const verdict: Verdict = {
    hours_notice: Math.round(hours * 10) / 10,
    is_late: isLate,
    plan_kind: planKind,
    will_charge_session: willCharge,
    can_reschedule: !isLate,
    message: willCharge
      ? `Under ${NOTICE_HOURS} hours' notice — this will use one of your sessions.`
      : isLate
        ? `Under ${NOTICE_HOURS} hours' notice. Nothing is charged on a membership, but Jason will be told.`
        : planKind === "subscription"
          ? "Free to cancel — you can rebook another time this week."
          : "Free to cancel — no session used.",
  };

  return { session: s, verdict, svc };
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: me } = await supabase
    .from("profiles").select("role").eq("id", user.id).maybeSingle();
  const isStaff = !!me && ["owner", "trainer"].includes((me as any).role);

  const result = await assess(id, user.id, isStaff);
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json(result.verdict);
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: me } = await supabase
    .from("profiles").select("role, full_name").eq("id", user.id).maybeSingle();
  const isStaff = !!me && ["owner", "trainer"].includes((me as any).role);

  const result = await assess(id, user.id, isStaff);
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  const { session, verdict, svc } = result;

  const body = await request.json().catch(() => ({}));
  const reason = String(body.reason ?? "").trim().slice(0, 500);

  const { error: updErr } = await svc
    .from("sessions")
    .update({
      status: verdict.is_late ? "late_cancelled" : "cancelled",
      cancelled_at: new Date().toISOString(),
      cancelled_by: user.id,
      cancellation_reason: reason || null,
      late_cancel_fee_charged: verdict.will_charge_session,
    } as never)
    .eq("id", id);

  if (updErr) {
    console.error("[cancel]", updErr.message);
    return NextResponse.json({ error: updErr.message }, { status: 500 });
  }

  // A late package cancel consumes the session, same as if they'd trained.
  let charged = false;
  if (verdict.will_charge_session) {
    const { data: rpc, error: rpcErr } = await svc.rpc("increment_session_counter", {
      p_client_id: (session as any).client_id,
      p_service_type: (session as any).service_type ?? "training",
    });
    if (rpcErr) console.error("[cancel] charge failed:", rpcErr.message);
    else charged = Boolean((rpc as any)?.incremented);
  }

  // Tell Jason. A cancellation he doesn't hear about is a wasted slot.
  try {
    const { data: client } = await svc
      .from("profiles").select("full_name").eq("id", (session as any).client_id).maybeSingle();
    const ownerEmail = process.env.OWNER_EMAIL;
    if (ownerEmail) {
      const when = new Date((session as any).scheduled_at).toLocaleString("en-US", {
        weekday: "long", month: "short", day: "numeric",
        hour: "numeric", minute: "2-digit",
      });
      const site = process.env.NEXT_PUBLIC_SITE_URL || "https://coachos-opal.vercel.app";
      await sendEmail({
        to: ownerEmail,
        subject: `${verdict.is_late ? "LATE cancel" : "Cancelled"} — ${(client as any)?.full_name ?? "A client"}, ${when}`,
        html: emailShell({
          heading: verdict.is_late ? "Late cancellation" : "Session cancelled",
          bodyHtml: `
            <p><strong>${(client as any)?.full_name ?? "A client"}</strong> cancelled ${when}.</p>
            <p style="color:#4b5563;">
              ${verdict.hours_notice.toFixed(1)} hours' notice ·
              ${verdict.plan_kind === "package" ? "package" : verdict.plan_kind === "subscription" ? "membership" : "no active plan"} ·
              ${charged ? "session charged" : "not charged"}
            </p>
            ${reason ? `<p style="color:#4b5563;">"${reason.replace(/[<>]/g, "")}"</p>` : ""}
            <p style="margin:24px 0;">
              <a href="${site}/schedule" style="background:#1c6a9c;color:#ffffff;padding:12px 24px;border-radius:8px;text-decoration:none;display:inline-block;font-weight:600;">
                Open the schedule
              </a>
            </p>
          `,
        }),
      });
    }
  } catch (err) {
    console.warn("[cancel] notify failed:", err);
  }

  return NextResponse.json({
    ok: true,
    is_late: verdict.is_late,
    charged,
    can_reschedule: verdict.can_reschedule,
    plan_kind: verdict.plan_kind,
  });
}
