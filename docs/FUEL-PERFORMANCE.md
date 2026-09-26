# Fuel & Performance — integrated build

## Scope and publication

This module extends existing durable clients and body_comp_records. No person is created or assigned from a PDF name. No ChatGPT source upload automatically becomes a published prescription or recorded assessment.

The nine-page Fire Academy Fuel Plan informed the five-phase scaffold, separate training/rest targets, meal ideas, swaps, groceries, scorecard and weekly questions. Individual dates, targets and measurements are NOT seeded or placed in the repository. The academy scaffold supplies structure only; numeric targets are blank. Input limits are structural validation, not clinical safety thresholds.

Staff entry: `/fuel`, Client Profile coach actions, mobile More, desktop sidebar or Owner Control Center. Client entry: `/fuel`, Today card, Progress link or desktop sidebar. Action Center includes a separately counted Fuel review queue. Core mobile bottom tabs remain unchanged.

Habit-only coaching requires no calorie target or assessment. Plan save creates an immutable PRIVATE version. Explicit individual coach review and release selects that exact saved version; new drafts never replace it. Pause is an appended release with no active version. Former releases remain historical snapshots. AI provenance is supported for imported drafts, but no new LLM generation/provider integration is enabled in this block.

## Evidence and measurement

Daily habits have four states: reported met, reported not met, not due, and not reported. Coverage and adherence are separate; missing days are not failures. The workspace shows a 28-day journal window and a seven-day weight average only with at least three reported weights. Scale change is not fat loss; lean mass is not a muscle-specific measurement.

The calendar supplies context, not rest-day inference. Clients explicitly select training/rest/unclassified so independent training is not misclassified. No appointment, class or package is completed by a journal entry.

Body composition uses existing `body_comp_records` plus immutable private source/protocol snapshots. Actual measurement date, person, method and report are required for a source transcription. Future projections cannot be saved as measurements. Legacy fields are not silently repaired. The original source's fixed noise thresholds, guaranteed lean-retention promises and calorie-adjustment rules are not executable clinical rules.

Macro checks report 4/4/9 arithmetic discrepancies without replacing source values. Weekly check-ins create coach-review items. Corrections reopen review for the exact new entry. A coach response does not alter calories, send communications or diagnose disease. Contact/referral outcomes require human follow-through; this is not continuously monitored care.

## Private original PDFs

`/clients/[id]/fuel/sources` stores original PDF bytes in a private `fuel-sources` bucket with SHA-256 and immutable source registry. Requires active owner or assigned coach. Raw PDFs are not client-published and no automatic extraction/measurement import occurs. Client and trainer identities are checked before any service storage client is created. Source registration is a service-only command which revalidates the server-observed actor. Never invent owner JWT claims.

Uploads are bounded to 3 MB in the application to fit the deployment request-body budget, PDF-signature checked, and upsert is disabled. The bucket's 8 MB storage ceiling does not expand that application limit. A failed registration can leave private orphan bytes; the UI explicitly says unconfirmed and retries the exact file, verifies matching hash/size, then resumes registration. Different bytes cannot overwrite the same source identity. Source downloads use brief authenticated signed URLs and forced download. Original report values are preserved, not silently reconciled against derived arithmetic. A full PDF malware scan and a larger-file direct-upload flow remain outside this implementation.

## Portability and templates

Habit and academy scaffolds are in the coach editor. JSON export/import carries typed content, not auth identities or measurements. Cross-client reuse requires individual editing and release. The authenticated IMS-branded print view uses a saved version; browser Print/Save PDF is supported, not a pixel-identical reproduction of the original nine-page design. Automatic PDF parsing, food-database synchronization, automated substitution equivalence, supplement recommendations, clinical adjustment automation and paid Fuel AI generation are not implemented.

## Rollout and acceptance

Staged migrations: `0078_fuel_performance.sql`, then `0079_fuel_private_sources.sql`. Neither is automatically applied to hosted Supabase. Rehearse against the current hosted client/body-comp/storage schema before controlled rollout. Missing module storage shows unavailable and disables its forms rather than inventing empty results. No Vercel deployment, real client plan publication, source measurement, notification, billing action, QuickBooks operation or Vagaro change is part of this build.

New tables are select-only through RLS; commands append records, receipts and audit in a transaction. Per-client row locks serialize revisions. Request receipts reject changed-content reuse; update/delete/truncate cannot silently rewrite new history. An ambiguous save stays locked and retains its exact request even if a later retry returns a permission error. A valid success receipt locks the form until the confirmed revision refreshes, preventing another click from duplicating a measurement.

Tests execute real TypeScript/model logic, the actual route handlers and mutation hook, and both SQL migrations against isolated synthetic PostgreSQL. Source tests include broad-policy storage isolation, source byte preservation, registration rollback, identical orphan recovery, changed-file rejection and privilege checks. These are not authenticated physical iPhone or production schema acceptance.

Before client use: host-schema compatibility/rehearsal, apply reviewed migrations, one integrated preview, owner/assigned coach/unrelated coach/two-client auth acceptance, real iPhone/Safari upload and Print/Save PDF checks, and individualized plan review. Existing database-reproduction and calendar-data-migration blockers remain separate and unresolved by this module.
