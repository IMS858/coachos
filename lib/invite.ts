import { createServiceClient } from "@/lib/supabase/server";
import { sendEmail, emailShell } from "@/lib/mailer";

/**
 * One place that turns "this person should be able to log in" into a real
 * link and email. Lead conversion, direct client creation, the per-client
 * resend, the bulk backfill and forgot-password all call this, so the link
 * format and the email can never drift apart between paths.
 *
 * The link is returned whether or not the email sends, so callers can always
 * offer it as a copyable fallback — onboarding never hard-depends on delivery.
 */

export type InviteResult = {
  sent: boolean;
  link: string | null;
  error: string | null;
};

/**
 * "invite" — first-time account setup for a new client
 * "reset"  — existing user who forgot their password
 * Identical one-time link; only the wording differs.
 */
export type InviteMode = "invite" | "reset";

export async function sendLoginInvite(
  email: string,
  fullName?: string | null,
  mode: InviteMode = "invite"
): Promise<InviteResult> {
  const site =
    process.env.NEXT_PUBLIC_SITE_URL || "https://coachos-opal.vercel.app";
  const svc = createServiceClient();

  let link: string;
  try {
    const { data, error } = await svc.auth.admin.generateLink({
      type: "recovery",
      email,
    });
    if (error || !data?.properties?.hashed_token) {
      return {
        sent: false,
        link: null,
        error: error?.message ?? "Couldn't generate a set-password link.",
      };
    }
    link = `${site}/api/auth/callback?token_hash=${data.properties.hashed_token}&type=recovery&next=${encodeURIComponent("/set-password")}`;
  } catch (e) {
    return {
      sent: false,
      link: null,
      error: e instanceof Error ? e.message : "Link generation failed.",
    };
  }

  const firstName = (fullName ?? "").trim().split(" ")[0] || "there";
  const button = (label: string) =>
    `<p style="margin:24px 0;">
       <a href="${link}" style="background:#1c6a9c;color:#ffffff;padding:12px 24px;border-radius:8px;text-decoration:none;display:inline-block;font-weight:600;">
         ${label}
       </a>
     </p>`;

  const content =
    mode === "reset"
      ? {
          subject: "Reset your IMS Coach OS password",
          heading: "Reset your password",
          body: `
            <p>Someone asked to reset the password on your IMS Coach OS account. Choose a new one here:</p>
            ${button("Set a new password")}
            <p style="color:#6b7280;font-size:13px;">This link works once and expires shortly. If you didn't request it, ignore this email — nothing changes until the link is used.</p>
          `,
        }
      : {
          subject: "Your IMS Coach OS account",
          heading: `Welcome to IMS, ${firstName}!`,
          body: `
            <p>Your IMS Coach OS account is ready. It's where you'll find your training plan, track your progress, request sessions and see your schedule.</p>
            ${button("Set your password")}
            <p style="color:#6b7280;font-size:13px;">This link works once. After that, sign in anytime at ${site}/login — and you can add the app to your phone's home screen from the browser share menu.</p>
          `,
        };

  const result = await sendEmail({
    to: email,
    subject: content.subject,
    html: emailShell({
      heading: content.heading,
      bodyHtml: content.body,
      footnote:
        "If you weren't expecting this, you can ignore it — the link expires on its own.",
    }),
  });

  return {
    sent: result.ok,
    link,
    error: result.ok ? null : result.error,
  };
}
