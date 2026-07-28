"use client";

import { useState } from "react";
import { Loader2, MailCheck, AlertTriangle, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Result =
  | { ok: true; id: string; to: string; config: Record<string, unknown> }
  | {
      ok: false;
      reason: string;
      error: string;
      guidance: string;
      to: string;
      config: Record<string, unknown>;
    }
  | null;

export function EmailDiagnostics({ defaultTo }: { defaultTo: string }) {
  const [to, setTo] = useState(defaultTo);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result>(null);

  async function run() {
    setBusy(true);
    setResult(null);
    try {
      const res = await fetch("/api/admin/email-test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to }),
      });
      setResult(await res.json());
    } catch {
      setResult({
        ok: false,
        reason: "unknown",
        error: "Couldn't reach the server.",
        guidance: "Check your connection and try again.",
        to,
        config: {},
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-lg border border-divider bg-navy-soft p-5">
        <h2 className="text-lg font-semibold text-cream">Send a test email</h2>
        <p className="prose-ims text-sm text-cream-dim mt-1">
          Every other email in Coach OS fails quietly on purpose, so a mail
          problem can never block a checkout or a client conversion. This is the
          one place that reports exactly what happened.
        </p>
        <div className="flex flex-col sm:flex-row gap-2 mt-4">
          <Input
            type="email"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            placeholder="you@example.com"
            className="flex-1"
          />
          <Button onClick={run} disabled={busy || !to.includes("@")}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            {busy ? "Sending…" : "Send test"}
          </Button>
        </div>
      </div>

      {result?.ok && (
        <div className="rounded-lg border border-status-optimal/40 bg-status-optimal/10 p-5">
          <div className="flex items-center gap-2 text-status-optimal font-medium">
            <MailCheck className="h-5 w-5" /> Sent to {result.to}
          </div>
          <p className="prose-ims text-sm text-cream-dim mt-2">
            Email is working. Check the inbox (and spam) to confirm delivery.
            Invites, password resets and reminders will all send.
          </p>
        </div>
      )}

      {result && !result.ok && (
        <div className="rounded-lg border border-status-limited/40 bg-status-limited/10 p-5">
          <div className="flex items-center gap-2 text-status-limited font-medium">
            <AlertTriangle className="h-5 w-5" /> Not sent
          </div>
          <p className="prose-ims text-sm text-cream mt-2">{result.guidance}</p>
          <p className="text-xs text-cream-faint mt-3 font-mono break-words">
            {result.reason} · {result.error}
          </p>
        </div>
      )}

      {result?.config && Object.keys(result.config).length > 0 && (
        <div className="rounded-lg border border-divider bg-navy-soft p-5">
          <h3 className="text-sm font-semibold text-cream mb-3">Configuration</h3>
          <dl className="flex flex-col gap-2 text-sm">
            {Object.entries(result.config).map(([k, v]) => (
              <div key={k} className="flex justify-between gap-4 border-b border-divider/60 pb-2 last:border-0">
                <dt className="text-cream-faint font-mono text-xs">{k}</dt>
                <dd className="text-cream text-right break-all text-xs">
                  {v === true ? "yes" : v === false ? "no" : String(v ?? "—")}
                </dd>
              </div>
            ))}
          </dl>
          <p className="text-xs text-cream-faint mt-3">
            Environment variables only load on a new build — after changing one
            in Vercel, redeploy before testing again.
          </p>
        </div>
      )}
    </div>
  );
}
