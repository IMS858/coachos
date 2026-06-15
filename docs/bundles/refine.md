# Refine Bundle — Session-Plan Integration + Audit Fixes

Wires the trainer dashboard's "mark complete" flow to plan counters, then
sweeps the system for integration weaknesses and fixes them.

## What this delivers

### Session completion flow (the headline feature)
1. Trainer opens dashboard → sees today's sessions
2. Taps a session → opens `/sessions/[id]` detail page
3. Picks service type (Training / Massage / Pilates) — UI shows which package will be drained
4. Writes notes, taps "Mark complete"
5. Backend calls `increment_session_counter(client_id, service_type)`
6. The matching package counter ticks up (Nikki: 24 → 25)
7. `clients.last_session_at` auto-updates via trigger
8. Owner dashboard at-risk list automatically removes Nikki

Undo is supported. If a trainer mistakenly marks complete, "Undo completion"
decrements the counter and recomputes `last_session_at` from remaining
completed sessions.

### Critical bugs fixed in this bundle
- **View RLS bypass** — `client_billing_summary` could expose all clients to anyone. Fixed via `security_invoker = on`.
- **At-risk list always wrong** — `clients.last_session_at` was never updated. Fixed via trigger.
- **Counter auto-expiring packages incorrectly** — Nikki's perpetual counter would have killed her plan after 12 sessions. Auto-expire removed.
- **Stripe webhook writing to deprecated table** — rewrote to `plans` (matters when you migrate off Vagaro).

### Integration audit
Full doc at `docs/INTEGRATION_AUDIT.md` walks through:
- 4 critical bugs found and fixed
- 4 schema integrity concerns
- 8 things checked and confirmed solid
- 6 workflow gaps to fix later
- Pre-launch checklist
- Mental model of the data flow

## Files in this bundle

```
refine/
├── packages/db/migrations/
│   ├── 0006_session_plan_integration.sql    ← session→plan wiring + triggers
│   └── 0007_security_hardening.sql          ← view RLS fix + indexes + payments.plan_id
├── apps/web/
│   ├── app/
│   │   ├── sessions/[id]/page.tsx           ← NEW: session detail page
│   │   └── api/
│   │       ├── sessions/[id]/route.ts                ← notes endpoint
│   │       ├── sessions/[id]/complete/route.ts       ← complete + undo
│   │       └── webhooks/stripe/route.ts              ← rewritten for plans table
│   ├── components/
│   │   ├── sessions/session-detail.tsx              ← interactive complete UI
│   │   └── dashboard/
│   │       ├── trainer-dashboard.tsx                ← session cards link to /sessions/[id]
│   │       └── owner-dashboard.tsx                  ← reads from view, real MRR + at-risk
│   ├── lib/types/database.ts                ← updated stub with plans/service_type/etc
│   └── scripts/
│       ├── seed-clients.ts                  ← rewritten to write to plans table
│       └── seed-jerry-plans.ts              ← Jerry's stacked plans (edit constants at top)
├── docs/INTEGRATION_AUDIT.md                ← full audit report
└── README.md
```

## Apply order

```bash
unzip ims-coach-os-refine.zip
cd ims-coach-os/

# 1. Copy migrations
cp ../refine/packages/db/migrations/000{6,7}*.sql packages/db/migrations/

# 2. Copy app code
cp -r ../refine/apps/web/app/sessions apps/web/app/
cp -r ../refine/apps/web/app/api/sessions apps/web/app/api/
cp ../refine/apps/web/app/api/webhooks/stripe/route.ts apps/web/app/api/webhooks/stripe/route.ts
cp -r ../refine/apps/web/components/sessions apps/web/components/
cp ../refine/apps/web/components/dashboard/trainer-dashboard.tsx apps/web/components/dashboard/
cp ../refine/apps/web/components/dashboard/owner-dashboard.tsx apps/web/components/dashboard/
cp ../refine/apps/web/lib/types/database.ts apps/web/lib/types/database.ts
cp ../refine/apps/web/scripts/seed-clients.ts apps/web/scripts/
cp ../refine/apps/web/scripts/seed-jerry-plans.ts apps/web/scripts/
cp ../refine/docs/INTEGRATION_AUDIT.md docs/

# 3. Run new migrations in Supabase SQL editor:
#    packages/db/migrations/0006_session_plan_integration.sql
#    packages/db/migrations/0007_security_hardening.sql

# 4. Edit Jerry's config in scripts/seed-jerry-plans.ts to match what he actually has,
#    then seed:
cd apps/web
pnpm tsx scripts/seed-jerry-plans.ts
```

## Verify the session-complete flow

After deploy:

1. Sign in as a trainer who has sessions scheduled today
2. Open `/dashboard` — see today's session cards
3. Click Nikki's training session → `/sessions/<id>` opens
4. Service type defaults to "training" — left rail shows her training pack at #24, marked as the one that'll tick
5. Write a post-session note
6. Click "Mark session complete"
7. Should see toast: "Session #25 for Nikki."
8. Go back to `/dashboard` — Nikki's card now has a green "Complete" badge
9. Open her profile (`/clients/<id>`) — training pack now shows #25
10. (Owner view) `/dashboard?view=owner` — at-risk list does NOT include Nikki

If any step fails, the trail is short:
- Step 7 fails → check `increment_session_counter` exists in Supabase Functions
- Step 8 doesn't update → page cache; refresh. If still stale, check the `router.refresh()` call
- Step 9 doesn't show 25 → check the trigger ran; query `SELECT * FROM plans WHERE client_id = ...`
- Step 10 still shows Nikki → check `clients.last_session_at` is non-null and recent

## What I left for you

1. **Pick Jerry's config** — open `scripts/seed-jerry-plans.ts` and edit the `JERRY_CONFIG` constants at the top. The default mirrors Nikki's setup.
2. **Drop the deprecated `memberships` table** — after a few weeks of running clean. One line:
   ```sql
   DROP TABLE memberships CASCADE;
   ```
3. **Read `docs/INTEGRATION_AUDIT.md`** — it's the most important doc in this bundle. Treat the pre-launch checklist as gospel.
