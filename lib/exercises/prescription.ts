/** Coaching intent only. Prescriptions never grant exercise approval or client visibility. */
export interface ExercisePrescription {
  sets: number | null;
  reps: string;
  load: string;
  rpe: number | null;
  rest_seconds: number | null;
  tempo: string;
  cue: string;
}
export type PrescriptionMap = Record<string, ExercisePrescription>;
export const EMPTY_PRESCRIPTION: ExercisePrescription = {
  sets: null, reps: "", load: "", rpe: null, rest_seconds: null, tempo: "", cue: "",
};
const KEYS = Object.keys(EMPTY_PRESCRIPTION);
export function parsePrescription(value: unknown): ExercisePrescription {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid exercise prescription.");
  const v = value as Record<string, unknown>;
  if (Object.keys(v).some(key => !KEYS.includes(key))) throw new Error("Only prescription fields may be changed here.");
  const text = (key: string, max: number) => {
    if (v[key] === undefined) return "";
    if (typeof v[key] !== "string" || v[key].length > max) throw new Error(`Invalid ${key}: maximum ${max} characters.`);
    return v[key].trim();
  };
  const number = (key: string, min: number, max: number, integer: boolean) => {
    const n = v[key];
    if (n === null || n === undefined) return null;
    if (typeof n !== "number" || !Number.isFinite(n) || n < min || n > max || (integer && !Number.isInteger(n))) throw new Error(`Invalid ${key}: use ${min}–${max}.`);
    return n;
  };
  return { sets: number("sets", 1, 20, true), reps: text("reps", 40), load: text("load", 120),
    rpe: number("rpe", 1, 10, false), rest_seconds: number("rest_seconds", 0, 900, true), tempo: text("tempo", 40), cue: text("cue", 500) };
}
export function parsePrescriptionMap(value: unknown, ids: readonly string[]): PrescriptionMap {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid prescription collection.");
  const rows = value as Record<string, unknown>;
  if (Object.keys(rows).some(id => !ids.includes(id))) throw new Error("Prescription must belong to a selected exercise.");
  return Object.fromEntries(ids.map(id => [id, parsePrescription(rows[id] ?? {})]));
}
/** Legacy selections without dosage reopen empty, never with an invented prescription. */
export function savedPrescriptions(data: unknown): PrescriptionMap {
  if (!data || typeof data !== "object" || Array.isArray(data)) return {};
  const exercises = (data as Record<string, unknown>).exercises;
  if (!Array.isArray(exercises)) return {};
  const result: PrescriptionMap = {};
  for (const row of exercises) {
    if (!row || typeof row !== "object" || typeof row.canonical_id !== "string") continue;
    const values = Object.fromEntries(KEYS.filter(key => row[key] !== undefined).map(key => [key, row[key]]));
    result[row.canonical_id] = parsePrescription(values);
  }
  return result;
}
export function prescriptionSignature(ids: readonly string[], map: PrescriptionMap = {}): string {
  return JSON.stringify(ids.map(id => [id, parsePrescription(map[id] ?? {})]));
}
export function prescriptionSummary(p: ExercisePrescription): string {
  return [p.sets === null ? "" : `${p.sets} sets`, p.reps, p.load, p.rpe === null ? "" : `RPE ${p.rpe}`,
    p.rest_seconds === null ? "" : `${p.rest_seconds}s rest`, p.tempo ? `Tempo ${p.tempo}` : ""].filter(Boolean).join(" · ");
}
