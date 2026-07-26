"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, CheckCircle2, Circle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { InteractiveGoniometer } from "@/components/assessments/interactive-goniometer";
import {
  type Rating,
  type Level,
  type Severity,
  type ConstraintStatus,
  type AssessmentData,
  JOINTS,
  PATTERNS,
  PAIN_AREAS,
  POSTURE_OPTIONS,
  NORMAL_ROM,
  STRENGTH_MARKERS,
  CARDIO_MACHINES,
  CARDIO_MACHINE_LABELS,
  ACCESSORY_CATEGORIES,
  emptyAssessment,
} from "@/components/assessments/assessment-data";

export type { AssessmentData };
export { emptyAssessment };

const STEPS = [
  "Goals",
  "Health",
  "Pain map",
  "Lifestyle",
  "Posture",
  "Movement",
  "Strength",
  "Conditioning",
  "Body comp",
  "Summary",
];

const SECTION_KEYS = [
  "goals",
  "health",
  "pain_map",
  "lifestyle",
  "posture",
  "movement_screen",
  "strength_baseline",
  "conditioning",
  "body_comp",
  "summary",
];

const inputCls = "bg-navy-deep border border-divider rounded-lg px-3 py-2 text-sm text-cream w-full focus:outline-none focus:border-sky";
const selectCls = inputCls + " appearance-none";
const labelCls = "block text-xs font-medium text-cream-dim mb-1";
const sectionTitle = "text-base font-semibold text-cream mb-3";

export function AssessmentWizard({
  assessmentId,
  clientId,
  clientName,
  clients,
  initialData,
  initialSectionStatus,
  initialStep = 0,
}: {
  assessmentId?: string;
  clientId?: string;
  clientName?: string;
  clients?: { id: string; full_name: string }[];
  initialData?: AssessmentData;
  initialSectionStatus?: Record<string, string>;
  initialStep?: number;
}) {
  const router = useRouter();
  const [id, setId] = useState<string | undefined>(assessmentId);
  const [selectedClient, setSelectedClient] = useState<string>(clientId ?? "");
  const [step, setStep] = useState(
    Math.min(Math.max(initialStep, 0), STEPS.length - 1)
  );
  const [data, setData] = useState<AssessmentData>(
    initialData ?? emptyAssessment()
  );
  const [sections, setSections] = useState<Record<string, string>>(
    initialSectionStatus ?? {}
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function upd(fn: (d: AssessmentData) => void) {
    setData((prev) => {
      const copy: AssessmentData = JSON.parse(JSON.stringify(prev));
      fn(copy);
      return copy;
    });
  }

  async function save(finish = false) {
    setSaving(true);
    setError(null);
    const sectionKey = SECTION_KEYS[step];
    const body: Record<string, unknown> = { data, section_status: { ...sections, [sectionKey]: "complete" } };
    if (finish) body.status = "complete";
    if (!id && selectedClient) body.client_id = selectedClient;

    const url = id ? `/api/assessments/${id}` : "/api/assessments";
    const res = await fetch(url, {
      method: id ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok) { setError(json.error || "Save failed."); return false; }
    if (!id && json.id) setId(json.id);
    setSections((p) => ({ ...p, [sectionKey]: "complete" }));
    return true;
  }

  async function next() {
    const ok = await save(false);
    if (ok && step < STEPS.length - 1) setStep(step + 1);
  }

  async function finish() {
    const ok = await save(true);
    if (ok) {
      if (id) router.push(`/assessments/${id}`);
      else router.push("/assessments");
      router.refresh();
    }
  }

  const g = data.goals;
  const h = data.health;
  const ls = data.lifestyle;
  const ps = data.posture;
  const cd = data.conditioning;
  const bc = data.body_comp;
  const sm = data.summary;

  return (
    <div className="flex flex-col gap-5">
      {/* Step progress */}
      <div className="flex flex-wrap gap-1.5 mb-2">
        {STEPS.map((label, i) => {
          const done = sections[SECTION_KEYS[i]] === "complete" && i !== step;
          const active = i === step;
          return (
            <button
              key={label}
              onClick={() => (id ? setStep(i) : undefined)}
              className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-xs transition-colors ${
                active ? "bg-sky text-white" : done ? "bg-status-optimal/20 text-status-optimal" : "bg-navy-soft text-cream-faint border border-divider"
              }`}
            >
              {done ? <CheckCircle2 className="h-3 w-3" /> : <Circle className="h-3 w-3" />}
              {label}
            </button>
          );
        })}
      </div>

      {/* Client picker (new assessment only) */}
      {!assessmentId && step === 0 && clients && (
        <div className="mb-3">
          <label className={labelCls}>Client</label>
          <select className={selectCls} value={selectedClient} onChange={(e) => setSelectedClient(e.target.value)}>
            <option value="">Select a client…</option>
            {clients.map((c) => <option key={c.id} value={c.id}>{c.full_name}</option>)}
          </select>
        </div>
      )}
      {clientName && <div className="text-xs text-cream-faint mb-1">Assessing: <span className="text-cream">{clientName}</span></div>}

      {error && <div className="rounded-md border border-status-limited/30 bg-status-limited/10 px-3 py-2 text-sm text-status-limited">{error}</div>}

      {/* === STEP 0: Goals === */}
      {step === 0 && (
        <div className="flex flex-col gap-3">
          <h3 className={sectionTitle}>Goals & Training History</h3>
          <div><label className={labelCls}>Primary goal</label><Input value={g.primary} onChange={(e) => upd((d) => (d.goals.primary = e.target.value))} placeholder="e.g. Get stronger, move without pain" /></div>
          <div><label className={labelCls}>Secondary goals</label><Input value={g.secondary} onChange={(e) => upd((d) => (d.goals.secondary = e.target.value))} placeholder="e.g. Lose body fat, improve posture" /></div>
          <div><label className={labelCls}>Training history (past experience)</label><textarea className={inputCls} rows={2} value={g.training_history} onChange={(e) => upd((d) => (d.goals.training_history = e.target.value))} placeholder="What have they done before? How long? How consistently?" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className={labelCls}>Current frequency</label><Input value={g.training_frequency_current} onChange={(e) => upd((d) => (d.goals.training_frequency_current = e.target.value))} placeholder="e.g. 2x/week, nothing" /></div>
            <div><label className={labelCls}>Current type</label><Input value={g.training_type_current} onChange={(e) => upd((d) => (d.goals.training_type_current = e.target.value))} placeholder="e.g. Peloton, gym, walking" /></div>
          </div>
          <div><label className={labelCls}>Target sessions/week</label><Input type="number" value={g.target_sessions_per_week} onChange={(e) => upd((d) => (d.goals.target_sessions_per_week = Number(e.target.value)))} /></div>
          <div><label className={labelCls}>What's worked for them before</label><Input value={g.what_worked} onChange={(e) => upd((d) => (d.goals.what_worked = e.target.value))} placeholder="Exercises, programs, modalities" /></div>
          <div><label className={labelCls}>What hasn't worked / what they dislike</label><Input value={g.what_didnt} onChange={(e) => upd((d) => (d.goals.what_didnt = e.target.value))} placeholder="Exercises that hurt, things they've failed at" /></div>
        </div>
      )}

      {/* === STEP 1: Health === */}
      {step === 1 && (
        <div className="flex flex-col gap-3">
          <h3 className={sectionTitle}>Health History</h3>
          <div><label className={labelCls}>Current injuries</label><textarea className={inputCls} rows={2} value={h.injuries_current} onChange={(e) => upd((d) => (d.health.injuries_current = e.target.value))} placeholder="Active injuries, where + severity" /></div>
          <div><label className={labelCls}>Past injuries</label><textarea className={inputCls} rows={2} value={h.injuries_past} onChange={(e) => upd((d) => (d.health.injuries_past = e.target.value))} /></div>
          <div><label className={labelCls}>Surgeries</label><textarea className={inputCls} rows={2} value={h.surgeries} onChange={(e) => upd((d) => (d.health.surgeries = e.target.value))} placeholder="Type, date, body area" /></div>
          <div><label className={labelCls}>Medical conditions</label><Input value={h.conditions} onChange={(e) => upd((d) => (d.health.conditions = e.target.value))} placeholder="e.g. Hypertension, diabetes, arthritis" /></div>
          <div><label className={labelCls}>Medications</label><Input value={h.medications} onChange={(e) => upd((d) => (d.health.medications = e.target.value))} placeholder="Anything that affects training" /></div>
          <div><label className={labelCls}>Coach notes</label><textarea className={inputCls} rows={2} value={h.notes} onChange={(e) => upd((d) => (d.health.notes = e.target.value))} /></div>
        </div>
      )}

      {/* === STEP 2: Pain Map === */}
      {step === 2 && (
        <div className="flex flex-col gap-3">
          <h3 className={sectionTitle}>Pain Map</h3>
          <p className="text-xs text-cream-faint">Rate current pain 0-10 for each area. Leave blank if no pain.</p>
          {PAIN_AREAS.map(([key, label]) => (
            <div key={key} className="grid grid-cols-[1fr_80px_110px] gap-2 items-start">
              <div>
                <label className={labelCls}>{label}</label>
                <Input value={data.pain_map[key]?.description ?? ""} onChange={(e) => upd((d) => (d.pain_map[key] = { ...d.pain_map[key], description: e.target.value }))} placeholder="Description (e.g. sharp on overhead)" />
              </div>
              <div>
                <label className={labelCls}>0-10</label>
                <select className={selectCls} value={data.pain_map[key]?.severity ?? ""} onChange={(e) => upd((d) => (d.pain_map[key] = { ...d.pain_map[key], severity: e.target.value as Severity }))}>
                  <option value="">—</option>
                  {[0,1,2,3,4,5,6,7,8,9,10].map((n) => <option key={n} value={String(n)}>{n}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls}>Status</label>
                <select className={selectCls} value={data.pain_map[key]?.status ?? ""} onChange={(e) => upd((d) => (d.pain_map[key] = { ...d.pain_map[key], status: e.target.value as ConstraintStatus }))}>
                  <option value="">—</option>
                  <option value="active_flare_up">Active flare-up</option>
                  <option value="history">History</option>
                  <option value="cleared">Cleared</option>
                  <option value="post_surgery">Post-surgery</option>
                  <option value="avoid_loading">Avoid loading</option>
                </select>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* === STEP 3: Lifestyle === */}
      {step === 3 && (
        <div className="flex flex-col gap-3">
          <h3 className={sectionTitle}>Lifestyle & Recovery Capacity</h3>
          <div><label className={labelCls}>Occupation</label><Input value={ls.occupation} onChange={(e) => upd((d) => (d.lifestyle.occupation = e.target.value))} placeholder="e.g. Software engineer, teacher, stay-at-home" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className={labelCls}>Hours at desk/day</label><Input value={ls.desk_hours} onChange={(e) => upd((d) => (d.lifestyle.desk_hours = e.target.value))} placeholder="e.g. 8-10" /></div>
            <div><label className={labelCls}>Sleep hours/night</label><Input value={ls.sleep_hours} onChange={(e) => upd((d) => (d.lifestyle.sleep_hours = e.target.value))} placeholder="e.g. 6-7" /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Sleep quality</label>
              <select className={selectCls} value={ls.sleep_quality} onChange={(e) => upd((d) => (d.lifestyle.sleep_quality = e.target.value))}>
                <option value="">—</option><option value="good">Good</option><option value="fair">Fair</option><option value="poor">Poor</option>
              </select>
            </div>
            <div>
              <label className={labelCls}>Stress level</label>
              <select className={selectCls} value={ls.stress_level} onChange={(e) => upd((d) => (d.lifestyle.stress_level = e.target.value))}>
                <option value="">—</option><option value="low">Low</option><option value="moderate">Moderate</option><option value="high">High</option><option value="very high">Very high</option>
              </select>
            </div>
          </div>
          <div><label className={labelCls}>Activity outside training</label><Input value={ls.activity_outside_training} onChange={(e) => upd((d) => (d.lifestyle.activity_outside_training = e.target.value))} placeholder="e.g. Walks 30 min daily, plays tennis weekends" /></div>
          <div><label className={labelCls}>Nutrition notes</label><Input value={ls.nutrition_notes} onChange={(e) => upd((d) => (d.lifestyle.nutrition_notes = e.target.value))} placeholder="Eating habits, diet type, anything relevant" /></div>
        </div>
      )}

      {/* === STEP 4: Posture === */}
      {step === 4 && (
        <div className="flex flex-col gap-3">
          <h3 className={sectionTitle}>Posture Analysis</h3>
          {(Object.entries(POSTURE_OPTIONS) as [keyof typeof POSTURE_OPTIONS, readonly string[]][]).map(([key, options]) => (
            <div key={key}>
              <label className={labelCls}>{key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}</label>
              <select className={selectCls} value={(ps as any)[key] ?? ""} onChange={(e) => upd((d) => ((d.posture as any)[key] = e.target.value))}>
                <option value="">—</option>
                {options.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
          ))}
          <div><label className={labelCls}>Posture notes</label><textarea className={inputCls} rows={2} value={ps.notes} onChange={(e) => upd((d) => (d.posture.notes = e.target.value))} placeholder="Asymmetries, compensations, observations" /></div>
        </div>
      )}

      {/* === STEP 5: Movement Screen === */}
      {step === 5 && (
        <div className="flex flex-col gap-3">
          <h3 className={sectionTitle}>Movement Screen (CARs + joint quality)</h3>
          {JOINTS.map(([key, label]) => (
            <div key={key} className="rounded-lg border border-divider/50 p-3">
              <div className="flex items-baseline justify-between mb-2">
                <span className="text-sm text-cream font-medium">{label}</span>
                {NORMAL_ROM[key] && (
                  <span className="text-[11px] text-cream-faint">{NORMAL_ROM[key].motion}</span>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2 mb-2">
                <div>
                  <label className={labelCls}>Rating</label>
                  <select className={selectCls} value={data.movement_screen[key]?.rating ?? ""} onChange={(e) => upd((d) => (d.movement_screen[key] = { ...d.movement_screen[key], rating: e.target.value as Rating }))}>
                    <option value="">—</option><option value="good">Good</option><option value="limited">Limited</option><option value="painful">Painful</option>
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Note</label>
                  <Input value={data.movement_screen[key]?.note ?? ""} onChange={(e) => upd((d) => (d.movement_screen[key] = { ...d.movement_screen[key], note: e.target.value }))} placeholder="Observation" />
                </div>
              </div>
              {NORMAL_ROM[key] ? (
                <div className="pt-1">
                  <label className={labelCls}>Range of motion — drag to measure</label>
                  <InteractiveGoniometer
                    label={label}
                    value={data.movement_screen[key]?.rom_degrees ?? ""}
                    normalRange={NORMAL_ROM[key].range}
                    onChange={(deg) => upd((d) => (d.movement_screen[key] = { ...d.movement_screen[key], rom_degrees: deg }))}
                  />
                </div>
              ) : (
                <div>
                  <label className={labelCls}>Observation detail</label>
                  <Input value={data.movement_screen[key]?.rom_degrees ?? ""} onChange={(e) => upd((d) => (d.movement_screen[key] = { ...d.movement_screen[key], rom_degrees: e.target.value }))} placeholder="e.g. heels rise, butt wink at parallel" />
                </div>
              )}
            </div>
          ))}

          <div className="mt-4 pt-4 border-t border-divider">
            <h4 className="text-sm font-medium text-cream mb-2">FRA Priorities — rank your top 3-5</h4>
            <p className="text-xs text-cream-faint mb-3">
              Format: "Joint Direction Side" (e.g. Hip IR L+R, Shoulder ER Right, Thoracic Extension)
            </p>
            {[0, 1, 2, 3, 4].map((i) => (
              <Input
                key={i}
                className="mb-2"
                value={data.fra_priorities[i] ?? ""}
                onChange={(e) => upd((d) => {
                  while (d.fra_priorities.length <= i) d.fra_priorities.push("");
                  d.fra_priorities[i] = e.target.value;
                })}
                placeholder={`Priority ${i + 1}${i >= 3 ? " (optional)" : ""}`}
              />
            ))}
          </div>
        </div>
      )}

      {/* === STEP 6: Strength Baseline === */}
      {step === 6 && (
        <div className="flex flex-col gap-3">
          <h3 className={sectionTitle}>Strength Baseline</h3>
          {PATTERNS.map(([key, label]) => (
            <div key={key} className="rounded-lg border border-divider/50 p-3">
              <div className="text-sm text-cream font-medium mb-2">{label}</div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className={labelCls}>Level</label>
                  <select className={selectCls} value={data.strength_baseline[key]?.level ?? ""} onChange={(e) => upd((d) => (d.strength_baseline[key] = { ...d.strength_baseline[key], level: e.target.value as Level }))}>
                    <option value="">—</option><option value="foundational">Foundational</option><option value="intermediate">Intermediate</option><option value="advanced">Advanced</option>
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Current load</label>
                  <Input value={data.strength_baseline[key]?.load ?? ""} onChange={(e) => upd((d) => (d.strength_baseline[key] = { ...d.strength_baseline[key], load: e.target.value }))} placeholder="e.g. 135lb, BW" />
                </div>
                <div>
                  <label className={labelCls}>Note</label>
                  <Input value={data.strength_baseline[key]?.note ?? ""} onChange={(e) => upd((d) => (d.strength_baseline[key] = { ...d.strength_baseline[key], note: e.target.value }))} placeholder="Compensation, cue" />
                </div>
              </div>
            </div>
          ))}

          <div className="mt-4 pt-4 border-t border-divider">
            <h4 className="text-sm font-medium text-cream mb-2">Strength Testing (if tested today)</h4>
            <p className="text-xs text-cream-faint mb-3">
              Enter results for any markers you tested. Leave blank if not tested.
            </p>
            <div className="flex flex-col gap-2">
              {STRENGTH_MARKERS.map((m) => (
                <div key={m.id} className="grid grid-cols-[1fr_120px] gap-2 items-center">
                  <div>
                    <span className="text-sm text-cream">{m.name}</span>
                    <span className="text-xs text-cream-faint ml-2">{m.format}</span>
                  </div>
                  <Input
                    value={data.strength_markers[m.id] ?? ""}
                    onChange={(e) => upd((d) => (d.strength_markers[m.id] = e.target.value))}
                    placeholder="Result"
                  />
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* === STEP 7: Conditioning === */}
      {step === 7 && (
        <div className="flex flex-col gap-3">
          <h3 className={sectionTitle}>Conditioning & Cardiovascular</h3>
          <div><label className={labelCls}>Resting heart rate</label><Input value={cd.resting_hr} onChange={(e) => upd((d) => (d.conditioning.resting_hr = e.target.value))} placeholder="e.g. 72 bpm" /></div>
          <div>
            <label className={labelCls}>Conditioning level</label>
            <select className={selectCls} value={cd.conditioning_level} onChange={(e) => upd((d) => (d.conditioning.conditioning_level = e.target.value))}>
              <option value="">—</option><option value="deconditioned">Deconditioned</option><option value="below average">Below average</option><option value="average">Average</option><option value="above average">Above average</option><option value="well-conditioned">Well conditioned</option>
            </select>
          </div>
          <div><label className={labelCls}>Preferred cardio modality</label><Input value={cd.preferred_modality} onChange={(e) => upd((d) => (d.conditioning.preferred_modality = e.target.value))} placeholder="e.g. Bike, walking, rowing, none" /></div>
          <div><label className={labelCls}>Conditioning limitations</label><Input value={cd.limitations} onChange={(e) => upd((d) => (d.conditioning.limitations = e.target.value))} placeholder="e.g. Can't run (knee), no high-impact" /></div>

          <div className="mt-3 pt-3 border-t border-divider">
            <h4 className="text-sm font-medium text-cream mb-2">Machine Tolerance</h4>
            <div className="mb-2">
              <label className={labelCls}>Primary tolerated machine</label>
              <select className={selectCls} value={data.cardio_tolerance.primary_machine} onChange={(e) => upd((d) => (d.cardio_tolerance.primary_machine = e.target.value))}>
                <option value="">—</option>
                {CARDIO_MACHINES.map((m) => <option key={m} value={m}>{CARDIO_MACHINE_LABELS[m]}</option>)}
              </select>
            </div>
            <div className="mb-2">
              <label className={labelCls}>Also tolerated (check all)</label>
              <div className="flex flex-wrap gap-2">
                {CARDIO_MACHINES.map((m) => (
                  <label key={m} className="flex items-center gap-1.5 text-xs text-cream-dim">
                    <input type="checkbox" checked={data.cardio_tolerance.tolerated_machines.includes(m)} onChange={(e) => upd((d) => {
                      if (e.target.checked) d.cardio_tolerance.tolerated_machines.push(m);
                      else d.cardio_tolerance.tolerated_machines = d.cardio_tolerance.tolerated_machines.filter((x: string) => x !== m);
                    })} />
                    {CARDIO_MACHINE_LABELS[m]}
                  </label>
                ))}
              </div>
            </div>
            <div className="mb-2">
              <label className={labelCls}>Avoid / caution (check all)</label>
              <div className="flex flex-wrap gap-2">
                {CARDIO_MACHINES.map((m) => (
                  <label key={m} className="flex items-center gap-1.5 text-xs text-cream-dim">
                    <input type="checkbox" checked={data.cardio_tolerance.avoid_machines.includes(m)} onChange={(e) => upd((d) => {
                      if (e.target.checked) d.cardio_tolerance.avoid_machines.push(m);
                      else d.cardio_tolerance.avoid_machines = d.cardio_tolerance.avoid_machines.filter((x: string) => x !== m);
                    })} />
                    {CARDIO_MACHINE_LABELS[m]}
                  </label>
                ))}
              </div>
            </div>
            <div>
              <label className={labelCls}>Interval clearance</label>
              <select className={selectCls} value={data.cardio_tolerance.interval_clearance} onChange={(e) => upd((d) => (d.cardio_tolerance.interval_clearance = e.target.value))}>
                <option value="">Not assessed</option>
                <option value="cleared">Cleared for intervals</option>
                <option value="not_cleared">Not cleared for intervals</option>
              </select>
            </div>
          </div>
        </div>
      )}

      {/* === STEP 8: Body Comp === */}
      {step === 8 && (
        <div className="flex flex-col gap-3">
          <h3 className={sectionTitle}>Body Composition</h3>
          <div className="grid grid-cols-2 gap-3">
            <div><label className={labelCls}>Weight (lbs)</label><Input value={bc.weight_lbs} onChange={(e) => upd((d) => (d.body_comp.weight_lbs = e.target.value))} placeholder="e.g. 185" /></div>
            <div><label className={labelCls}>Body fat %</label><Input value={bc.body_fat_pct} onChange={(e) => upd((d) => (d.body_comp.body_fat_pct = e.target.value))} placeholder="e.g. 22" /></div>
            <div><label className={labelCls}>Lean mass (lbs)</label><Input value={bc.lean_mass_lbs} onChange={(e) => upd((d) => (d.body_comp.lean_mass_lbs = e.target.value))} placeholder="If tested" /></div>
            <div><label className={labelCls}>Waist (inches)</label><Input value={bc.waist_inches} onChange={(e) => upd((d) => (d.body_comp.waist_inches = e.target.value))} placeholder="At navel" /></div>
          </div>
          <div><label className={labelCls}>Notes</label><textarea className={inputCls} rows={2} value={bc.notes} onChange={(e) => upd((d) => (d.body_comp.notes = e.target.value))} placeholder="Goals related to body comp, history" /></div>
        </div>
      )}

      {/* === STEP 9: Summary === */}
      {step === 9 && (
        <div className="flex flex-col gap-3">
          <h3 className={sectionTitle}>Coach Summary & Recommendations</h3>
          <div><label className={labelCls}>Overall recommendation</label><textarea className={inputCls} rows={3} value={sm.recommendation} onChange={(e) => upd((d) => (d.summary.recommendation = e.target.value))} placeholder="Your take: what this client needs, the approach, the timeline" /></div>
          <div><label className={labelCls}>Recommended sessions/week</label><Input type="number" value={sm.recommended_sessions_per_week} onChange={(e) => upd((d) => (d.summary.recommended_sessions_per_week = Number(e.target.value)))} /></div>
          <div><label className={labelCls}>Primary focus areas</label><textarea className={inputCls} rows={2} value={sm.focus_areas} onChange={(e) => upd((d) => (d.summary.focus_areas = e.target.value))} placeholder="e.g. Hip mobility, shoulder end-range, hinge patterning" /></div>
          <div><label className={labelCls}>Primary limitations to address</label><textarea className={inputCls} rows={2} value={sm.primary_limitations} onChange={(e) => upd((d) => (d.summary.primary_limitations = e.target.value))} placeholder="What's holding them back most" /></div>
          <div><label className={labelCls}>Red flags / contraindications</label><textarea className={inputCls} rows={2} value={sm.red_flags} onChange={(e) => upd((d) => (d.summary.red_flags = e.target.value))} placeholder="Things to absolutely avoid, movements that are off-limits" /></div>

          <div className="mt-3 pt-3 border-t border-divider">
            <h4 className="text-sm font-medium text-cream mb-2">Accessory Preferences (Strength C block)</h4>
            <p className="text-xs text-cream-faint mb-2">What extra work does this client want/need? Leave blank for day-type defaults.</p>
            <div className="flex flex-wrap gap-2">
              {ACCESSORY_CATEGORIES.map((cat) => (
                <label key={cat.id} className="flex items-center gap-1.5 text-xs text-cream-dim bg-navy-deep border border-divider rounded-lg px-3 py-2">
                  <input type="checkbox" checked={data.accessory_categories.includes(cat.id)} onChange={(e) => upd((d) => {
                    if (e.target.checked) d.accessory_categories.push(cat.id);
                    else d.accessory_categories = d.accessory_categories.filter((x: string) => x !== cat.id);
                  })} />
                  {cat.label}
                </label>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Navigation */}
      <div className="flex items-center justify-between pt-2 border-t border-divider">
        <Button variant="secondary" size="sm" onClick={() => setStep(Math.max(0, step - 1))} disabled={step === 0 || saving}>
          ← Back
        </Button>
        <div className="text-xs text-cream-faint">{step + 1} / {STEPS.length}</div>
        {step < STEPS.length - 1 ? (
          <Button size="sm" onClick={next} disabled={saving || (!id && !selectedClient)}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save & next →"}
          </Button>
        ) : (
          <Button size="sm" onClick={finish} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Complete assessment"}
          </Button>
        )}
      </div>
    </div>
  );
}
