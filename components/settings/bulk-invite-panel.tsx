"use client";

import { useState } from "react";
import { Loader2, Send, Users, Check, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

type Pending = { name: string | null; email: string };
type SendResult = { name: string; email: string; sent: boolean; error: string | null };

/**
 * Backfills logins for clients who already exist but have never signed in —
 * the ones added directly rather than converted from a lead, who got an
 * account with a random password and no email.
 *
 * Always previews before sending. Anyone who has signed in is excluded, so
 * active clients never get a confusing second invite.
 */
export function BulkInvitePanel() {
  const [pending, setPending] = useState<Pending[] | null>(null);
  const [results, setResults] = useState<SendResult[] | null>(null);
  const [busy, setBusy] = useState<"check" | "send" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function check() {
    setBusy("check");
    setError(null);
    setResults(null);
    try {
      const res = await fetch("/api/admin/invite-all");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Couldn't check.");
      setPending(data.clients ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't check.");
    } finally {
      setBusy(null);
    }
  }

  async function send() {
    setBusy("send");
    setError(null);
    try {
      const res = await fetch("/api/admin/invite-all", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Couldn't send.");
      setResults(data.results ?? []);
      setPending(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't send.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="rounded-lg border border-divider bg-navy-soft p-5 flex flex-col gap-3">
      <div className="flex items-start gap-3">
        <div className="h-9 w-9 rounded-lg bg-sky/10 flex items-center justify-center shrink-0">
          <Users className="h-4 w-4 text-sky" />
        </div>
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-cream">Send login invites</h2>
          <p className="prose-ims text-sm text-cream-dim mt-0.5">
            Emails a set-password link to every client who has never signed in.
            Anyone already using the app is skipped.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" size="sm" onClick={check} disabled={busy !== null}>
          {busy === "check" ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Check who needs one
        </Button>
        {pending && pending.length > 0 && (
          <Button size="sm" onClick={send} disabled={busy !== null}>
            {busy === "send" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            {busy === "send" ? "Sending…" : `Send ${pending.length} invite${pending.length === 1 ? "" : "s"}`}
          </Button>
        )}
      </div>

      {error && <p className="text-sm text-status-limited">{error}</p>}

      {pending && pending.length === 0 && (
        <p className="text-sm text-status-optimal">
          Everyone with an email has already signed in — no invites needed.
        </p>
      )}

      {pending && pending.length > 0 && (
        <div className="rounded-md border border-divider bg-navy-elev p-3">
          <p className="text-xs text-cream-faint mb-2">
            {pending.length} client{pending.length === 1 ? "" : "s"} will receive an invite:
          </p>
          <ul className="flex flex-col gap-1 max-h-56 overflow-y-auto">
            {pending.map((c) => (
              <li key={c.email} className="text-sm text-cream flex justify-between gap-3">
                <span className="truncate">{c.name ?? "—"}</span>
                <span className="text-cream-faint text-xs truncate">{c.email}</span>
              </li>
            ))}
          </ul>
          <p className="text-xs text-cream-faint mt-2">
            Sends are paced about one per second, so this takes a moment.
          </p>
        </div>
      )}

      {results && (
        <div className="rounded-md border border-divider bg-navy-elev p-3">
          <p className="text-sm text-cream mb-2">
            {results.filter((r) => r.sent).length} sent
            {results.some((r) => !r.sent) && `, ${results.filter((r) => !r.sent).length} failed`}
          </p>
          <ul className="flex flex-col gap-1 max-h-56 overflow-y-auto">
            {results.map((r) => (
              <li key={r.email} className="text-sm flex items-start gap-2">
                {r.sent ? (
                  <Check className="h-4 w-4 text-status-optimal shrink-0 mt-0.5" />
                ) : (
                  <AlertTriangle className="h-4 w-4 text-status-limited shrink-0 mt-0.5" />
                )}
                <span className="text-cream truncate">{r.name}</span>
                {!r.sent && r.error && (
                  <span className="text-xs text-status-limited">{r.error}</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
