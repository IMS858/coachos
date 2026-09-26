"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight } from "lucide-react";
export function ConvertExerciseSetButton({ setId, setName }: { setId: string; setName: string }) {
  const router = useRouter();
  const requestId = useRef<string | null>(null), lock = useRef(false);
  const [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null);
  async function convert() {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError(null);
    requestId.current ??= crypto.randomUUID();
    try {
      const response = await fetch(`/api/library/sets/${setId}/convert`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ request_id: requestId.current, name: setName }) });
      const data = await response.json();
      if (!response.ok || !data.ok || !data.id) throw new Error(data.error || "Could not create the program draft.");
      router.push(`/programs/${data.id}/library`); router.refresh();
    } catch (e) { setError(e instanceof Error ? e.message : "Could not create the program draft."); }
    finally { lock.current = false; setBusy(false); }
  }
  return <div><button type="button" disabled={busy} onClick={() => void convert()} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-sky px-4 text-sm font-semibold text-white disabled:opacity-50">{busy ? "Creating…" : "Build program"}<ArrowRight className="h-4 w-4"/></button>{error && <p role="alert" className="mt-2 max-w-xs text-xs text-status-limited">{error} Retry uses the same draft reference.</p>}</div>;
}
