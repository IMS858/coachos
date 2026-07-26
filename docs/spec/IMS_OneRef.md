# IMS Coach OS — One-Page Reference

## What This Is
**One integrated app** replacing GoDaddy site, paper waivers, GoHighLevel CRM, and scattered tools. Three role-scoped dashboards on a shared Supabase backend.

---

## The Stack (Locked)
- **Frontend:** Next.js 15 + React + TypeScript + Tailwind + shadcn/ui
- **Backend:** Supabase (Postgres + Auth + Storage + Realtime)
- **Hosting:** Vercel + GitHub
- **Generator:** Existing Python Flask app stays — deploy to Railway, call from Next.js
- **Payments:** Stripe (eventually) + Vagaro (kept short-term)
- **Messaging:** Resend (email) + Twilio (SMS) + Inngest (workflows)

**Monthly cost: ~$85-100/mo** (vs $259/mo with GoHighLevel stack)

---

## Three Roles, One Database

| Role | Sees | Does |
|---|---|---|
| **Owner** (Jason) | MRR, retention, pipeline, all clients | Run the business |
| **Trainer** (Jason, Gabriel) | Today's schedule, their clients, programs | Run sessions, edit programs |
| **Client** (members) | Their plan, their progress, their messages | Show up, log effort, do homework |

Row-level security in Postgres enforces this at the database level. Impossible to bypass.

---

## The Big Wins This Unlocks

1. **Digital intake + e-signed waivers** — closes the #1 ops gap
2. **Trainer "Today" view** — Jason and Gabriel use this 50+x/week
3. **Owner KPI dashboard** — answers "how are we doing?" in 5 seconds
4. **Auto post-assessment follow-up** — recovers 10-30% of leads currently lost
5. **Client mobile dashboard** — drives stickiness, drives retention, drives MRR

---

## The Build Path

| Phase | Weeks | What |
|---|---|---|
| 1 | 1-2 | Foundation: repo, auth, RLS, layout shells |
| 2 | 3-5 | Client side: intake, waivers, dashboard |
| 3 | 6-9 | Trainer side: assessment wizard, plan review, session log |
| 4 | 10-11 | Owner side: KPIs, charts, reports |
| 5 | 12-13 | Automation: 12 Inngest workflows, webhooks |
| 6 | 14 | Polish + launch |

**MVP cut for first 4 weeks:** auth + intake + trainer today view + client dashboard + Python generator wired up. Use it for 2 weeks. Then build the rest.

---

## Repo Structure

```
ims-coach-os/
├── apps/
│   ├── web/             # Next.js 15 (the main thing)
│   └── generator/       # Python Flask service (existing code, deployed to Railway)
├── packages/
│   ├── db/              # Migrations, types, seed
│   └── shared-types/    # TS types matching Python Assessment/Program contracts
└── docs/
```

Monorepo via pnpm + Turborepo.

---

## What to Decide This Week

1. Domain: `app.imsfitnesscenter.com` for the OS, marketing on root domain?
2. DIY build with Claude Code, or hire a developer?
3. Vagaro stays for billing in v1, yes/no?
4. Multi-tenant future (other studios) or single-tenant only (just IMS)?

---

## Files Delivered

- `IMS_Ultimate_Build_Spec.md` — the full 18-section build specification
- `supabase_schema.sql` — complete runnable database schema with RLS
- `IMS_OneRef.md` — this page

Run the SQL file in your Supabase project and the entire data model exists. Then start building Next.js against it.

---

*The generator engine is your moat. The Coach OS is the delivery mechanism. The three dashboards are how you serve owners, trainers, and clients without compromise.*
