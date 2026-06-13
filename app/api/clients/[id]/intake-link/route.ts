import { NextResponse, type NextRequest } from "next/server";
import { randomBytes } from "crypto";
import { createClient, createServiceClient } from "@/lib/supabase/server";

/**
 * POST /api/clients/[id]/intake-link
 * Generates (or refreshes) a public intake token for a client and returns the
 * shareable URL. Staff only. Reuses an existing unused, unexpired token if one
 * is already outstanding so we don't pile up dead links.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (!profile || profile.role === "client") {
    return NextResponse.json({ error: "Staff only" }, { status: 403 });
  }

  // Service client: intake_tokens is locked down to public read-by-token only
  const svc = createServiceClient();

  // Verify the client exists
  const { data: client } = await svc
    .from("clients")
    .select("id")
    .eq("id", id)
    .maybeSingle();
  if (!client) {
    return NextResponse.json({ error: "Client not found" }, { status: 404 });
  }

  const nowIso = new Date().toISOString();

  // Reuse an existing live token if present
  const { data: existing } = await svc
    .from("intake_tokens")
    .select("token, expires_at, used_at")
    .eq("client_id", id)
    .is("used_at", null)
    .gt("expires_at", nowIso)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  let token = existing?.token;

  if (!token) {
    token = randomBytes(24).toString("base64url");
    const { error } = await svc.from("intake_tokens").insert({
      token,
      client_id: id,
      expires_at: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
    });
    if (error) {
      return NextResponse.json(
        { error: "Could not create link", detail: error.message },
        { status: 500 }
      );
    }
  }

  const origin =
    request.headers.get("origin") ??
    new URL(request.url).origin;
  const url = `${origin}/intake/${token}`;

  return NextResponse.json({ url, token, reused: Boolean(existing) });
}
