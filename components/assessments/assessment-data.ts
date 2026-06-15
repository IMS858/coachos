/**
 * Shared assessment shape + helpers.
 * NO "use client" — both server pages and client components import from here.
 * This is the input contract for the program generator; keep it stable.
 */

export type Rating = "good" | "limited" | "painful" | "";
export type Level = "foundational" | "intermediate" | "advanced" | "";

export type AssessmentData = {
  goals: {
    primary: string;
    secondary: string;
    training_history: string;
    target_sessions_per_week: number;
  };
  health: {
    injuries_current: string;
    injuries_past: string;
    conditions: string;
    pain_areas: string;
    notes: string;
  };
  movement_screen: Record<string, { rating: Rating; note: string }>;
  strength_baseline: Record<string, { level: Level; note: string }>;
  summary: {
    recommendation: string;
    recommended_sessions_per_week: number;
    focus_areas: string;
  };
};

export const JOINTS = [
  ["neck", "Neck"],
  ["shoulders", "Shoulders"],
  ["t_spine", "T-Spine"],
  ["hips", "Hips"],
  ["knees", "Knees"],
  ["ankles", "Ankles"],
  ["squat_pattern", "Squat pattern"],
  ["hinge_pattern", "Hinge pattern"],
] as const;

export const PATTERNS = [
  ["squat", "Squat"],
  ["hinge", "Hinge"],
  ["push", "Push"],
  ["pull", "Pull"],
  ["carry", "Carry"],
  ["core", "Core / brace"],
] as const;

export function emptyAssessment(): AssessmentData {
  return {
    goals: {
      primary: "",
      secondary: "",
      training_history: "",
      target_sessions_per_week: 3,
    },
    health: {
      injuries_current: "",
      injuries_past: "",
      conditions: "",
      pain_areas: "",
      notes: "",
    },
    movement_screen: Object.fromEntries(
      JOINTS.map(([k]) => [k, { rating: "" as Rating, note: "" }])
    ),
    strength_baseline: Object.fromEntries(
      PATTERNS.map(([k]) => [k, { level: "" as Level, note: "" }])
    ),
    summary: {
      recommendation: "",
      recommended_sessions_per_week: 3,
      focus_areas: "",
    },
  };
}
