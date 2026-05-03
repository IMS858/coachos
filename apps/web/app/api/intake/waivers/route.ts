import { type NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

const WAIVER_VERSION = "1.0";

export async function POST(request: NextRequest) {
  const { token, clientId, waivers } = await request.json();
  const supabase = createServiceClient();

  // Validate token
  const { data: tokenRow } = await supabase
    .from("intake_tokens")
    .select("client_id, expires_at, used_at")
    .eq("token", token)
    .maybeSingle();

  if (!tokenRow || tokenRow.client_id !== clientId) {
    return NextResponse.json({ error: "Invalid token" }, { status: 403 });
  }
  if (new Date(tokenRow.expires_at) < new Date()) {
    return NextResponse.json({ error: "Token expired" }, { status: 410 });
  }

  const ip = request.headers.get("x-forwarded-for")?.split(",")[0] ?? null;
  const userAgent = request.headers.get("user-agent") ?? null;

  // Save each signed waiver. Note: `signature_data_url` stores the base64 PNG.
  // In production, you'd also generate a PDF and upload to Storage; that's a
  // background job (Inngest) so it doesn't block the user.
  const rows = Object.entries(waivers).map(([type, dataUrl]) => ({
    client_id: clientId,
    waiver_type: type,
    waiver_version: WAIVER_VERSION,
    signed_at: new Date().toISOString(),
    ip_address: ip,
    user_agent: userAgent,
    signature_data_url: dataUrl as string,
  }));

  const { error } = await supabase.from("waivers").insert(rows);
  if (error) {
    return NextResponse.json(
      { error: "Failed to save waivers", detail: error.message },
      { status: 500 }
    );
  }

  // Mark token used and update client status
  await supabase
    .from("intake_tokens")
    .update({ used_at: new Date().toISOString() })
    .eq("token", token);

  await supabase
    .from("clients")
    .update({ status: "assessment_booked" })
    .eq("id", clientId);

  // TODO (background): generate signed PDFs, email to client, notify trainer
  // via Inngest event 'intake.completed' (see lib/inngest/workflows/).

  return NextResponse.json({ ok: true });
}
