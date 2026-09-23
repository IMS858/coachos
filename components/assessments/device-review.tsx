"use client";
import { useState } from "react";

type Reading = Record<string, unknown>;
type Props = { assessmentId: string; measurements: Reading[]; workouts: Reading[] };
export function DeviceReview({ assessmentId, measurements, workouts }: Props) {
  const [entries, setEntries] = useState({ activforce: measurements, voltra: workouts });
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  async function review(device: "activforce" | "voltra", index: number, decision: "approved" | "rejected") {
    const reading = entries[device][index];
    setBusy(device + index); setMessage("");
    try {
      const response = await fetch(`/api/assessments/${assessmentId}/device-review`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ device, index, decision, expected_recorded_at: reading.recorded_at }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Review failed");
      setEntries(current => ({ ...current, [device]: current[device].map((item, i) =>
        i === index ? { ...item, review_status: decision } : item) }));
      setMessage("Review saved.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Review failed"); }
    finally { setBusy(""); }
  }
  const str = (value: unknown) => typeof value === "string" || typeof value === "number" ? String(value) : "—";
  return <section className="rounded-2xl border border-white/15 p-5">
    <h2 className="text-lg font-semibold">Device results · Coach review</h2>
    <p className="mt-1 text-sm opacity-75">Confirm testing context and readings before they can be considered for programming. Approval does not automatically change a program.</p>
    {(["activforce", "voltra"] as const).map(device => <div key={device} className="mt-4">
      <h3 className="font-semibold">{device === "activforce" ? "ActivForce 2" : "VOLTRA"}</h3>
      {!entries[device].length && <p className="mt-1 text-sm opacity-60">No readings yet.</p>}
      <div className="mt-2 grid gap-2">{entries[device].map((reading, index) =>
        <div key={str(reading.recorded_at) + index} className="rounded-xl border border-white/10 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div><p className="font-medium">{device === "activforce"
              ? `${str(reading.joint)} · ${str(reading.motion)} · ${str(reading.side)}`
              : `${str(reading.exercise)} · ${str(reading.side)}`}</p>
              <p className="text-sm opacity-70">{device === "activforce"
                ? `${str(reading.value)} ${str(reading.unit)} · ${str(reading.position)} · ${str(reading.test_date)}`
                : `${str(reading.total_repetitions)} reps · ${str(reading.training_mode)} · ${str(reading.session_date)}`}</p>
            </div>
            <span className="rounded-full border border-white/20 px-2 py-1 text-xs">{str(reading.review_status)}</span>
          </div>
          {device === "voltra" && Array.isArray(reading.sets) && <div className="mt-2 text-sm opacity-80">
            {(reading.sets as Array<Record<string, unknown>>).map((set, i) =>
              <p key={i}>Set {str(set.set_index)}: {str(set.repetitions)} reps · {str(set.base_load_lb_min)}–{str(set.base_load_lb_max)} lb · {str(set.mean_velocity_m_s)} m/s · {str(set.peak_power_w)} W peak</p>)}
          </div>}
          {device === "activforce" && Boolean(reading.notes) && <p className="mt-2 text-sm opacity-70">{str(reading.notes)}</p>}
          <div className="mt-3 flex gap-2">
            <button disabled={!!busy || reading.review_status === "approved"} onClick={() => review(device, index, "approved")} className="rounded-lg bg-emerald-400 px-3 py-1.5 text-sm font-medium text-slate-950 disabled:opacity-40">Approve</button>
            <button disabled={!!busy || reading.review_status === "rejected"} onClick={() => review(device, index, "rejected")} className="rounded-lg border border-white/30 px-3 py-1.5 text-sm disabled:opacity-40">Reject</button>
          </div>
        </div>)}</div>
    </div>)}
    <p role="status" className="mt-3 text-sm">{message}</p>
  </section>;
}
