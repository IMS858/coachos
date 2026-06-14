# IMS Coach OS

The integrated platform for **Innovative Movement Solutions** — premium movement coaching studio in Scripps Ranch, San Diego.

One Next.js 15 app, three role-based dashboards (Owner / Trainer / Client), Supabase Postgres with row-level security, Stripe billing. Replaces the GoDaddy site, paper waivers, GoHighLevel CRM, NiceJob, and (eventually) Vagaro.

---

## Repo structure

```
ims-coach-os/
├── app/                        Next.js 15 App Router pages
├── components/                 React components organized by domain
├── lib/                        Supabase clients, types, utilities
├── scripts/                    Seed scripts (clients, exercises, owner, etc.)
├── middleware.ts               Auth + role-based routing
├── next.config.ts
├── postcss.config.mjs
├── tsconfig.json
├── package.json
├── packages/db/migrations/     10 SQL migrations (run in order)
├── generator/                  Python Flask program generator (Dockerfile only)
└── docs/
    ├── DEPLOY_RUNBOOK.md       👈 START HERE for first deployment
    ├── INTEGRATION_AUDIT.md
    ├── AUDIT_2.md
    ├── ARCHITECTURE.md
    ├── DEVELOPMENT.md
    ├── DEPLOYMENT.md
    ├── bundles/                Per-bundle changelogs
    └── spec/                   Original spec docs
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
- `0007` — Security hardening
- `0008` — Extended session types (massage, pilates)
- `0009` — Concurrency fix (`FOR UPDATE` row lock) + index optimizations
- `0010` — Exercise library

### App surfaces
- Auth + three-layer role routing (middleware → AppShell → RLS)
- Owner / Trainer / Client dashboards
- Public intake flow with e-signed waivers
- Clients module — list, profile editor, stacked plans, "+ New client"
- Sessions module — schedule, complete, undo, atomic counter increment
- Library module — exercises, favorites, program integration
- Stripe webhook — idempotent, multi-plan reconciliation

### Seed scripts
```bash
pnpm seed:owner       # bootstrap your account (REQUIRED first)
pnpm seed:clients     # 46 real clients
pnpm seed:nikki       # Nikki's stacked plans
pnpm seed:jerry       # Jerry's stacked plans
pnpm seed:exercises   # 15 exemplar exercises
pnpm seed:stripe      # Stripe catalog
```

---

## First-time deployment

**Read `docs/DEPLOY_RUNBOOK.md` end-to-end before deploying.**

---

## Local development

```bash
pnpm install
cp .env.example .env.local        # fill in real values
pnpm dev                           # starts Next.js on :3000
```

(npm and yarn also work — pnpm is just the recommendation.)

---

## After deploy

Generate real database types so you can re-enable strict TypeScript checking:

```bash
pnpm dlx supabase gen types typescript \
  --project-id YOUR_PROJECT_ID --schema public \
  > lib/types/database.ts
```

Then flip `typescript.ignoreBuildErrors` and `eslint.ignoreDuringBuilds` back to `false` in `next.config.ts`.

---

## Owner: Jason · Innovative Movement Solutions
- imsmethod.com · (619) 937-1434
- Scripps Ranch, San Diego, CA
