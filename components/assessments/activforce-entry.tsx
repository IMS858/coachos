"use client";

import { useState, type FormEvent } from "react";

export function ActivForceEntry({ assessmentId }: { assessmentId: string }) {
  const [kind, setKind] = useState<"rom" | "force">("rom");
  const [joint, setJoint] = useState("");
  const [motion, setMotion] = useState("");
  const [side, setSide] = useState<"left" | "right" | "bilateral">("left");
  const [value, setValue] = useState("");
  const [unit, setUnit] = useState<"degrees" | "lb" | "N">("degrees");
  const [position, setPosition] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(`/api/assessments/${assessmentId}/device-measurements`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ measurement: { device: "activforce_2", kind, joint, motion,
          side, value: Number(value), unit: kind === "rom" ? "degrees" : unit,
          position, test_date: date, notes } }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not save");
      setValue("");
      setNotes("");
      setMessage("Measurement saved for coach review. Reload the assessment before editing other sections.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not save measurement");
    } finally { setBusy(false); }
  }
  const field = "rounded-lg border border-white/20 bg-transparent p-2 text-inherit";
  return <section className="rounded-2xl border border-white/15 p-5">
    <h2 className="text-lg font-semibold">ActivForce 2 · Manual measurement</h2>
    <p className="mt-1 text-sm opacity-75">Record the actual test and setup. Measurements require coach review before programming.</p>
    <form onSubmit={save} className="mt-4 grid gap-3 sm:grid-cols-2">
      <label className="grid gap-1 text-sm">Test type
        <select className={field} value={kind} onChange={e => { const k = e.target.value as "rom" | "force"; setKind(k); setUnit(k === "rom" ? "degrees" : "lb"); }}>
          <option value="rom">Range of motion</option><option value="force">Force</option>
        </select>
      </label>
      <label className="grid gap-1 text-sm">Side
        <select className={field} value={side} onChange={e => setSide(e.target.value as typeof side)}>
          <option value="left">Left</option><option value="right">Right</option><option value="bilateral">Bilateral</option>
        </select>
      </label>
      <label className="grid gap-1 text-sm">Joint / muscle group
        <input className={field} required maxLength={100} value={joint} onChange={e => setJoint(e.target.value)} placeholder="Shoulder" />
      </label>
      <label className="grid gap-1 text-sm">Motion / test
        <input className={field} required maxLength={100} value={motion} onChange={e => setMotion(e.target.value)} placeholder="External rotation" />
      </label>
      <label className="grid gap-1 text-sm">Measurement
        <input className={field} type="number" required min={0} max={kind === "rom" ? 360 : 10000} step="any" value={value} onChange={e => setValue(e.target.value)} />
      </label>
      <label className="grid gap-1 text-sm">Units
        <select className={field} value={kind === "rom" ? "degrees" : unit} disabled={kind === "rom"} onChange={e => setUnit(e.target.value as typeof unit)}>
          <option value="degrees">Degrees</option><option value="lb">Pounds-force</option><option value="N">Newtons</option>
        </select>
      </label>
      <label className="grid gap-1 text-sm">Testing position
        <input className={field} required maxLength={150} value={position} onChange={e => setPosition(e.target.value)} placeholder="Seated, elbow at 90°" />
      </label>
      <label className="grid gap-1 text-sm">Test date
        <input className={field} type="date" required value={date} onChange={e => setDate(e.target.value)} />
      </label>
      <label className="grid gap-1 text-sm sm:col-span-2">Notes
        <textarea className={field} maxLength={500} value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder="Protocol, symptoms or retest context" />
      </label>
      <div className="sm:col-span-2 flex items-center gap-3">
        <button type="submit" disabled={busy} className="rounded-lg bg-emerald-400 px-4 py-2 font-semibold text-slate-950 disabled:opacity-50">{busy ? "Saving…" : "Save measurement"}</button>
        <span role="status" className="text-sm">{message}</span>
      </div>
    </form>
  </section>;
}
