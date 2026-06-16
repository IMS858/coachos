/**
 * Progress scoring — turns raw assessment + session + body-comp data into the
 * Top 5 metrics that demonstrate IMS value over time.
 *
 * Designed around re-assessment: compare the earliest vs. latest assessment to
 * show measurable change in movement quality, pain, and strength capacity.
 */

const JOINTS = [
  "neck", "shoulders", "t_spine", "hips", "knees", "ankles",
  "squat_pattern", "hinge_pattern",
];
const PATTERNS = ["squat", "hinge", "push", "pull", "carry", "core"];

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

/** % of joints rated "good" (movement quality). */
function movementQuality(data: any): number | null {
  const ms = data?.movement_screen;
  if (!ms) return null;
  let rated = 0;
  let good = 0;
  for (const j of JOINTS) {
    const r = ms[j]?.rating;
    if (r === "good" || r === "limited" || r === "painful") {
      rated++;
      if (r === "good") good++;
    }
  }
  if (rated === 0) return null;
  return Math.round((good / rated) * 100);
}

/** Count of joints NOT painful (pain-free joints). */
function painFreeJoints(data: any): number | null {
  const ms = data?.movement_screen;
  if (!ms) return null;
  let rated = 0;
  let painFree = 0;
  for (const j of JOINTS) {
    const r = ms[j]?.rating;
    if (r === "good" || r === "limited" || r === "painful") {
      rated++;
      if (r !== "painful") painFree++;
    }
  }
  return rated === 0 ? null : painFree;
}

/** Average strength level across the 6 patterns, scaled 0-100. */
function strengthCapacity(data: any): number | null {
  const sb = data?.strength_baseline;
  if (!sb) return null;
  let sum = 0;
  let n = 0;
  for (const p of PATTERNS) {
    const lvl = sb[p]?.level;
    if (lvl && LEVEL_VALUE[lvl]) {
      sum += LEVEL_VALUE[lvl];
      n++;
    }
  }
  if (n === 0) return null;
  // 1..3 → 0..100
  return Math.round(((sum / n - 1) / 2) * 100);
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
  // Sort oldest → newest
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
      "/8",
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
