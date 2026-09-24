# Hosted schema recovery checkpoint — 2026-09-24

**Read-only production inspection. No DDL, migration-ledger edits, client data exports, branch creation, or production changes were performed.**

Project: `ims-coach-os` / `hatcusqagwpmebzsbolw`
Release: `release/ims-unified-2026-09` / draft PR #18

## Verified hosted shape

| Object | Count |
| --- | ---: |
| Public tables | 45 |
| Public views/materialized views | 21 |
| Public RLS policies | 88 |
| Public user triggers | 22 |
| Public functions | 64 |
| Hosted migration-ledger entries | 24 |

All 45 inspected public tables have RLS enabled. This does **not** mean every policy/grant is correct.

The hosted migration ledger begins on 2026-09-23 with private-artifact/security work. It does not contain the application's original schema history. Supabase's documented existing-project workflow treats a full remote schema pull as the baseline and requires replay/reset verification before relying on that history. Therefore a hosted branch created from the current ledger is not yet accepted as a faithful reconstruction.

## Security-advisor findings to resolve/rehearse

- `intake_tokens`: RLS enabled with no policy. This is intended to remain service-only; do not add a client policy merely to silence the advisor. Verify table grants during baseline recovery.
- `citext` extension currently lives in `public`; evaluate moving it only in staging because extension relocation can affect dependent objects.
- Four public SECURITY DEFINER functions remain executable by `authenticated`: `is_owner()`, `is_trainer()`, `increment_session_counter(...)`, `decrement_session_counter(...)`. The release must explicitly justify/restrict their EXECUTE grants. Do not blindly revoke role helpers before replaying RLS because policies depend on them.
- Supabase leaked-password protection is disabled. Treat enabling it as an Auth configuration launch gate, separate from SQL replay.

## Baseline recovery rule

Do **not** manufacture a migration-ledger baseline by inserting history rows or by applying the numbered repository migrations to production. The repository has two historical SQL tracks (`packages/db/migrations` and `supabase/migrations`) and neither alone has been proven to reconstruct the current hosted database.

The acceptable baseline artifact is schema-only: no rows from `auth.users`, clients, profiles, sessions, payments, messages, assessments, notes, leads, waivers, Stripe events, or storage objects.

It must preserve/review at minimum:
- schemas, extensions and types;
- tables, columns, defaults, constraints and indexes;
- functions/procedures and function grants;
- triggers;
- views with security mode;
- RLS enablement and policies;
- table/schema/sequence grants;
- storage schema customizations only if IMS has modified them.

## Reconciliation sequence

1. Obtain an authenticated Supabase CLI session and link **read-only recovery work** to the hosted project.
2. Pull/dump the complete schema into a dedicated recovery branch; inspect generated extension/drop statements before committing.
3. Replay the baseline into an empty local/staging database and compare object counts/definitions against this hosted inventory.
4. Reconcile the 24 hosted ledger entries and repository SQL into a single forward history **without editing production migration metadata first**.
5. Re-run a clean reset/replay. Only after it reproduces the baseline should `ims-release-qa` be created.
6. Apply the four unified release migrations to staging in documented order, then run synthetic owner/trainer/two-client, booking, recurring, package, Stripe-test and notification tests.
7. Run Supabase security/performance advisors again and resolve or explicitly accept every launch-relevant finding.

## Stop conditions

Stop before production metadata or DDL changes if replay differs on authorization, billing/session constraints, function grants, triggers, or client-visible views. Never use production client data to make staging tests pass.
