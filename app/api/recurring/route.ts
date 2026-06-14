import { NextResponse, type NextRequest } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import {
  generateSeriesSessions,
  type RecurringSlot,
  type SeriesRow,
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

  const { data: series, error } = await svc
    .from("recurring_series")
    .insert({
      client_id: body.client_id,
      trainer_id: body.trainer_id ?? user.id,
      session_type: body.session_type ?? "training",
      duration_minutes: body.duration_minutes ?? 60,
      location: body.location ?? "IMS Studio",
      slots,
      status: "active",
      start_date: body.start_date ?? undefined,
      created_by: user.id,
    })
    .select(
      "id, client_id, trainer_id, session_type, duration_minutes, location, slots, status, generated_until, start_date"
    )
    .single();

  if (error || !series) {
    return NextResponse.json(
      { error: "Could not create standing booking", detail: error?.message },
      { status: 500 }
    );
  }

  const created = await generateSeriesSessions(svc, series as SeriesRow);

  return NextResponse.json({ ok: true, series_id: series.id, created });
}
