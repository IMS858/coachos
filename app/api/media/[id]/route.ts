import { type NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/media/[id] — a short-lived playback URL.
 * Staff can open anything; a client only their own. Viewing also stamps
 * viewed_at the first time, so the coach can see what's been watched.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: me } = await supabase
    .from("profiles").select("role").eq("id", user.id).maybeSingle();
  const isStaff = !!me && ["owner", "trainer"].includes(me.role);

  const svc = createServiceClient();
  const { data: media } = await svc
    .from("client_media")
    .select("id, client_id, storage_path, poster_path, viewed_at, title")
    .eq("id", id)
    .maybeSingle();

  if (!media) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!isStaff && (media as any).client_id !== user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { data: signed, error } = await svc.storage
    .from("client-media")
    .createSignedUrl((media as any).storage_path, 60 * 60); // 1 hour

  if (error || !signed) {
    return NextResponse.json({ error: error?.message ?? "Couldn't sign" }, { status: 500 });
  }

  if (!isStaff && !(media as any).viewed_at) {
    await svc
      .from("client_media")
      .update({ viewed_at: new Date().toISOString() } as never)
      .eq("id", id);
  }

  let posterUrl: string | null = null;
  if ((media as any).poster_path) {
    const { data: p } = await svc.storage
      .from("client-media")
      .createSignedUrl((media as any).poster_path, 60 * 60);
    posterUrl = p?.signedUrl ?? null;
  }

  return NextResponse.json({
    url: signed.signedUrl,
    poster: posterUrl,
    title: (media as any).title,
  });
}

/** DELETE /api/media/[id] — staff archive. Soft delete keeps the coaching record. */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: me } = await supabase
    .from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (!me || !["owner", "trainer"].includes(me.role)) {
    return NextResponse.json({ error: "Staff only" }, { status: 403 });
  }

  const svc = createServiceClient();
  await svc
    .from("client_media")
    .update({ archived_at: new Date().toISOString() } as never)
    .eq("id", id);

  return NextResponse.json({ ok: true });
}
