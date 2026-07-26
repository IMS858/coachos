# Multi-Plan Update — Stackable Subscriptions + Packages

Replaces the single-membership-per-client model with stackable plans.

A client can now have any number of concurrent active plans:
- **1 subscription** (recurring monthly) — Essentials, Standard, Premium, Recovery, or Custom
- **N packages** (session counts) — Training, Massage, or Pilates, each with its own counter
- Stacked packages of the same type are allowed (FIFO drain — oldest fills first when sessions complete)

## What this fixes

You told me Nikki has:
- Monthly subscription at $3,550 (non-standard amount)
- 12-pack training
- 12-pack massage (currently at session #24 on the running counter)

The previous model couldn't represent any of that — it assumed one membership per client, with tiers locked to the standard rates. Now Nikki's profile shows three independent plan cards, each editable separately.

## Files in this bundle

```
plans-update/
├── packages/db/migrations/
│   └── 0005_multi_plan_model.sql           ← the schema migration
├── apps/web/
│   ├── app/
│   │   ├── clients/page.tsx                ← updated list (shows stacked plans)
│   │   ├── clients/[id]/page.tsx           ← updated profile (loads plans)
│   │   ├── api/clients/[id]/route.ts       ← profile + status only now
│   │   ├── api/clients/[id]/plans/route.ts ← POST: add plan
│   │   └── api/plans/[id]/route.ts         ← PATCH/DELETE: update or cancel plan
│   ├── components/clients/
│   │   ├── client-editor.tsx               ← multi-plan editor with add panel + per-plan cards
│   │   └── clients-filter.tsx              ← simplified (dropped type filter)
│   └── scripts/
│       └── seed-nikki-plans.ts             ← Nikki's three plans
└── README.md
```

## Schema changes — what migration 0005 does

1. New enums: `service_type` (training, massage, pilates, recovery, body_comp), `plan_kind` (subscription, package), expanded `plan_tier` enum with `'custom'`, `'package_custom'`
2. New `plans` table — replaces single-active-membership pattern. RLS: clients see their own, trainers/owner see all
3. Migrates existing data — every row in `memberships` becomes a row in `plans` (preserves all current Nikki/Will/Diana counters)
4. Drops old `client_billing_summary` view, rebuilds with multi-plan aggregates: active plan counts, total monthly $, primary plan label
5. New `increment_session_counter(client_id, service_type)` function — FIFO across stacked packages, auto-expires when total exhausted
6. Old `memberships` table is **kept** (deprecated, not dropped) so nothing breaks if old code still references it. Drop it manually once you've confirmed everything works.

## Editor UI

Open any client profile and you see:

```
┌────────────────────────────────────────────────────┐
│ Nikki                            $3,550/mo   3 plans│
│ nikki@ims-roster.local                              │
└────────────────────────────────────────────────────┘

  Active Plans                          [+ Add plan]

  ┌────────────────────────────────────────────────┐
  │ 🔄 Subscription · Nikki Custom              🗑 │
  │ $3,550/month · started Apr 30, 2026            │
  │ [Edit name & rate]                             │
  └────────────────────────────────────────────────┘

  ┌────────────────────────────────────────────────┐
  │ 📦 Training · 12-session pack                🗑 │
  │ next = #25                                      │
  │ [ − ] [  24  ] [ + ]                           │
  │ ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓ 24 used (overdraft)  │
  └────────────────────────────────────────────────┘

  ┌────────────────────────────────────────────────┐
  │ 📦 Massage · 12-session pack                 🗑 │
  │ next = #1                                       │
  │ [ − ] [  0  ] [ + ]                            │
  │ ░░░░░░░░░░░░░░░░░░░░░░ 0 used                  │
  └────────────────────────────────────────────────┘

  [Past plans (0) ▼]
```

The +/− buttons save instantly. Direct-typing in the input also auto-saves on blur. Trash icon soft-cancels (keeps history). "Add plan" opens an inline panel with subscription/package toggle.

## How to apply

```bash
unzip ims-coach-os-plans-update.zip
cd ims-coach-os/

# 1. Copy files (NOTE: existing files are overwritten)
cp ../plans-update/packages/db/migrations/0005*.sql packages/db/migrations/
cp ../plans-update/apps/web/app/clients/page.tsx apps/web/app/clients/page.tsx
cp ../plans-update/apps/web/app/clients/[id]/page.tsx apps/web/app/clients/[id]/page.tsx
cp ../plans-update/apps/web/app/api/clients/[id]/route.ts apps/web/app/api/clients/[id]/route.ts

# These are NEW paths — make sure the dirs exist:
mkdir -p apps/web/app/api/clients/[id]/plans
mkdir -p apps/web/app/api/plans/[id]
cp ../plans-update/apps/web/app/api/clients/[id]/plans/route.ts apps/web/app/api/clients/[id]/plans/route.ts
cp ../plans-update/apps/web/app/api/plans/[id]/route.ts apps/web/app/api/plans/[id]/route.ts

cp ../plans-update/apps/web/components/clients/client-editor.tsx apps/web/components/clients/client-editor.tsx
cp ../plans-update/apps/web/components/clients/clients-filter.tsx apps/web/components/clients/clients-filter.tsx
cp ../plans-update/apps/web/scripts/seed-nikki-plans.ts apps/web/scripts/

# 2. Run migration 0005 in Supabase SQL editor:
#    packages/db/migrations/0005_multi_plan_model.sql

# 3. Seed Nikki's three plans
cd apps/web
pnpm tsx scripts/seed-nikki-plans.ts
```

Then `pnpm dev` and visit `/clients/<nikki-id>`.

## What this enables next

The session-completion flow on the trainer dashboard now has the right primitive:

```sql
SELECT increment_session_counter(
  '<nikki-uuid>'::uuid,
  'training'::service_type
);
```

Returns the affected plan + new counter, or null if no active package of that type exists. Trainer dashboard wires this into the "Mark complete" button on each session, with logic like:

```
If session.service_type = 'training':
  result = increment_session_counter(client_id, 'training')
  if result.incremented:
    notify "Training session #N completed for {client}"
  else:
    notify "{client} has no active training package — charge a la carte?"
```

That's the next surface to build.

## What I need from you

When you open Nikki's profile after seeding:

1. **Verify the plans look right** — three cards, custom $3,550 subscription, training pack at #24, massage pack at #0
2. **Tell me the session count for her massage pack** — I seeded it at 0 since you didn't say. If she's already had massage sessions, just bump the counter
3. **Are there other clients with multiple plans I should know about?** — same pattern as Nikki. Tell me who and I'll add them
