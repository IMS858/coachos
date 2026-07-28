"use client";

import { useState } from "react";
import { Loader2, Mail, Link2, KeyRound, Check, AlertTriangle, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Everything an owner needs to get one client logged in, in the order you'd
 * actually reach for them:
 *
 *   1. Email a link      — normal case
 *   2. Copy the link     — email is bouncing or slow; text it to them
 *   3. Temporary password — they're standing in front of you and want in now
 *
 * Every path ends with the client able to sign in, so a mail problem is never
 * a dead end.
 */
export function ClientLoginPanel({
  clientId,
  clientName,
  hasEmail,
  isOwner,
}: {
  clientId: string;
  clientName: string;
  hasEmail: boolean;
  isOwner: boolean;
}) {
  const [busy, setBusy] = useState<"email" | "password" | null>(null);
  const [link, setLink] = useState<string | null>(null);
  const [tempPassword, setTempPassword] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ kind: "ok" | "warn" | "err"; text: string } | null>(null);

  function copy(text: string, label: string) {
    void navigator.clipboard.writeText(text);
    setMsg({ kind: "ok", text: `${label} copied.` });
  }

  async function sendInvite() {
    setBusy("email");
    setMsg(null);
    setTempPassword(null);
    try {
      const res = await fetch(`/api/clients/${clientId}/invite`, { method: "POST" });
      const data = await res.json();
      if (data.sent) {
        setLink(data.link ?? null);
        setMsg({ kind: "ok", text: `Sent to ${data.email}.` });
      } else {
        setLink(data.link ?? null);
        setMsg({
          kind: "warn",
          text: data.link
            ? "Email didn't send — copy the link below and text it instead."
            : `Couldn't create a link. ${data.error ?? ""}`,
        });
      }
    } catch {
      setMsg({ kind: "err", text: "Couldn't reach the server." });
    } finally {
      setBusy(null);
    }
  }

  async function setPassword() {
    if (
      !confirm(
        `Set a temporary password for ${clientName}?\n\nThis replaces any password they already have. You'll need to read it to them.`
      )
    )
      return;
    setBusy("password");
    setMsg(null);
    setLink(null);
    try {
      const res = await fetch(`/api/clients/${clientId}/set-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (res.ok && data.password) {
        setTempPassword(data.password);
        setMsg({ kind: "ok", text: "Password set. Shown once — copy it now." });
      } else {
        setMsg({ kind: "err", text: data.error ?? "Couldn't set a password." });
      }
    } catch {
      setMsg({ kind: "err", text: "Couldn't reach the server." });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="rounded-lg border border-divider bg-navy-soft p-5 flex flex-col gap-3">
      <div>
        <h3 className="text-base font-semibold text-cream">Account access</h3>
        <p className="prose-ims text-sm text-cream-dim mt-0.5">
          {hasEmail
            ? "Get this client signed in — by email, by link, or in person."
            : "Add an email to this client's profile before sending a login."}
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={sendInvite} disabled={!hasEmail || busy !== null}>
          {busy === "email" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
          Email login link
        </Button>
        {isOwner && (
          <Button
            variant="secondary"
            size="sm"
            onClick={setPassword}
            disabled={busy !== null}
          >
            {busy === "password" ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
            Set temporary password
          </Button>
        )}
      </div>

      {msg && (
        <p
          className={`text-sm flex items-start gap-1.5 ${
            msg.kind === "ok"
              ? "text-status-optimal"
              : msg.kind === "warn"
                ? "text-status-moderate"
                : "text-status-limited"
          }`}
        >
          {msg.kind === "ok" ? (
            <Check className="h-4 w-4 shrink-0 mt-0.5" />
          ) : (
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
          )}
          {msg.text}
        </p>
      )}

      {link && (
        <div className="rounded-md border border-divider bg-navy-elev p-3 flex flex-col gap-2">
          <div className="flex items-center gap-1.5 text-xs text-cream-faint">
            <Link2 className="h-3.5 w-3.5" /> One-time set-password link
          </div>
          <code className="text-[11px] text-cream-dim break-all">{link}</code>
          <Button size="sm" variant="secondary" onClick={() => copy(link, "Link")}>
            <Copy className="h-3.5 w-3.5" /> Copy link
          </Button>
        </div>
      )}

      {tempPassword && (
        <div className="rounded-md border border-sky/40 bg-sky/10 p-3 flex flex-col gap-2">
          <div className="text-xs text-cream-faint">
            Temporary password — read this to {clientName.split(" ")[0]}
          </div>
          <code
            className="text-lg text-cream tracking-wide"
            style={{ fontFamily: "var(--font-mono)" }}
          >
            {tempPassword}
          </code>
          <Button size="sm" onClick={() => copy(tempPassword, "Password")}>
            <Copy className="h-3.5 w-3.5" /> Copy password
          </Button>
          <p className="text-xs text-cream-faint">
            Shown once. They sign in with this, then change it under their
            account. Any password they had before no longer works.
          </p>
        </div>
      )}
    </div>
  );
}
