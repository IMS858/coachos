"use client";
import { useRef, useState } from "react";
import { libraryDraftRows } from "@/lib/programs/library-draft";
import { ExerciseVideo } from "@/components/library/exercise-video";
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
      const response = await fetch(`/api/programs/${programId}/library-draft`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ expected_updated_at: version, exercises: rows.map(({ key, sets, reps, load, rest_seconds, tempo }) => ({ key, sets, reps, load, rest_seconds, tempo })) }) });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.error || "Save was not confirmed.");
      setVersion(result.updated_at); setMessage("Prescription saved to this private client draft. Nothing was published or sent.");
    } catch (e) { setError(e instanceof Error ? e.message : "Could not save."); }
    finally { lock.current = false; setBusy(false); }
  }
  const field = "mt-1 min-h-11 w-full rounded-xl border border-divider bg-white px-3 text-base";
  if (!rows.length) return <p role="alert">This draft has no saved exercise selection. Reopen its source set.</p>;
  return <section className="space-y-4" aria-label="Quick program prescriptions">
    <p className="rounded-2xl border border-sky/30 bg-sky/5 p-4 text-sm leading-6">Assessment optional. Prescribe the exercises below, then review the client context and exercise identities. This is a coach-only draft; client release remains a separate step.</p>
    {rows.map((row, i) => <article key={row.key} className="rounded-2xl border border-divider bg-white p-5 shadow-sm">
      <h2 className="text-xl font-semibold">{i + 1}. {row.name}</h2><p className="mt-1 text-xs text-cream-faint">{row.canonical_id ?? "Custom exercise"} · {row.exercise_id ? "Library identity linked; review before release" : "Identity mapping still needed for client release"}</p>
      <fieldset disabled={busy} className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3"><legend className="sr-only">Prescription for {row.name}</legend>
        {([ ["sets", "Sets"], ["reps", "Reps / time"], ["load", "Load / RPE"], ["rest_seconds", "Rest (seconds)"], ["tempo", "Tempo"] ] as const).map(([key,label]) => <label key={key} className="text-sm font-medium">{label}<input className={field} type={key === "sets" || key === "rest_seconds" ? "number" : "text"} min={key === "sets" ? 1 : 0} max={key === "sets" ? 20 : key === "rest_seconds" ? 900 : undefined} maxLength={key === "load" ? 120 : 40} value={row[key] ?? ""} onChange={e => { const value = key === "sets" || key === "rest_seconds" ? e.target.value === "" ? null : Number(e.target.value) : e.target.value; setRows(old => old.map((r,index) => index === i ? { ...r, [key]: value } : r)); setMessage(null); }}/></label>)}
      </fieldset>
      {row.exercise_id && <div className="mt-4"><ExerciseVideo exerciseId={row.exercise_id}/></div>}
    </article>)}
    {error && <p role="alert" className="text-sm text-status-limited">{error}</p>}{message && <p role="status" className="text-sm text-status-optimal">{message}</p>}
    <button type="button" disabled={busy} onClick={() => void save()} className="min-h-12 rounded-xl bg-sky px-5 font-semibold text-white disabled:opacity-50">{busy ? "Saving…" : "Save prescription"}</button>
  </section>;
}
