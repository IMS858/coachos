"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, UserX, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Mark a session as a no-show.
 *
 * Asks whether to charge before doing it, because "didn't turn up" and
 * "genuinely couldn't" are different situations and only Jason knows which
 * this was. Defaults to charging — that's the policy — but waiving is one tap,
 * not a database edit.
 */
export function NoShowButton({
  sessionId,
  status,
}: {
  sessionId: string;
  status: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isNoShow = status === "no_show";

  async function mark(charge: boolean) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/sessions/${sessionId}/no-show`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ charge }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Couldn't mark it.");
      setOpen(false);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't mark it.");
    } finally {
      setBusy(false);
    }
  }

  async function undo() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/sessions/${sessionId}/no-show`, { method: "DELETE" });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error ?? "Couldn't undo.");
      }
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't undo.");
    } finally {
      setBusy(false);
    }
  }

  if (isNoShow) {
    return (
      <div className="flex flex-col gap-1">
        <Button variant="secondary" size="sm" onClick={undo} disabled={busy}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Undo2 className="h-4 w-4" />}
          Undo no-show
        </Button>
        {error && <p className="text-xs text-status-limited">{error}</p>}
      </div>
    );
  }

  if (!open) {
    return (
      <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
        <UserX className="h-4 w-4" /> No-show
      </Button>
    );
  }

  return (
    <div className="rounded-md border border-divider bg-navy-elev p-3 flex flex-col gap-2">
      <p className="text-sm text-cream">Charge them for this session?</p>
      <p className="text-xs text-cream-faint">
        Packages lose a session. Memberships are never charged — they&apos;ve
        already paid for the month.
      </p>
      <div className="flex gap-2">
        <Button size="sm" onClick={() => mark(true)} disabled={busy} className="flex-1">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Charge
        </Button>
        <Button variant="secondary" size="sm" onClick={() => mark(false)} disabled={busy} className="flex-1">
          Waive it
        </Button>
      </div>
      <button
        onClick={() => setOpen(false)}
        className="text-xs text-cream-faint hover:text-cream"
      >
        Cancel
      </button>
      {error && <p className="text-xs text-status-limited">{error}</p>}
    </div>
  );
}
