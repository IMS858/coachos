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

Owner Dashboard, Action Center, Communications and Lead Reports use the same source-aware inquiry classification. Current inquiry metrics no longer count historical imports as prospects. Exercise selections are excluded from program-completion queues. Incoming messages are defined by client sender, unread state and archive timestamp; outgoing replies from any staff member are excluded.

Services edits have explicit error states and validated fields. Catalog visibility does not authorize a new booking type or change Stripe prices.

Also fixes the actual repeated build failure in `sessions/[id]/respond`: duplicate `pushClient` import AND duplicate delivery call. Regression tests detect duplicate import bindings before the production build.

## Verification
- First integrated checkpoint `9c954df131bab7cef68bff508f0717e738751727`: GitHub PR quality run `36062529680` SUCCESS, 140 regression tests, zero-warning lint, production build and TypeScript.
- Subsequent cross-screen integration must pass its own quality run before acceptance. The prior success is not evidence for a newer head.
- Test data are synthetic; no real clients, source exercise approvals, service flags or historical lead records were changed by this development pass.

## Still open
- Authenticated owner/trainer UI acceptance for selection save/reopen and new lead/service views.
- Connect a chosen research execution provider and review/qualification flow; no autonomous sends.
- Translate a selected exercise collection into a fully prescribed, reviewable program.
- Native iOS authentication, Xcode build and APNs delivery acceptance remain separate unfinished work.
- No production promotion, hosted migrations, actual lead/client mutations or external messages are performed by this code checkpoint.
