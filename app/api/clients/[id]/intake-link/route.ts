import { NextResponse, type NextRequest } from "next/server";
import { randomBytes } from "crypto";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { sendEmail, emailShell } from "@/lib/mailer";

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

  // Optionally email the link to the client (button can request this)
  const wantEmail = Boolean(body?.send);
  let emailed: "sent" | "skipped" | "no_email" | "failed" = "skipped";

  if (wantEmail) {
    // Look up the client's email + name from their profile
    const { data: prof } = await svc
      .from("profiles")
      .select("email, full_name")
      .eq("id", id)
      .maybeSingle();

    if (!prof?.email) {
      emailed = "no_email";
    } else {
      const firstName = (prof.full_name ?? "there").split(" ")[0];
      const result = await sendEmail({
        to: prof.email,
        subject: "Your IMS intake form & waivers",
        replyTo: "jason@imsmethod.com",
        text:
          `Hi ${firstName},\n\nWelcome to Innovative Movement Solutions! ` +
          `Before your first session, please complete your intake form and ` +
          `sign our waivers using this secure link:\n\n${url}\n\n` +
          `It takes about 10 minutes and expires in 14 days.\n\n` +
          `Questions? Reply here or call (619) 937-1434.\n\nThe IMS Team`,
        html: emailShell({
          heading: `Welcome, ${firstName}!`,
          bodyHtml:
            `Before your first session, please take about 10 minutes to ` +
            `complete your intake form and sign our waivers. It's all in one ` +
            `secure place:`,
          cta: { label: "Complete intake & waivers", url },
          footnote:
            "This secure link expires in 14 days. If you have any questions, " +
            "just reply to this email or call us at (619) 937-1434.",
        }),
      });
      emailed = result.ok ? "sent" : result.ok === false && "skipped" in result ? "skipped" : "failed";
    }
  }

  return NextResponse.json({
    url,
    token,
    reused: Boolean(existing),
    emailed,
  });
}
