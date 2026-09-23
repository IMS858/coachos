"use client";

import { useState } from "react";
import { AlertTriangle, ChevronDown, ChevronUp } from "lucide-react";

type Exercise = {
  name?: string; library_id?: string | null; dose?: string;
  tempo?: string | null; rationale?: string | null;
  progression_note?: string | null;
  week_prescriptions?: Array<{week?: number; sets?: number; reps?: string | number; weight?: number | string; weight_unit?: string; rpe?: number | string; fallback_text?: string; intent_label?: string}>;
};
type Block = {name?: string; duration_note?: string; exercises?: Exercise[]};
type Session = {day_number?: number; day_type?: string; focus?: string; blocks?: Block[]};
type Week = {week_number?: number; intent?: string; sessions?: Session[]; progression_notes?: string[]};
type StructuredProgram = {weeks?: Week[]; generator_version?: string; protocol_version?: string};

export function FourWeekProgramPreview({ program }: { program: StructuredProgram }) {
  const weeks = Array.isArray(program?.weeks) ? program.weeks : [];
  const [weekIndex, setWeekIndex] = useState(0);
  const [expanded, setExpanded] = useState<number[]>([0]);
  const complete = weeks.length === 4 && weeks.every(w =>
    Array.isArray(w.sessions) && w.sessions.length > 0 &&
    w.sessions.every(s => Array.isArray(s.blocks) && s.blocks.length > 0 &&
      s.blocks.every(b => Array.isArray(b.exercises) && b.exercises.length > 0 &&
        b.exercises.every(e => typeof e.name === "string" && e.name.trim().length > 0))));
  const week = weeks[weekIndex];
  return <section aria-label="Four-week coach program preview" className="overflow-hidden rounded-2xl border border-divider bg-navy-soft">
    <header className="space-y-3 border-b border-divider p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><p className="text-xs font-semibold uppercase tracking-widest text-sky">IMS / Coach preview</p><h2 className="mt-1 text-xl font-semibold text-cream">Four-week prescription</h2></div>
        <span className={`rounded-lg px-3 py-2 text-xs font-semibold ${complete ? "bg-sky/10 text-sky" : "bg-status-limited/10 text-status-limited"}`}>{complete ? "Four weeks present · safety review still required" : "Incomplete plan · do not publish"}</span>
      </div>
      <p className="text-sm text-cream-dim">Inspect each session and week-specific dose against the generated PDF. This preview does not establish medical clearance or exercise approval.</p>
      <nav aria-label="Select program week" className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {weeks.map((w,i) => <button type="button" key={i} onClick={() => {setWeekIndex(i);setExpanded([0]);}} aria-current={weekIndex===i?"step":undefined} className={`rounded-xl border p-3 text-left ${weekIndex===i?"border-sky bg-sky/10 text-cream":"border-divider text-cream-dim hover:bg-navy-elev"}`}><span className="block text-xs uppercase tracking-widest">Week {w.week_number ?? i+1}</span><span className="mt-1 block text-sm font-medium">{w.intent || "Review prescription"}</span></button>)}
      </nav>
    </header>
    {!complete && <p role="alert" className="flex items-start gap-2 border-b border-divider bg-status-limited/10 p-4 text-sm text-status-limited"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0"/>The structured program has missing weeks, sessions, blocks or exercise names. Hold publication and regenerate.</p>}
    {week ? <div className="space-y-4 p-5">
      {Array.isArray(week.progression_notes) && week.progression_notes.length>0 && <div className="rounded-xl border border-divider bg-navy p-4"><h3 className="text-xs font-semibold uppercase tracking-widest text-sky">Week progression</h3><ul className="mt-2 space-y-1 text-sm text-cream-dim">{week.progression_notes.map((note,i)=><li key={i}>{note}</li>)}</ul></div>}
      {(week.sessions ?? []).map((session,i) => <article key={i} className="overflow-hidden rounded-xl border border-divider">
        <button type="button" aria-expanded={expanded.includes(i)} onClick={()=>setExpanded(old=>old.includes(i)?old.filter(x=>x!==i):[...old,i])} className="flex min-h-16 w-full items-center justify-between gap-4 bg-navy p-4 text-left">
          <span><span className="block text-xs uppercase tracking-widest text-sky">Session {session.day_number ?? i+1} · {(session.day_type ?? "training").replaceAll("_"," ")}</span><span className="mt-1 block text-sm font-semibold text-cream">{session.focus || "Session review"}</span></span>
          {expanded.includes(i)?<ChevronUp className="h-4 w-4 shrink-0 text-cream-dim"/>:<ChevronDown className="h-4 w-4 shrink-0 text-cream-dim"/>}
        </button>
        {expanded.includes(i)&&<div className="space-y-5 p-4">{(session.blocks??[]).map((block,bi)=><div key={bi}>
          <div className="mb-2 flex items-center justify-between"><h4 className="text-xs font-semibold uppercase tracking-widest text-sky">{block.name||"Training block"}</h4><span className="text-xs text-cream-faint">{block.duration_note}</span></div>
          <div className="divide-y divide-divider">{(block.exercises??[]).map((ex,ei)=>{
            const specific=ex.week_prescriptions?.find(p=>p.week===week.week_number || p.week===weekIndex+1);
            return <div key={ei} className="grid gap-2 py-3 sm:grid-cols-[minmax(0,1fr)_minmax(150px,auto)]">
              <div><p className="text-sm font-semibold text-cream">{ex.name||"Unnamed exercise"}</p>{ex.rationale&&<p className="mt-1 text-xs text-cream-dim">{ex.rationale}</p>}{ex.progression_note&&<p className="mt-1 text-xs text-cream-faint">{ex.progression_note}</p>}</div>
              <div className="text-sm text-cream-dim sm:text-right"><p className="font-medium text-cream">{specific ? [specific.sets&&`${specific.sets} sets`,specific.reps&&`${specific.reps} reps`,specific.weight&&`${specific.weight} ${specific.weight_unit??""}`].filter(Boolean).join(" · ") || specific.fallback_text || ex.dose || "Dose not provided" : ex.dose||"Dose not provided"}</p>{specific?.rpe&&<p className="text-xs">RPE {specific.rpe}</p>}{ex.tempo&&<p className="text-xs">Tempo: {ex.tempo}</p>}</div>
            </div>;
          })}</div>
        </div>)}</div>}
      </article>)}
    </div>:<p className="p-5 text-sm text-cream-dim">No structured weeks were returned by the generator.</p>}
  </section>;
}
