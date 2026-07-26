import { NextResponse, type NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { sendEmail, emailShell } from "@/lib/mailer";

/**
 * POST /api/auth/reset-password
 * Public. Takes { email }, generates a Supabase recovery link via the
 * admin API, and emails it through Resend with IMS branding.
 *
 * The link lands on /api/auth/callback?token_hash=...&type=recovery&next=/set-password
 * which verifies the token, creates a session, and sends the user to the
 * set-password page.
 *
 * Always returns a generic success message so we never leak which
 * email addresses have accounts.
 */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const email = String(body.email ?? "").trim().toLowerCase();

  const generic = NextResponse.json({
    ok: true,
    message: "If that email has an account, a reset link is on its way.",
  });

  if (!email || !email.includes("@")) return generic;

  try {
    const svc = createServiceClient();
    const site = process.env.NEXT_PUBLIC_SITE_URL || "https://coachos-opal.vercel.app";

    const { data, error } = await svc.auth.admin.generateLink({
      type: "recovery",
      email,
    });

    if (error || !data?.properties?.hashed_token) {
      // User probably doesn't exist — still return generic success
      if (error) console.warn("[reset-password] generateLink:", error.message);
      return generic;
    }

    const link = `${site}/api/auth/callback?token_hash=${data.properties.hashed_token}&type=recovery&next=${encodeURIComponent("/set-password")}`;

    await sendEmail({
      to: email,
      subject: "Reset your IMS Coach OS password",
      html: emailShell({
        heading: "Reset your password",
        bodyHtml: `
          <p>Someone requested a password reset for your IMS Coach OS account.</p>
          <p style="margin:24px 0;">
            <a href="${link}" style="background:#3a8bc4;color:#ffffff;padding:12px 24px;border-radius:8px;text-decoration:none;display:inline-block;font-weight:600;">
              Set a new password
            </a>
          </p>
          <p style="color:#8a94a3;font-size:13px;">This link expires shortly and can be used once. If you didn't request this, you can safely ignore this email.</p>
        `,
      }),
    });
  } catch (err) {
    console.error("[reset-password] error:", err);
  }

  return generic;
}
