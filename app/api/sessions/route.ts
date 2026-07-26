import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * POST /api/sessions
 *
 * Creates a new session row. Two modes:
 *
 *   mode: 'schedule' — future booking. Status = 'scheduled'. No counter change.
 *   mode: 'log'      — already happened. Status = 'completed'. If the
 *                      service_type is billable (training/massage/pilates),
 *                      increment the matching package counter atomically.
 *
 * Trainer/owner only.
 *
 * Body:
 *   {
 *     mode: 'schedule' | 'log',
 *     client_id: string (required),
 *     trainer_id?: string (defaults to caller),
 *     scheduled_at: ISO8601 string (required),
 *     duration_minutes: number (required),
 *     session_type: string (required) — feeds the session_type enum
 *     service_type?: 'training' | 'massage' | 'pilates' | null
 *     notes_pre?: string
 *     notes_post?: string
 *   }
 *
 * Returns: { session_id, counter? }
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (!profile || profile.role === "client") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));

  // Validate
  const mode = body.mode === "log" ? "log" : "schedule";
  if (!body.client_id) {
    return NextResponse.json({ error: "client_id required" }, { status: 400 });
  }
  if (!body.scheduled_at) {
    return NextResponse.json({ error: "scheduled_at required" }, { status: 400 });
  }
  if (!body.session_type) {
    return NextResponse.json({ error: "session_type required" }, { status: 400 });
  }
  if (!body.duration_minutes || body.duration_minutes < 1) {
    return NextResponse.json(
      { error: "duration_minutes must be at least 1" },
      { status: 400 }
    );
  }

  const isCompleted = mode === "log";
  const billable =
    body.service_type &&
    ["training", "massage", "pilates"].includes(body.service_type);

  // For 'log' mode + billable service: increment counter FIRST
  // (so we can roll back if the session insert fails)
  let billingPlanId: string | null = null;
  let counterResult: any = null;

  if (isCompleted && billable) {
    const { data: result, error: incErr } = await supabase.rpc(
      "increment_session_counter",
      {
        p_client_id: body.client_id,
        p_service_type: body.service_type,
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

  // Build session row
  const insert: any = {
    client_id: body.client_id,
    trainer_id: body.trainer_id ?? user.id,
    scheduled_at: body.scheduled_at,
    duration_minutes: body.duration_minutes,
    session_type: body.session_type,
    service_type: body.service_type ?? null,
    status: isCompleted ? "completed" : "scheduled",
    notes_pre: body.notes_pre ?? null,
    notes_post: body.notes_post ?? null,
  };

  if (isCompleted) {
    insert.completed_at = new Date().toISOString();
    insert.completed_by = user.id;
    insert.plan_id = billingPlanId;
  }

  const { data: session, error: insertErr } = await supabase
    .from("sessions")
    .insert(insert)
    .select("id")
    .single();

  if (insertErr) {
    // Roll back the counter if we incremented one
    if (billingPlanId) {
      await supabase.rpc("decrement_session_counter", {
        p_plan_id: billingPlanId,
      });
    }
    return NextResponse.json(
      { error: "Session insert failed", detail: insertErr.message },
      { status: 500 }
    );
  }

  // The trigger sessions_sync_last_session_at handles clients.last_session_at
  // automatically when status='completed'.

  return NextResponse.json({
    ok: true,
    session_id: session.id,
    counter: counterResult,
  });
}
