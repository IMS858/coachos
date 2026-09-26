import {FUEL_UUID, type PlanVersion} from "./model";
export type AdjustmentContext = {clientId: string; entryId: string; current: PlanVersion | null; latest: PlanVersion | null};
/** Reuse a newer draft instead of overwriting it or repeatedly copying an older release. */
export function fuelAdjustmentState({clientId, entryId, current, latest}: AdjustmentContext) {
  if (!FUEL_UUID.test(clientId) || !FUEL_UUID.test(entryId) || !current || !latest
    || !FUEL_UUID.test(current.id) || !FUEL_UUID.test(latest.id)
    || !["coach_authored", "source_transcription", "ai_proposed"].includes(current.origin)
    || current.client_id !== clientId || latest.client_id !== clientId
    || !Number.isSafeInteger(current.revision) || current.revision < 1
    || !Number.isSafeInteger(latest.revision) || latest.revision < current.revision
    || (latest.revision === current.revision && latest.id !== current.id)
    || (latest.id === current.id && latest.revision !== current.revision)) {
    return {kind: "unavailable" as const};
  }
  if (latest.id !== current.id) return {kind: "existing_draft" as const, revision: latest.revision};
  return {kind: "ready" as const, expectedRevision: latest.revision, nextRevision: latest.revision + 1,
    // Structural provenance only. Never place private rationale in a potentially released source_reference.
    sourceReference: "checkin:" + entryId + "; base_version:" + current.id + "; origin:" + current.origin};
}
export function fuelAdjustmentDraft(context: AdjustmentContext, requestId: string) {
  const state = fuelAdjustmentState(context);
  if (state.kind !== "ready" || !context.current || !FUEL_UUID.test(requestId)) throw new Error("Refresh the reviewed check-in and continue the latest private draft.");
  return {action: "save_plan" as const, request_id: requestId, expected_revision: state.expectedRevision,
    content: structuredClone(context.current.content), origin: context.current.origin, source_reference: state.sourceReference};
}
