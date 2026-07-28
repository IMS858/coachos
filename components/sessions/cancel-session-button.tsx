"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Loader2, X, AlertTriangle, CalendarPlus, Check } from "lucide-react";
import { Button } from "@/components/ui/button";

type Verdict = {
  hours_notice: number;
  is_late: boolean;
  plan_kind: "package" | "subscription" | "none";
  will_charge_session: boolean;
  can_reschedule: boolean;
  message: string;
};

/**
 * Cancelling a session, with the consequence shown first.
 *
 * The whole point of a 24-hour policy is that people can plan around it, which
 * only works if they're told before they commit — not after they've lost a
 * session. So opening this fetches the verdict from the server (never computed
 * here, where a wrong clock or stale plan data would mislead) and shows it
 * plainly, then asks.
 *
 * On a free cancel by a member we surface rebooking straight away: the slot is
 * gone either way, and the version of this that keeps people training is the
 * one where the next session gets booked in the same breath.
 */
export function CancelSessionButton({
  sessionId,
  scheduledAt,
}: {
  sessionId: string;
  scheduledAt: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<null | { charged: boolean; canReschedule: boolean }>(null);
  const [error, setError] = useState<string | null>(null);

  async function openDialog() {
    setOpen(true);
    setError(null);
    setVerdict(null);
    try {
      const res = await fetch(`/api/sessions/${sessionId}/cancel`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Couldn't check this session.");
      setVerdict(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't check this session.");
    }
  }

  async function confirm() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/sessions/${sessionId}/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Couldn't cancel.");
      setDone({ charged: data.charged, canReschedule: data.can_reschedule });
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't cancel.");
    } finally {
      setBusy(false);
    }
  }

  const when = new Date(scheduledAt).toLocaleString("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

  if (!open) {
    return (
      <button
        onClick={openDialog}
        className="text-xs text-cream-faint hover:text-status-limited underline underline-offset-2"
      >
        Cancel this session
      </button>
    );
  }

  return (
    <div className="rounded-lg border border-divider bg-navy-elev p-4 flex flex-col gap-3 mt-2">
      {done ? (
        <>
          <p className="text-sm text-status-optimal flex items-start gap-1.5">
            <Check className="h-4 w-4 shrink-0 mt-0.5" />
            <span>
              Cancelled. Jason has been notified.
              {done.charged && (
                <span className="block text-cream-dim mt-0.5">
                  This used one session from your package.
                </span>
              )}
            </span>
          </p>
          {done.canReschedule && (
            <Link href="/book">
              <Button size="sm" className="w-full">
                <CalendarPlus className="h-4 w-4" /> Book another time
              </Button>
            </Link>
          )}
        </>
      ) : (
        <>
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-sm text-cream font-medium">Cancel {when}?</p>
            </div>
            <button
              onClick={() => setOpen(false)}
              className="text-cream-faint hover:text-cream shrink-0"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {!verdict && !error && (
            <p className="text-sm text-cream-faint flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" /> Checking…
            </p>
          )}

          {verdict && (
            <div
              className={`rounded-md border px-3 py-2.5 text-sm ${
                verdict.will_charge_session
                  ? "border-status-limited/40 bg-status-limited/10 text-cream"
                  : verdict.is_late
                    ? "border-status-moderate/40 bg-status-moderate/10 text-cream"
                    : "border-status-optimal/40 bg-status-optimal/10 text-cream"
              }`}
            >
              <span className="flex items-start gap-1.5">
                {verdict.is_late && (
                  <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                )}
                {verdict.message}
              </span>
            </div>
          )}

          {verdict && (
            <div>
              <label className="block text-xs font-medium text-cream-dim mb-1.5">
                Reason (optional)
              </label>
              <input
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Work ran over, feeling unwell…"
                className="w-full rounded-lg border border-divider bg-navy-soft px-3 py-2 text-sm text-cream focus:outline-none focus:border-sky"
              />
            </div>
          )}

          {error && <p className="text-sm text-status-limited">{error}</p>}

          {verdict && (
            <div className="flex gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setOpen(false)}
                disabled={busy}
                className="flex-1"
              >
                Keep it
              </Button>
              <Button size="sm" onClick={confirm} disabled={busy} className="flex-1">
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {verdict.will_charge_session ? "Cancel anyway" : "Cancel session"}
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
