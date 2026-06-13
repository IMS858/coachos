# IMS Coach OS — Deploy Bundle

The runbook + owner-bootstrap script for taking your app from "zip files on a
laptop" to "running production system at https://your-app.vercel.app."

## Files

```
deploy/
├── apps/web/scripts/
│   └── seed-owner.ts            ← creates your owner login, run once after migrations
├── docs/
│   └── DEPLOY_RUNBOOK.md        ← the full step-by-step
└── README.md
```

## What this is for

Your specific situation:
- ✅ GitHub + Vercel + Supabase ready
- ✅ Fresh empty Supabase production project
- ⏭️ No domain yet (using `*.vercel.app`)
- ⏭️ Skipping Stripe for v1 (staying on Vagaro)
- ⏭️ Skipping Bunny Stream (library video later)
- ⏭️ Skipping Railway (Python generator later)
- ⏭️ Just need an owner login on day one

The runbook is tailored to exactly this — no generic boilerplate, no steps
for things you're not doing.

## Apply

```bash
unzip ims-coach-os-deploy.zip
cd ims-coach-os/

# 1. Owner script
cp ../deploy/apps/web/scripts/seed-owner.ts apps/web/scripts/

# 2. Runbook
cp ../deploy/docs/DEPLOY_RUNBOOK.md docs/

# 3. Open the runbook and follow it
open docs/DEPLOY_RUNBOOK.md
```

## Time estimate

Plan ~3 hours including buffer. Realistic Saturday-morning project.

| Part | Time |
|---|---|
| 0. Pre-flight (verify build, gather files) | 15 min |
| 1. Supabase production (run all migrations) | 30 min |
| 2. Vercel deploy + env vars | 20 min |
| 3. Connect auth to Vercel URL | 10 min |
| 4. Owner account + seed 46 clients + Nikki/Jerry | 20 min |
| 5. Smoke test | 30 min |
| Buffer for surprises | 30-60 min |

## What "done" looks like

When you finish the runbook, you'll have:

- A live URL at `https://your-app.vercel.app`
- Your owner account, signed in via magic link
- Owner dashboard showing 46 clients and ~$7,100 MRR (Nikki + Jerry custom subs)
- The ability to log a real session and see the counter tick
- A working concurrency-safe production database

Everything else is iteration.

## When you hit a wall

The runbook has a "Part 6 — When things break" section covering the most
common failure modes. If something doesn't match, paste the error here and
we'll debug.
