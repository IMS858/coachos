# Audit 2 — Concurrency Fix + UX Polish

Second integration audit. Found one **real concurrency bug** and a few smaller
issues. All fixes shipped in this bundle.

## What this delivers

### 🔴 Critical: counter race condition fix
The most important thing in this bundle. `increment_session_counter` had a
SELECT-then-UPDATE pattern with no row lock. Two trainers logging sessions
for the same client at the same time could both read `current_session_number=24`,
both write 25, and end up at 25 instead of 26 — silently losing a tick.

Migration 0009 adds `FOR UPDATE` to lock the chosen plan row so concurrent
callers serialize correctly.

### 🟡 Index for trigger performance
The `sync_last_session_at` trigger does a sequential scan when undoing a
completion. Added a partial index on completed sessions for fast lookup.

### 🟡 Better error messages on duplicate-subscription attempts
When the unique partial index from migration 0007 fires (two active
subscriptions on same client), users used to see a generic "Save failed."
Now they see: *"This client already has an active subscription. Cancel
that one first, or add a package instead."* (HTTP 409.)

### 🟢 Reactivate cancelled plans
Click trash by mistake → no longer requires SQL to recover. Each cancelled
plan in the past-plans section now has a **Reactivate** button. Re-runs
through the same constraint check, so it surfaces a clear error if the slot
is taken.

## Files in this bundle

```
audit2/
├── packages/db/migrations/
│   └── 0009_concurrency_and_indexes.sql        ← FOR UPDATE lock + completed-sessions index
├── apps/web/
│   ├── app/api/
│   │   ├── clients/[id]/plans/route.ts         ← 409 on unique violation
│   │   └── plans/[id]/route.ts                 ← reactivate + 409 handling
│   └── components/clients/
│       └── client-editor.tsx                   ← Reactivate button
├── docs/AUDIT_2.md                             ← full findings doc
└── README.md
```

## Apply

```bash
unzip ims-coach-os-audit2.zip
cd ims-coach-os/

# Migration
cp ../audit2/packages/db/migrations/0009*.sql packages/db/migrations/
# Run in Supabase SQL editor

# App code (overwrites existing files)
cp ../audit2/apps/web/app/api/clients/[id]/plans/route.ts apps/web/app/api/clients/[id]/plans/route.ts
cp ../audit2/apps/web/app/api/plans/[id]/route.ts apps/web/app/api/plans/[id]/route.ts
cp ../audit2/apps/web/components/clients/client-editor.tsx apps/web/components/clients/client-editor.tsx
cp ../audit2/docs/AUDIT_2.md docs/
```

## Verify the race condition fix

The migration includes a SQL test you can run. Two psql terminals:

```sql
-- Terminal 1
BEGIN;
SELECT increment_session_counter('<nikki-uuid>', 'training');
-- Returns the new session number (say 25). Don't commit yet.

-- Terminal 2 (in parallel)
SELECT increment_session_counter('<nikki-uuid>', 'training');
-- Should HANG, waiting for Terminal 1 to release the lock.

-- Terminal 1
COMMIT;

-- Terminal 2 unblocks and returns 26 (correct).
```

Without the fix, Terminal 2 would have returned 25 (silent dupe).

## What's still on the master list

After this:

| # | Item | Status |
|---|---|---|
| 1–17 | Core build through Quick Log/New Session form | ✅ |
| 18 | Drop `memberships` table | ⏳ 1 SQL line |
| 19 | Deploy to production | ⏳ follow audit checklist |
| 20 | Phase 2 Stripe migration | ⏳ multi-day |
| 21 | Inngest workflows | ⏳ half-day each |
| 22 | pgTAP counter tests | ⏳ 2-3 hrs (high value now) |
| 23 | Cancellation reason UI | ⏳ 30 min |
| 24 | Reschedule UI | ⏳ 2 hrs |
| 25 | Sentry + monitoring | ⏳ 30 min |

The architectural work is done. Items left are launch hygiene + growth
features. Read `docs/AUDIT_2.md` end-to-end before deploy.
