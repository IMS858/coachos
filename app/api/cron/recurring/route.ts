import { NextResponse, type NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { generateAllActiveSeries } from "@/lib/recurring";

/**
 * GET /api/cron/recurring
 *
 * Runs daily. Rolls every active standing-booking series forward so the
 * calendar always has ~8 weeks of upcoming sessions. Idempotent: existing
 * slots are skipped via the unique (series, scheduled_at) index.
 *
 * Protected by CRON_SECRET when set (Vercel sends it as a Bearer token).
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = request.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const svc = createServiceClient();
  const result = await generateAllActiveSeries(svc);

  return NextResponse.json({
    ok: true,
    active_series: result.series,
    sessions_created: result.created,
    at: new Date().toISOString(),
  });
}
