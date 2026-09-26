# Integrated growth + inline prescription checkpoint

Build base: 0066ab2524f4ea179fb0994943abccece6710e1b (quality gate #774).

## Implemented
- The actual library picker captures sets, reps/time, load, target RPE, rest, tempo and cues before saving to a client profile.
- Saves and reopens preserve dosage; conversion copies it into the existing private program draft. Empty fields remain empty. Exercise identity, mapping approval and client publication are not changed by dosage edits.
- Owner Growth Center connects editable campaign plans, budget ceilings, incurred-spend evidence, research reviews, follow-up dates, outreach drafts and explicit attribution to existing inquiries and clients.
- Research Desk is a direct owner navigation destination, including mobile More. Permanent Today / Clients / Schedule / Actions tabs remain unchanged.
- Research approval never creates an inquiry, changes the research source, implies consent, sends outreach or creates a client.
- Growth writes use a single owner-authorized database transaction: state, audit and idempotency ledger succeed together or roll back. Direct authenticated table writes are revoked. Stale versions require a refresh.
- Revenue display counts deduplicated successful USD payment records only for explicitly mapped converted inquiries and owner-selected UTC start dates. Research, declined payments and fully refunded records do not inflate it.

## Rollout
Migration: `packages/db/migrations/0045_growth_workspace.sql` (additive). Test against the included synthetic PGlite fixture before applying to hosted Supabase. No source-client data should be created for testing in hosted environments.

The `/growth` page fails visibly, without fake totals, when schema or evidence reads are unavailable. Source read errors never imply empty pipeline or zero revenue.

`vercel.json` disables automatic Git deployments for `release/ims-unified-2026-09` only. After the exact consolidated HEAD passes source verification, regression/security tests, strict lint, production build and TypeScript, create ONE manual preview for that exact SHA. No production promotion is part of this build.

## Deliberate boundaries / remaining work
- Paid research execution is NOT connected. Campaign budgets are planning records, not authorization to charge. Spend entries record incurred costs, not charges initiated by Coach OS.
- No advertising campaigns activated, no data purchased, no messages sent, no QuickBooks writes and no Vagaro work.
- Successful-payment attribution is NOT accounting net revenue or profit: Stripe fees, partial-refund detail and payout reconciliation are not exposed by this evidence model. Those must be reconciled before ROAS/net-profit claims.
- Consultation count uses existing inquiry booking evidence; no booking or attendance is invented.
- Cross-run research duplicates are flagged by organization hostname, not automatically merged or deleted.
- Existing repo migrations 0043 (payroll reviews) and 0044 (staff operations) were absent in the hosted schema during this pass. They require their own verified rollout; this growth build does not silently apply them.
- Manual preview QA remains required on real phone/desktop sessions after deployment; passing CI is not a claim that every live interaction was exercised.
