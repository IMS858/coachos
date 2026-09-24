export const LIBRARY_DRAFT_SOURCE = "ims_library_program";
export interface DraftExercise {
  key: string;
  name: string;
  exercise_id: string | null;
  canonical_id: string | null;
  sets: number | null;
  reps: string;
  load: string;
  rest_seconds: number | null;
  tempo: string;
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
      sets: typeof v.sets === "number" ? v.sets : null, reps: typeof v.reps === "string" ? v.reps : "",
      load: typeof v.load === "string" ? v.load : "", rest_seconds: typeof v.rest_seconds === "number" ? v.rest_seconds : null,
      tempo: typeof v.tempo === "string" ? v.tempo : "" };
  });
}
/** Identity comes from saved data, never from a prescription edit. Full rows are updated in one compare-and-swap. */
export function applyDraftPrescription(data: unknown, value: unknown): Record<string, unknown> {
  const original = object(data);
  const rows = libraryDraftRows(original);
  if (!rows.length || rows.length > 500 || !Array.isArray(value) || value.length !== rows.length) throw new Error("Exercise selection changed. Reopen this draft.");
  const text = (v: unknown, max: number) => { if (typeof v !== "string" || v.length > max) throw new Error("Invalid prescription text."); return v.trim(); };
  const number = (v: unknown, min: number, max: number) => { if (v === null) return null; if (typeof v !== "number" || !Number.isInteger(v) || v < min || v > max) throw new Error("Invalid sets or rest value."); return v; };
  const exercises = (original.exercises as unknown[]).map((raw, index) => {
    const p = object(value[index]);
    if (p.key !== String(index) || Object.keys(p).some(k => !["key", "sets", "reps", "load", "rest_seconds", "tempo"].includes(k))) throw new Error("Exercise identities cannot be edited through prescriptions.");
    return { ...object(raw), sets: number(p.sets, 1, 20), reps: text(p.reps, 40), load: text(p.load, 120), rest_seconds: number(p.rest_seconds, 0, 900), tempo: text(p.tempo, 40) };
  });
  const complete = exercises.every(e => e.sets !== null && e.reps.length > 0);
  return { ...original, exercises, visibility: "coach_only", prescription_status: complete ? "ready_for_coach_review" : "needs_prescription" };
}
