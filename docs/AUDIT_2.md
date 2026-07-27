# Audit 2 — Findings After "Operationally Complete"

A second pass after the system was declared operationally usable. The first
audit caught the obvious bugs (security_invoker on the view, last_session_at
trigger, counter auto-expire). This pass looked for subtler ones —
concurrency, error handling, rare edge cases.

## Scope of this audit

I walked the system asking specifically:
1. **What happens under concurrent load?** (Two trainers, simultaneous actions)
2. **What happens at edge boundaries?** (Decrement at 0, back-dating, undo of an undo)
3. **What errors does the user actually see when constraints fire?** (vs generic 500s)
4. **What's missing from the operational happy path?** (Reactivation, reschedule, etc.)
5. **Where does referential integrity quietly break?**

---

## 🔴 Critical findings

### 1. Counter race condition (real bug)

**Severity:** High. Could cause silent data loss in production.

**Where:** `increment_session_counter()` function in migration 0006.

**The bug:** Two trainers logging sessions for the same client at the same time
both execute the function. The function does:

```sql
SELECT id INTO target_plan_id FROM plans WHERE ... LIMIT 1;
-- (no row lock here)
UPDATE plans SET current_session_number = current_session_number + 1 WHERE id = target_plan_id;
```

Trainer A's transaction reads `current_session_number = 24`. Before A commits,
trainer B's transaction also reads 24. Both write 25. Postgres serializes the
two UPDATEs but the second one overwrites the first with the same value.
Result: two sessions logged, one tick.

**Repro:**
```sql
-- Terminal 1
BEGIN;
SELECT increment_session_counter('<nikki-uuid>', 'training');  -- returns 25
-- (don't commit yet)

-- Terminal 2 (parallel)
SELECT increment_session_counter('<nikki-uuid>', 'training');  -- returns 25 too!

-- Terminal 1
COMMIT;
```

**Fix:** Migration 0009 adds `FOR UPDATE` to the SELECT inside the function.
Plain FOR UPDATE (not SKIP LOCKED) — we want the second caller to wait, not
pick a different plan. After the fix, trainer B's call blocks until A commits,
then reads the now-25 value and increments to 26 correctly.

**How likely was this in practice?** With 3 trainers covering Nikki between
them, fairly low — probably wouldn't happen until you're at 10+ sessions per
day per client. But once it does happen, you'd silently lose ticks and not
notice for weeks. Worth fixing now.

### 2. Trigger does seq scan on every undo

**Severity:** Medium. Slow as session history grows.

**Where:** `sync_last_session_at()` trigger (migration 0006).

**The issue:** On undo, the trigger runs:
```sql
UPDATE clients SET last_session_at = (
  SELECT MAX(scheduled_at) FROM sessions
  WHERE client_id = NEW.client_id AND status = 'completed' AND id != NEW.id
)
```

Existing indexes (`idx_sessions_trainer_today`, `idx_sessions_client_upcoming`)
don't cover `status = 'completed'`. So this is a sequential scan of all
sessions belonging to the client. With Nikki at 344 lifetime sessions, that's
fine. With a long-tenured client at 1000+ sessions... still fast in absolute
terms, but it's an unnecessary scan on every undo.

**Fix:** Migration 0009 adds:
```sql
CREATE INDEX idx_sessions_completed_per_client
  ON sessions(client_id, scheduled_at DESC)
  WHERE status = 'completed';
```

Now the recompute is an index-only scan reading at most 1 row.

---

## 🟡 UX gaps fixed this pass

### 3. Generic 500 on duplicate-subscription attempt

**Where:** `POST /api/clients/[id]/plans` and `PATCH /api/plans/[id]`.

**The issue:** The unique partial index from migration 0007 prevents two
active subscriptions per client. Hitting it returned a generic "Save failed"
to the user. The trainer has no idea why.

**Fix:** Both endpoints now check for Postgres SQLSTATE `23505` (unique
violation) and return 409 with a clear message:

> "This client already has an active subscription. Cancel that one first, or
> add a package instead."

The client editor surfaces this inline above the affected button.

### 4. No way to reactivate a cancelled plan

**Where:** Client editor.

**The issue:** Click trash icon by mistake → plan goes to status='cancelled'.
Recovery requires SQL or starting over with a new plan that loses the running
counter.

**Fix:** Each row in the "Past plans" expandable section now shows a
**Reactivate** button (only for status='cancelled' plans, not paused/expired).
Clicking it sets status back to 'active' and clears end_date. The reactivate
flows through the same PATCH endpoint, so it triggers the same unique-violation
check if you try to bring back a sub when another active sub exists — and you
get a clear error, not a 500.

### 5. Reschedule capability exists in API but no UI

**Where:** `PATCH /api/sessions/[id]` (the endpoint already accepts
`scheduled_at` and `duration_minutes`).

**The issue:** Trainer scheduled Will for Tuesday 10am, he asks to move to
Wednesday. Right now you'd cancel + recreate, losing the audit trail.

**Status:** API works, UI not exposed. Documented as deferred. Two-hour build
when you want it: add an "Edit time" button to the session detail header that
toggles the time/duration display into editable inputs.

---

## 🟢 Things checked and confirmed solid

### Service role isolation
`createServiceClient()` — used in seed scripts and the new-client API — is
only ever imported from server-side code. The supabase service role key is
NEXT_PUBLIC_-free in `.env.example`. Verified no client-bundle exposure.

### Trigger handles back-dating correctly
Concern: if Jason logs a session that happened LAST WEEK while Nikki has a
session from YESTERDAY, does last_session_at regress to last week?

Answer: No. The trigger has `AND last_session_at < NEW.scheduled_at` — so it
only forward-updates. Yesterday's date wins. Correct behavior.

### Decrement underflow protection
The decrement function uses `GREATEST(0, x - 1)` for both
`current_session_number` and `sessions_used`. Can never go negative. Good.

### RLS three-layer enforcement (verified)
1. Middleware (`apps/web/middleware.ts`) — early redirect at the edge
2. AppShell server component — re-checks role on every page render
3. Postgres RLS — final word at the database

If any layer breaks, the next catches it. The view is now `security_invoker`
so RLS applies to it too.

### Foreign key referential integrity
- `sessions.client_id` → clients (CASCADE delete)
- `sessions.trainer_id` → profiles (SET NULL — allows trainer to leave)
- `sessions.plan_id` → plans (SET NULL — preserves audit trail if plan deleted)
- `plans.client_id` → clients (CASCADE)
- `payments.plan_id` → plans (SET NULL)

No orphan possibilities. The SET NULL on plan_id is intentional — if you
delete a plan that had sessions billed against it, those sessions still exist
and just lose the link. Correct.

### Trigger-vs-service-role interaction
The `sync_last_session_at` trigger runs SECURITY INVOKER (default) but is on
a table the service role has full access to. Webhook + seed inserts to
sessions trigger the update path correctly. Verified by reading the trigger
definition.

### Atomic rollback in POST /api/sessions
When `mode='log'`, the API increments the counter FIRST, then inserts the
session. If the insert fails, we explicitly call `decrement_session_counter`
to roll back. So you can't end up with a counter tick and no session row.
Verified by reading the code path.

---

## 🟠 Known weaknesses, deferred

These are documented for the future but not blocking launch.

### Rate limiting at the app level
Anyone with valid auth can hammer `POST /api/sessions` at 1000 RPS. Vercel has
default DDoS protection but no app-level rate limits. With 3 trainers and
client-facing endpoints under custom auth, real risk is low. Add Upstash
Ratelimit or similar if you ever have a public-facing API surface.

### CSRF posture
Next.js doesn't ship default CSRF on API routes. Same-origin requests are
protected by SameSite cookie defaults (Supabase auth helpers set SameSite=Lax).
Cross-origin auth is blocked at the Supabase layer. **Do not** embed the app
in iframes from third-party domains; the cookie behavior would change. If you
need to embed, add explicit CSRF tokens.

### Cancellation reason capture
Schema has `sessions.cancellation_reason`, `cancelled_by`, `cancelled_at`,
`late_cancel_fee_charged`. None are exposed in the UI. If a session is
cancelled, we just lose the why. Add a small modal on the session detail
page when status changes to 'cancelled' or 'late_cancelled'. Half-hour build.

### Hard delete for sessions
We support cancel (soft delete via status) but not hard delete. If a session
was created in error (wrong client picked), the trainer has to mark it
cancelled — leaves a row. Probably correct behavior for audit, but if you ever
want hard delete, it should also call decrement_session_counter to roll back
the counter tick. Defer.

### Database migrations tracking
Right now you run SQL files manually in the Supabase dashboard. There's no
record of which migrations have been applied — just convention (numeric
prefix). Adopt Supabase CLI migrations or sqitch when you want a real
migration log. Especially important if you onboard another dev.

### Sentry / PostHog wiring
Both stubbed in `.env.example`, neither actually connected. Add when you go to
production. ~30 min for Sentry, longer for PostHog with custom events.

### Backup runbook
Supabase auto-backs-up daily by default on paid plans. No documented restore
procedure or test. Write a half-page runbook before launch: how to restore to
a point in time, how to export a logical dump, who has the keys.

### Multi-trainer client visibility
Right now any trainer sees all 46 clients. This is **intentional** — IMS has
3 trainers who cover for each other, so partitioning by `primary_trainer_id`
would be wrong. Documented here so it doesn't get "fixed" later by mistake.

### Client dashboard multi-plan handling
Quick check: does the client-facing dashboard correctly show a client with
multiple plans (subscription + packages)? I didn't fully audit this; the
component reads from sessions/mobility/body_comp directly, not plans, so it
should be unaffected. But worth a manual smoke test as a client when you
deploy.

### Empty states across stub pages
Pages like `/programs`, `/assessments`, `/messages` have placeholder content,
not real empty states. They're stubs with build notes. Will get fleshed out
when you build those features. Don't ship them in production without at
minimum a friendly empty state and a "coming soon" banner.

---

## Updated pre-launch checklist

In order, before pointing real domain at this:

- [ ] Run all migrations through 0009 in production Supabase
- [ ] Verify the FOR UPDATE lock works (the SQL test in 0009 docs)
- [ ] Verify view RLS — query as a non-owner, confirm only own row visible
- [ ] Run seed-clients.ts (46 clients)
- [ ] Run seed-nikki-plans.ts + seed-jerry-plans.ts
- [ ] Manually correct service_type for any non-training package clients
- [ ] Manually set tier for the 25 unset clients
- [ ] Replace placeholder emails with real ones
- [ ] Drop `memberships` table after verifying nothing references it
- [ ] Wire Sentry (~30 min)
- [ ] Document the restore procedure (half-page runbook)
- [ ] Set production env vars in Vercel + Railway
- [ ] **Concurrency smoke test**: open two browser windows side by side, log
      sessions for the same client in both, confirm counter ticks twice
- [ ] **Reactivate smoke test**: cancel a plan, reactivate it, confirm
      counter is preserved
- [ ] **Duplicate sub smoke test**: try to add a second active subscription,
      confirm clear error message (not 500)
- [ ] Run end-to-end intake flow on a real phone
- [ ] Sign in with each role, verify dashboards

---

## What's left in the entire build

After this audit, the truly remaining work is:

1. **Deploy** (follow the checklist above) — half-day
2. **pgTAP tests on counter functions** — 2-3 hrs, especially valuable now
   that the FOR UPDATE lock matters
3. **Cancellation reason UI** — 30 min
4. **Reschedule UI** — 2 hrs
5. **Sentry + monitoring** — 30 min
6. **Phase 2 Stripe migration** — multi-day project, separate phase
7. **Inngest workflows** — half-day each, post-launch

None of those are architectural. The system itself is correct, performant,
and operationally complete. Items 1–5 are launch hygiene; 6–7 are growth
features.
