"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function PublishImsProgramButton({ programId }: { programId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function publish() {
    if (!window.confirm("Publish this reviewed PDF to the client? Internal coach notes will remain private.")) return;
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/programs/${programId}/publish`, { method: "POST" });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "Unable to publish");
      router.refresh();
    } catch (error) {
      setError(error instanceof Error ? error.message : "Unable to publish");
    } finally { setBusy(false); }
  }
  return <div className="flex flex-col gap-2">
    <button type="button" disabled={busy} onClick={publish}
      className="w-fit rounded-xl bg-[#237d61] px-5 py-3 text-sm font-semibold text-white disabled:opacity-50">
      {busy ? "Publishing…" : "Approve & publish client PDF"}
    </button>
    {error && <p role="alert" className="text-sm text-status-limited">{error}</p>}
  </div>;
}
