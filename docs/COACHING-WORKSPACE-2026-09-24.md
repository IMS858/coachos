# Coaching workspace release checkpoint

## Product corrections requested by owner
- Exercise Catalog becomes the full working source library, not the review dashboard.
- Browse all source entries, search/filter, select/reorder a set, and save it to a client profile.
- Services puts Personal Training first; other catalog records are preserved under supporting administration.
- Historical contacts are not qualified leads. New business, Contacts and Research are separate workspaces.

## Implemented boundary
Exercise selections reuse existing `programs` rows with `status=draft`, `data.source=ims_exercise_set`, and `visibility=coach_only`. Source IDs and names are snapshots; an unconfirmed match never becomes an assigned exercise ID. One-row writes are atomic, repeated creates use stable IDs, and edits use optimistic concurrency. General program editing refuses to publish/transform these collections. These are NOT prescribed workouts and no client messages or approval flags are changed.

The full source library is paged, not capped at the prior 200 displayed exercises. Saving selections does not require a new table or migration. Existing draft-program RLS keeps them private. Hosted authenticated acceptance is still required.

New business is classified from explicit inquiry sources or preserved website inquiry evidence. Historical import source labels remain unchanged. Research candidates are isolated from the active sales pipeline. The Research Desk exports an agent brief and accepts bounded, source-linked organization research; it does NOT yet run an autonomous research agent, verify source claims or send outreach.

Services edits have explicit error states and validated fields. Catalog visibility does not authorize a new booking type or change Stripe prices.

Also fixes the actual repeated build failure in `sessions/[id]/respond`: duplicate `pushClient` import AND duplicate delivery call. Regression tests detect duplicate import bindings before the production build.

## Still open
- Align every legacy dashboard inquiry KPI with the new source-aware pipeline model.
- Connect a chosen research execution provider and review/qualification flow; no autonomous sends.
- Translate a selected exercise collection into a fully prescribed, reviewable program.
- Native iOS authentication, Xcode build and APNs delivery acceptance remain separate unfinished work.
- No production promotion, hosted migrations, actual lead/client mutations or external messages are performed by this code checkpoint.
