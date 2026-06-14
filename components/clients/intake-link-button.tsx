"use client";

import { useState } from "react";
import { Link2, Copy, Check, Mail, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * "Send intake link" — staff action on a client profile.
 * Calls /api/clients/[id]/intake-link to mint (or reuse) a 14-day public
 * token, then surfaces the URL with copy + pre-filled email buttons.
 */
export function IntakeLinkButton({
  clientId,
  clientName,
  clientEmail,
}: {
  clientId: string;
  clientName: string;
  clientEmail?: string | null;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sendState, setSendState] = useState<
    "idle" | "sending" | "sent" | "no_email" | "skipped" | "failed"
  >("idle");

  async function generate() {
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/clients/${clientId}/intake-link`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
    setLoading(false);
    if (!res.ok) {
      const e = await res.json().catch(() => ({}));
      setError(e.detail ?? e.error ?? "Could not create link.");
      return;
    }
    const { url } = await res.json();
    setUrl(url);
  }

  async function sendViaResend() {
    setSendState("sending");
    setError(null);
    const res = await fetch(`/api/clients/${clientId}/intake-link`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ send: true }),
    });
    if (!res.ok) {
      setSendState("failed");
      return;
    }
    const data = await res.json();
    if (!url && data.url) setUrl(data.url);
    setSendState(data.emailed === "sent" ? "sent" : data.emailed);
  }

  async function copy() {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Couldn't copy — select the link and copy manually.");
    }
  }

  const firstName = clientName.split(" ")[0];
  const mailtoSubject = encodeURIComponent(
    "Your IMS intake form & waivers"
  );
  const mailtoBody = encodeURIComponent(
    `Hi ${firstName},\n\n` +
      `Welcome to Innovative Movement Solutions! Before your first session, ` +
      `please complete your intake form and sign our waivers using the secure ` +
      `link below. It takes about 10 minutes.\n\n` +
      `${url}\n\n` +
      `This link expires in 14 days. If you have any questions, just reply to ` +
      `this email or call us at (619) 937-1434.\n\n` +
      `See you soon,\nThe IMS Team`
  );
  const mailto = clientEmail
    ? `mailto:${clientEmail}?subject=${mailtoSubject}&body=${mailtoBody}`
    : `mailto:?subject=${mailtoSubject}&body=${mailtoBody}`;

  return (
    <div className="rounded-xl border border-divider bg-navy-soft p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="font-medium text-cream flex items-center gap-2">
            <Link2 className="h-4 w-4 text-sky-light" />
            Intake & waivers
          </h3>
          <p className="text-sm text-cream-faint mt-1">
            Send {firstName} a secure link to complete their intake form and
            sign waivers. No login required — expires in 14 days.
          </p>
        </div>
        {!url && (
          <Button onClick={generate} disabled={loading}>
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Link2 className="h-4 w-4" />
            )}
            Generate link
          </Button>
        )}
      </div>

      {error && <p className="text-sm text-status-limited mt-3">{error}</p>}

      {url && (
        <div className="mt-4 space-y-3">
          <div className="flex items-center gap-2 rounded-lg border border-divider bg-navy px-3 py-2">
            <input
              readOnly
              value={url}
              onFocus={(e) => e.currentTarget.select()}
              className="flex-1 bg-transparent text-sm text-cream-dim focus:outline-none"
            />
            <button
              onClick={copy}
              className="shrink-0 text-cream-faint hover:text-cream transition-colors"
              title="Copy link"
            >
              {copied ? (
                <Check className="h-4 w-4 text-status-optimal" />
              ) : (
                <Copy className="h-4 w-4" />
              )}
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {clientEmail && (
              <Button onClick={sendViaResend} disabled={sendState === "sending"}>
                {sendState === "sending" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Mail className="h-4 w-4" />
                )}
                Email {firstName}
              </Button>
            )}
            <a href={mailto}>
              <Button variant="secondary">
                <Mail className="h-4 w-4" />
                {clientEmail ? "Open in mail app" : "Compose email"}
              </Button>
            </a>
            <Button variant="ghost" onClick={copy}>
              {copied ? (
                <>
                  <Check className="h-4 w-4 text-status-optimal" />
                  Copied
                </>
              ) : (
                <>
                  <Copy className="h-4 w-4" />
                  Copy link
                </>
              )}
            </Button>
          </div>

          {sendState === "sent" && (
            <p className="text-sm text-status-optimal flex items-center gap-1.5">
              <Check className="h-4 w-4" />
              Email sent to {clientEmail}.
            </p>
          )}
          {sendState === "no_email" && (
            <p className="text-sm text-status-moderate">
              No email on file for this client — add one above, or use copy.
            </p>
          )}
          {sendState === "skipped" && (
            <p className="text-sm text-status-moderate">
              Email isn't configured yet (RESEND_API_KEY). The link still works —
              copy and send it manually for now.
            </p>
          )}
          {sendState === "failed" && (
            <p className="text-sm text-status-limited">
              Couldn't send the email. Copy the link and send it manually.
            </p>
          )}
          <p className="text-xs text-cream-faint">
            Tip: the same link stays valid for 14 days, so you can resend it if
            they don't finish right away.
          </p>
        </div>
      )}
    </div>
  );
}
