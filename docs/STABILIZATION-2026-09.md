# Stabilization checkpoint — September 24, 2026

**Release candidate only. No production promotion, live DDL, customer record changes,
Vagaro edits or test email/payment sends were performed.** This work belongs to
[unified draft PR #18](https://github.com/IMS858/coachos/pull/18).

## What changed

- Stripe event effects and completion marker now commit together. Unique checkout,
  subscription and payment identities stop replay duplication. Early invoices retry;
  late failed invoices cannot overwrite successful ones. Subscription snapshots are
  refreshed. Each successful refund is recorded once under its own refund ID.
- Completion/undo, new past-session logging, late cancellation and no-show/undo each
  lock the session and update its original package in one transaction. New staff
  sessions use a stable request ID. Undo refuses ambiguous legacy billing linkage
  instead of guessing which package to credit. Existing package overrun behavior
  remains visible. Pending booking requests do not incur cancellation debits.
- The existing cancellation API's 24-hour rule is preserved and reminder copy is
  aligned. Owner confirmation of the business policy remains part of pilot acceptance.
- Trainer conflicts are enforced by a staged PostgreSQL exclusion constraint for
  scheduled/confirmed appointments, including moves and recurrence inserts. Adjacent
  appointments are allowed. No room-capacity or group-session rule was invented.
- Reminders cover the next 30 hours, with a five-minute lease, immutable payload,
  provider idempotency key and checked acknowledgement. Ambiguous deliveries older
  than 23 hours require reconciliation before retrying beyond provider key expiry.
- Client week/day labels and staff session input use Pacific time explicitly.
  DST, midnight and week-length boundaries have regression tests.
- Inherited lint errors are repaired, including component identity and state reset
  issues. Lint now requires zero warnings. A PostgreSQL 16 service exercises genuine
  concurrent connections in CI; local tests use isolated PGlite.

## Verification scope

Local verification: 60 tests pass, strict lint has zero warnings, and the Node 20
production build and standalone TypeScript checks pass. The CI job additionally runs concurrent completion, competing
trainer bookings and duplicate checkout workers against PostgreSQL 16. Its result
must be green for the exact PR head before accepting this checkpoint. The first
PostgreSQL run proved one overlapping writer is rejected; it exposed that PostgreSQL
may return a deadlock rejection (40P01) as well as an exclusion violation (23P01).
The API now handles both, and the test retries the loser to verify persistent
conflict rejection. Vercel successfully built the initial stabilization commit.

The synthetic database fixture matches the inspected billing/session column contract;
it is **not** a complete production schema reconstruction. No migrations were applied
to the live project. Read-only production preflight found zero duplicate Stripe
payment/subscription identities, zero invalid session durations and zero overlapping
scheduled/confirmed trainer pairs. Re-run these checks immediately before migration.

## Migration order and rollout

1. Reconcile the numbered and timestamped migration histories and establish a clean
   staging baseline. Record extensions, policies, triggers, grants and storage rules.
2. Back up production and demonstrate restoration to an isolated staging project.
3. Apply these new migrations to staging in order:
   - `20260924060916_atomic_billing_and_completion.sql`
   - `20260924060925_reliable_notification_delivery.sql`
   - `20260924061853_trainer_booking_exclusion.sql`
4. Re-run replay, failure, concurrent booking and role-isolation tests against staging.
   Exercise actual Stripe test-mode signatures, event order and partial refunds.
   Verify email retry with a controlled test recipient and provider logs.
5. Check existing Stripe identity duplicates, overlapping active trainer intervals,
   duration validity and legacy charged sessions without a linked plan. Reconcile
   exceptions explicitly; never delete records to make a constraint pass.
6. Migrations are additive but required by the new APIs. Apply approved schema changes
   before the application promotion. Verify each RPC exists with the intended grants.
   A preview using the old schema can render public pages but cannot exercise the
   new billing/session/reminder mutations successfully.
7. Run owner, trainer and two-client journeys; capture exact application/generator
   SHAs, schema version, deployment IDs, settings and results. Promote only after
   those gates and source-data review are complete.

### Rollback

Stop rollout for incorrect balances, unauthorized access, duplicate payments,
recurring gaps or sustained mutation errors. Keep Stripe event delivery retryable;
do not acknowledge an event whose database transaction failed. Record affected event
and session IDs privately for reconciliation.

If only the application fails, restore the previously verified application deployment
and retain additive database changes. Be aware that older application paths lack the
new atomic guarantees; suspend affected workflows until repaired. Do not drop billing
columns or uniqueness constraints during an incident. Restore data only through the
rehearsed backup procedure with reconciliation of writes since the backup. The last
observed production Coach OS SHA was `41487409c0b89a9e2bccf8c5b779659714ee6bee`;
verify it remains the rollback target before rollout.

## Still required before launch

- Complete schema baseline, migration rehearsal, restore demonstration and regenerated
  database types. Review legacy counter RPC grants and direct write policies.
- Authenticated owner/trainer/client isolation and mobile UI acceptance, including
  messages, notes, assessments, PDFs, media and expired/deleted accounts.
- Qualified exercise mapping/review and paired generator staging acceptance.
- Private Vagaro reconciliation/import rehearsal and staff sign-off. No real client
  correction records belong in this public release document.
- Repository seed-data provenance/history review and runtime/branch protection checks.
- A scheduler cadence that permits prompt reminder retries and short-notice bookings;
  the existing daily cron still cannot guarantee those cases. Outbox retention and
  failure alerting require an operational policy.
- Explicit room/group booking rules and recurring-series recovery. The new exclusion
  constraint protects appointments, but series creation/generation is not yet one
  transaction; a failed generation can leave a series needing staff attention.

Track acceptance and ownership in [RELEASE-BACKLOG.csv](RELEASE-BACKLOG.csv). No item
is marked complete merely because a branch exists or a public page responds.
