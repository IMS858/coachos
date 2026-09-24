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

  if (!Number.isInteger(body.duration_minutes) || body.duration_minutes > 480 ||
      !Number.isFinite(Date.parse(body.scheduled_at)) ||
      (body.service_type != null && !["training","massage","pilates"].includes(body.service_type))) {
    return NextResponse.json({error:"Invalid session details"},{status:400});
  }
  if (typeof body.request_id !== "string" || !/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(body.request_id)) {
    return NextResponse.json({error:"A session request ID is required. Refresh and try again."},{status:400});
  }
  const {data,error}=await supabase.rpc("create_staff_session",{p_id:body.request_id,p_body:{...body,mode}});
  if(error) return NextResponse.json({error:error.code==="23P01"?"Trainer already has a session at this time.":"Session could not be saved",detail:error.message},
    {status:error.code==="23P01"||error.code==="22023"?409:error.code==="42501"?403:503});
  return NextResponse.json(data);
}
