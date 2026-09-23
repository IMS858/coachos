"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, Loader2, Download, ShieldAlert } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export function GenerateProgramButton({
  assessmentId,
}: {
  assessmentId: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [needsReview, setNeedsReview] = useState(false);

  async function generate(pdfMode: string = "client") {
    setBusy(true);
    setError(null);
    setNeedsReview(false);
    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assessment_id: assessmentId, pdf_mode: pdfMode }),
        signal: AbortSignal.timeout(60000),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        if (res.status === 422 && data.error === "coach_review_required") {
          setNeedsReview(true);
          setError(data.detail || "A coach must review the current restrictions before generating this plan.");
        } else if (res.status === 503) {
          setError("Generator not configured. Set PROGRAM_GENERATOR_URL in Vercel.");
        } else {
          setError(data.detail || data.error || `Generator returned ${res.status}`);
        }
        return;
      }

      // Response is a PDF — handle differently for mobile vs desktop
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);

      // Detect mobile/PWA — use window.open for iOS (blob download fails in standalone mode)
      const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
      const isStandalone = window.matchMedia("(display-mode: standalone)").matches
        || (navigator as any).standalone === true;

      if (isMobile || isStandalone) {
        // Open PDF in new tab — iOS shows native PDF viewer with share/save/print
        window.open(url, "_blank");
      } else {
        // Desktop — trigger download
        const disposition = res.headers.get("content-disposition") ?? "";
        const match = disposition.match(/filename="?([^"]+)"?/);
        const filename = match?.[1] ?? "ims_plan.pdf";
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      }

      setDone(true);
      router.refresh();
    } catch (err: any) {
      if (err?.name === "TimeoutError") {
        setError("Generation took too long. Try again — it usually works on retry.");
      } else {
        setError("Couldn't reach the generator. Try again.");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => generate("client")} disabled={busy}>
          {busy ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : done ? (
            <Download className="h-4 w-4" />
          ) : (
            <Sparkles className="h-4 w-4" />
          )}
          {busy ? "Generating…" : done ? "Download again" : "Generate Client Plan"}
        </Button>
        <Button variant="secondary" onClick={() => generate("coach")} disabled={busy}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          Coach Plan
        </Button>
      </div>
      {error && (
        <div role="alert" className={needsReview ? "rounded-xl border border-status-limited/40 bg-navy-soft p-4" : ""}>
          {needsReview && <p className="mb-2 flex items-center gap-2 text-sm font-semibold text-cream"><ShieldAlert className="h-4 w-4" /> Coach review required</p>}
          <p className="text-sm text-status-limited">{error}</p>
          {needsReview && (
            <Link href="/programs?view=draft" className="mt-3 inline-flex min-h-10 items-center text-sm font-semibold text-sky underline underline-offset-4">
              Open program review queue
            </Link>
          )}
        </div>
      )}
      {done && !error && (
        <p className="text-xs text-status-optimal">Plan generated and downloading. Check your Downloads folder.</p>
      )}
    </div>
  );
}
