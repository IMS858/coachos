import { type NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * POST /api/sessions/[id]/no-show — staff only.
 *
 * A no-show costs exactly what a late cancel costs: the slot is gone and it was
 * held for someone who didn't arrive. So it charges the same way — a package
 * client loses the session, a member doesn't (they've already paid for the
 * month). Anything else means marking no-shows "complete" to bill them, which
 * corrupts the training history.
 *
 * DELETE undoes it, because this gets clicked by mistake and someone stuck in
 * traffic shouldn't lose a session over it.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: me } = await supabase
    .from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (!me || !["owner", "trainer"].includes((me as any).role)) {
    return NextResponse.json({ error: "Staff only" }, { status: 403 });
  }

  const svc = createServiceClient();
  const { data: session } = await svc
    .from("sessions")
    .select("id, client_id, status, service_type")
    .eq("id", id)
    .maybeSingle();

  if (!session) return NextResponse.json({ error: "Session not found" }, { status: 404 });
  const s = session as any;
  if (s.status === "completed") {
    return NextResponse.json(
      { error: "This is marked complete. Undo that first." },
      { status: 400 }
    );
  }

  const body = await request.json().catch(() => ({}));
  const charge = body.charge !== false; // default to charging; staff can waive

  // Same rule as a late cancel: only packages are drained.
  const { data: plans } = await svc
    .from("plans")
    .select("kind")
    .eq("client_id", s.client_id)
    .eq("status", "active");
  const hasPackage = (plans ?? []).some((p: any) => p.kind === "package");

  const { error: updErr } = await svc
    .from("sessions")
    .update({
      status: "no_show",
      cancelled_at: new Date().toISOString(),
      cancelled_by: user.id,
      late_cancel_fee_charged: charge && hasPackage,
    } as never)
    .eq("id", id);

  if (updErr) {
    return NextResponse.json({ error: updErr.message }, { status: 500 });
  }

  let charged = false;
  if (charge && hasPackage) {
    const { data: rpc, error } = await svc.rpc("increment_session_counter", {
      p_client_id: s.client_id,
      p_service_type: s.service_type ?? "training",
    });
    if (error) console.error("[no-show] charge failed:", error.message);
    else charged = Boolean((rpc as any)?.incremented);
  }

  return NextResponse.json({ ok: true, charged, plan: hasPackage ? "package" : "membership" });
}

/** DELETE — undo, and hand back the session if it was charged. */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: me } = await supabase
    .from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (!me || !["owner", "trainer"].includes((me as any).role)) {
    return NextResponse.json({ error: "Staff only" }, { status: 403 });
  }

  const svc = createServiceClient();
  const { data: session } = await svc
    .from("sessions")
    .select("id, client_id, status, service_type, late_cancel_fee_charged")
    .eq("id", id)
    .maybeSingle();
  if (!session) return NextResponse.json({ error: "Session not found" }, { status: 404 });
  const s = session as any;

  // Give the session back before clearing the flag, so a failure here can't
  // silently lose it.
  if (s.late_cancel_fee_charged) {
    const { data: plan } = await svc
      .from("plans")
      .select("id")
      .eq("client_id", s.client_id)
      .eq("kind", "package")
      .eq("status", "active")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (plan) {
      await svc.rpc("decrement_session_counter", { p_plan_id: (plan as any).id });
    }
  }

  await svc
    .from("sessions")
    .update({
      status: "scheduled",
      cancelled_at: null,
      cancelled_by: null,
      late_cancel_fee_charged: false,
    } as never)
    .eq("id", id);

  return NextResponse.json({ ok: true });
}
