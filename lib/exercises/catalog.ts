import { parsePrescriptionMap, type PrescriptionMap } from "./prescription";
export const EXERCISE_SET_SOURCE = "ims_exercise_set";
export const MAX_SET_EXERCISES = 500;
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export interface CatalogExercise {
  canonical_id: string; canonical_name: string; aliases: string | null; category: string | null;
  movement_pattern: string | null; source_primary_joints: string | null; equipment: string | null;
  matched_exercise_id: string | null; mapping_status: string | null;
}
export interface CatalogClient { id: string; full_name: string }
export interface SavedExerciseSet {
  id: string; name: string; client_id: string; updated_at: string; canonical_ids: string[]; note: string;
  prescriptions?: PrescriptionMap;
}
export function isExerciseSet(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value)
    && (value as Record<string, unknown>).source === EXERCISE_SET_SOURCE;
}
export function exerciseSetIds(value: unknown): string[] {
  if (!isExerciseSet(value) || !Array.isArray(value.canonical_ids)) return [];
  return value.canonical_ids.filter((id): id is string => typeof id === "string");
}
/** Preserve source text; splitting is only for search/filter controls. */
export function sourceTokens(value: string | null): string[] {
  if (!value?.trim()) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    if (Array.isArray(parsed)) return parsed.filter((v): v is string => typeof v === "string").map(v => v.trim()).filter(Boolean);
  } catch { /* Source also contains ordinary delimited text. */ }
  return value.split(/[,;|]/).map(v => v.trim()).filter(Boolean);
}
export function catalogLabel(value: string | null): string { return value ? value.replaceAll("_", " ") : "Uncategorized"; }
export function filterCatalog(rows: CatalogExercise[], filters: { query?: string; category?: string; joint?: string; equipment?: string; selectedOnly?: boolean }, selected: ReadonlySet<string> = new Set()): CatalogExercise[] {
  const terms = (filters.query ?? "").trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  return rows.filter(row => {
    if (filters.selectedOnly && !selected.has(row.canonical_id)) return false;
    if (filters.category && row.category !== filters.category) return false;
    if (filters.joint && !sourceTokens(row.source_primary_joints).includes(filters.joint)) return false;
    if (filters.equipment && !sourceTokens(row.equipment).includes(filters.equipment)) return false;
    const haystack = [row.canonical_id, row.canonical_name, row.aliases, row.category, row.movement_pattern, row.source_primary_joints, row.equipment].join(" ").replaceAll("_", " ").toLocaleLowerCase();
    return terms.every(term => haystack.includes(term));
  });
}
export interface ExerciseSetInput {
  request_id: string; client_id: string; name: string; note: string; canonical_ids: string[];
  prescriptions?: PrescriptionMap; expected_updated_at?: string;
}
export function parseExerciseSetInput(value: unknown, editing = false): ExerciseSetInput {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid exercise selection.");
  const v = value as Record<string, unknown>;
  if (typeof v.request_id !== "string" || !UUID.test(v.request_id)
      || typeof v.client_id !== "string" || !UUID.test(v.client_id)) throw new Error("Choose a client and retry the save.");
  if (typeof v.name !== "string" || !v.name.trim() || v.name.trim().length > 160) throw new Error("Give this exercise set a name (up to 160 characters).");
  if (v.note !== undefined && (typeof v.note !== "string" || v.note.length > 2000)) throw new Error("Keep the coach note under 2,000 characters.");
  if (!Array.isArray(v.canonical_ids) || v.canonical_ids.length < 1 || v.canonical_ids.length > MAX_SET_EXERCISES
      || v.canonical_ids.some(id => typeof id !== "string" || !/^EX-\d{4,6}$/.test(id))
      || new Set(v.canonical_ids).size !== v.canonical_ids.length) throw new Error("Choose a non-duplicated set of source exercises.");
  if (editing && (typeof v.expected_updated_at !== "string" || !Number.isFinite(Date.parse(v.expected_updated_at)))) throw new Error("Refresh this saved set before editing it.");
  // Dosage is coaching intent, not a publication, safety or identity override.
  const allowed = new Set(["request_id", "client_id", "name", "note", "canonical_ids", "prescriptions", "expected_updated_at"]);
  if (Object.keys(v).some(key => !allowed.has(key))) throw new Error("Only exercise selections, prescriptions and coach notes can be saved here.");
  return { request_id: v.request_id, client_id: v.client_id, name: v.name.trim(), note: typeof v.note === "string" ? v.note.trim() : "", canonical_ids: v.canonical_ids as string[],
    ...(v.prescriptions === undefined ? {} : { prescriptions: parsePrescriptionMap(v.prescriptions, v.canonical_ids as string[]) }),
    ...(editing ? { expected_updated_at: v.expected_updated_at as string } : {}) };
}
/** Snapshots are coaching selections, not exercise approvals or a publishable plan. */
export function exerciseSetData(input: ExerciseSetInput, rows: CatalogExercise[], actorId: string) {
  const byId = new Map(rows.map(row => [row.canonical_id, row]));
  if (input.canonical_ids.some(id => !byId.has(id))) throw new Error("One or more exercises are no longer in the source catalog. Refresh and retry.");
  const prescriptions = parsePrescriptionMap(input.prescriptions ?? {}, input.canonical_ids);
  return {
    source: EXERCISE_SET_SOURCE, visibility: "coach_only", schema_version: 2,
    canonical_ids: input.canonical_ids, note: input.note, selected_by: actorId,
    exercises: input.canonical_ids.map(id => {
      const row = byId.get(id)!;
      return { canonical_id: id, name: row.canonical_name, category: row.category, primary_joints: row.source_primary_joints, equipment: row.equipment,
        // Never turn an unverified match/candidate into an assignment.
        matched_exercise_id: row.mapping_status === "coach_confirmed" ? row.matched_exercise_id : null,
        ...prescriptions[id] };
    }),
  };
}
/** Deterministic pagination: never let a server row cap masquerade as a full catalog. */
export async function allCatalogPages<T>(page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown; count?: number | null }>, size = 200): Promise<T[]> {
  const rows: T[] = [];
  let expected: number | null = null;
  for (let from = 0; from < 20_000; from += size) {
    const result = await page(from, from + size - 1);
    if (result.error || !result.data) throw new Error("Exercise workspace data is unavailable. Please retry.");
    if (result.count != null) {
      if (expected !== null && expected !== result.count) throw new Error("Exercise workspace changed while loading. Please refresh.");
      expected = result.count;
    }
    rows.push(...result.data);
    if (result.data.length < size || (expected !== null && rows.length >= expected)) {
      if (expected !== null && rows.length !== expected) throw new Error("Exercise workspace coverage is incomplete. Please retry.");
      return rows;
    }
  }
  throw new Error("Exercise workspace is too large to load safely in one view.");
}
