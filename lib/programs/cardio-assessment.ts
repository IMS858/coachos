/**
 * IMS assessment -> generator cardio contract. Only a coach's explicit
 * interval clearance may unlock pickups or intervals. Blank is NOT clearance.
 */
import { CARDIO_MACHINES } from "@/components/assessments/assessment-data";

const allowed = new Set<string>(CARDIO_MACHINES);
export type CardioAssessment = {
  primary_machine?: unknown;
  tolerated_machines?: unknown;
  avoid_machines?: unknown;
  interval_clearance?: unknown;
};
export type ConditioningAssessment = {
  conditioning_level?: unknown;
  hrr_end_hr?: unknown;
  hrr_one_min_hr?: unknown;
};

function machine(value: unknown): string | null {
  return typeof value === "string" && allowed.has(value) ? value : null;
}
function machines(value: unknown): string[] {
  return Array.isArray(value)
    ? [...new Set(value.map(machine).filter((m): m is string => m !== null))]
    : [];
}
function hr(value: unknown): number | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const text = String(value).trim();
  if (!/^\d{2,3}$/.test(text)) return null;
  const number = Number(text);
  return Number.isInteger(number) && number >= 30 && number <= 250 ? number : null;
}

export function generatorCardioProfile(
  cardio: CardioAssessment | null | undefined,
  conditioning: ConditioningAssessment | null | undefined
) {
  const ct = cardio ?? {};
  const cd = conditioning ?? {};
  const avoid = machines(ct.avoid_machines);
  const primary = machine(ct.primary_machine);
  // An avoid/caution checkbox always takes precedence, even if the trainer
  // also accidentally selected that machine as primary or tolerated.
  const secondaries = machines(ct.tolerated_machines).filter(m => !avoid.includes(m));
  const limitations: string[] = [
    ct.interval_clearance === "cleared"
      ? "cleared_for_intervals"
      : "not_cleared_for_intervals",
  ];
  if (cd.conditioning_level === "deconditioned") limitations.push("deconditioned");
  const end = hr(cd.hrr_end_hr);
  const minute = hr(cd.hrr_one_min_hr);
  const hrr = end !== null && minute !== null && minute <= end
    ? { end_hr: end, one_min_hr: minute }
    : {};
  return {
    primary_modality: primary,
    secondary_modalities: secondaries,
    avoid_modalities: avoid,
    limitations,
    interval_clearance: ct.interval_clearance === "cleared" ? "cleared" : "not_cleared",
    hr_recovery: hrr,
  };
}

const ACTIVE = new Set(["active_flare_up", "post_surgery", "avoid_loading"]);
const STATUSES = new Set([...ACTIVE, "history", "cleared"]);
const JOINTS: Record<string, string> = {
  low_back: "lumbar", lower_back: "lumbar", lumbar: "lumbar",
  si_joint: "lumbar", neck_cervical: "cervical", t_spine: "thoracic",
  hip: "hip", knee: "knee", shoulder: "shoulder", wrist: "wrist",
  ankle: "ankle", elbow: "elbow", neck: "cervical",
};

export function generatorRichRestrictions(painMap: unknown) {
  if (!painMap || typeof painMap !== "object" || Array.isArray(painMap)) return [];
  return Object.entries(painMap as Record<string, unknown>)
    .filter(([, value]) => !!value && typeof value === "object" && !Array.isArray(value))
    .map(([rawKey, raw]) => {
      const row = raw as Record<string, unknown>;
      const status = typeof row.status === "string" ? row.status : "";
      if (!STATUSES.has(status)) return null;
      const key = rawKey.trim().toLowerCase().replace(/[\s-]+/g, "_");
      const side = key.startsWith("left_") ? "L" : key.startsWith("right_") ? "R" : "bilateral";
      const base = key.replace(/^(left|right)_/, "");
      // Unknown active keys must hold, rather than silently missing the
      // corresponding exercise load profile on the generator side.
      const canonical = JOINTS[base] ?? (ACTIVE.has(status) ? "unknown" : base);
      const level = Number(row.severity);
      return {
        key: canonical,
        display_name: rawKey.replace(/_/g, " "),
        side,
        status,
        pain_level: Number.isFinite(level) && level >= 0 && level <= 10 ? level : null,
        avoid_notes: typeof row.description === "string" ? row.description : null,
      };
    })
    .filter((row): row is NonNullable<typeof row> => row !== null);
}


/** A surgery field alone never establishes that loading has been cleared. */
export function includeUnverifiedSurgicalHistory(
  rows: ReturnType<typeof generatorRichRestrictions>,
  surgeryHistory: unknown
) {
  const history = typeof surgeryHistory === "string" ? surgeryHistory.trim() : "";
  if (!history) return rows;
  const lower = history.toLowerCase();
  const mentions: Array<[RegExp, string]> = [
    [/\b(knee|acl|meniscus)\b/, "knee"],
    [/\b(shoulder|rotator cuff|labrum)\b/, "shoulder"],
    [/\b(hip|hip replacement)\b/, "hip"],
    [/\b(back|spine|lumbar|disc)\b/, "lumbar"],
    [/\b(ankle|achilles)\b/, "ankle"],
    [/\b(wrist|hand)\b/, "wrist"],
  ];
  const joints = mentions.filter(([pattern]) => pattern.test(lower)).map(([, joint]) => joint);
  // A non-joint surgery also requires a coach to decide whether activity is
  // cleared; do not attempt a diagnosis from unstructured free text.
  if (!joints.length) joints.push("unknown");
  const result = [...rows];
  for (const joint of [...new Set(joints)]) {
    if (rows.some(row => row.key === joint && ["cleared", "active_flare_up", "post_surgery", "avoid_loading"].includes(row.status))) continue;
    result.push({
      key: joint, display_name: "Surgical history — clearance not documented",
      side: "bilateral", status: "avoid_loading", pain_level: null,
      avoid_notes: "Coach must verify current restrictions and clearance before generation",
    });
  }
  return result;
}

/** Weekly training frequency is total sessions, not strength days PLUS extras. */
export function recommendedTrainingDays(total: number) {
  const days = Number.isInteger(total) && total >= 1 && total <= 5 ? total : 3;
  const cardio_days = days >= 4 ? 1 : 0;
  return { strength_days: days - cardio_days, cardio_days, training_frequency: days };
}
