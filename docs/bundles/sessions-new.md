# New Session Form — Quick Log + Schedule

Adds `/sessions/new` — one form that handles both:
- **Quick Log**: a session that just happened (counter ticks immediately)
- **Schedule**: a future booking (counter doesn't tick until completion)

This closes the last operational gap. With this in place, you can run the studio without depending on Vagaro for scheduling.

## What this delivers

### One form, two modes
A toggle at the top switches between:
- **Schedule** — default time = next round hour. Saves a `scheduled` row; trainer marks complete later via `/sessions/[id]`.
- **Log Completed** — default time = 1 hour ago, rounded. Saves as `completed` immediately AND ticks the matching package counter atomically.

### Searchable client picker
Pre-loaded list of all active clients (~46 today). Type to filter by name or email. Arrow keys + Enter to select. Each result row shows a compact summary: `2 packs · 1 sub`. With 46 clients this loads in one batch and filters client-side; if you grow to 500+, swap to server-side search.

### Active plans display when a client is picked
As soon as you select a client, you see their current plan stack inline:
- `🔄 Nikki Custom — $3,550/mo`
- `📦 training 12-pack — #24`
- `📦 massage 12-pack — #0`

So Jason knows exactly what's billable before picking a service type.

### Counter preview before submit
When in **Log mode** with a billable service type and the client has a matching package:

> ✅ Will tick Nikki's training counter from #24 → #25

When the client has no matching package:

> ⚠️ Nikki has no active training package. Session will save but no counter ticks — flag for a la carte billing.

When the service type is non-billable (recovery, assessment):

> ⏱ Non-billable session — no counter ticks.

This prevents the most common mistake — trainer picks "training" by habit when the client was actually doing massage that day.

### Atomic counter + session insert with rollback
The API endpoint at `POST /api/sessions`:
1. Calls `increment_session_counter` first (gets back the plan_id)
2. Inserts the session row with `status='completed'` and `plan_id` set
3. If session insert fails, calls `decrement_session_counter` to roll back

So you'll never see a counter tick without a corresponding session row, or vice versa.

### URL params for deep links
- `?mode=log` — opens directly in Quick Log mode
- `?mode=schedule` — schedule mode (default)
- `?client_id=<uuid>` — pre-selects a client (handy for "Schedule new session" buttons on a client profile page later)

## Files in this bundle

```
sessions-new/
├── packages/db/migrations/
│   └── 0008_extend_session_type.sql            ← add 'massage' + 'pilates' to enum
├── apps/web/
│   ├── app/
│   │   ├── sessions/new/page.tsx               ← server: pre-loads clients + plans
│   │   └── api/sessions/route.ts               ← POST: create scheduled or completed
│   └── components/
│       ├── sessions/new-session-form.tsx       ← client form (searchable picker, mode toggle, preview)
│       └── dashboard/trainer-dashboard.tsx     ← buttons wired to /sessions/new
└── README.md
```

## Apply

```bash
unzip ims-coach-os-sessions-new.zip
cd ims-coach-os/

# 1. Migration
cp ../sessions-new/packages/db/migrations/0008*.sql packages/db/migrations/
# Run it in Supabase SQL editor: 0008_extend_session_type.sql

# 2. App code
mkdir -p apps/web/app/sessions/new
cp ../sessions-new/apps/web/app/sessions/new/page.tsx apps/web/app/sessions/new/page.tsx
cp ../sessions-new/apps/web/app/api/sessions/route.ts apps/web/app/api/sessions/route.ts
mkdir -p apps/web/components/sessions
cp ../sessions-new/apps/web/components/sessions/new-session-form.tsx apps/web/components/sessions/new-session-form.tsx
cp ../sessions-new/apps/web/components/dashboard/trainer-dashboard.tsx apps/web/components/dashboard/trainer-dashboard.tsx
```

## Verify the flow

After deploy:

1. Sign in as trainer
2. From dashboard, click **Quick Log** → opens `/sessions/new?mode=log` with the Log mode pre-selected
3. Click in the search box and type "nikki" — Nikki appears in the dropdown
4. Press Enter or click her — her three active plans appear
5. Default time is 1 hour ago; default duration is 60 min; service type defaults to **Training**
6. You see the green preview: "Will tick Nikki's training counter from #24 → #25"
7. Type a post-session note
8. Click **Log + tick counter**
9. You're redirected to `/sessions/<id>` showing the completed session
10. Open Nikki's profile — training pack now shows #25, last_session_at synced
11. From dashboard, click **Schedule** — same flow but mode=schedule
12. Pick a future time, click Schedule — session saved with `status='scheduled'`, no counter change

## Edge cases handled

| Case | Behavior |
|---|---|
| Client has no active plans | Form lets you save anyway (with a warning); counter doesn't tick |
| Client has no package matching service type | Session saves with `plan_id=null`; warning banner reminds you to flag for billing |
| Counter increment succeeds but session insert fails | Counter is rolled back via `decrement_session_counter` |
| Trainer picks a non-billable service type (recovery, assessment) | Counter doesn't tick; "Non-billable session" displayed |
| Trainer schedules in the past | Allowed (back-dating); but if mode=schedule, status stays `scheduled` until manual complete |
| Duration ≤ 0 | Validation error |
| Missing client_id or scheduled_at | Validation error |

## What's still open

Now that #17 is done, the remaining items from the master to-do list are:

- **#18** Drop deprecated `memberships` table (1 SQL line, after running stable for a few weeks)
- **#19** Deploy to production (follow `docs/DEPLOYMENT.md`)
- **#20** Phase 2: Stripe migration off Vagaro
- **#21** Inngest workflows (post-assessment follow-up, dunning, reactivation drip)
- **#22** pgTAP tests for `increment_session_counter` / `decrement_session_counter`

The remaining items are deployment, billing migration, polish — not core feature build. The studio can operate end-to-end on what's been shipped:
- Onboard new clients via UI
- Set up multi-plan billing
- Schedule or log sessions
- Counters tick correctly
- Owner sees real MRR + at-risk
- Trainers see today's schedule and can mark complete
- Clients see their next session and program
