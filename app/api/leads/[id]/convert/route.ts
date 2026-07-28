import { type NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { sendLoginInvite } from "@/lib/invite";

/**
 * POST /api/leads/[id]/convert
 * Turns a lead into a real client: creates auth user + profile + clients row,
 * then marks the lead as converted. Email is required to create the account.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabaseUser = await createClient();
  const {
    data: { user },
  } = await supabaseUser.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: me } = await supabaseUser
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  if (!me || !["owner", "trainer"].includes(me.role)) {
    return NextResponse.json({ error: "Staff only" }, { status: 403 });
  }

  const svc = createServiceClient();

  const { data: lead } = await svc
    .from("leads")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (!lead) {
    return NextResponse.json({ error: "Lead not found" }, { status: 404 });
  }

  const body = await request.json().catch(() => ({}));
  // email may come from the lead or be supplied at convert time
  const email = ((body.email ?? lead.email) ?? "").trim().toLowerCase();
  if (!email || !email.includes("@")) {
    return NextResponse.json(
      { error: "An email is required to convert. Add one for this lead first." },
      { status: 400 }
    );
  }

  // already a client with this email?
  const { data: existing } = await svc
    .from("profiles")
    .select("id")
    .eq("email", email)
    .maybeSingle();
  if (existing) {
    return NextResponse.json(
      { error: "A client with this email already exists." },
      { status: 409 }
    );
  }

  const tempPassword = Array.from(crypto.getRandomValues(new Uint8Array(16)))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  const { data: authData, error: authError } = await svc.auth.admin.createUser({
    email,
    password: tempPassword,
    email_confirm: true,
    user_metadata: { full_name: lead.full_name },
  });
  if (authError || !authData.user) {
    return NextResponse.json(
      { error: "Could not create account", detail: authError?.message },
      { status: 500 }
    );
  }

  const newId = authData.user.id;

  await svc
    .from("profiles")
    .update({
      full_name: lead.full_name,
      phone: lead.phone || null,
      role: "client",
    })
    .eq("id", newId);

  const { error: clientErr } = await svc.from("clients").insert({
    id: newId,
    status: "active",
    billing_type: "unset",
    joined_at: new Date().toISOString(),
    primary_trainer_id: user.id,
  });
  if (clientErr) {
    await svc.auth.admin.deleteUser(newId);
    return NextResponse.json(
      { error: "Could not create client", detail: clientErr.message },
      { status: 500 }
    );
  }

  // Mark the lead converted (keep it for history)
  await svc
    .from("leads")
    .update({ stage: "converted", updated_at: new Date().toISOString() })
    .eq("id", id);

  // One shared invite path (lib/invite.ts) so this email can never drift from
  // the one sent by direct client creation or the bulk backfill.
  const invite = await sendLoginInvite(email, lead.full_name);
  const inviteSent = invite.sent;
  const inviteLink = invite.link;
  const emailError = invite.error;

  return NextResponse.json({
    ok: true,
    client_id: newId,
    invite_sent: inviteSent,
    invite_link: inviteLink,
    email_error: emailError,
  });
}
