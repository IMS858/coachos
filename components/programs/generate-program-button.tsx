"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Calls /api/generate for this assessment, then routes to the new program.
 * Surfaces a clear message if the Python generator service isn't configured.
 */
export function GenerateProgramButton({
  assessmentId,
}: {
  assessmentId: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generate() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assessment_id: assessmentId }),
        signal: AbortSignal.timeout(65000),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.program_id) {
        router.push(`/programs/${data.program_id}`);
        router.refresh();
        return;
      }
      if (res.status === 503) {
        setError(
          "The generator isn't connected yet — add ANTHROPIC_API_KEY in Vercel and redeploy."
        );
      } else {
        setError(data.detail || data.error || "Couldn't generate the program.");
      }
    } catch (err: any) {
      if (err?.name === "TimeoutError") {
        setError("The generator took too long. Try again — it's usually faster on a second run.");
      } else {
        setError("Couldn't reach the generator. Try again.");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <Button onClick={generate} disabled={busy}>
        {busy ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" /> Generating…
          </>
        ) : (
          <>
            <Sparkles className="h-4 w-4" /> Generate Program
          </>
        )}
      </Button>
      {error && (
        <p className="text-xs text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-md px-3 py-2">
          {error}
        </p>
      )}
    </div>
  );
}
