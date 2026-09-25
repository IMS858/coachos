"use client";
import { useRef, useState } from "react";
import { libraryDraftRows } from "@/lib/programs/library-draft";
import { ExerciseVideo } from "@/components/library/exercise-video";
import { ExercisePrescriptionFields } from "@/components/library/exercise-prescription-fields";
export function LibraryDraftEditor({ programId, data, updatedAt }: { programId: string; data: unknown; updatedAt: string }) {
  const [rows, setRows] = useState(() => libraryDraftRows(data));
  const [version, setVersion] = useState(updatedAt);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const lock = useRef(false);
  async function save() {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError(null); setMessage(null);
    try {
      const response = await fetch(`/api/programs/${programId}/library-draft`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ expected_updated_at: version, exercises: rows.map(({ key, sets, reps, load, rpe, rest_seconds, tempo, cue }) => ({ key, sets, reps, load, rpe, rest_seconds, tempo, cue })) }) });
      const result = await response.json();
      if (!response.ok || !result.ok || !result.updated_at) throw new Error(result.error || "Save was not confirmed.");
      setVersion(result.updated_at); setMessage("Prescription saved to this private client draft. Nothing was published or sent.");
    } catch (e) { setError(e instanceof Error ? e.message : "Could not save."); }
    finally { lock.current = false; setBusy(false); }
  }
  if (!rows.length) return <p role="alert">This draft has no saved exercise selection. Reopen its source set.</p>;
  return <section className="space-y-4" aria-label="Quick program prescriptions">
    <p className="rounded-2xl border border-sky/30 bg-sky/5 p-4 text-sm leading-6">Assessment optional. Prescribe the exercises below, then review the client context and exercise identities. This is a coach-only draft; client release remains a separate step.</p>
    {rows.map((row, i) => <article key={row.key} className="rounded-2xl border border-divider bg-white p-5 shadow-sm">
      <h2 className="text-xl font-semibold">{i + 1}. {row.name}</h2><p className="mt-1 text-xs text-cream-faint">{row.canonical_id ?? "Custom exercise"} · {row.exercise_id ? "Library identity linked; review before release" : "Identity mapping still needed for client release"}</p>
      <div className="mt-4"><ExercisePrescriptionFields idPrefix={`draft-${row.key}`} label={row.name} value={row} disabled={busy} onChange={value=>{setRows(old=>old.map((r,index)=>index===i?{...r,...value}:r));setMessage(null);}}/></div>
      {row.exercise_id && <div className="mt-4"><ExerciseVideo exerciseId={row.exercise_id}/></div>}
    </article>)}
    {error && <p role="alert" className="text-sm text-status-limited">{error}</p>}{message && <p role="status" className="text-sm text-status-optimal">{message}</p>}
    <button type="button" disabled={busy} onClick={() => void save()} className="min-h-12 rounded-xl bg-sky px-5 font-semibold text-white disabled:opacity-50">{busy ? "Saving…" : "Save prescription"}</button>
  </section>;
}
