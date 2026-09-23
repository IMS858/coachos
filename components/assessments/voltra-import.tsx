"use client";
import { useState, type FormEvent } from "react";

export function VoltraImport({ assessmentId }: { assessmentId: string }) {
  const [file, setFile] = useState<File | null>(null);
  const [exercise, setExercise] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [side, setSide] = useState("bilateral");
  const [mode, setMode] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [summary, setSummary] = useState<{ total_repetitions: number; sets: Array<{
    set_index: number; repetitions: number; mean_velocity_m_s: number;
    peak_power_w: number; base_load_lb_min: number; base_load_lb_max: number }> } | null>(null);
  async function submit(event: FormEvent) {
    event.preventDefault(); if (!file) return;
    setBusy(true); setMessage("");
    try {
      if (file.size > 8_000_000) throw new Error("Maximum CSV size is 8 MB");
      const response = await fetch(`/api/assessments/${assessmentId}/voltra`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ csv: await file.text(), exercise, session_date: date, side, training_mode: mode }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Import failed");
      setSummary(result.session);
      setMessage("Workout saved for coach review. Reload before editing other assessment sections.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Import failed"); }
    finally { setBusy(false); }
  }
  const field = "rounded-lg border border-white/20 bg-transparent p-2 text-inherit";
  return <section className="rounded-2xl border border-white/15 p-5">
    <h2 className="text-lg font-semibold">VOLTRA · Import Beyond+ CSV</h2>
    <p className="mt-1 text-sm opacity-75">Import a completed workout. The export has no client, exercise or date information; confirm the context before saving.</p>
    <form onSubmit={submit} className="mt-4 grid gap-3 sm:grid-cols-2">
      <label className="grid gap-1 text-sm sm:col-span-2">Beyond+ CSV
        <input type="file" accept=".csv,text/csv" required onChange={e => { setFile(e.target.files?.[0] ?? null); setSummary(null); }} />
      </label>
      <label className="grid gap-1 text-sm">Exercise
        <input className={field} required maxLength={150} value={exercise} onChange={e => setExercise(e.target.value)} placeholder="Cable row" />
      </label>
      <label className="grid gap-1 text-sm">Workout date
        <input className={field} type="date" required value={date} onChange={e => setDate(e.target.value)} />
      </label>
      <label className="grid gap-1 text-sm">Side
        <select className={field} value={side} onChange={e => setSide(e.target.value)}>
          <option value="bilateral">Bilateral</option><option value="left">Left</option>
          <option value="right">Right</option><option value="unspecified">Unspecified</option>
        </select>
      </label>
      <label className="grid gap-1 text-sm">Training mode
        <input className={field} required maxLength={150} value={mode} onChange={e => setMode(e.target.value)} placeholder="Weight training" />
      </label>
      <div className="sm:col-span-2 flex items-center gap-3">
        <button type="submit" disabled={!file || busy} className="rounded-lg bg-emerald-400 px-4 py-2 font-semibold text-slate-950 disabled:opacity-50">{busy ? "Importing…" : "Import workout"}</button>
        <span role="status" className="text-sm">{message}</span>
      </div>
    </form>
    {summary && <div className="mt-4 overflow-x-auto">
      <p className="mb-2 text-sm font-medium">{summary.total_repetitions} reps imported · Coach review required</p>
      <table className="w-full text-left text-sm"><thead><tr><th>Set</th><th>Reps</th><th>Load (lb)</th><th>Mean velocity (m/s)</th><th>Peak power (W)</th></tr></thead>
        <tbody>{summary.sets.map(s => <tr key={s.set_index} className="border-t border-white/10">
          <td>{s.set_index}</td><td>{s.repetitions}</td><td>{s.base_load_lb_min === s.base_load_lb_max ? s.base_load_lb_min : `${s.base_load_lb_min}–${s.base_load_lb_max}`}</td>
          <td>{s.mean_velocity_m_s}</td><td>{s.peak_power_w}</td>
        </tr>)}</tbody></table>
    </div>}
  </section>;
}
