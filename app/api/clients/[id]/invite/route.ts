import { type NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { sendLoginInvite } from "@/lib/invite";

export const dynamic = "force-dynamic";

/**
 * POST /api/clients/[id]/invite
 * Staff-only. Emails one client a set-password link, and returns the link
 * either way so it can be copied and sent by text if mail fails.
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: me } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  if (!me || !["owner", "trainer"].includes(me.role)) {
    return NextResponse.json({ error: "Staff only" }, { status: 403 });
  }

  const svc = createServiceClient();
  const { data: profile } = await svc
    .from("profiles")
    .select("email, full_name")
    .eq("id", id)
    .maybeSingle();

  if (!profile?.email) {
    return NextResponse.json(
      { error: "This client has no email on file." },
      { status: 400 }
    );
  }

  const result = await sendLoginInvite(profile.email, profile.full_name);
  return NextResponse.json({
    ok: result.sent,
    sent: result.sent,
    link: result.link,
    error: result.error,
    email: profile.email,
  });
}
