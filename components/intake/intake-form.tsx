"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, ArrowLeft, Loader2 } from "lucide-react";

interface IntakeFormProps {
  token: string;
  clientId: string;
  prefill: { full_name: string; email: string; phone: string };
}

const STEPS = [
  { key: "identity", title: "Identity", desc: "Who you are" },
  { key: "health", title: "Health History", desc: "PAR-Q & medical" },
  { key: "movement", title: "Movement", desc: "Pain, injuries, history" },
  { key: "goals", title: "Goals", desc: "Why you're here" },
  { key: "logistics", title: "Logistics", desc: "Schedule & lifestyle" },
] as const;

type StepKey = (typeof STEPS)[number]["key"];

export function IntakeForm({ token, clientId, prefill }: IntakeFormProps) {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  const [responses, setResponses] = useState({
    identity: {
      full_name: prefill.full_name,
      email: prefill.email,
      phone: prefill.phone,
      date_of_birth: "",
      address_line1: "",
      city: "",
      state: "CA",
      zip: "",
      emergency_contact_name: "",
      emergency_contact_phone: "",
      emergency_contact_relationship: "",
    },
    health: {
      heart_condition: false,
      chest_pain: false,
      dizziness: false,
      bone_or_joint_problem: false,
      blood_pressure_meds: false,
      other_meds_affecting_exercise: false,
      other_concerns: "",
      medications: "",
      allergies: "",
      physician_name: "",
      physician_phone: "",
    },
    movement: {
      past_surgeries: "",
      current_pain_areas: "",
      previous_pt: "",
      sports_history: "",
    },
    goals: {
      primary_goal: "",
      specific_outcomes: "",
      timeline_expectation: "",
      what_has_worked: "",
      what_hasnt_worked: "",
    },
    logistics: {
      preferred_days: "",
      preferred_times: "",
      other_activities: "",
      sleep_hours: "",
      stress_level: "",
      lead_source: "",
    },
  });

  function updateField(step: StepKey, field: string, value: string | boolean) {
    setResponses((prev) => ({
      ...prev,
      [step]: { ...prev[step], [field]: value },
    }));
  }

  function next() {
    if (currentStep < STEPS.length - 1) {
      setCurrentStep(currentStep + 1);
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }

  function back() {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }

  async function handleSubmit() {
    setSubmitting(true);
    const res = await fetch("/api/intake/submit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, clientId, responses }),
    });

    if (res.ok) {
      router.push(`/intake/${token}/waiver`);
    } else {
      setSubmitting(false);
      alert("Something went wrong. Please try again or call us.");
    }
  }

  const stepKey = STEPS[currentStep]?.key as StepKey;

  return (
    <div>
      {/* Progress */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-medium uppercase tracking-wider text-navy/60">
            Step {currentStep + 1} of {STEPS.length}
          </span>
          <span className="text-xs text-navy/60">
            {STEPS[currentStep]?.title}
          </span>
        </div>
        <div className="h-1 bg-paper-deep rounded-full overflow-hidden">
          <div
            className="h-full bg-sky transition-all"
            style={{
              width: `${((currentStep + 1) / STEPS.length) * 100}%`,
            }}
          />
        </div>
      </div>

      {/* Step content */}
      <div className="rounded-xl bg-white border border-line p-6">
        <h2 className="text-xl font-semibold text-navy mb-1">
          {STEPS[currentStep]?.title}
        </h2>
        <p className="text-sm text-navy/60 mb-5">
          {STEPS[currentStep]?.desc}
        </p>

        {stepKey === "identity" && (
          <IdentityStep
            data={responses.identity}
            onChange={(f, v) => updateField("identity", f, v)}
          />
        )}
        {stepKey === "health" && (
          <HealthStep
            data={responses.health}
            onChange={(f, v) => updateField("health", f, v)}
          />
        )}
        {stepKey === "movement" && (
          <MovementStep
            data={responses.movement}
            onChange={(f, v) => updateField("movement", f, v)}
          />
        )}
        {stepKey === "goals" && (
          <GoalsStep
            data={responses.goals}
            onChange={(f, v) => updateField("goals", f, v)}
          />
        )}
        {stepKey === "logistics" && (
          <LogisticsStep
            data={responses.logistics}
            onChange={(f, v) => updateField("logistics", f, v)}
          />
        )}
      </div>

      {/* Nav */}
      <div className="mt-6 flex items-center justify-between">
        <button
          type="button"
          onClick={back}
          disabled={currentStep === 0}
          className="flex items-center gap-1.5 text-sm text-navy/60 hover:text-navy disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </button>

        {currentStep < STEPS.length - 1 ? (
          <button
            type="button"
            onClick={next}
            className="flex items-center gap-1.5 rounded-md bg-navy text-white text-sm font-medium px-5 py-2.5"
          >
            Next
            <ArrowRight className="h-4 w-4" />
          </button>
        ) : (
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting}
            className="flex items-center gap-1.5 rounded-md bg-sky text-white text-sm font-medium px-5 py-2.5 disabled:opacity-50"
          >
            {submitting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <>
                Continue to waiver
                <ArrowRight className="h-4 w-4" />
              </>
            )}
          </button>
        )}
      </div>
    </div>
  );
}

/* ------------------------------ STEP COMPONENTS ----------------------------- */

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label className="block text-xs font-medium text-navy/70 mb-1.5">
      {children}
    </label>
  );
}

function TextField(props: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
  required?: boolean;
}) {
  return (
    <div>
      <FieldLabel>
        {props.label}
        {props.required && <span className="text-status-limited"> *</span>}
      </FieldLabel>
      <input
        type={props.type ?? "text"}
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
        placeholder={props.placeholder}
        required={props.required}
        className="w-full rounded-md border border-line bg-paper px-3 py-2 text-sm text-navy placeholder:text-navy/40 focus:outline-none focus:ring-2 focus:ring-sky"
      />
    </div>
  );
}

function TextArea(props: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  rows?: number;
}) {
  return (
    <div>
      <FieldLabel>{props.label}</FieldLabel>
      <textarea
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
        placeholder={props.placeholder}
        rows={props.rows ?? 3}
        className="w-full rounded-md border border-line bg-paper px-3 py-2 text-sm text-navy placeholder:text-navy/40 focus:outline-none focus:ring-2 focus:ring-sky"
      />
    </div>
  );
}

function YesNo(props: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-sm text-navy/80 flex-1">{props.label}</span>
      <div className="flex gap-2">
        {(["No", "Yes"] as const).map((opt) => {
          const isYes = opt === "Yes";
          const selected = props.value === isYes;
          return (
            <button
              key={opt}
              type="button"
              onClick={() => props.onChange(isYes)}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
                selected
                  ? isYes
                    ? "bg-status-limited text-white"
                    : "bg-status-optimal text-white"
                  : "bg-paper-deep text-navy/60 hover:bg-paper-deep/80"
              }`}
            >
              {opt}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function IdentityStep({ data, onChange }: any) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <TextField label="Full name" value={data.full_name} onChange={(v) => onChange("full_name", v)} required />
      <TextField label="Date of birth" type="date" value={data.date_of_birth} onChange={(v) => onChange("date_of_birth", v)} required />
      <TextField label="Email" type="email" value={data.email} onChange={(v) => onChange("email", v)} required />
      <TextField label="Phone" type="tel" value={data.phone} onChange={(v) => onChange("phone", v)} required />
      <TextField label="Address" value={data.address_line1} onChange={(v) => onChange("address_line1", v)} />
      <div className="grid grid-cols-3 gap-2">
        <TextField label="City" value={data.city} onChange={(v) => onChange("city", v)} />
        <TextField label="State" value={data.state} onChange={(v) => onChange("state", v)} />
        <TextField label="ZIP" value={data.zip} onChange={(v) => onChange("zip", v)} />
      </div>
      <div className="sm:col-span-2 mt-2 pt-4 border-t border-line">
        <h3 className="text-sm font-semibold text-navy mb-3">Emergency Contact</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <TextField label="Name" value={data.emergency_contact_name} onChange={(v) => onChange("emergency_contact_name", v)} required />
          <TextField label="Phone" type="tel" value={data.emergency_contact_phone} onChange={(v) => onChange("emergency_contact_phone", v)} required />
          <TextField label="Relationship" value={data.emergency_contact_relationship} onChange={(v) => onChange("emergency_contact_relationship", v)} placeholder="e.g. spouse, parent" />
        </div>
      </div>
    </div>
  );
}

function HealthStep({ data, onChange }: any) {
  return (
    <div className="space-y-4">
      <p className="text-xs text-navy/60 italic">
        Standard PAR-Q questions. Honest answers protect you and inform your program.
      </p>
      <div className="space-y-3">
        <YesNo label="Has a doctor ever said you have a heart condition and that you should only do physical activity recommended by a doctor?" value={data.heart_condition} onChange={(v) => onChange("heart_condition", v)} />
        <YesNo label="Do you feel pain in your chest when you do physical activity?" value={data.chest_pain} onChange={(v) => onChange("chest_pain", v)} />
        <YesNo label="Do you lose your balance from dizziness or do you ever lose consciousness?" value={data.dizziness} onChange={(v) => onChange("dizziness", v)} />
        <YesNo label="Do you have a bone or joint problem that could be made worse by a change in your physical activity?" value={data.bone_or_joint_problem} onChange={(v) => onChange("bone_or_joint_problem", v)} />
        <YesNo label="Is your doctor currently prescribing medications for blood pressure or a heart condition?" value={data.blood_pressure_meds} onChange={(v) => onChange("blood_pressure_meds", v)} />
        <YesNo label="Are you taking any other medications that could affect your ability to exercise?" value={data.other_meds_affecting_exercise} onChange={(v) => onChange("other_meds_affecting_exercise", v)} />
      </div>
      <div className="pt-4 border-t border-line space-y-4">
        <TextArea label="Other medical concerns" value={data.other_concerns} onChange={(v) => onChange("other_concerns", v)} placeholder="Anything not covered above" />
        <TextArea label="Current medications" value={data.medications} onChange={(v) => onChange("medications", v)} placeholder="List name & dosage" />
        <TextArea label="Allergies" value={data.allergies} onChange={(v) => onChange("allergies", v)} placeholder="Including topical products that may be relevant for massage" />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <TextField label="Primary physician" value={data.physician_name} onChange={(v) => onChange("physician_name", v)} />
          <TextField label="Physician phone" type="tel" value={data.physician_phone} onChange={(v) => onChange("physician_phone", v)} />
        </div>
      </div>
    </div>
  );
}

function MovementStep({ data, onChange }: any) {
  return (
    <div className="space-y-4">
      <TextArea label="Past surgeries (with approximate dates)" value={data.past_surgeries} onChange={(v) => onChange("past_surgeries", v)} placeholder="e.g. Left knee meniscus repair 2021, lumbar disc 2018" />
      <TextArea label="Where do you currently feel pain or restriction?" value={data.current_pain_areas} onChange={(v) => onChange("current_pain_areas", v)} placeholder="Be specific — &quot;right hip when squatting&quot;, &quot;low back stiffness in the morning&quot;" rows={4} />
      <TextArea label="Have you done physical therapy? When? For what?" value={data.previous_pt} onChange={(v) => onChange("previous_pt", v)} />
      <TextArea label="Sports / training history" value={data.sports_history} onChange={(v) => onChange("sports_history", v)} placeholder="Past and present" />
    </div>
  );
}

function GoalsStep({ data, onChange }: any) {
  return (
    <div className="space-y-4">
      <div>
        <FieldLabel>Primary goal</FieldLabel>
        <select
          value={data.primary_goal}
          onChange={(e) => onChange("primary_goal", e.target.value)}
          className="w-full rounded-md border border-line bg-paper px-3 py-2 text-sm text-navy focus:outline-none focus:ring-2 focus:ring-sky"
        >
          <option value="">Pick one...</option>
          <option value="pain_relief">Reduce pain / move without restriction</option>
          <option value="strength">Get stronger</option>
          <option value="mobility">Improve mobility / range of motion</option>
          <option value="body_comp">Body composition (muscle / fat)</option>
          <option value="performance">Athletic performance</option>
          <option value="general_fitness">General fitness & longevity</option>
        </select>
      </div>
      <TextArea label="What does success look like in 90 days?" value={data.specific_outcomes} onChange={(v) => onChange("specific_outcomes", v)} placeholder="Be specific. &quot;Walk without back pain&quot;, &quot;deadlift my bodyweight&quot;, &quot;keep up with my kids on weekends&quot;" rows={4} />
      <TextArea label="What's worked for you before?" value={data.what_has_worked} onChange={(v) => onChange("what_has_worked", v)} />
      <TextArea label="What hasn't worked?" value={data.what_hasnt_worked} onChange={(v) => onChange("what_hasnt_worked", v)} />
    </div>
  );
}

function LogisticsStep({ data, onChange }: any) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <TextField label="Preferred training days" value={data.preferred_days} onChange={(v) => onChange("preferred_days", v)} placeholder="e.g. Mon/Wed/Fri" />
        <TextField label="Preferred times" value={data.preferred_times} onChange={(v) => onChange("preferred_times", v)} placeholder="e.g. mornings before 9am" />
      </div>
      <TextArea label="Other physical activities you do" value={data.other_activities} onChange={(v) => onChange("other_activities", v)} placeholder="Hiking, tennis, yoga, etc." />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <TextField label="Average sleep (hours)" type="number" value={data.sleep_hours} onChange={(v) => onChange("sleep_hours", v)} placeholder="e.g. 7" />
        <div>
          <FieldLabel>Stress level (1-10)</FieldLabel>
          <select
            value={data.stress_level}
            onChange={(e) => onChange("stress_level", e.target.value)}
            className="w-full rounded-md border border-line bg-paper px-3 py-2 text-sm text-navy focus:outline-none focus:ring-2 focus:ring-sky"
          >
            <option value="">Pick one...</option>
            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </div>
      </div>
      <div>
        <FieldLabel>How did you hear about IMS?</FieldLabel>
        <select
          value={data.lead_source}
          onChange={(e) => onChange("lead_source", e.target.value)}
          className="w-full rounded-md border border-line bg-paper px-3 py-2 text-sm text-navy focus:outline-none focus:ring-2 focus:ring-sky"
        >
          <option value="">Pick one...</option>
          <option value="google">Google search</option>
          <option value="referral">Friend / family referral</option>
          <option value="instagram">Instagram</option>
          <option value="walk_in">Walked by the studio</option>
          <option value="nextdoor">Nextdoor</option>
          <option value="other">Other</option>
        </select>
      </div>
    </div>
  );
}
