import { NextResponse, type NextRequest } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import {
  buildSeriesOccurrences,
  type RecurringSlot,
} from "@/lib/recurring";

/**
 * POST /api/recurring — create a standing appointment series and generate its
 * first rolling window of sessions.
 *
 * Body: {
 *   client_id: string,
 *   trainer_id?: string (defaults to caller),
 *   slots: { weekday: 0-6, time: "HH:MM" }[],   // 1–4 entries
 *   session_type?: string,
 *   duration_minutes?: number,
 *   start_date?: "YYYY-MM-DD",
 * }
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { data: me } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  if (!me || !["owner", "trainer"].includes(me.role)) {
    return NextResponse.json({ error: "Staff only" }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const slots: RecurringSlot[] = Array.isArray(body.slots) ? body.slots : [];

  if (!body.client_id) {
    return NextResponse.json({ error: "client_id required" }, { status: 400 });
  }
  if (slots.length < 1 || slots.length > 4) {
    return NextResponse.json(
      { error: "Choose 1 to 4 weekly slots" },
      { status: 400 }
    );
  }
  for (const s of slots) {
    if (
      typeof s.weekday !== "number" ||
      s.weekday < 0 ||
      s.weekday > 6 ||
      !/^\d{2}:\d{2}$/.test(s.time)
    ) {
      return NextResponse.json({ error: "Invalid slot" }, { status: 400 });
    }
  }

  const svc = createServiceClient();

  const trainerId = body.trainer_id ?? user.id;
  const sessionType = body.session_type ?? "training";
  const duration = Number(body.duration_minutes ?? 60);
  const startDate = body.start_date ?? new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles" }).format(new Date());
  const built = buildSeriesOccurrences({ slots, startDate, horizonWeeks: 8 });
  const { data: seriesId, error } = await svc.rpc("create_recurring_series_atomic", {
    p_client_id: body.client_id,
    p_trainer_id: trainerId,
    p_session_type: sessionType,
    p_duration_minutes: duration,
    p_location: body.location ?? "IMS Studio",
    p_slots: slots,
    p_start_date: startDate,
    p_created_by: user.id,
    p_occurrences: built.occurrences.map((scheduled_at) => ({ scheduled_at })),
    p_generated_until: built.generatedUntil,
  });
  if (error || !seriesId) {
    const conflict = error?.code === "23P01" || error?.code === "40P01";
    return NextResponse.json(
      { error: conflict ? "One of these standing slots conflicts with an existing trainer booking." : "Could not create standing booking", detail: error?.message },
      { status: conflict ? 409 : 500 }
    );
  }

  return NextResponse.json({ ok: true, series_id: seriesId, built.occurrences.length });
}
