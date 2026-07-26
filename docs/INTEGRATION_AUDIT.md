# Integration Audit — IMS Coach OS

This doc walks through the full system and flags what's solid, what was fixed
in this round, and what still needs work. Read it once before going live.

Last reviewed: end-to-end pass at refine bundle.

---

## 🔴 Critical bugs found and fixed

### 1. View RLS bypass (security hole)
**Where:** `client_billing_summary` view (created in migration 0005)
**Problem:** Postgres views by default run with the *view owner's* privileges, not the caller's. Any authenticated client could `SELECT * FROM client_billing_summary` and see every other client's billing data — bypassing the `clients` and `profiles` RLS policies entirely.
**Fix:** Migration 0007 adds `ALTER VIEW client_billing_summary SET (security_invoker = on)`. Now the view enforces RLS based on who's calling it.
**Verify in production:** After running 0007, query the view as a client. They should see only their own row.

### 2. `clients.last_session_at` never updated
**Where:** Owner dashboard at-risk list
**Problem:** The column existed in the schema but no code wrote to it. So every active client showed up as "at-risk" because the query is "OR last_session_at IS NULL." The dashboard was loud and useless.
**Fix:** Migration 0006 adds a trigger `sessions_sync_last_session_at` that updates the column when a session moves to `completed`. Also handles the undo case (recomputes from remaining completed sessions when a completion is reverted).

### 3. Counter auto-expired packages too aggressively
**Where:** `increment_session_counter()` from migration 0005
**Problem:** Function auto-marked plans `expired` when sessions_used reached total_sessions. But Jason uses **perpetual** counters (Nikki ticks 24 → 25 → 26... up to 344 over years). The auto-expire would have marked her training plan expired after 12 sessions even though she's still actively training.
**Fix:** Migration 0006 simplifies the function — it just increments. Jason cancels old plans and adds new ones manually when selling fresh batches.

### 4. Stripe webhook still writes to deprecated table
**Where:** `apps/web/app/api/webhooks/stripe/route.ts`
**Problem:** Webhook handler inserts into `memberships`. After migration 0005 added `plans`, new editor writes go to `plans`, but Stripe events would land in `memberships` — split-brain.
**Status:** Not fixed yet. **Doesn't matter today** because billing is on Vagaro, not Stripe. Must fix before Phase 2 Stripe migration.
**Fix path:** Update handlers to insert into `plans` with appropriate `kind`/`tier`/`service_type` based on `lookup_key` metadata.

---

## 🟡 Schema integrity concerns

### `memberships` is deprecated but still queryable
Migration 0005 keeps the old table for safety. Some old code paths might still touch it. New code consistently reads `plans` and the `client_billing_summary` view. Once you've confirmed nothing breaks, drop the table:

```sql
DROP TABLE memberships;
```

That's a one-line manual step you should do after a few weeks of running on the new schema.

### Migration version map (current state after refine bundle)
| File | Adds |
|---|---|
| `0001_initial_schema.sql` | core tables, RLS, triggers |
| `0002_pricing_lockin.sql` | recovery_monthly tier, service_catalog, refund queue, stripe_events |
| `0004_billing_type_and_counter.sql` | billing_type enum, current_session_number (on memberships, now superseded) |
| `0005_multi_plan_model.sql` | `plans` table, multi-plan model, view rebuild |
| `0006_session_plan_integration.sql` | sessions.service_type/plan_id, last_session_at trigger, simplified counter |
| `0007_security_hardening.sql` | view security_invoker, indexes, unique-active-subscription constraint |

There's no `0003` (was reserved for a seed file that never landed). Run them in numeric order against a fresh Supabase project; safe to re-run on an existing one.

### Active subscription uniqueness
Migration 0007 adds a unique partial index: a client can have only **one** active subscription at a time, but unlimited active packages. If you try to add a second active subscription via the editor, the insert fails. The editor should catch this and prompt you to cancel the existing sub first. (Right now it surfaces the raw Postgres error — improvement opportunity.)

---

## 🟢 Things that were checked and look correct

### RLS on every table
Every table has policies for `authenticated`. Pattern is consistent:
- Self-row read for clients (`id = auth.uid()`)
- Trainer all-access (`is_trainer()` helper)
- Owner all-access (`is_owner()`)

The `is_trainer()` and `is_owner()` helpers query `profiles.role` — these run on every request, so they should be cached. Postgres does this automatically per-statement. No change needed.

### Auth + role gating layers (defense in depth)
1. Middleware (`apps/web/middleware.ts`) — first line, redirects at the edge
2. Server component (`AppShell`) — re-checks role on every page
3. RLS policies — enforces at the database layer

If any one fails, the next catches it. Nice.

### Public intake flow
Token-based, uses service-role to bypass RLS — but token validation is mandatory, expiry is checked, and tokens are single-use (marked used after waiver completion). Solid.

### Stripe webhook idempotency
Events are deduped via `stripe_events.id` (the Stripe event ID is unique). Re-delivery is safe.

### Session counter + audit trail
- `sessions.plan_id` records which plan was billed against
- Undo flow uses this to know which plan to decrement
- `sessions.completed_by` tracks who marked it done
- No way to lose track of "did this session bill against a package?"

---

## 🟠 Workflow gaps (not bugs, but missing UX)

### "+ New client" button does nothing
The Clients list has a New button that's a no-op. Add a quick-create modal: name + email + initial billing type, creates the auth user (admin API) + profile + clients row.

### "Quick Log" button on trainer dashboard does nothing
For when Jason did a session that wasn't pre-scheduled — needs a flow that creates a session row already in `completed` state with the counter incremented. Easy version: link to a /sessions/new page with a dropdown of clients.

### No way to schedule a future session from the UI
Sessions exist only by SQL insert today. Trainers can't "book Nikki for next Tuesday" from the app. This blocks real launch — Vagaro currently does this. Either keep Vagaro for scheduling and sync with a webhook, or build a /schedule page.

### `/api/clients/[id]/route.ts` PATCH only handles profile + status
After the multi-plan refactor, the old "billing" patch path is gone — billing now goes through `/api/clients/[id]/plans` (POST) and `/api/plans/[id]` (PATCH/DELETE). This is correct but the trace isn't obvious. Updated route comment now explains it.

### No "complete session with note + RPE in one shot" mobile UX
Trainer dashboard → tap session → opens detail page → write notes → mark complete. That's three taps. Could be one swipe-to-complete on the schedule card. Defer.

### Stripe → plans integration
The webhook writes to `memberships` (legacy). When you migrate billing off Vagaro, the webhook handler needs rewriting to:
- Map Stripe `lookup_key` → `tier` + `service_type` for packages
- Create one `plans` row per Stripe subscription (not one per client)
- Handle subscription updates by closing old plan + creating new

I drafted the lookup_key → tier map back in `apps/web/scripts/seed-stripe-catalog.ts`. Reuse that mapping when rewriting the webhook.

---

## 🟣 Things deferred

### Tests
Zero test coverage. Realistic for an MVP. Most-valuable test surfaces, in order:
1. `increment_session_counter` / `decrement_session_counter` (pgTAP test)
2. Session complete API end-to-end (assertion: counter goes up, session.plan_id set, last_session_at synced)
3. Plan-add API: subscription uniqueness rejection
4. Public intake flow: token validity gate
5. RLS smoke: as-client-X cannot read client-Y data

Even three pgTAP tests against the increment function would catch most regressions. Worth doing before launch.

### Database type generation
The hand-written `database.ts` covers the new tables but isn't authoritative. Run `pnpm dlx supabase gen types typescript ...` after deploying migrations to regenerate. Keep the same export interface.

### Sentry / PostHog
Stubbed in `.env.example` but no code is wired. Add `@sentry/nextjs` with auto-instrumentation when ready — about 30 minutes of work.

### Inngest workflows
Listed in `.env.example` and referenced in deployment docs but no actual workflows exist. Highest-value first ones to build:
1. Post-assessment follow-up sequence (3 emails over 7 days)
2. Birthday text from Jason
3. Reactivation drip for clients tagged at-risk
4. Dunning when Stripe `invoice.payment_failed`

---

## 📋 Pre-launch checklist

Before you point a real domain at this and onboard real members:

- [ ] Run all migrations (0001–0007) in order against production Supabase
- [ ] Verify view RLS — query `client_billing_summary` as a non-owner; should only see own row
- [ ] Run `seed-clients.ts` (creates 46 clients)
- [ ] Run `seed-nikki-plans.ts` (Nikki's three concurrent plans)
- [ ] Run `seed-jerry-plans.ts` (Jerry's three concurrent plans, after editing his real config)
- [ ] Spot-check 3 random clients' profiles — billing type, plan counters look right
- [ ] Manually fix package service_type for any massage/pilates clients (the seed assumes training; correct via editor)
- [ ] Manually set membership tier for the 25 unset clients
- [ ] Replace placeholder `@ims-roster.local` emails as you collect real ones
- [ ] Drop `memberships` table after you've confirmed nothing references it
- [ ] Set production env vars in Vercel
- [ ] Run a full intake flow end-to-end on a real phone
- [ ] Mark a session complete + verify counter ticks
- [ ] Undo that completion + verify counter rolls back
- [ ] Sign out and sign back in with each role to verify dashboards

---

## 🧠 Mental model summary

When in doubt about how something flows:

```
Trainer marks session complete
   ↓
POST /api/sessions/[id]/complete
   ↓
1. RPC increment_session_counter(client_id, service_type)
   - Finds oldest active package matching service_type (FIFO)
   - Returns { plan_id, session_number, incremented: true }
2. UPDATE sessions SET status='completed', plan_id, completed_at, completed_by
3. TRIGGER sessions_sync_last_session_at fires
   - UPDATEs clients.last_session_at = scheduled_at
   ↓
Owner dashboard at-risk list re-evaluates
   - Reads from client_billing_summary view (security_invoker, RLS-respecting)
   - Joins clients.last_session_at with 14-day cutoff
   - Removes Nikki from at-risk because she just had a session
```

Every layer is visible. Every layer enforces security. No hidden state.
