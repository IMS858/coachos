import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * POST /api/sessions/[id]/complete
 *
 * Marks a session complete. If service_type is training/massage/pilates,
 * also calls increment_session_counter() to drain the appropriate package.
 *
 * Body: { service_type: 'training' | 'massage' | 'pilates' | null }
 *   null = no plan to bill against (e.g. assessment, complimentary recovery)
 */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id: sessionId } = await context.params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (!profile || profile.role === "client") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const serviceType = body.service_type as string | null;

  // Load the session
  const { data: session, error: loadErr } = await supabase
    .from("sessions")
    .select("id, client_id, status, session_type")
    .eq("id", sessionId)
    .single();

  if (loadErr || !session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }
  if (session.status === "completed") {
    return NextResponse.json({ error: "Already completed" }, { status: 400 });
  }

  // If service_type provided, increment the matching plan counter
  let counterResult: any = null;
  let billingPlanId: string | null = null;
  if (serviceType && ["training", "massage", "pilates"].includes(serviceType)) {
    const { data: result, error: incErr } = await supabase.rpc(
      "increment_session_counter",
      {
        p_client_id: session.client_id,
        p_service_type: serviceType,
      }
    );
    if (incErr) {
      return NextResponse.json(
        { error: "Counter increment failed", detail: incErr.message },
        { status: 500 }
      );
    }
    counterResult = result;
    billingPlanId = result?.plan_id ?? null;
  }

  // Update the session — trigger sync_last_session_at handles clients.last_session_at
  const { error: updateErr } = await supabase
    .from("sessions")
    .update({
      status: "completed",
      service_type: serviceType,
      plan_id: billingPlanId,
      completed_at: new Date().toISOString(),
      completed_by: user.id,
    })
    .eq("id", sessionId);

  if (updateErr) {
    // If the session update failed but we already incremented, roll back
    if (billingPlanId) {
      await supabase.rpc("decrement_session_counter", { p_plan_id: billingPlanId });
    }
    return NextResponse.json(
      { error: "Session update failed", detail: updateErr.message },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    counter: counterResult,
  });
}

/**
 * DELETE /api/sessions/[id]/complete
 *
 * Undo a completion. Decrements the counter on the previously-billed plan,
 * resets the session status to 'confirmed'.
 */
export async function DELETE(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id: sessionId } = await context.params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (!profile || profile.role === "client") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data: session } = await supabase
    .from("sessions")
    .select("id, status, plan_id")
    .eq("id", sessionId)
    .single();

  if (!session || session.status !== "completed") {
    return NextResponse.json({ error: "Session is not completed" }, { status: 400 });
  }

  // Decrement the plan counter if we have a record of which plan was billed
  if (session.plan_id) {
    await supabase.rpc("decrement_session_counter", { p_plan_id: session.plan_id });
  }

  // Reset session — trigger handles last_session_at recompute
  const { error } = await supabase
    .from("sessions")
    .update({
      status: "confirmed",
      plan_id: null,
      completed_at: null,
      completed_by: null,
    })
    .eq("id", sessionId);

  if (error) {
    return NextResponse.json(
      { error: "Reset failed", detail: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}
