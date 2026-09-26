# Fuel & Performance — integrated build

## Scope and publication

This module extends the existing durable clients and body_comp_records. No client is created or assigned from a name in a PDF. No source upload in ChatGPT is automatically a published prescription or a recorded assessment.

The nine-page Fire Academy Fuel Plan informed the five-phase scaffold, separate training/rest targets, meal ideas, swaps, groceries, scorecard and weekly questions. Individual dates, targets and measurements are NOT seeded or placed in the repository. The academy scaffold supplies structure only; numeric targets are blank. The application's input validation limits are not clinical safety thresholds.

Staff entry: `/fuel` or `/clients/[id]/fuel`. Client entry: `/fuel`. The module supports habit-only coaching without assessments, or individually reviewed targets. A plan save creates an immutable private version. Explicit release selects that exact saved version; new drafts do not replace it. Pause is an appended release with no active version. Former releases remain historical snapshots. AI provenance is supported for imported drafts, but there is no new LLM generation/provider integration in this block.

## Evidence and measurement

Daily habits have four states: reported met, reported not met, not due, and not reported. Coverage and adherence are separate; missing days are not failures. The report shows a 28-day journal window and a seven-day weight average only with at least three reported weights. Scale change is not fat loss, and lean mass is not a muscle-specific measure.

The calendar supplies context, not a rest-day inference. Clients explicitly select training/rest/unclassified so independent training is not misclassified. No class booking, appointment or package is completed by a journal entry.

Body composition writes use the existing `body_comp_records` plus immutable private source/protocol snapshots. The actual measurement date, person, method and report are required for a source transcription. Future projections cannot be saved as measurements. Legacy fields are not silently repaired. The original source's fixed measurement-noise thresholds, guaranteed lean-mass promises and calorie adjustment rules are not executable clinical rules.

Macro checks report 4/4/9 arithmetic discrepancies without replacing source values. A weekly check-in creates a coach-review item. A corrected entry reopens review. A coach response does not alter calories, create a prescription, send communications or constitute medical diagnosis. Contact and referral outcomes require human follow-through; the inbox is not continuous monitoring.

## Portability and templates

Habit and five-phase academy scaffolds are available in the coach editor. JSON export/import carries typed plan content, not auth identities or measurements. Cross-client reuse requires individual editing/review, not automatic template publication. Authenticated plan print view uses the IMS logo and saved version; browser Print/Save PDF is supported. It is a new structured snapshot, not a pixel-identical reproduction of the uploaded PDF. Automatic PDF extraction, food-database integrations and automated meal nutrient equivalence are not implemented.

## Rollout

`0078_fuel_performance.sql` is staged in the repository, not automatically applied to hosted Supabase. Run the full test suite and rehearse with the existing client/body-comp schema before controlled rollout. New module pages disclose unavailable storage and disable editing rather than invent empty results. No Vercel deploy, real client plan publication, source measurement, notification, billing action, QuickBooks operation or Vagaro change is part of this build.

Authorization is rechecked in both the request handler and database command. Owner or assigned active coach can author/release/measure/respond; active clients may report only their own daily/weekly entries. Unrelated trainers, other clients, anonymous callers and disabled profiles are excluded. New tables are select-only through RLS; commands append records plus receipts and audit in one transaction. Per-client row locks serialize revisions. Request receipts reject changed-payload reuse; updates, deletes and truncates cannot silently rewrite new history.

Physical iPhone/Safari acceptance, hosted schema compatibility, and original-source verification remain release gates. Existing database-baseline and calendar migration blockers are not resolved by adding this module.
