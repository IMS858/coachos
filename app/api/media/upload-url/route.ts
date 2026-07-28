import { type NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * POST /api/media/upload-url
 * Staff-only. Returns a short-lived signed URL the browser uploads straight to.
 *
 * The file never passes through this route — Vercel caps a serverless request
 * body around 4.5MB and a phone video exceeds that almost immediately.
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: me } = await supabase
    .from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (!me || !["owner", "trainer"].includes(me.role)) {
    return NextResponse.json({ error: "Staff only" }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const clientId = String(body.client_id ?? "");
  const ext = String(body.ext ?? "mp4").toLowerCase().replace(/[^a-z0-9]/g, "");
  if (!clientId) {
    return NextResponse.json({ error: "client_id required" }, { status: 400 });
  }

  // First path segment is the owning client — the storage policy reads it.
  // An optional `base` lets the poster sit alongside its video with a shared
  // id, so the pair is obvious in the bucket.
  const base = String(body.base ?? "").replace(/[^a-zA-Z0-9-]/g, "") || crypto.randomUUID();
  const suffix = body.poster ? "-poster" : "";
  const path = `${clientId}/${base}${suffix}.${ext}`;

  const svc = createServiceClient();
  const { data, error } = await svc.storage
    .from("client-media")
    .createSignedUploadUrl(path);

  if (error) {
    console.error("[media/upload-url]", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ path, base, token: data.token, signedUrl: data.signedUrl });
}
