/**
 * Exercise Library Seed — 15 structurally-correct exemplars.
 *
 * Coaching cues marked [JASON: rewrite] are placeholders. Jason should
 * replace them with IMS-specific language before publishing.
 *
 * All exercises start as status='draft' and client_visible=false. After
 * Jason reviews each one and records a Bunny Stream video, set:
 *   status = 'published'
 *   client_visible = true
 *   video_id = <bunny GUID>
 *
 *   pnpm tsx apps/web/scripts/seed-exercises.ts
 *
 * Idempotent — checks slug before inserting.
 */

import { createClient } from "@supabase/supabase-js";
import type { Database } from "../lib/types/database";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error("❌ Missing env vars");
  process.exit(1);
}

const supabase = createClient<Database>(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

interface ExerciseSeed {
  name: string;
  ims_label?: string;
  slug: string;
  category: "mobility" | "strength" | "corrective" | "conditioning" | "recovery";
  movement_pattern: string;
  level: "beginner" | "intermediate" | "advanced";
  primary_joints: string[];
  primary_muscles: string[];
  equipment: string[];
  coaching_cues: string[];
  common_mistakes: string[];
  programming_notes?: string;
  contraindications?: string;
  load_descriptors: string[];
  system_tags: string[];
  tags: string[];
}

const exercises: ExerciseSeed[] = [
  // ========== MOBILITY (3) ==========
  {
    name: "Hip CARs",
    ims_label: "Hip Controlled Articular Rotations",
    slug: "hip-cars",
    category: "mobility",
    movement_pattern: "isolated_joint",
    level: "beginner",
    primary_joints: ["hip"],
    primary_muscles: ["hip_flexors", "glute_max", "glute_med", "adductors"],
    equipment: ["bodyweight"],
    coaching_cues: [
      "[JASON: rewrite] Brace hard, move only the hip",
      "[JASON: rewrite] Make the biggest circle you can control",
      "[JASON: rewrite] No compensating from the lumbar spine",
    ],
    common_mistakes: [
      "Moving from the lumbar spine instead of isolating the hip",
      "Rushing the rotation to extend range artificially",
      "Holding breath through effort phases",
    ],
    programming_notes:
      "Use as joint prep before any lower-body session. 1-2 reps per direction is typically enough.",
    contraindications:
      "Acute hip flare or recent hip surgery — defer to clinical guidance.",
    load_descriptors: ["low_lumbar_load", "low_patellofemoral_load"],
    system_tags: ["warm_up", "mobility_prep", "cars"],
    tags: ["frc", "joint_health", "longevity"],
  },
  {
    name: "Shoulder CARs",
    ims_label: "Shoulder Controlled Articular Rotations",
    slug: "shoulder-cars",
    category: "mobility",
    movement_pattern: "isolated_joint",
    level: "beginner",
    primary_joints: ["shoulder", "scapula"],
    primary_muscles: ["rotator_cuff", "deltoids", "lats"],
    equipment: ["bodyweight"],
    coaching_cues: [
      "[JASON: rewrite] Brace the rib cage, isolate the shoulder",
      "[JASON: rewrite] Maximum range with full control",
      "[JASON: rewrite] No torso compensation",
    ],
    common_mistakes: [
      "Letting the rib cage flare to extend range",
      "Speeding through to avoid sticking points",
      "Losing tension at end ranges",
    ],
    programming_notes:
      "Pair with hip CARs for daily joint prep. Single-arm or both arms simultaneously.",
    load_descriptors: ["shoulder_friendly_pressing"],
    system_tags: ["warm_up", "mobility_prep", "cars"],
    tags: ["frc", "joint_health"],
  },
  {
    name: "Thoracic Spine Rotation",
    ims_label: "T-Spine Open-Book",
    slug: "thoracic-spine-rotation",
    category: "mobility",
    movement_pattern: "rotation",
    level: "beginner",
    primary_joints: ["thoracic_spine"],
    primary_muscles: ["thoracic_extensors", "obliques"],
    equipment: ["bodyweight"],
    coaching_cues: [
      "[JASON: rewrite] Rotate from the mid-back, not the lumbar",
      "[JASON: rewrite] Eyes follow the hand",
      "[JASON: rewrite] Pause at end range — own the position",
    ],
    common_mistakes: [
      "Rotating primarily from the lumbar spine",
      "Bouncing into end range instead of pausing",
      "Letting the bottom knee lift to extend rotation",
    ],
    programming_notes:
      "Excellent prep before pressing or rotation-heavy work. 5-8 reps per side.",
    load_descriptors: ["low_lumbar_load"],
    system_tags: ["warm_up", "mobility_prep"],
    tags: ["spine_health", "desk_worker"],
  },

  // ========== STRENGTH — LOWER (3) ==========
  {
    name: "Goblet Squat",
    ims_label: "Goblet Squat",
    slug: "goblet-squat",
    category: "strength",
    movement_pattern: "squat",
    level: "beginner",
    primary_joints: ["hip", "knee", "ankle"],
    primary_muscles: ["quad", "glute_max", "adductors", "core"],
    equipment: ["dumbbell", "kettlebell"],
    coaching_cues: [
      "[JASON: rewrite] Drive the knees out over the toes",
      "[JASON: rewrite] Hold the bell tight against the chest",
      "[JASON: rewrite] Spread the floor with your feet",
      "[JASON: rewrite] Sit between the hips, not behind them",
    ],
    common_mistakes: [
      "Knees collapsing inward (valgus)",
      "Heels lifting at depth — ankle mobility issue, not effort",
      "Lumbar flexion at the bottom of the rep",
      "Holding the bell loose, away from the chest",
    ],
    programming_notes:
      "Great teaching squat. Use heel-elevated variation for clients with limited ankle DF. 3-4 sets of 6-12 typical.",
    contraindications:
      "Acute knee pain on loading, recent disc episode without clearance.",
    load_descriptors: [],
    system_tags: [],
    tags: ["foundational", "teaching_lift"],
  },
  {
    name: "Heel-Elevated Goblet Squat",
    ims_label: "Heel-Elevated Goblet Squat",
    slug: "heel-elevated-goblet-squat",
    category: "strength",
    movement_pattern: "squat",
    level: "beginner",
    primary_joints: ["hip", "knee"],
    primary_muscles: ["quad", "glute_max"],
    equipment: ["dumbbell", "kettlebell", "wedge"],
    coaching_cues: [
      "[JASON: rewrite] Heels elevated reduces ankle DF demand",
      "[JASON: rewrite] More forward knee travel — that's the point",
      "[JASON: rewrite] Vertical torso, full depth",
    ],
    common_mistakes: [
      "Treating it like a regular squat with no quad emphasis",
      "Lifting heels off the wedge mid-rep",
    ],
    programming_notes:
      "Useful regression for limited ankle mobility, or quad-biased variation when that's the goal.",
    load_descriptors: ["low_lumbar_load"],
    system_tags: [],
    tags: ["regression", "quad_biased"],
  },
  {
    name: "Romanian Deadlift",
    ims_label: "RDL",
    slug: "romanian-deadlift",
    category: "strength",
    movement_pattern: "hinge",
    level: "intermediate",
    primary_joints: ["hip", "lumbar_spine"],
    primary_muscles: ["hamstrings", "glute_max", "spinal_erectors"],
    equipment: ["barbell", "dumbbell"],
    coaching_cues: [
      "[JASON: rewrite] Push the hips back, don't bend forward",
      "[JASON: rewrite] Bar stays close — drag it down the legs",
      "[JASON: rewrite] Soft knees, not bent — locked, not braced",
      "[JASON: rewrite] Stop where you lose neutral spine, not where the bar reaches the floor",
    ],
    common_mistakes: [
      "Squatting the lift — too much knee bend",
      "Lumbar rounding at the bottom (the most common fault)",
      "Bar drifting forward of the legs",
      "Hyperextension at the top instead of neutral lockout",
    ],
    programming_notes:
      "Range of motion is determined by the client's hamstring length and ability to maintain neutral spine. Don't chase the floor.",
    contraindications:
      "Recent disc episode — work with clinical clearance.",
    load_descriptors: [],
    system_tags: [],
    tags: ["foundational", "posterior_chain"],
  },
  {
    name: "Hip Thrust",
    ims_label: "Hip Thrust",
    slug: "hip-thrust",
    category: "strength",
    movement_pattern: "hinge",
    level: "intermediate",
    primary_joints: ["hip"],
    primary_muscles: ["glute_max", "hamstrings"],
    equipment: ["barbell", "bench"],
    coaching_cues: [
      "[JASON: rewrite] Ribs down, not flared — drive through the glutes",
      "[JASON: rewrite] Tuck the chin, eyes forward at the top",
      "[JASON: rewrite] Squeeze hard at lockout, ribs stay down",
    ],
    common_mistakes: [
      "Hyperextending the lumbar spine instead of finishing with the hips",
      "Letting the rib cage flare at the top",
      "Pushing through toes instead of mid-foot",
    ],
    programming_notes:
      "Sweet spot for glute development without spine loading. Good post-RDL accessory.",
    load_descriptors: ["low_lumbar_load"],
    system_tags: [],
    tags: ["glute_focus", "accessory"],
  },

  // ========== STRENGTH — UPPER PUSH (2) ==========
  {
    name: "Push-Up",
    ims_label: "Push-Up",
    slug: "push-up",
    category: "strength",
    movement_pattern: "push_horizontal",
    level: "beginner",
    primary_joints: ["shoulder", "elbow", "scapula"],
    primary_muscles: ["pec", "front_delt", "tricep", "core"],
    equipment: ["bodyweight"],
    coaching_cues: [
      "[JASON: rewrite] Plank from heels to head — no sag",
      "[JASON: rewrite] Elbows track at ~45° from the torso",
      "[JASON: rewrite] Push the floor away at the top",
    ],
    common_mistakes: [
      "Hips sagging — core not engaged",
      "Elbows flaring to 90° from the torso (shoulder-stressful)",
      "Head leading the chest",
      "Half reps from a missing range of motion",
    ],
    programming_notes:
      "Underrated. Better push pattern for most clients than benching. Hand elevation as a regression.",
    load_descriptors: ["shoulder_friendly_pressing"],
    system_tags: [],
    tags: ["foundational", "bodyweight"],
  },
  {
    name: "Dumbbell Bench Press",
    ims_label: "DB Bench",
    slug: "dumbbell-bench-press",
    category: "strength",
    movement_pattern: "push_horizontal",
    level: "intermediate",
    primary_joints: ["shoulder", "elbow"],
    primary_muscles: ["pec", "front_delt", "tricep"],
    equipment: ["dumbbell", "bench"],
    coaching_cues: [
      "[JASON: rewrite] Light arch, ribs down — not flared",
      "[JASON: rewrite] Elbows tucked ~45°",
      "[JASON: rewrite] Press, don't push — control on the eccentric",
    ],
    common_mistakes: [
      "Excessive lumbar arch instead of light spine extension",
      "Bouncing dumbbells off the chest",
      "Elbows flared 90° (shoulder-impingement risk)",
    ],
    programming_notes:
      "More shoulder-friendly than barbell for most clients. 3-5 sets of 6-12 typical.",
    load_descriptors: ["shoulder_friendly_pressing"],
    system_tags: [],
    tags: [],
  },

  // ========== STRENGTH — UPPER PULL (2) ==========
  {
    name: "Chest-Supported Row",
    ims_label: "CSR",
    slug: "chest-supported-row",
    category: "strength",
    movement_pattern: "pull_horizontal",
    level: "beginner",
    primary_joints: ["shoulder", "scapula", "elbow"],
    primary_muscles: ["lats", "rhomboids", "rear_delt", "biceps"],
    equipment: ["dumbbell", "bench"],
    coaching_cues: [
      "[JASON: rewrite] Chest stays glued to the bench — no body english",
      "[JASON: rewrite] Pull the elbows back, not up",
      "[JASON: rewrite] Squeeze the back, then lower under control",
    ],
    common_mistakes: [
      "Lifting the chest off the pad to swing weight up",
      "Pulling into the upper trap instead of the mid-back",
      "Half range — barely moving the elbow past the torso",
    ],
    programming_notes:
      "Excellent for cleaning up posture and balancing pressing volume. Removes lumbar engagement so it isolates the back.",
    load_descriptors: ["low_lumbar_load"],
    system_tags: [],
    tags: ["foundational", "posture"],
  },
  {
    name: "Lat Pulldown",
    ims_label: "Lat Pulldown",
    slug: "lat-pulldown",
    category: "strength",
    movement_pattern: "pull_vertical",
    level: "beginner",
    primary_joints: ["shoulder", "scapula", "elbow"],
    primary_muscles: ["lats", "biceps", "rear_delt"],
    equipment: ["cable_machine"],
    coaching_cues: [
      "[JASON: rewrite] Initiate from the lats, not the arms",
      "[JASON: rewrite] Bar to upper chest, not the chin",
      "[JASON: rewrite] Lean back slightly, ribs down",
    ],
    common_mistakes: [
      "Yanking with the arms before the lats engage",
      "Excessive backward lean turning it into a row",
      "Letting the shoulder roll forward at the bottom of the rep",
    ],
    load_descriptors: [],
    system_tags: [],
    tags: [],
  },

  // ========== STRENGTH — CORE (2) ==========
  {
    name: "Dead Bug",
    ims_label: "Dead Bug",
    slug: "dead-bug",
    category: "strength",
    movement_pattern: "anti_extension",
    level: "beginner",
    primary_joints: ["lumbar_spine"],
    primary_muscles: ["transverse_abdominis", "rectus_abdominis"],
    equipment: ["bodyweight"],
    coaching_cues: [
      "[JASON: rewrite] Lower back pinned to the floor — that's the win condition",
      "[JASON: rewrite] Slow, opposite arm and opposite leg",
      "[JASON: rewrite] Exhale on the extension",
    ],
    common_mistakes: [
      "Letting the lumbar spine rise off the floor — defeats the purpose",
      "Rushing — speed kills the brace",
      "Not breathing — holding tension by holding breath",
    ],
    programming_notes:
      "Foundation for anti-extension work. Master before progressing to harder anti-extension drills.",
    load_descriptors: ["low_lumbar_load"],
    system_tags: ["mobility_prep"],
    tags: ["foundational", "core_stability"],
  },
  {
    name: "Pallof Press",
    ims_label: "Pallof Press",
    slug: "pallof-press",
    category: "strength",
    movement_pattern: "anti_rotation",
    level: "beginner",
    primary_joints: ["lumbar_spine"],
    primary_muscles: ["obliques", "transverse_abdominis"],
    equipment: ["cable_machine", "band"],
    coaching_cues: [
      "[JASON: rewrite] Stand square to the cable — resist rotation",
      "[JASON: rewrite] Press straight out, ribs down",
      "[JASON: rewrite] Pause at lockout",
    ],
    common_mistakes: [
      "Letting the torso rotate toward the cable",
      "Hips drifting — they should stay square",
      "Pressing too quickly — the slow-motion press is the point",
    ],
    programming_notes:
      "Excellent corrective for spine stability under rotational load. Pair with rotational lifts as antagonist work.",
    load_descriptors: ["low_lumbar_load"],
    system_tags: [],
    tags: ["foundational", "core_stability"],
  },

  // ========== CONDITIONING (1) ==========
  {
    name: "Sled Push",
    ims_label: "Sled Push",
    slug: "sled-push",
    category: "conditioning",
    movement_pattern: "gait",
    level: "intermediate",
    primary_joints: ["hip", "knee", "ankle"],
    primary_muscles: ["quad", "glute_max", "calves", "core"],
    equipment: ["sled"],
    coaching_cues: [
      "[JASON: rewrite] Lean into the handles — body angle is everything",
      "[JASON: rewrite] Drive through the floor, not at it",
      "[JASON: rewrite] Short choppy steps for intervals, longer drives for strength",
    ],
    common_mistakes: [
      "Standing too upright — kills propulsion",
      "Trying to push too heavy — should be able to maintain rhythm",
    ],
    programming_notes:
      "Joint-friendly conditioning option. Less spine compression than running. Great for clients managing knee or back issues.",
    load_descriptors: ["low_lumbar_load", "low_patellofemoral_load"],
    system_tags: [],
    tags: ["conditioning", "joint_friendly"],
  },

  // ========== CORRECTIVE (1) ==========
  {
    name: "Wall Slide",
    ims_label: "Wall Slide",
    slug: "wall-slide",
    category: "corrective",
    movement_pattern: "push_vertical",
    level: "beginner",
    primary_joints: ["shoulder", "scapula", "thoracic_spine"],
    primary_muscles: ["lower_trap", "serratus", "rotator_cuff"],
    equipment: ["bodyweight", "wall"],
    coaching_cues: [
      "[JASON: rewrite] Low back stays on the wall — that's the constraint",
      "[JASON: rewrite] Slide up, then reach the hands further away at the top",
      "[JASON: rewrite] Slow and tight, no compensating",
    ],
    common_mistakes: [
      "Lumbar lifting off the wall to extend the range",
      "Elbows leaving the wall during the slide",
      "Rushing through — the value is in the slow control",
    ],
    programming_notes:
      "Pre-press warm-up for clients with shoulder restriction. 8-12 controlled reps.",
    load_descriptors: ["low_lumbar_load", "shoulder_friendly_pressing"],
    system_tags: ["warm_up", "mobility_prep"],
    tags: ["shoulder_health", "posture"],
  },

  // ========== RECOVERY (1) ==========
  {
    name: "90/90 Breathing",
    ims_label: "90/90 Reset Breathing",
    slug: "90-90-breathing",
    category: "recovery",
    movement_pattern: "breathing",
    level: "beginner",
    primary_joints: ["lumbar_spine", "thoracic_spine"],
    primary_muscles: ["diaphragm", "transverse_abdominis"],
    equipment: ["bodyweight"],
    coaching_cues: [
      "[JASON: rewrite] Heels on a chair or wall, lumbar flat",
      "[JASON: rewrite] Inhale through the nose into the back and ribs",
      "[JASON: rewrite] Long, full exhale — empty completely before the next breath",
    ],
    common_mistakes: [
      "Breathing into the upper chest only",
      "Forcing the exhale in 1-2 seconds",
      "Lumbar lifting off the floor",
    ],
    programming_notes:
      "Use as a parasympathetic reset between heavy sets, or as a session opener for stressed-out clients.",
    contraindications:
      "If client has uncontrolled breathing pattern from anxiety, defer to clinical guidance.",
    load_descriptors: ["low_lumbar_load"],
    system_tags: ["mobility_prep"],
    tags: ["recovery", "downregulation", "breathwork"],
  },
];

async function main() {
  console.log(`🌱 Seeding ${exercises.length} exemplar exercises\n`);

  let created = 0;
  let skipped = 0;
  let failed = 0;

  for (const ex of exercises) {
    const { data: existing } = await supabase
      .from("exercises")
      .select("id")
      .eq("slug", ex.slug)
      .maybeSingle();

    if (existing) {
      console.log(`  · ${ex.name.padEnd(38)} (already exists)`);
      skipped++;
      continue;
    }

    const { error } = await supabase.from("exercises").insert({
      ...ex,
      status: "draft",
      client_visible: false,
      video_provider: "placeholder",
    });

    if (error) {
      console.log(`  ✗ ${ex.name.padEnd(38)} ${error.message}`);
      failed++;
    } else {
      console.log(`  ✓ ${ex.name.padEnd(38)} [${ex.category}]`);
      created++;
    }
  }

  console.log(`\n${created} created · ${skipped} existed · ${failed} failed\n`);
  console.log("Next steps:");
  console.log("  1. Open /library — see all 15 listed (drafts only visible to trainers)");
  console.log("  2. Jason rewrites coaching cues marked [JASON: rewrite]");
  console.log("  3. Record videos, paste Bunny Stream GUID into video_id field");
  console.log("  4. Set status='published' and client_visible=true to release");
}

main().catch((err) => {
  console.error("❌", err);
  process.exit(1);
});
