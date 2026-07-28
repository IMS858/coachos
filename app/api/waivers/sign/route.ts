import { type NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { WAIVER_BY_TYPE } from "@/lib/waivers";

export const dynamic = "force-dynamic";

/**
 * POST /api/waivers/sign — a signed-in client re-signs.
 *
 * Distinct from /api/intake/waivers, which is token-based for people who don't
 * have an account yet. Here identity comes from the session, so there's no
 * token to leak or replay.
 *
 * Every signature is a NEW row. Waivers are never updated in place — the
 * history of what was agreed, when, and against which wording is the entire
 * evidentiary value.
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const waivers = body.waivers as Record<string, string> | undefined;
  if (!waivers || Object.keys(waivers).length === 0) {
    return NextResponse.json({ error: "Nothing signed." }, { status: 400 });
  }

  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  const userAgent = request.headers.get("user-agent") ?? null;

  const rows = Object.entries(waivers)
    .filter(([type]) => type in WAIVER_BY_TYPE)
    .map(([type, dataUrl]) => ({
      client_id: user.id,
      waiver_type: type,
      waiver_version: WAIVER_BY_TYPE[type as keyof typeof WAIVER_BY_TYPE].version,
      signed_at: new Date().toISOString(),
      ip_address: ip,
      user_agent: userAgent,
      signature_data_url: dataUrl,
    }));

  if (rows.length === 0) {
    return NextResponse.json({ error: "No valid waivers." }, { status: 400 });
  }

  const svc = createServiceClient();
  const { error } = await svc.from("waivers").insert(rows as never);
  if (error) {
    console.error("[waivers/sign]", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, signed: rows.length });
}
