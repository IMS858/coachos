import { type NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

/**
 * Save intake responses. Uses service-role to bypass RLS — the security here
 * comes from validating the token, not from the user's auth session.
 */
export async function POST(request: NextRequest) {
  const { token, clientId, responses } = await request.json();
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

  // Upsert intake form
  const { error: intakeError } = await supabase.from("intake_forms").insert({
    client_id: clientId,
    form_version: "1.0",
    responses,
    completed_at: new Date().toISOString(),
  });

  if (intakeError) {
    return NextResponse.json(
      { error: "Failed to save intake", detail: intakeError.message },
      { status: 500 }
    );
  }

  // Update client record with structured fields
  const id = responses.identity ?? {};
  const health = responses.health ?? {};
  await supabase
    .from("clients")
    .update({
      date_of_birth: id.date_of_birth || null,
      address_line1: id.address_line1 || null,
      city: id.city || null,
      state: id.state || null,
      zip: id.zip || null,
      emergency_contact_name: id.emergency_contact_name || null,
      emergency_contact_phone: id.emergency_contact_phone || null,
      emergency_contact_relationship: id.emergency_contact_relationship || null,
      physician_name: health.physician_name || null,
      physician_phone: health.physician_phone || null,
      lead_source: responses.logistics?.lead_source || null,
    })
    .eq("id", clientId);

  // NOTE: Do NOT mark token used yet — the user still needs to sign waivers.
  // Token gets marked used after waiver completion.

  return NextResponse.json({ ok: true });
}
