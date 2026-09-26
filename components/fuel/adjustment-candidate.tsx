"use client";
import {useState} from "react";
import type {PlanVersion} from "@/lib/fuel/model";
import {fuelAdjustmentDraft, fuelAdjustmentState} from "@/lib/fuel/adjustment";
import {MutationStatus, useFuelMutation, primaryClass, secondaryClass} from "./controls";
export function FuelAdjustmentCandidate({clientId, entryId, current, latest}: {clientId: string; entryId: string; current: PlanVersion | null; latest: PlanVersion | null}) {
  const mutation = useFuelMutation(clientId), [open, setOpen] = useState(false);
  const context = {clientId, entryId, current, latest}, state = fuelAdjustmentState(context);
  if (state.kind === "unavailable") return <div className="mt-3 space-y-3"><p className="text-xs text-cream-dim">A released plan and its latest version must be available before creating an adjustment draft.</p><MutationStatus mutation={mutation}/></div>;
  if (state.kind === "existing_draft") return <div className="mt-3 rounded-xl border border-divider p-3"><p className="text-sm">Private version {state.revision} already exists. Continue that draft instead of replacing it with an older prescription.</p><a href="#fuel-plan" className={secondaryClass}>Continue latest private draft →</a><MutationStatus mutation={mutation}/></div>;
  return <div className="mt-3 space-y-3 rounded-xl border border-divider bg-surface-soft p-4">
    <p className="text-sm font-semibold">Plan adjustment</p>
    <p className="text-xs leading-5 text-cream-dim">Create a private copy with the same prescription. The check-in and original version remain linked; AI/source provenance is preserved. Nothing changes for the client until you edit, review and explicitly publish the saved version.</p>
    {!open ? <button type="button" className={secondaryClass} disabled={mutation.disabled} onClick={() => setOpen(true)}>Create private adjustment candidate</button>
      : <form onSubmit={event => {event.preventDefault(); void mutation.submit(fuelAdjustmentDraft(context, crypto.randomUUID()));}}>
        <fieldset disabled={mutation.disabled} className="space-y-3"><legend className="sr-only">Create a private adjustment draft</legend>
          <p className="text-xs leading-5 text-cream-dim">This creates private v{state.nextRevision}, not a client release. No calories or macros are changed automatically. Cancel closes this unsaved choice; it does not record a clinical decision.</p>
          <div className="flex flex-wrap gap-2"><button className={primaryClass} type="submit">Create private v{state.nextRevision}</button><button className={secondaryClass} type="button" onClick={() => setOpen(false)}>Cancel</button></div>
        </fieldset>
      </form>}
    {/* Keep ambiguous-save recovery visible and outside the disabled form. */}
    <MutationStatus mutation={mutation}/>
    {mutation.message && <a href="#fuel-plan" className={secondaryClass}>Review the saved private draft →</a>}
  </div>;
}
