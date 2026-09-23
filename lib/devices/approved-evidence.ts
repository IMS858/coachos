/** Only coach-approved measurements may reach the generator.
 * VOLTRA Beyond+ rep exports are DYNAMIC; never disguise peak rep power
 * or sampled force as a mid/end-range isometric strength measurement.
 */
type RecordValue = Record<string, unknown>;
const jointAliases: Record<string, string> = {
  shoulders: "shoulder", hips: "hip", knees: "knee", ankles: "ankle",
  wrists: "wrist", neck: "cervical", "low back": "lumbar",
};
const joints = new Set(["shoulder", "hip", "knee", "ankle", "wrist", "elbow", "cervical", "lumbar"]);
const motions: Record<string, string> = {
  "external rotation": "er", "internal rotation": "ir",
  "dorsiflexion": "dorsiflexion", "plantar flexion": "plantarflexion",
};
const dynamoTests = new Set([
  "wrist_flexion", "wrist_extension", "shoulder_ir", "shoulder_er",
  "shoulder_abduction", "shoulder_adduction", "shoulder_flexion",
  "shoulder_extension", "hip_abduction", "hip_adduction", "hip_ir",
  "hip_er", "hip_flexion", "hip_extension", "knee_extension",
  "knee_flexion", "ankle_dorsiflexion", "ankle_plantarflexion",
  "ankle_inversion", "ankle_eversion", "elbow_flexion",
  "elbow_extension", "cervical_flexion", "cervical_extension",
]);
const sideMap: Record<string, string> = { left: "L", right: "R", bilateral: "bilateral" };
const text = (value: unknown) => typeof value === "string" ? value.trim() : "";
const approved = (value: unknown): value is RecordValue =>
  !!value && typeof value === "object" && !Array.isArray(value)
  && (value as RecordValue).review_status === "approved";
function normalizedTest(reading: RecordValue) {
  const rawJoint = text(reading.joint).toLowerCase();
  const joint = jointAliases[rawJoint] ?? rawJoint;
  const rawMotion = text(reading.motion).toLowerCase().replace(/[_-]/g, " ");
  const motion = motions[rawMotion] ?? rawMotion.replace(/\s+/g, "_");
  if (!joints.has(joint) || !motion || !sideMap[text(reading.side)]) return null;
  return { joint, motion, side: sideMap[text(reading.side)] };
}
export function approvedDeviceEvidence(data: RecordValue) {
  const readings = Array.isArray(data.device_measurements) ? data.device_measurements.filter(approved) : [];
  const workouts = Array.isArray(data.voltra_sessions) ? data.voltra_sessions.filter(approved) : [];
  const rom: RecordValue[] = [], dynamo: RecordValue[] = [];
  const skipped: string[] = [];
  const sorted = [...readings].sort((a, b) => text(b.test_date).localeCompare(text(a.test_date)));
  const seen = new Set<string>();
  for (const reading of sorted) {
    const test = normalizedTest(reading);
    const value = reading.value;
    const date = text(reading.test_date);
    if (!test || typeof value !== "number" || !Number.isFinite(value) ||
        !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      skipped.push("Unrecognized ActivForce test or invalid reading");
      continue;
    }
    const kind = text(reading.kind);
    const key = [kind, test.joint, test.motion, test.side].join(":");
    if (seen.has(key)) continue;
    seen.add(key);
    if (kind === "rom" && reading.unit === "degrees" && value >= 0 && value <= 200) {
      rom.push({ joint: test.joint, motion: test.motion, side: test.side,
        degrees: value, mode: "unspecified", source: "activforce_2_manual",
        measured_on: date });
    } else if (kind === "force" && reading.protocol === "peak_isometric" && ["lb", "N"].includes(text(reading.unit)) &&
               value > 0 && dynamoTests.has(test.joint + "_" + test.motion)) {
      dynamo.push({ test: test.joint + "_" + test.motion, side: test.side,
        value, unit: reading.unit, source: "activforce_2_manual",
        measured_on: date });
    } else skipped.push("Unsupported ActivForce test, units or unverified force protocol");
  }
  // The Python engine accepts a single measurement date per set. Restrict
  // structured input to the newest approved date rather than mixing sessions.
  const dates = [...rom, ...dynamo].map(x => text(x.measured_on)).sort().reverse();
  const currentDate = dates[0];
  const current = {
    date: currentDate,
    rom: rom.filter(x => x.measured_on === currentDate),
    dynamo: dynamo.filter(x => x.measured_on === currentDate),
  };
  const voltraNotes = workouts.slice(-5).map(w => {
    const sets = Array.isArray(w.sets) ? w.sets : [];
    const reps = typeof w.total_repetitions === "number" ? w.total_repetitions : "?";
    return `${text(w.session_date)} ${text(w.exercise)} (${text(w.training_mode)}, ${text(w.side)}): ${reps} dynamic reps across ${sets.length} sets`;
  });
  return {
    objective_measures: current.rom.length || current.dynamo.length ? { current } : null,
    approved_voltra_notes: voltraNotes,
    skipped_count: skipped.length,
    approved_activforce_count: readings.length,
    approved_voltra_count: workouts.length,
  };
}
