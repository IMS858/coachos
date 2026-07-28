import { NextResponse, type NextRequest } from "next/server";
import { sendLoginInvite } from "@/lib/invite";

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
    // Shared link + email path (lib/invite.ts). Any failure stays silent to the
    // caller — the generic response below never reveals whether an account
    // exists for this address.
    const result = await sendLoginInvite(email, null, "reset");
    if (!result.sent && result.error) {
      console.warn("[reset-password]", result.error);
    }
  } catch (err) {
    console.error("[reset-password] error:", err);
  }

  return generic;
}
