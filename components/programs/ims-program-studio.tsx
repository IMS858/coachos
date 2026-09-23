"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PublishImsProgramButton } from "@/components/programs/publish-ims-program-button";
import { Activity, ArrowUpRight, ClipboardCheck, Dumbbell, ShieldCheck } from "lucide-react";

type Exercise = {
  name?: string; dose?: string; tempo?: string | null;
  rationale?: string | null; progression_note?: string | null;
  week_prescriptions?: Array<{week?: number; sets?: number; reps?: number | string; weight?: number; weight_unit?: string; rpe?: number; fallback_text?: string}>;
};
type Session = { day_number?: number; day_type?: string; focus?: string; blocks?: Array<{name?: string; duration_note?: string; exercises?: Exercise[]}> };
type Week = { week_number?: number; intent?: string; progression_notes?: string[]; sessions?: Session[] };
type Plan = { weeks?: Week[]; progression?: Record<string, unknown>; assessment?: {primary_goal?: string; fra_priorities?: Array<{description?: string}>; constraints?: string[]; concerns?: string[]} };

export function ImsProgramStudio({ plan, programId, initialEdits, canPublish = false }: { plan: Plan; programId: string; initialEdits?: Plan | null; canPublish?: boolean }) {
  const router = useRouter();
  const [working, setWorking] = useState<Plan>(() => structuredClone(initialEdits ?? plan));
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [savedEdits, setSavedEdits] = useState(Boolean(initialEdits));
  const [pdfReady, setPdfReady] = useState(canPublish && !initialEdits);
  function editExercise(bi: number, ei: number, field: "name" | "dose" | "tempo" | "rationale" | "progression_note", value: string) {
    setWorking(previous => {
      const next = structuredClone(previous);
      const exercise = next.weeks?.[selectedWeek]?.sessions?.[selectedSession]?.blocks?.[bi]?.exercises?.[ei];
      if (exercise) exercise[field] = value;
      return next;
    });
    setDirty(true);
    setPdfReady(false);
    setNotice("");
  }
  async function save() {
    setBusy(true); setNotice("");
    try {
      const response = await fetch(`/api/programs/${programId}`, {method:"PATCH", headers:{"Content-Type":"application/json"}, body:JSON.stringify({coach_edits:{structured_program:working}})});
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error ?? "Could not save draft");
      setDirty(false); setSavedEdits(true); setPdfReady(false); setNotice("Coach edits saved. Regenerate the PDF before publishing.");
      router.refresh();
    } catch (error) {setNotice(error instanceof Error ? error.message : "Save failed");}
    finally {setBusy(false);}
  }
  async function regenerate() {
    setBusy(true); setNotice("");
    try {
      const response = await fetch(`/api/programs/${programId}/regenerate`, {method:"POST"});
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error ?? "Could not regenerate PDF");
      setSavedEdits(false); setPdfReady(true); setNotice("Reviewed client PDF regenerated. Ready for final coach approval.");
      router.refresh();
    } catch (error) {setNotice(error instanceof Error ? error.message : "Regeneration failed");}
    finally {setBusy(false);}
  }
  const weeks = Array.isArray(working.weeks) ? working.weeks : [];
  const [selectedWeek, setSelectedWeek] = useState(0);
  const [selectedSession, setSelectedSession] = useState(0);
  const week = weeks[selectedWeek];
  const sessions = Array.isArray(week?.sessions) ? week.sessions : [];
  const session = sessions[Math.min(selectedSession, Math.max(0, sessions.length - 1))];
  const count = (session?.blocks ?? []).reduce((n, block) => n + (block.exercises?.length ?? 0), 0);
  if (!weeks.length) return <p className="text-sm text-cream-dim">No structured weeks were returned. Review the saved PDF before publishing.</p>;
  return (
    <section className="ims-program-studio space-y-5" aria-label="Generated training program">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-divider bg-navy-soft p-4">
        <div><p className="eyebrow">Coach review</p><p className="text-sm text-cream-dim">Edit the prescription, save your changes, then regenerate the client PDF.</p></div>
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={busy || (!dirty && (savedEdits || pdfReady))} onClick={save} className="rounded-lg border border-sky px-4 py-2 text-sm font-semibold text-sky disabled:opacity-40">{dirty ? "Save draft" : "Approve unchanged plan"}</button>
          <button type="button" disabled={busy || dirty || !savedEdits} onClick={regenerate} className="rounded-lg bg-[#237d61] px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">Regenerate PDF</button>
        </div>
        {pdfReady && !dirty && !busy && <PublishImsProgramButton programId={programId} />}
        {!dirty && !savedEdits && !pdfReady && <p className="w-full text-xs text-cream-dim">Review the unchanged plan or edit exercises, then save and regenerate the client PDF.</p>}
        {notice && <p role="status" className="w-full text-sm text-sky">{notice}</p>}
        {dirty && <p className="w-full text-xs text-status-moderate">Unsaved changes — publishing is blocked until the reviewed PDF is regenerated.</p>}
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="ims-studio-stat"><Dumbbell className="h-5 w-5 text-sky" /><span>Training block</span><strong>{weeks.length} weeks</strong></div>
        <div className="ims-studio-stat"><Activity className="h-5 w-5 text-sky" /><span>Weekly frequency</span><strong>{sessions.length} sessions</strong></div>
        <div className="ims-studio-stat"><ShieldCheck className="h-5 w-5 text-sky" /><span>Program status</span><strong>Coach review</strong></div>
      </div>
      <div className="ims-studio-panel p-4 sm:p-6">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div><p className="eyebrow">Periodized training</p><h3 className="text-2xl text-cream">Weekly breakdown</h3></div>
          <span className="rounded-full border border-divider px-3 py-1 text-xs text-cream-dim">Select a week to inspect</span>
        </div>
        <div className="flex flex-wrap gap-2" role="tablist" aria-label="Training week">
          {weeks.map((w, i) => (
            <button key={i} type="button" role="tab" aria-selected={selectedWeek === i}
              onClick={() => { setSelectedWeek(i); setSelectedSession(0); }}
              className={`ims-week-tab ${selectedWeek === i ? "ims-week-tab-active" : ""}`}>
              Week {w.week_number ?? i + 1}
            </button>
          ))}
        </div>
        <div className="mt-5 mb-4 flex items-start gap-3 rounded-xl border border-divider bg-navy-deep p-4">
          <ClipboardCheck className="mt-0.5 h-5 w-5 shrink-0 text-sky" />
          <div><p className="font-semibold text-cream">{week.intent || "Build consistency and quality"}</p>
            {(week.progression_notes ?? []).map((note, i) => <p key={i} className="mt-1 text-sm text-cream-dim">{note}</p>)}
          </div>
        </div>
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          {sessions.map((s, i) => (
            <button type="button" key={i} onClick={() => setSelectedSession(i)}
              aria-pressed={selectedSession === i}
              className={`rounded-xl border p-4 text-left transition-colors ${selectedSession === i ? "border-sky bg-navy-elev" : "border-divider bg-navy-deep hover:border-sky"}`}>
              <span className="text-xs uppercase tracking-widest text-sky">Day {s.day_number ?? i + 1}</span>
              <strong className="mt-2 block text-sm text-cream">{s.focus || (s.day_type ?? "Training").replaceAll("_", " ")}</strong>
              <span className="mt-2 block text-xs text-cream-dim">{(s.blocks ?? []).reduce((n,b) => n + (b.exercises?.length ?? 0),0)} exercises <ArrowUpRight className="inline h-3 w-3" /></span>
            </button>
          ))}
        </div>
      </div>
      {session && <div className="ims-studio-panel p-4 sm:p-6">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div><p className="eyebrow">Day {session.day_number ?? selectedSession + 1} · {(session.day_type ?? "training").replaceAll("_", " ")}</p>
            <h3 className="text-2xl text-cream">{session.focus || "Session details"}</h3></div>
          <span className="text-sm text-cream-dim">{count} exercises</span>
        </div>
        <div className="space-y-5">
          {(session.blocks ?? []).map((block, bi) => <div key={bi}>
            <div className="mb-3 flex items-center justify-between gap-2 border-b border-divider pb-2">
              <h4 className="text-lg text-sky">{block.name || "Training block"}</h4>
              {block.duration_note && <span className="text-xs text-cream-faint">{block.duration_note}</span>}
            </div>
            <div className="grid gap-2">
              {(block.exercises ?? []).map((ex, ei) => <details key={ei} className="ims-exercise-row group">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-3">
                  <div className="min-w-0"><span className="block font-semibold text-cream">{ex.name || "Unnamed exercise"}</span>
                    <span className="text-xs text-cream-dim">{ex.dose || "Coach to prescribe"}{ex.tempo ? ` · ${ex.tempo}` : ""}</span></div>
                  <span className="shrink-0 text-xs text-sky group-open:rotate-90">View details →</span>
                </summary>
                <div className="space-y-2 border-t border-divider px-3 py-3 text-sm text-cream-dim">
                  <label className="block"><span className="mb-1 block text-xs text-sky">Exercise name</span><input className="w-full rounded-lg border border-divider bg-navy-elev p-2 text-cream" value={ex.name ?? ""} onChange={e=>editExercise(bi,ei,"name",e.target.value)} /></label>
                  <label className="block"><span className="mb-1 block text-xs text-sky">Dose · sets / reps / time</span><input className="w-full rounded-lg border border-divider bg-navy-elev p-2 text-cream" value={ex.dose ?? ""} onChange={e=>editExercise(bi,ei,"dose",e.target.value)} /></label>
                  <label className="block"><span className="mb-1 block text-xs text-sky">Tempo</span><input className="w-full rounded-lg border border-divider bg-navy-elev p-2 text-cream" value={ex.tempo ?? ""} onChange={e=>editExercise(bi,ei,"tempo",e.target.value)} /></label>
                  <label className="block"><span className="mb-1 block text-xs text-sky">Why this exercise</span><textarea className="w-full rounded-lg border border-divider bg-navy-elev p-2 text-cream" value={ex.rationale ?? ""} onChange={e=>editExercise(bi,ei,"rationale",e.target.value)} /></label>
                  <label className="block"><span className="mb-1 block text-xs text-sky">Progression notes</span><textarea className="w-full rounded-lg border border-divider bg-navy-elev p-2 text-cream" value={ex.progression_note ?? ""} onChange={e=>editExercise(bi,ei,"progression_note",e.target.value)} /></label>
                  {(ex.week_prescriptions ?? []).filter(p => p.week === week.week_number).map((p,i) =>
                    <p key={i}><strong className="text-cream">Prescription:</strong> {[p.sets && `${p.sets} sets`, p.reps && `${p.reps} reps`, p.weight && `${p.weight} ${p.weight_unit ?? ""}`, p.rpe && `RPE ${p.rpe}`, p.fallback_text].filter(Boolean).join(" · ")}</p>)}
                </div>
              </details>)}
            </div>
          </div>)}
        </div>
      </div>}
      <p className="text-xs text-cream-faint">Generated recommendations require coach review. This view shows the saved engine output; changes to prescriptions must be reflected in a regenerated PDF before publishing.</p>
    </section>
  );
}
