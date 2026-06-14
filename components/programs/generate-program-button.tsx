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
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.program_id) {
        router.push(`/programs/${data.program_id}`);
        router.refresh();
        return;
      }
      // Friendly messaging for the common failure: generator not deployed
      if (res.status === 503) {
        setError(
          "The program generator service isn't connected yet. Set PYTHON_GENERATOR_URL once your Railway service is live."
        );
      } else {
        setError(data.detail || data.error || "Couldn't generate the program.");
      }
    } catch {
      setError("Couldn't reach the generator. Try again.");
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
