"use client";

import { useEffect, useState } from "react";
import { FileText, Loader2, Send, Check, AlertTriangle, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";

type Status = {
  type: string;
  title: string;
  required: boolean;
  state: "current" | "missing" | "expired" | "outdated";
  signed_at: string | null;
  expires_at: string | null;
};

/**
 * Agreements for one client: what's signed, what's lapsed, and a way to chase it.
 *
 * States are distinguished on purpose — "never signed", "due for renewal" and
 * "wording changed" are different conversations, and lumping them into
 * "unsigned" would make a long-standing client look like a new one.
 */
export function WaiverPanel({ clientId }: { clientId: string }) {
  const [statuses, setStatuses] = useState<Status[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    fetch(`/api/clients/${clientId}/waivers`)
      .then((r) => r.json())
      .then((d) => live && setStatuses(d.statuses ?? []))
      .catch(() => live && setError("Couldn't load agreements."));
    return () => {
      live = false;
    };
  }, [clientId]);

  async function send() {
    setBusy(true);
    setMsg(null);
    setError(null);
    try {
      const res = await fetch(`/api/clients/${clientId}/waivers`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Couldn't send.");
      if (data.reason === "nothing_outstanding") {
        setMsg("Everything's already signed — nothing to send.");
      } else if (data.sent) {
        setMsg(`Sent — ${data.count} agreement${data.count === 1 ? "" : "s"} to sign.`);
      } else {
        setError(data.error ?? "The email didn't send.");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't send.");
    } finally {
      setBusy(false);
    }
  }

  const pending = (statuses ?? []).filter((s) => s.state !== "current");
  const blocking = pending.filter((s) => s.required);

  const chip = (s: Status) => {
    const map = {
      current: { icon: Check, cls: "text-status-optimal", label: s.expires_at
        ? `until ${new Date(s.expires_at).toLocaleDateString("en-US", { month: "short", year: "numeric" })}`
        : "signed" },
      expired: { icon: Clock, cls: "text-status-moderate", label: "due for renewal" },
      outdated: { icon: Clock, cls: "text-status-moderate", label: "wording updated" },
      missing: { icon: AlertTriangle, cls: "text-status-limited", label: "never signed" },
    }[s.state];
    const Icon = map.icon;
    return (
      <span className={`flex items-center gap-1 text-xs shrink-0 ${map.cls}`}>
        <Icon className="h-3.5 w-3.5" /> {map.label}
      </span>
    );
  };

  return (
    <div className="rounded-lg border border-divider bg-navy-soft p-5 flex flex-col gap-3">
      <div className="flex items-start gap-3">
        <div className="h-9 w-9 rounded-lg bg-sky/10 flex items-center justify-center shrink-0">
          <FileText className="h-4 w-4 text-sky" />
        </div>
        <div className="min-w-0">
          <h3 className="text-base font-semibold text-cream">Agreements</h3>
          <p className="prose-ims text-sm text-cream-dim mt-0.5">
            {statuses === null
              ? "Checking…"
              : blocking.length > 0
                ? `${blocking.length} required agreement${blocking.length === 1 ? "" : "s"} outstanding — they'll be asked to sign at next login.`
                : pending.length > 0
                  ? "All required agreements are current. Optional ones aren't signed."
                  : "Everything current."}
          </p>
        </div>
      </div>

      {statuses && statuses.length > 0 && (
        <ul className="flex flex-col gap-2">
          {statuses.map((s) => (
            <li
              key={s.type}
              className="flex items-center justify-between gap-3 border-b border-divider/60 last:border-0 pb-2 last:pb-0"
            >
              <span className="text-sm text-cream truncate">
                {s.title}
                {!s.required && (
                  <span className="text-cream-faint text-xs"> · optional</span>
                )}
              </span>
              {chip(s)}
            </li>
          ))}
        </ul>
      )}

      {msg && <p className="text-sm text-status-optimal">{msg}</p>}
      {error && <p className="text-sm text-status-limited">{error}</p>}

      <div>
        <Button size="sm" onClick={send} disabled={busy || pending.length === 0}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          {pending.length === 0
            ? "Nothing to send"
            : `Send ${pending.length} to sign`}
        </Button>
      </div>
    </div>
  );
}
