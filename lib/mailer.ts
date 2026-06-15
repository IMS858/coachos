import { Resend } from "resend";

/**
 * Central mailer. Every outbound email goes through here.
 *
 * Reads:
 *   RESEND_API_KEY     — from Resend dashboard (re_...)
 *   RESEND_FROM_EMAIL  — verified sender, e.g. "IMS <hello@imsmethod.com>"
 *                        (falls back to Resend's test address if unset)
 *
 * If RESEND_API_KEY is missing, send() no-ops and returns { ok:false, skipped:true }
 * instead of throwing — so the app keeps working before the key is added,
 * and callers can decide whether the email was essential.
 */

const FROM =
  process.env.RESEND_FROM_EMAIL || "IMS <onboarding@resend.dev>";

let client: Resend | null = null;
function getClient(): Resend | null {
  if (!process.env.RESEND_API_KEY) return null;
  if (!client) client = new Resend(process.env.RESEND_API_KEY);
  return client;
}

export type SendResult =
  | { ok: true; id: string }
  | { ok: false; skipped: true }
  | { ok: false; error: string };

export async function sendEmail(opts: {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
}): Promise<SendResult> {
  const resend = getClient();
  if (!resend) {
    console.warn("[mailer] RESEND_API_KEY not set — email skipped:", opts.subject);
    return { ok: false, skipped: true };
  }

  try {
    const { data, error } = await resend.emails.send({
      from: FROM,
      to: Array.isArray(opts.to) ? opts.to : [opts.to],
      subject: opts.subject,
      html: opts.html,
      text: opts.text,
      replyTo: opts.replyTo,
    });
    if (error) return { ok: false, error: error.message };
    return { ok: true, id: data?.id ?? "" };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "send failed" };
  }
}

/* ---------------------------------------------------------------------------
 * Branded HTML shell — keeps every IMS email consistent.
 * ------------------------------------------------------------------------- */
export function emailShell(opts: {
  heading: string;
  bodyHtml: string;
  cta?: { label: string; url: string };
  footnote?: string;
}): string {
  const cta = opts.cta
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:28px 0;">
         <tr><td style="border-radius:8px;background:#1c6fd6;">
           <a href="${opts.cta.url}"
              style="display:inline-block;padding:13px 26px;font-family:Arial,sans-serif;
                     font-size:15px;color:#ffffff;text-decoration:none;font-weight:600;">
             ${opts.cta.label}
           </a>
         </td></tr>
       </table>`
    : "";

  return `<!DOCTYPE html>
<html><body style="margin:0;padding:0;background:#0f1722;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0f1722;padding:32px 0;">
    <tr><td align="center">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0"
             style="background:#16202e;border-radius:16px;padding:36px;max-width:560px;">
        <tr><td>
          <img src="https://coachos-opal.vercel.app/ims-logo.png"
               alt="IMS — Innovative Movement Solutions"
               width="160" style="display:block;margin-bottom:8px;" />
          <h1 style="font-family:Arial,sans-serif;font-size:20px;color:#eef3f8;margin:24px 0 12px;">
            ${opts.heading}
          </h1>
          <div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.6;color:#b8c4d2;">
            ${opts.bodyHtml}
          </div>
          ${cta}
          ${
            opts.footnote
              ? `<p style="font-family:Arial,sans-serif;font-size:12px;color:#6b7a8c;margin-top:24px;border-top:1px solid #243140;padding-top:16px;">${opts.footnote}</p>`
              : ""
          }
          <p style="font-family:Arial,sans-serif;font-size:12px;color:#6b7a8c;margin-top:20px;">
            Innovative Movement Solutions · Scripps Ranch, San Diego · (619) 937-1434
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}
