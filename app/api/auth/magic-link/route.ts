import { NextResponse, type NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { sendEmail, emailShell } from "@/lib/mailer";

/**
 * Custom magic-link delivery.
 *
 * Instead of relying on Supabase's built-in SMTP (which we couldn't get to
 * deliver reliably), we:
 *   1. Use the Supabase **admin** API to GENERATE a secure magic link
 *      (this does not send any email — it just mints the token).
 *   2. Email that link ourselves through Resend, using the IMS-branded shell.
 *
 * The link still points at our existing /api/auth/callback route and uses
 * Supabase's own one-time token, so security is unchanged — only the
 * delivery mechanism is ours.
 *
 * Always returns a generic success message regardless of whether the email
 * exists, to avoid leaking which addresses have accounts.
 */
export async function POST(request: NextRequest) {
  const body = await request
    .json()
    .catch(() => ({}) as { email?: string; next?: string });

  const email = (body.email ?? "").trim().toLowerCase();
  const next = body.next || "/dashboard";

  // Basic email shape check
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return NextResponse.json({ error: "Valid email required" }, { status: 400 });
  }

  const site =
    process.env.NEXT_PUBLIC_SITE_URL ||
    new URL(request.url).origin;

  const redirectTo = `${site}/api/auth/callback?next=${encodeURIComponent(next)}`;

  const svc = createServiceClient();

  // Generate a magic link without sending Supabase's own email.
  const { data, error } = await svc.auth.admin.generateLink({
    type: "magiclink",
    email,
    options: { redirectTo },
  });

  // If the user doesn't exist, Supabase errors. We don't reveal that —
  // just return the same generic response.
  if (error || !data?.properties?.action_link) {
    if (error) console.warn("[magic-link] generateLink:", error.message);
    return NextResponse.json({ ok: true });
  }

  const link = data.properties.action_link;

  const html = emailShell({
    heading: "Your IMS sign-in link",
    bodyHtml: `
      <p>Tap the button below to sign in to your IMS account. This link is
      good for one use and expires in about an hour.</p>
    `,
    cta: { label: "Sign in to IMS", url: link },
    footnote:
      "If you didn't request this, you can safely ignore this email — no one can access your account without the link.",
  });

  const result = await sendEmail({
    to: email,
    subject: "Your IMS sign-in link",
    html,
    text: `Sign in to IMS using this link (expires in ~1 hour):\n\n${link}\n\nIf you didn't request this, ignore this email.`,
    replyTo: "admins@imsfitnesscenter.com",
  });

  if (!result.ok && "error" in result) {
    console.warn("[magic-link] send failed:", result.error);
    // Still return ok:true so the UI shows the neutral "check your email"
    // message; the failure is logged server-side for us.
  }

  return NextResponse.json({ ok: true });
}
