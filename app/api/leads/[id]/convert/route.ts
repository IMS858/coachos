import { type NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { sendEmail, emailShell } from "@/lib/mailer";

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

  // Send an invite email with a one-time link to set their password
  let inviteSent = false;
  try {
    const site = process.env.NEXT_PUBLIC_SITE_URL || "https://coachos-opal.vercel.app";
    const { data: linkData, error: linkErr } = await svc.auth.admin.generateLink({
      type: "recovery",
      email,
    });
    if (!linkErr && linkData?.properties?.hashed_token) {
      const link = `${site}/api/auth/callback?token_hash=${linkData.properties.hashed_token}&type=recovery&next=${encodeURIComponent("/set-password")}`;
      const firstName = (lead.full_name ?? "").split(" ")[0] || "there";
      const result = await sendEmail({
        to: email,
        subject: "Welcome to IMS — set up your account",
        html: emailShell({
          heading: `Welcome to IMS, ${firstName}!`,
          bodyHtml: `
            <p>Your IMS Coach OS account is ready. This is where you'll see your training plan, track your progress, and manage your schedule.</p>
            <p style="margin:24px 0;">
              <a href="${link}" style="background:#3a8bc4;color:#ffffff;padding:12px 24px;border-radius:8px;text-decoration:none;display:inline-block;font-weight:600;">
                Set your password
              </a>
            </p>
            <p style="color:#8a94a3;font-size:13px;">This link can be used once. After setting your password, sign in anytime at ${site}/login</p>
          `,
        }),
      });
      inviteSent = result.ok !== false;
    }
  } catch (err) {
    console.warn("[convert] invite email failed:", err);
  }

  return NextResponse.json({ ok: true, client_id: newId, invite_sent: inviteSent });
}
