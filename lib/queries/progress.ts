/**
 * Progress scoring — turns raw assessment + session + body-comp data into
 * trackable metrics that demonstrate IMS value over time.
 *
 * Designed around re-assessment: compare the earliest vs. latest assessment to
 * show measurable change in movement quality, pain, and strength capacity.
 *
 * Updated for the expanded 10-section assessment with 10 joints, 10 strength
 * patterns, pain map severity, and posture analysis.
 */

// Expanded joint list (matches assessment-data.ts JOINTS)
const JOINTS = [
  "neck", "shoulders", "t_spine", "wrists", "hips",
  "knees", "ankles", "squat_pattern", "hinge_pattern", "lunge_pattern",
];

// Expanded pattern list (matches assessment-data.ts PATTERNS)
const PATTERNS = [
  "squat", "hinge", "push_horizontal", "push_vertical",
  "pull_horizontal", "pull_vertical", "carry",
  "core_anti_extension", "core_anti_rotation", "core_anti_lateral",
];

const LEVEL_VALUE: Record<string, number> = {
  foundational: 1,
  intermediate: 2,
  advanced: 3,
};

export interface AssessmentLike {
  id: string;
  assessment_date: string;
  data: any;
}
export interface BodyComp {
  recorded_at: string;
  weight_lb: number | null;
  body_fat_pct: number | null;
  lean_mass_lb: number | null;
}

export interface MetricPoint {
  date: string;
  value: number;
}
export interface ProgressMetric {
  key: string;
  label: string;
  unit: string;
  description: string;
  current: number | null;
  baseline: number | null;
  delta: number | null;
  direction: "up_good" | "down_good";
  series: MetricPoint[];
}

/** % of joints rated "good" (movement quality). Dynamic — handles old 8-joint + new 10-joint data. */
function movementQuality(data: any): number | null {
  const ms = data?.movement_screen;
  if (!ms) return null;
  let rated = 0;
  let good = 0;
  // Check all known joints, skip any not present in this assessment
  for (const j of JOINTS) {
    const r = ms[j]?.rating;
    if (r === "good" || r === "limited" || r === "painful") {
      rated++;
      if (r === "good") good++;
    }
  }
  // Also check any extra joints in the data not in our list (backwards compat)
  for (const j of Object.keys(ms)) {
    if (!JOINTS.includes(j)) {
      const r = ms[j]?.rating;
      if (r === "good" || r === "limited" || r === "painful") {
        rated++;
        if (r === "good") good++;
      }
    }
  }
  if (rated === 0) return null;
  return Math.round((good / rated) * 100);
}

/** Count of joints NOT painful. Dynamic denominator. */
function painFreeJoints(data: any): number | null {
  const ms = data?.movement_screen;
  if (!ms) return null;
  let rated = 0;
  let painFree = 0;
  const allJoints = new Set([...JOINTS, ...Object.keys(ms)]);
  for (const j of allJoints) {
    const r = ms[j]?.rating;
    if (r === "good" || r === "limited" || r === "painful") {
      rated++;
      if (r !== "painful") painFree++;
    }
  }
  return rated === 0 ? null : painFree;
}

/** Dynamic denominator for pain-free display (e.g. "/10" or "/8"). */
function painFreeDenominator(data: any): number {
  const ms = data?.movement_screen;
  if (!ms) return 10;
  const allJoints = new Set([...JOINTS, ...Object.keys(ms)]);
  let rated = 0;
  for (const j of allJoints) {
    const r = ms[j]?.rating;
    if (r === "good" || r === "limited" || r === "painful") rated++;
  }
  return rated || 10;
}

/** Average strength level across all patterns, scaled 0-100. Dynamic. */
function strengthCapacity(data: any): number | null {
  const sb = data?.strength_baseline;
  if (!sb) return null;
  let sum = 0;
  let n = 0;
  const allPatterns = new Set([...PATTERNS, ...Object.keys(sb)]);
  for (const p of allPatterns) {
    const lvl = sb[p]?.level;
    if (lvl && LEVEL_VALUE[lvl]) {
      sum += LEVEL_VALUE[lvl];
      n++;
    }
  }
  if (n === 0) return null;
  return Math.round(((sum / n - 1) / 2) * 100);
}

/** Total pain score from pain_map (sum of all severities). Lower = better. */
function totalPainScore(data: any): number | null {
  const pm = data?.pain_map;
  if (!pm) return null;
  let total = 0;
  let hasAny = false;
  for (const area of Object.values(pm) as any[]) {
    const sev = Number(area?.severity || 0);
    if (sev > 0) hasAny = true;
    total += sev;
  }
  return hasAny ? total : null;
}

/** Posture score — count of findings that are "neutral" (out of total assessed). Higher = better. */
function postureScore(data: any): number | null {
  const ps = data?.posture;
  if (!ps) return null;
  const fields = ["head_position", "shoulder_position", "thoracic_curve", "lumbar_curve", "pelvic_tilt", "knee_position", "foot_arch"];
  let assessed = 0;
  let neutral = 0;
  for (const f of fields) {
    const val = ps[f];
    if (val && val !== "") {
      assessed++;
      if (val === "neutral") neutral++;
    }
  }
  if (assessed === 0) return null;
  return Math.round((neutral / assessed) * 100);
}

export interface ProgressReport {
  metrics: ProgressMetric[];
  assessmentCount: number;
  sessionsCompleted: number;
  firstAssessmentDate: string | null;
  latestAssessmentDate: string | null;
}

export function buildProgressReport(
  assessments: AssessmentLike[],
  bodyComp: BodyComp[],
  sessionsCompleted: number
): ProgressReport {
  const a = [...assessments].sort((x, y) =>
    x.assessment_date.localeCompare(y.assessment_date)
  );
  const bc = [...bodyComp].sort((x, y) =>
    x.recorded_at.localeCompare(y.recorded_at)
  );

  function metricSeries(fn: (d: any) => number | null): MetricPoint[] {
    return a
      .map((row) => ({ date: row.assessment_date, value: fn(row.data) }))
      .filter((p) => p.value !== null) as MetricPoint[];
  }

  function buildMetric(
    key: string,
    label: string,
    unit: string,
    description: string,
    fn: (d: any) => number | null,
    direction: "up_good" | "down_good" = "up_good"
  ): ProgressMetric {
    const series = metricSeries(fn);
    const baseline = series.length > 0 ? series[0].value : null;
    const current = series.length > 0 ? series[series.length - 1].value : null;
    const delta =
      baseline !== null && current !== null ? current - baseline : null;
    return { key, label, unit, description, current, baseline, delta, direction, series };
  }

  // Dynamic denominator for pain-free joints
  const latestData = a.length > 0 ? a[a.length - 1].data : null;
  const pfDenom = painFreeDenominator(latestData);

  const metrics: ProgressMetric[] = [
    buildMetric(
      "movement_quality",
      "Movement Quality",
      "%",
      "Share of your joints moving well. The clearest sign your body is working better.",
      movementQuality
    ),
    buildMetric(
      "pain_free",
      "Pain-Free Joints",
      `/${pfDenom}`,
      "How many joints are free of pain. Proof the joint-health work is paying off.",
      painFreeJoints
    ),
    buildMetric(
      "strength",
      "Strength Capacity",
      "%",
      "Your strength across the core movement patterns, built safely.",
      strengthCapacity
    ),
  ];

  // Total pain score (from pain map — only if assessed)
  const painSeries = metricSeries(totalPainScore);
  if (painSeries.length > 0) {
    metrics.push(
      buildMetric(
        "pain_score",
        "Pain Score",
        "pts",
        "Total pain across all areas. Lower is better — shows recovery progress.",
        totalPainScore,
        "down_good"
      )
    );
  }

  // Posture score (only if posture was assessed)
  const postureSeries = metricSeries(postureScore);
  if (postureSeries.length > 0) {
    metrics.push(
      buildMetric(
        "posture",
        "Posture Score",
        "%",
        "Share of posture checkpoints at neutral. Tracks structural improvements.",
        postureScore
      )
    );
  }

  // Body composition (from Bod Pod etc.)
  const bfSeries = bc
    .filter((r) => r.body_fat_pct != null)
    .map((r) => ({ date: r.recorded_at, value: Number(r.body_fat_pct) }));
  const lmSeries = bc
    .filter((r) => r.lean_mass_lb != null)
    .map((r) => ({ date: r.recorded_at, value: Number(r.lean_mass_lb) }));

  if (lmSeries.length > 0) {
    metrics.push({
      key: "lean_mass",
      label: "Lean Muscle Mass",
      unit: "lb",
      description: "Muscle you've built. Strength, metabolism, and longevity.",
      baseline: lmSeries[0].value,
      current: lmSeries[lmSeries.length - 1].value,
      delta: lmSeries[lmSeries.length - 1].value - lmSeries[0].value,
      direction: "up_good",
      series: lmSeries,
    });
  }
  if (bfSeries.length > 0) {
    metrics.push({
      key: "body_fat",
      label: "Body Fat",
      unit: "%",
      description: "Body fat percentage trending down as composition improves.",
      baseline: bfSeries[0].value,
      current: bfSeries[bfSeries.length - 1].value,
      delta: bfSeries[bfSeries.length - 1].value - bfSeries[0].value,
      direction: "down_good",
      series: bfSeries,
    });
  }

  return {
    metrics,
    assessmentCount: a.length,
    sessionsCompleted,
    firstAssessmentDate: a.length > 0 ? a[0].assessment_date : null,
    latestAssessmentDate: a.length > 0 ? a[a.length - 1].assessment_date : null,
  };
}
