import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * PATCH /api/account/avatar — a user sets their OWN profile photo.
 * Scoped to auth.uid(), and the URL must be a Supabase storage URL so this
 * can't be used to point a profile at an arbitrary remote image.
 */
export async function PATCH(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const avatarUrl = String(body.avatar_url ?? "").trim();

  const base = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  if (!avatarUrl || !base || !avatarUrl.startsWith(`${base}/storage/v1/object/public/avatars/`)) {
    return NextResponse.json({ error: "Invalid image URL." }, { status: 400 });
  }

  const { error } = await supabase
    .from("profiles")
    .update({ avatar_url: avatarUrl } as never)
    .eq("id", user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
