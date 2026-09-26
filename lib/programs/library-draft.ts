import { parsePrescription, type ExercisePrescription } from "../exercises/prescription";
export const LIBRARY_DRAFT_SOURCE = "ims_library_program";
export interface DraftExercise extends ExercisePrescription {
  key: string; name: string; exercise_id: string | null; canonical_id: string | null;
}
const object = (v: unknown): Record<string, unknown> => v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : {};
export function libraryDraftRows(data: unknown): DraftExercise[] {
  const d = object(data);
  if (d.source !== LIBRARY_DRAFT_SOURCE || !Array.isArray(d.exercises)) return [];
  return d.exercises.map((value, index) => {
    const v = object(value);
    return { key: String(index), name: typeof v.name === "string" ? v.name : "Exercise identity needs review",
      exercise_id: typeof v.exercise_id === "string" ? v.exercise_id : typeof v.matched_exercise_id === "string" ? v.matched_exercise_id : null,
      canonical_id: typeof v.canonical_id === "string" ? v.canonical_id : null,
      ...parsePrescription({ sets: v.sets, reps: v.reps, load: v.load, rpe: v.rpe, rest_seconds: v.rest_seconds, tempo: v.tempo, cue: v.cue }) };
  });
}
/** Identity comes from saved data, never from a prescription edit. Full rows are updated in one compare-and-swap. */
export function applyDraftPrescription(data: unknown, value: unknown): Record<string, unknown> {
  const original = object(data);
  const rows = libraryDraftRows(original);
  if (!rows.length || rows.length > 500 || !Array.isArray(value) || value.length !== rows.length) throw new Error("Exercise selection changed. Reopen this draft.");
  const exercises = (original.exercises as unknown[]).map((raw, index) => {
    const p = object(value[index]);
    if (!["key", "sets", "reps", "load", "rest_seconds", "tempo"].every(k => Object.hasOwn(p, k)) || p.key !== String(index) || Object.keys(p).some(k => !["key", "sets", "reps", "load", "rpe", "rest_seconds", "tempo", "cue"].includes(k))) throw new Error("Exercise identities cannot be edited through prescriptions.");
    // An older open tab must not silently clear new fields it does not know about.
    const prior = rows[index];
    return { ...object(raw), ...parsePrescription({ sets: p.sets, reps: p.reps, load: p.load,
      rpe: p.rpe === undefined ? prior.rpe : p.rpe, rest_seconds: p.rest_seconds, tempo: p.tempo,
      cue: p.cue === undefined ? prior.cue : p.cue }) };
  });
  const complete = exercises.every(e => e.sets !== null && e.reps.length > 0);
  return { ...original, exercises, visibility: "coach_only", prescription_status: complete ? "ready_for_coach_review" : "needs_prescription" };
}
