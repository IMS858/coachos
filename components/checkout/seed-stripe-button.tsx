"use client";

import { useState } from "react";
import { Loader2, Check, Package } from "lucide-react";
import { Button } from "@/components/ui/button";

export function SeedStripeButton() {
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [results, setResults] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function seed() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/seed-stripe", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setDone(true);
        setResults(data.results ?? []);
      } else {
        setError(data.detail || data.error || "Couldn't set up products.");
      }
    } catch {
      setError("Couldn't reach the server. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-lg border border-divider bg-navy-elev p-4 mb-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-sm text-cream font-medium flex items-center gap-2">
            <Package className="h-4 w-4 text-sky" /> One-time product setup
          </div>
          <div className="text-xs text-cream-faint">
            Creates your 7 memberships & packages in Stripe. Safe to run once.
          </div>
        </div>
        <Button size="sm" onClick={seed} disabled={busy || done}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : done ? <Check className="h-4 w-4" /> : null}
          {done ? "Done" : "Set up products"}
        </Button>
      </div>
      {error && <p className="text-xs text-red-400 mt-2">{error}</p>}
      {results.length > 0 && (
        <ul className="text-xs text-cream-faint mt-2 flex flex-col gap-0.5">
          {results.map((r, i) => (
            <li key={i}>{r}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
