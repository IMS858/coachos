import { type NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { sendLoginInvite } from "@/lib/invite";
export const dynamic = "force-dynamic";

/** Send an existing portal client a login link. This does not activate record-only clients. */
export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const auth = await supabase.auth.getUser();
  if (auth.error || !auth.data.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const actor = await supabase.from("profiles").select("role,deleted_at").eq("id", auth.data.user.id).maybeSingle();
  if (actor.error) return NextResponse.json({ error: "Staff access could not be verified." }, { status: 503 });
  if (!actor.data || actor.data.deleted_at || !["owner", "trainer"].includes(actor.data.role)) return NextResponse.json({ error: "Active staff only" }, { status: 403 });
  const scope = await supabase.from("clients").select("id").eq("id", id).maybeSingle();
  if (scope.error) return NextResponse.json({ error: "Client access could not be verified." }, { status: 503 });
  if (!scope.data) return NextResponse.json({ error: "Client not found or not assigned." }, { status: 404 });
  const svc = createServiceClient();
  const target = await svc.from("profiles").select("email, full_name, contact_only").eq("id", id).eq("role", "client").is("deleted_at", null).maybeSingle();
  if (target.error) return NextResponse.json({ error: "Client profile could not be verified." }, { status: 503 });
  const profile = target.data;
  if (profile?.contact_only) return NextResponse.json({ error: "This is a client record without a login. Add an email and complete separate portal setup before inviting." }, { status: 409 });
  if (!profile?.email) return NextResponse.json({ error: "This client has no email on file." }, { status: 400 });
  const result = await sendLoginInvite(profile.email, profile.full_name);
  return NextResponse.json({ ok: result.sent, sent: result.sent, link: result.link, error: result.error, email: profile.email });
}
