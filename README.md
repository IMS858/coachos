# IMS Coach OS

The integrated platform for **Innovative Movement Solutions** — premium movement coaching studio in Scripps Ranch, San Diego.

One Next.js 15 app, three role-based dashboards (Owner / Trainer / Client), Supabase Postgres with row-level security, Stripe billing, and Inngest workflows. Replaces the GoDaddy site, paper waivers, GoHighLevel CRM, NiceJob, and (eventually) Vagaro.

---

## What's in this repo

```
ims-coach-os/
├── apps/
│   ├── web/                    Next.js 15 app — the whole product
│   └── generator/              Python Flask program generator (Dockerfile only)
├── packages/
│   └── db/
│       └── migrations/         10 SQL migrations (run in order against Supabase)
├── docs/
│   ├── ARCHITECTURE.md
│   ├── DEPLOY_RUNBOOK.md       👈 START HERE for first deployment
│   ├── INTEGRATION_AUDIT.md    Security review + race-condition fix walkthrough
│   ├── AUDIT_2.md              Second audit: concurrency hardening
│   ├── DEVELOPMENT.md
│   ├── DEPLOYMENT.md
│   ├── bundles/                Per-bundle changelogs from incremental builds
│   └── spec/                   Original spec docs (locked decisions, pricing, schema)
├── package.json                pnpm workspace root
├── pnpm-workspace.yaml
├── turbo.json
├── tsconfig.base.json
├── biome.json
└── .env.example
```

---

## What's built

### Schema (10 migrations)
- `0001` — Initial schema, RLS, all enums
- `0002` — Pricing lock-in (recovery_monthly tier, service_catalog)
- `0003` — Dev seed
- `0004` — Billing type + perpetual session counter
- `0005` — Multi-plan model (subscriptions + stackable packages)
- `0006` — Session ↔ plan integration
- `0007` — Security hardening (`security_invoker` view, `last_session_at` trigger)
- `0008` — Extended session types (massage, pilates)
- `0009` — Concurrency fix (`FOR UPDATE` row lock) + index optimizations
- `0010` — Exercise library (exercises, favorites, program_exercises)

### App surfaces
- **Auth + role routing.** Three-layer guard (middleware → AppShell → Postgres RLS).
- **Owner dashboard** with KPIs, roster, at-risk clients, recent activity.
- **Trainer dashboard** showing today's sessions and pending tasks.
- **Client dashboard** mobile-first with today/plan/progress.
- **Public intake flow** (8 steps + e-sign waivers, tokenized link).
- **Clients module** — list, filter, full profile editor, stacked-plan cards, "+ New client" form.
- **Sessions module** — create/schedule, complete with counter increment, undo, detail view.
- **Library module** — exercise browse/detail/edit, favorites, "Add to program" integration.
- **Programs API** — assignments, exercise prescriptions, generator passthrough.
- **Stripe webhook** with idempotency, multi-plan reconciliation, reactivation.

### Seeded data (run `pnpm seed:*` after migrations)
- 46 real clients (21 with package counts, 25 membership/unset)
- 3 trainers (Jason, Gabriel Madrid, Kara Vasko)
- Nikki & Jerry's stacked plans (custom subscription + training pack + massage pack)
- 15 exemplar exercises across 5 categories
- Stripe products/prices catalog
- Owner bootstrap script

---

## First-time deployment

**Read `docs/DEPLOY_RUNBOOK.md` end-to-end before doing anything.** It walks you through:

1. Push this repo to GitHub
2. Run all 10 migrations against your Supabase project
3. Set environment variables in Vercel
4. Deploy
5. Bootstrap your owner account (`pnpm seed:owner`)
6. Concurrency smoke test (verifies the `FOR UPDATE` race fix from migration 0009)
7. Optional: seed roster, plans, exercises

---

## Stack

- **Next.js 15** App Router, React 19, TypeScript strict
- **Tailwind v4** + shadcn-style components
- **Supabase** Postgres + Auth + Storage + Realtime
- **Stripe** for subscriptions and packages
- **Inngest** for workflows (post-assessment, dunning, reactivation — defined but not yet wired)
- **Resend** for email, **Twilio** for SMS
- **Bunny Stream** for exercise videos (env var: `NEXT_PUBLIC_BUNNY_LIBRARY_ID`)
- **Vercel** hosting, **Railway** for the Python program generator (separate service)

Total monthly runtime cost target: **$85-100/mo**.

---

## Local development

```bash
pnpm install
cp .env.example apps/web/.env.local   # fill in real values
pnpm dev                               # starts Next.js on :3000
```

Database changes go in `packages/db/migrations/` as numbered SQL files. Apply them in the Supabase SQL editor in order.

---

## Branch / commit hygiene

This repo was assembled from a series of incremental build bundles. Each bundle's README is preserved in `docs/bundles/` so you can trace what was added when. Going forward, work in feature branches off `main` and squash-merge.

---

## Owner: Jason · Innovative Movement Solutions
- imsmethod.com · (619) 937-1434
- Scripps Ranch, San Diego, CA

---

*Built incrementally with Claude. Single-tenant. No multi-org refactor planned until/unless IMS opens a second location or licenses the platform.*
