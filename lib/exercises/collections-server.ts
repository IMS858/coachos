import type { SupabaseClient } from "@supabase/supabase-js";
import { exerciseSetData, exerciseSetIds, isExerciseSet, type CatalogExercise, type ExerciseSetInput } from "./catalog";

export class ExerciseSetError extends Error {
  constructor(message: string, public readonly status: number) { super(message); }
}
export const CATALOG_COLUMNS = "canonical_id,canonical_name,aliases,category,movement_pattern,source_primary_joints,equipment,matched_exercise_id,mapping_status";
const SET_COLUMNS = "id,name,client_id,trainer_id,status,data,updated_at";

/** Called only after active-staff authorization, using that caller's RLS client. */
export async function saveExerciseSet(db: Pick<SupabaseClient, "from">, actorId: string, input: ExerciseSetInput, editing: boolean) {
  const [profile, client] = await Promise.all([
    db.from("profiles").select("id").eq("id", input.client_id).eq("role", "client").is("deleted_at", null).maybeSingle(),
    db.from("clients").select("id").eq("id", input.client_id).maybeSingle(),
  ]);
  if (profile.error || client.error) throw new ExerciseSetError("Client lookup is unavailable. No selection was saved.", 503);
  if (!profile.data || !client.data) throw new ExerciseSetError("Choose an existing client profile.", 404);

  const prior = await db.from("programs").select(SET_COLUMNS).eq("id", input.request_id).maybeSingle();
  if (prior.error) throw new ExerciseSetError("Saved selections could not be checked. Please retry.", 503);
  if (editing) {
    if (!prior.data || !isExerciseSet(prior.data.data) || prior.data.client_id !== input.client_id) throw new ExerciseSetError("Exercise set not found for this client.", 404);
    if (prior.data.status !== "draft") throw new ExerciseSetError("Only a private draft exercise set can be edited.", 409);
    if (prior.data.updated_at !== input.expected_updated_at) throw new ExerciseSetError("This set changed in another tab. Refresh before saving.", 409);
  } else if (prior.data) {
    const same = prior.data.status === "draft" && isExerciseSet(prior.data.data)
      && prior.data.client_id === input.client_id && prior.data.trainer_id === actorId
      && prior.data.name === input.name && prior.data.data.note === input.note
      && JSON.stringify(exerciseSetIds(prior.data.data)) === JSON.stringify(input.canonical_ids);
    if (!same) throw new ExerciseSetError("This save reference is already in use. Start a new set or reopen the saved selection.", 409);
    return { id: prior.data.id as string, updated_at: prior.data.updated_at as string, deduped: true };
  }

  const catalog = await db.from("canonical_exercise_queue").select(CATALOG_COLUMNS).in("canonical_id", input.canonical_ids);
  if (catalog.error) throw new ExerciseSetError("Your source catalog could not be verified. No selection was saved.", 503);
  let data;
  try { data = exerciseSetData(input, (catalog.data ?? []) as CatalogExercise[], actorId); }
  catch (error) { throw new ExerciseSetError(error instanceof Error ? error.message : "Invalid source selection.", 409); }

  if (editing) {
    const saved = await db.from("programs").update({ name: input.name, data, updated_at: new Date().toISOString() })
      .eq("id", input.request_id).eq("client_id", input.client_id).eq("status", "draft")
      .eq("data->>source", "ims_exercise_set").eq("updated_at", input.expected_updated_at!)
      .select("id,updated_at").maybeSingle();
    if (saved.error) throw new ExerciseSetError("Unable to save the exercise set. Your selection is still on this screen.", 503);
    if (!saved.data) throw new ExerciseSetError("This set changed while saving. Refresh before retrying.", 409);
    return { id: saved.data.id as string, updated_at: saved.data.updated_at as string, deduped: false };
  }

  // One row is one atomic save. No exercise mappings, review flags, clients,
  // messages or publication state are changed by this operation.
  const saved = await db.from("programs").insert({ id: input.request_id, client_id: input.client_id, trainer_id: actorId,
    name: input.name, status: "draft", weeks: 4, data, coach_edits: {} }).select("id,updated_at").single();
  if (saved.error?.code === "23505") {
    // A parallel/retried save can only acknowledge an identical owned draft.
    const duplicate = await db.from("programs").select(SET_COLUMNS).eq("id", input.request_id).maybeSingle();
    const row = duplicate.data;
    if (!duplicate.error && row && row.status === "draft" && row.client_id === input.client_id && row.trainer_id === actorId
        && row.name === input.name && isExerciseSet(row.data) && row.data.note === input.note
        && JSON.stringify(exerciseSetIds(row.data)) === JSON.stringify(input.canonical_ids)) {
      return { id: row.id as string, updated_at: row.updated_at as string, deduped: true };
    }
    throw new ExerciseSetError("This save reference is already in use. Reopen the saved set before retrying.", 409);
  }
  if (saved.error || !saved.data) throw new ExerciseSetError("Unable to save the exercise set. Your selection is still on this screen.", 503);
  return { id: saved.data.id as string, updated_at: saved.data.updated_at as string, deduped: false };
}
