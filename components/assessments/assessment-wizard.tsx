"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar } from "@/components/ui/avatar";
import {
  type Rating,
  type Level,
  type AssessmentData,
  JOINTS,
  PATTERNS,
  emptyAssessment,
} from "@/components/assessments/assessment-data";

export type { AssessmentData };
export { emptyAssessment };

const STEPS = [
  "Goals",
  "Health history",
  "Movement screen",
  "Strength baseline",
  "Summary",
] as const;

const SECTION_KEYS = [
  "goals",
  "health",
  "movement_screen",
  "strength_baseline",
  "summary",
] as const;

/* ------------------------------------------------------------------------- */

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
  /** Only provided in "new" mode — picker options */
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

  const pickedName =
    clientName ??
    clients?.find((c) => c.id === selectedClient)?.full_name ??
    "";

  function patch<K extends keyof AssessmentData>(
    key: K,
    value: Partial<AssessmentData[K]>
  ) {
    setData((d) => ({ ...d, [key]: { ...d[key], ...value } }));
  }

  async function persist(extra: Record<string, unknown> = {}) {
    setError(null);
    const sectionKey = SECTION_KEYS[step];
    const nextSections = { ...sections, [sectionKey]: "complete" };

    if (!id) {
      if (!selectedClient) {
        setError("Pick a client first.");
        return false;
      }
      setSaving(true);
      const res = await fetch("/api/assessments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_id: selectedClient,
          data,
          section_status: nextSections,
        }),
      });
      setSaving(false);
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        setError(e.detail ?? e.error ?? "Could not save.");
        return false;
      }
      const { id: newId } = await res.json();
      setId(newId);
      setSections(nextSections);
      // Move the URL to the persistent record so refresh resumes correctly
      window.history.replaceState(null, "", `/assessments/${newId}`);
      return true;
    }

    setSaving(true);
    const res = await fetch(`/api/assessments/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        data,
        section_status: nextSections,
        status: "in_progress",
        ...extra,
      }),
    });
    setSaving(false);
    if (!res.ok) {
      const e = await res.json().catch(() => ({}));
      setError(e.detail ?? e.error ?? "Could not save.");
      return false;
    }
    setSections(nextSections);
    return true;
  }

  async function next() {
    const ok = await persist();
    if (ok && step < STEPS.length - 1) setStep(step + 1);
  }

  async function finish() {
    const ok = await persist({ status: "complete" });
    if (ok) {
      router.push("/assessments");
      router.refresh();
    }
  }

  /* ----- UI helpers ----- */

  const labelCls = "block text-sm text-cream-dim mb-1.5";
  const areaCls =
    "w-full resize-none rounded-lg border border-divider bg-navy px-3.5 py-2.5 text-sm text-cream placeholder:text-cream-faint focus:outline-none focus:border-sky-400/60";

  function RatingPills({
    value,
    onChange,
  }: {
    value: Rating;
    onChange: (r: Rating) => void;
  }) {
    const opts: { v: Rating; label: string; cls: string }[] = [
      { v: "good", label: "Good", cls: "border-status-optimal/50 text-status-optimal" },
      { v: "limited", label: "Limited", cls: "border-status-moderate/50 text-status-moderate" },
      { v: "painful", label: "Painful", cls: "border-status-limited/50 text-status-limited" },
    ];
    return (
      <div className="flex gap-1.5">
        {opts.map((o) => (
          <button
            key={o.v}
            type="button"
            onClick={() => onChange(value === o.v ? "" : o.v)}
            className={`rounded-full border px-3 py-1 text-xs transition-colors ${
              value === o.v
                ? `${o.cls} bg-navy-elev`
                : "border-divider text-cream-faint hover:text-cream"
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
    );
  }

  function LevelPills({
    value,
    onChange,
  }: {
    value: Level;
    onChange: (l: Level) => void;
  }) {
    const opts: Level[] = ["foundational", "intermediate", "advanced"];
    return (
      <div className="flex gap-1.5">
        {opts.map((o) => (
          <button
            key={o}
            type="button"
            onClick={() => onChange(value === o ? "" : o)}
            className={`rounded-full border px-3 py-1 text-xs capitalize transition-colors ${
              value === o
                ? "border-sky-400/60 text-sky-light bg-navy-elev"
                : "border-divider text-cream-faint hover:text-cream"
            }`}
          >
            {o}
          </button>
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Client snapshot header */}
      <div className="flex items-center gap-3 rounded-xl border border-divider bg-navy-soft px-5 py-4">
        {pickedName ? (
          <>
            <Avatar name={pickedName} />
            <div>
              <div className="font-medium text-cream">{pickedName}</div>
              <div className="text-xs text-cream-faint">
                Assessment ·{" "}
                {new Intl.DateTimeFormat("en-US", {
                  timeZone: "America/Los_Angeles",
                  month: "long",
                  day: "numeric",
                  year: "numeric",
                }).format(new Date())}
              </div>
            </div>
          </>
        ) : (
          <div className="text-sm text-cream-faint">
            Select a client below to begin.
          </div>
        )}
      </div>

      {/* Stepper */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        {STEPS.map((label, i) => {
          const done = sections[SECTION_KEYS[i]] === "complete" && i !== step;
          const active = i === step;
          return (
            <button
              key={label}
              type="button"
              onClick={() => id && setStep(i)}
              className={`flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-xs whitespace-nowrap transition-colors ${
                active
                  ? "border-sky-400/60 bg-sky-500/15 text-sky-light"
                  : done
                    ? "border-status-optimal/40 text-status-optimal"
                    : "border-divider text-cream-faint"
              } ${id ? "cursor-pointer" : "cursor-default"}`}
            >
              <span className="flex h-4 w-4 items-center justify-center rounded-full border border-current text-[9px]">
                {done ? <Check className="h-2.5 w-2.5" /> : i + 1}
              </span>
              {label}
            </button>
          );
        })}
      </div>

      {/* Step body */}
      <div className="rounded-xl border border-divider bg-navy-soft p-6 space-y-5">
        {step === 0 && (
          <>
            {!assessmentId && !clientId && (
              <div>
                <label className={labelCls}>
                  Client <span className="text-status-limited">*</span>
                </label>
                <select
                  value={selectedClient}
                  onChange={(e) => setSelectedClient(e.target.value)}
                  disabled={!!id}
                  className="w-full rounded-lg border border-divider bg-navy px-3.5 py-2.5 text-sm text-cream focus:outline-none focus:border-sky-400/60 disabled:opacity-60"
                >
                  <option value="">Choose a client…</option>
                  {(clients ?? []).map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.full_name}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div>
              <label className={labelCls}>Primary goal</label>
              <Input
                value={data.goals.primary}
                onChange={(e) => patch("goals", { primary: e.target.value })}
                placeholder="e.g. Move without knee pain, get stronger for golf"
              />
            </div>
            <div>
              <label className={labelCls}>Secondary goals</label>
              <Input
                value={data.goals.secondary}
                onChange={(e) => patch("goals", { secondary: e.target.value })}
                placeholder="e.g. Drop 10 lbs, keep up with grandkids"
              />
            </div>
            <div>
              <label className={labelCls}>Training history</label>
              <textarea
                rows={3}
                className={areaCls}
                value={data.goals.training_history}
                onChange={(e) =>
                  patch("goals", { training_history: e.target.value })
                }
                placeholder="Past training experience, sports background, what's worked / what hasn't"
              />
            </div>
            <div className="max-w-[200px]">
              <label className={labelCls}>Target sessions / week</label>
              <Input
                type="number"
                min={1}
                max={7}
                value={data.goals.target_sessions_per_week}
                onChange={(e) =>
                  patch("goals", {
                    target_sessions_per_week: Number(e.target.value) || 0,
                  })
                }
              />
            </div>
          </>
        )}

        {step === 1 && (
          <>
            <div>
              <label className={labelCls}>Current injuries / issues</label>
              <textarea
                rows={2}
                className={areaCls}
                value={data.health.injuries_current}
                onChange={(e) =>
                  patch("health", { injuries_current: e.target.value })
                }
              />
            </div>
            <div>
              <label className={labelCls}>Past injuries / surgeries</label>
              <textarea
                rows={2}
                className={areaCls}
                value={data.health.injuries_past}
                onChange={(e) =>
                  patch("health", { injuries_past: e.target.value })
                }
              />
            </div>
            <div>
              <label className={labelCls}>Medical conditions</label>
              <textarea
                rows={2}
                className={areaCls}
                value={data.health.conditions}
                onChange={(e) => patch("health", { conditions: e.target.value })}
              />
            </div>
            <div>
              <label className={labelCls}>Pain areas today</label>
              <Input
                value={data.health.pain_areas}
                onChange={(e) => patch("health", { pain_areas: e.target.value })}
                placeholder="e.g. R shoulder front rack, low back on hinge"
              />
            </div>
            <div>
              <label className={labelCls}>Other notes</label>
              <textarea
                rows={2}
                className={areaCls}
                value={data.health.notes}
                onChange={(e) => patch("health", { notes: e.target.value })}
              />
            </div>
          </>
        )}

        {step === 2 && (
          <div className="space-y-4">
            {JOINTS.map(([key, label]) => (
              <div
                key={key}
                className="grid gap-2 sm:grid-cols-[140px_auto_1fr] sm:items-center"
              >
                <div className="text-sm text-cream">{label}</div>
                <RatingPills
                  value={data.movement_screen[key]?.rating ?? ""}
                  onChange={(rating) =>
                    patch("movement_screen", {
                      [key]: { ...data.movement_screen[key], rating },
                    })
                  }
                />
                <Input
                  value={data.movement_screen[key]?.note ?? ""}
                  onChange={(e) =>
                    patch("movement_screen", {
                      [key]: {
                        ...data.movement_screen[key],
                        note: e.target.value,
                      },
                    })
                  }
                  placeholder="Notes"
                />
              </div>
            ))}
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4">
            {PATTERNS.map(([key, label]) => (
              <div
                key={key}
                className="grid gap-2 sm:grid-cols-[140px_auto_1fr] sm:items-center"
              >
                <div className="text-sm text-cream">{label}</div>
                <LevelPills
                  value={data.strength_baseline[key]?.level ?? ""}
                  onChange={(level) =>
                    patch("strength_baseline", {
                      [key]: { ...data.strength_baseline[key], level },
                    })
                  }
                />
                <Input
                  value={data.strength_baseline[key]?.note ?? ""}
                  onChange={(e) =>
                    patch("strength_baseline", {
                      [key]: {
                        ...data.strength_baseline[key],
                        note: e.target.value,
                      },
                    })
                  }
                  placeholder="Load / variation notes"
                />
              </div>
            ))}
          </div>
        )}

        {step === 4 && (
          <>
            <div>
              <label className={labelCls}>Coach recommendation</label>
              <textarea
                rows={4}
                className={areaCls}
                value={data.summary.recommendation}
                onChange={(e) =>
                  patch("summary", { recommendation: e.target.value })
                }
                placeholder="What you'd tell this client across the table — plan, priorities, expectations"
              />
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>Recommended sessions / week</label>
                <Input
                  type="number"
                  min={1}
                  max={7}
                  value={data.summary.recommended_sessions_per_week}
                  onChange={(e) =>
                    patch("summary", {
                      recommended_sessions_per_week:
                        Number(e.target.value) || 0,
                    })
                  }
                />
              </div>
              <div>
                <label className={labelCls}>Focus areas</label>
                <Input
                  value={data.summary.focus_areas}
                  onChange={(e) =>
                    patch("summary", { focus_areas: e.target.value })
                  }
                  placeholder="e.g. hip mobility, posterior chain, scap control"
                />
              </div>
            </div>
          </>
        )}

        {error && <p className="text-sm text-status-limited">{error}</p>}
      </div>

      {/* Sticky action bar */}
      <div className="flex items-center justify-between">
        <Button
          variant="secondary"
          onClick={() => setStep(Math.max(0, step - 1))}
          disabled={step === 0 || saving}
        >
          <ChevronLeft className="h-4 w-4" />
          Back
        </Button>
        <div className="flex items-center gap-3">
          {saving && (
            <span className="text-xs text-cream-faint flex items-center gap-1.5">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Saving…
            </span>
          )}
          {step < STEPS.length - 1 ? (
            <Button onClick={next} disabled={saving || (!id && !selectedClient)}>
              Save & continue
              <ChevronRight className="h-4 w-4" />
            </Button>
          ) : (
            <Button onClick={finish} disabled={saving}>
              <Check className="h-4 w-4" />
              Mark complete
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
