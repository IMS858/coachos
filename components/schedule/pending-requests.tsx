"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Check, X, Inbox } from "lucide-react";
import { Button } from "@/components/ui/button";

interface RequestRow {
  id: string;
  scheduled_at: string;
  session_type: string;
  notes_pre: string | null;
  client_name: string;
}

export function PendingRequests({ requests }: { requests: RequestRow[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [handled, setHandled] = useState<Set<string>>(new Set());

  async function respond(id: string, action: "approve" | "decline") {
    setBusy(id);
    const res = await fetch(`/api/sessions/${id}/respond`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    setBusy(null);
    if (res.ok) {
      setHandled((prev) => new Set(prev).add(id));
      router.refresh();
    }
  }

  const visible = requests.filter((r) => !handled.has(r.id));
  if (visible.length === 0) return null;

  return (
    <div className="rounded-xl border border-sky/30 bg-sky/5 p-4">
      <div className="flex items-center gap-2 mb-3">
        <Inbox className="h-4 w-4 text-sky" />
        <span className="text-sm font-medium text-cream">
          Session requests ({visible.length})
        </span>
      </div>
      <div className="flex flex-col gap-2">
        {visible.map((r) => (
          <div
            key={r.id}
            className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-navy-deep border border-divider px-3 py-2.5"
          >
            <div className="min-w-0">
              <div className="text-sm text-cream">
                {r.client_name} ·{" "}
                <span className="capitalize">{r.session_type}</span>
              </div>
              <div className="text-xs text-cream-faint">
                {new Date(r.scheduled_at).toLocaleString("en-US", {
                  weekday: "short",
                  month: "short",
                  day: "numeric",
                  hour: "numeric",
                  minute: "2-digit",
                })}
                {r.notes_pre && <span> · &quot;{r.notes_pre}&quot;</span>}
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={() => respond(r.id, "approve")}
                disabled={busy === r.id}
              >
                {busy === r.id ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Check className="h-4 w-4" />
                )}
                Approve
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => respond(r.id, "decline")}
                disabled={busy === r.id}
              >
                <X className="h-4 w-4" />
                Decline
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
