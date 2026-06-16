/**
 * Shared assessment shape + helpers.
 * NO "use client" — both server pages and client components import from here.
 * This is the input contract for the program generator; keep it stable.
 */

export type Rating = "good" | "limited" | "painful" | "";
export type Level = "foundational" | "intermediate" | "advanced" | "";
export type Severity = "" | "0" | "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "10";

export type ConstraintStatus = "" | "active_flare_up" | "history" | "cleared" | "post_surgery" | "avoid_loading";

export const CARDIO_MACHINES = [
  "upright_bike", "stationary_bike", "arc_trainer", "treadmill", "assault_bike", "rower", "skierg",
] as const;

export const CARDIO_MACHINE_LABELS: Record<string, string> = {
  upright_bike: "Upright Bike", stationary_bike: "Stationary Bike", arc_trainer: "Arc Trainer",
  treadmill: "Treadmill", assault_bike: "Assault Bike", rower: "Rower", skierg: "SkiErg",
};

export const STRENGTH_MARKERS = [
  { id: "goblet_squat", name: "Goblet Squat", format: "8 reps at max load" },
  { id: "back_squat", name: "Back Squat", format: "5 reps at max load" },
  { id: "sl_rdl", name: "Single-Leg RDL", format: "8 reps at max load/side" },
  { id: "conventional_deadlift", name: "Conventional Deadlift", format: "3-5 reps at max load" },
  { id: "trap_bar_deadlift", name: "Trap Bar Deadlift", format: "3-5 reps at max load" },
  { id: "incline_pushups", name: "Incline Pushups", format: "max reps in 30 seconds" },
  { id: "landmine_sa_press", name: "Landmine SA Press", format: "6 reps at max load/side" },
  { id: "inverted_rows", name: "Inverted Rows", format: "max reps in 30 seconds" },
  { id: "lat_pulldown", name: "Lat Pulldown", format: "3 reps at max load" },
  { id: "pullups", name: "Pull-Ups", format: "max strict reps" },
  { id: "dead_hang", name: "Dead Hang", format: "max hang time in seconds" },
  { id: "farmer_carry", name: "Farmer Carry", format: "max distance at BW/hand" },
  { id: "suitcase_carry", name: "Suitcase Carry", format: "max distance/side" },
  { id: "side_plank_hold", name: "Side Plank Hold", format: "max hold/side in seconds" },
  { id: "wall_sit", name: "Wall Sit", format: "max hold at 90° in seconds" },
] as const;

export const ACCESSORY_CATEGORIES = [
  { id: "arms", label: "Arms (biceps + triceps)" },
  { id: "calves_tibialis", label: "Calves + Tibialis" },
  { id: "glutes_extra", label: "Glutes (extra)" },
  { id: "grip_forearms", label: "Grip + Forearms" },
  { id: "neck_traps", label: "Neck + Traps" },
  { id: "shoulders_delts", label: "Shoulders (delts / rear delt)" },
  { id: "loaded_carries", label: "Loaded Carries" },
  { id: "conditioning_accessories", label: "Conditioning (sled, KB, ropes)" },
] as const;

export type AssessmentData = {
  goals: {
    primary: string;
    secondary: string;
    training_history: string;
    training_frequency_current: string;
    training_type_current: string;
    target_sessions_per_week: number;
    what_worked: string;
    what_didnt: string;
  };
  health: {
    injuries_current: string;
    injuries_past: string;
    surgeries: string;
    conditions: string;
    medications: string;
    pain_areas: string;
    notes: string;
  };
  pain_map: Record<string, { severity: Severity; description: string; status: ConstraintStatus }>;
  lifestyle: {
    occupation: string;
    desk_hours: string;
    sleep_quality: string;
    sleep_hours: string;
    stress_level: string;
    activity_outside_training: string;
    nutrition_notes: string;
  };
  posture: {
    head_position: string;
    shoulder_position: string;
    thoracic_curve: string;
    lumbar_curve: string;
    pelvic_tilt: string;
    knee_position: string;
    foot_arch: string;
    notes: string;
  };
  movement_screen: Record<string, { rating: Rating; rom_degrees: string; note: string }>;
  strength_baseline: Record<string, { level: Level; load: string; note: string }>;
  conditioning: {
    resting_hr: string;
    conditioning_level: string;
    preferred_modality: string;
    limitations: string;
  };
  body_comp: {
    weight_lbs: string;
    body_fat_pct: string;
    lean_mass_lbs: string;
    waist_inches: string;
    notes: string;
  };
  fra_priorities: string[];
  strength_markers: Record<string, string>;
  cardio_tolerance: {
    primary_machine: string;
    tolerated_machines: string[];
    avoid_machines: string[];
    interval_clearance: string;
  };
  accessory_categories: string[];
  summary: {
    recommendation: string;
    recommended_sessions_per_week: number;
    focus_areas: string;
    primary_limitations: string;
    red_flags: string;
  };
};

export const JOINTS = [
  ["neck", "Neck / Cervical"],
  ["shoulders", "Shoulders"],
  ["t_spine", "T-Spine / Thoracic"],
  ["wrists", "Wrists"],
  ["hips", "Hips"],
  ["knees", "Knees"],
  ["ankles", "Ankles"],
  ["squat_pattern", "Squat pattern"],
  ["hinge_pattern", "Hinge pattern"],
  ["lunge_pattern", "Lunge / split stance"],
] as const;

export const PATTERNS = [
  ["squat", "Squat"],
  ["hinge", "Hinge / Deadlift"],
  ["push_horizontal", "Horizontal Push"],
  ["push_vertical", "Vertical Push"],
  ["pull_horizontal", "Horizontal Pull"],
  ["pull_vertical", "Vertical Pull"],
  ["carry", "Loaded Carry"],
  ["core_anti_extension", "Core — anti-extension"],
  ["core_anti_rotation", "Core — anti-rotation"],
  ["core_anti_lateral", "Core — anti-lateral flexion"],
] as const;

export const PAIN_AREAS = [
  ["low_back", "Low Back"],
  ["upper_back", "Upper Back / Thoracic"],
  ["neck_cervical", "Neck"],
  ["left_shoulder", "Left Shoulder"],
  ["right_shoulder", "Right Shoulder"],
  ["left_hip", "Left Hip"],
  ["right_hip", "Right Hip"],
  ["left_knee", "Left Knee"],
  ["right_knee", "Right Knee"],
  ["left_ankle", "Left Ankle / Foot"],
  ["right_ankle", "Right Ankle / Foot"],
  ["left_wrist", "Left Wrist / Hand"],
  ["right_wrist", "Right Wrist / Hand"],
] as const;

export const POSTURE_OPTIONS = {
  head_position: ["neutral", "forward", "tilted right", "tilted left"],
  shoulder_position: ["neutral", "rounded forward", "elevated", "asymmetric"],
  thoracic_curve: ["neutral", "excessive kyphosis", "flat"],
  lumbar_curve: ["neutral", "excessive lordosis", "flat / posterior tilt"],
  pelvic_tilt: ["neutral", "anterior tilt", "posterior tilt", "lateral shift"],
  knee_position: ["neutral", "valgus (knock-kneed)", "varus (bow-legged)", "hyperextended"],
  foot_arch: ["neutral", "flat / pronated", "high arch / supinated"],
} as const;

export function emptyAssessment(): AssessmentData {
  return {
    goals: {
      primary: "",
      secondary: "",
      training_history: "",
      training_frequency_current: "",
      training_type_current: "",
      target_sessions_per_week: 3,
      what_worked: "",
      what_didnt: "",
    },
    health: {
      injuries_current: "",
      injuries_past: "",
      surgeries: "",
      conditions: "",
      medications: "",
      pain_areas: "",
      notes: "",
    },
    pain_map: Object.fromEntries(
      PAIN_AREAS.map(([k]) => [k, { severity: "" as Severity, description: "", status: "" as ConstraintStatus }])
    ),
    lifestyle: {
      occupation: "",
      desk_hours: "",
      sleep_quality: "",
      sleep_hours: "",
      stress_level: "",
      activity_outside_training: "",
      nutrition_notes: "",
    },
    posture: {
      head_position: "",
      shoulder_position: "",
      thoracic_curve: "",
      lumbar_curve: "",
      pelvic_tilt: "",
      knee_position: "",
      foot_arch: "",
      notes: "",
    },
    movement_screen: Object.fromEntries(
      JOINTS.map(([k]) => [k, { rating: "" as Rating, rom_degrees: "", note: "" }])
    ),
    strength_baseline: Object.fromEntries(
      PATTERNS.map(([k]) => [k, { level: "" as Level, load: "", note: "" }])
    ),
    conditioning: {
      resting_hr: "",
      conditioning_level: "",
      preferred_modality: "",
      limitations: "",
    },
    body_comp: {
      weight_lbs: "",
      body_fat_pct: "",
      lean_mass_lbs: "",
      waist_inches: "",
      notes: "",
    },
    fra_priorities: [],
    strength_markers: {},
    cardio_tolerance: {
      primary_machine: "",
      tolerated_machines: [],
      avoid_machines: [],
      interval_clearance: "",
    },
    accessory_categories: [],
    summary: {
      recommendation: "",
      recommended_sessions_per_week: 3,
      focus_areas: "",
      primary_limitations: "",
      red_flags: "",
    },
  };
}
