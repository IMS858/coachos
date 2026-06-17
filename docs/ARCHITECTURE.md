# Architecture

How IMS Coach OS is put together. Read this once before making changes that
cross system boundaries.

---

## The mental model

```
                       ┌──────────────────────────┐
                       │      Vercel (web)        │
                       │   Next.js 15 + React 19  │
                       │   Server + Client comps  │
                       └────────────┬─────────────┘
                                    │
              ┌─────────────────────┼─────────────────────┐
              │                     │                     │
              ▼                     ▼                     ▼
   ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
   │   Supabase      │  │   Stripe        │  │  Railway        │
   │ ─────────────── │  │ ─────────────── │  │ ─────────────── │
   │ Postgres + RLS  │  │ Subscriptions   │  │ Python Flask    │
   │ Auth (JWT)      │  │ Checkout        │  │ Program engine  │
   │ Storage         │  │ Webhooks        │  │ FRC libraries   │
   │ Realtime        │  │ Customer Portal │  │                 │
   └─────────────────┘  └─────────────────┘  └─────────────────┘
              │                     │                     │
              └─────────────────────┼─────────────────────┘
                                    │
                       ┌────────────▼─────────────┐
                       │    Inngest (workflows)   │
                       │  Post-assessment follow- │
                       │  up · dunning · birthday │
                       │  Resend + Twilio side    │
                       │  effects                 │
                       └──────────────────────────┘
```

Six external services, one app codebase, three role-based UIs.

---

## Why Next.js 15 (and not just React)

- **Server Components** mean we can do auth + data fetching on the server,
  shipping rendered HTML to the client. No client-side waterfall.
- **Route groups** `(auth)/`, `(owner)/`, `(trainer)/`, `(client)/` group
  pages by role without affecting the URL.
- **Middleware** runs on every request at the edge, so role gating is
  enforced before any page renders.
- **Vercel hosting** is deeply integrated — preview deploys per PR are free.

---

## Why Supabase (and not just Postgres)

The killer feature is **Row-Level Security**. Three policies in SQL replace
hundreds of lines of permission-check middleware:

```sql
CREATE POLICY clients_self ON clients
  FOR SELECT TO authenticated
  USING (id = auth.uid());

CREATE POLICY clients_trainer ON clients
  FOR SELECT TO authenticated
  USING (is_trainer());

CREATE POLICY clients_owner ON clients
  FOR ALL TO authenticated
  USING (is_owner());
```

Postgres enforces these on every query. There is no way to bypass at the API
layer because the API layer doesn't make the decision — the database does.

When a client logs in and queries `clients`, they only see their own row.
When a trainer logs in and queries the same table, they see everyone. Same
SQL query. Different results. Enforced by Postgres.

This is why we don't need a separate API server. Next.js server components
talk directly to Supabase, and Supabase enforces who sees what.

---

## The auth flow

```
1. User visits /
   ↓
2. middleware.ts runs at the edge
   ↓
3. updateSession() refreshes the JWT from cookies
   ↓
4. If no user → redirect to /login
   If user → fetch profiles.role from Postgres
   ↓
5. Role-based gating:
   - /owner/*    → owner only
   - /clients/*  → trainer + owner
   - /dashboard  → all roles (resolves view by role)
   ↓
6. Page renders as Server Component
   - Re-verifies user via supabase.auth.getUser()
   - Queries data with the user's JWT (RLS applies)
   - Streams HTML to client
```

The middleware is a thin gate. The real security is in RLS policies. Both
layers exist because defense-in-depth is cheap when the middleware is one
file.

---

## Where things live

### `apps/web/middleware.ts`
The first thing that runs on every request. Refreshes auth, resolves role,
gates routes. Don't add business logic here — keep it routing-only.

### `apps/web/lib/supabase/`
Three Supabase clients for three contexts:
- **`server.ts → createClient()`** — Server Components, Server Actions, Route Handlers (respects RLS as the user)
- **`server.ts → createServiceClient()`** — Webhook handlers, scheduled jobs (bypasses RLS, dangerous, never expose to user requests)
- **`client.ts → createClient()`** — Browser-side, for realtime subscriptions

Pick the right one. Using `createServiceClient` in a user-facing route is a
security hole. Using `createClient` in a webhook handler will fail because
there's no user session.

### `apps/web/app/`
Routes. Three role groups:
- `(auth)/` — login, signup
- `(owner)/`, `(trainer)/`, `(client)/` — role-scoped sections (route group doesn't affect URL)
- `intake/[token]/` — public, no auth required (token-validated)
- `api/` — Route Handlers for webhooks, server actions, RPC

### `apps/web/components/`
- `ui/` — primitives (Button, Card, Input, Badge)
- `layout/` — sidebar, bottom nav, app shell
- `dashboard/` — role-specific dashboards, KPI cards
- `intake/` — multi-step intake form, waiver flow

### `packages/db/migrations/`
SQL migrations. Run in order against your Supabase project. Each file is
idempotent (safe to re-run).

### `apps/generator/`
The Python Flask program engine. Stays separate. Communicates over HTTP only.

---

## Data flow: what happens when a trainer publishes a program

1. **Trainer in browser** clicks "Generate Program" on an assessment
2. **Browser** POSTs to `/api/generate` with `assessment_id`
3. **Route Handler** uses server Supabase client → loads assessment (RLS enforces trainer access)
4. **Route Handler** POSTs `assessment.data` to `PYTHON_GENERATOR_URL/generate`
5. **Python service** runs the FRC engine, returns Program JSON
6. **Route Handler** inserts row into `programs` table with `status = 'draft'`
7. **Browser** redirects to `/programs/[id]` (Plan Review)
8. **Trainer** edits exercises in 3-pane editor
9. **Edits** save to `programs.coach_edits` (jsonb)
10. **Trainer** clicks "Publish" → `programs.status = 'published'`
11. **Inngest event** `program.published` fires
12. **Inngest workflow** sends email + SMS to client, schedules sessions
13. **Client** sees program in their dashboard via RLS-scoped query

Eleven steps. Six external services touched. One app coordinates them all.

---

## Data flow: what happens when a Stripe payment succeeds

1. **Stripe** processes a recurring charge
2. **Stripe** POSTs to `/api/webhooks/stripe` with `invoice.payment_succeeded`
3. **Route Handler** verifies signature using `STRIPE_WEBHOOK_SECRET`
4. **Route Handler** uses **service-role** Supabase client (bypasses RLS)
5. **Idempotency check** in `stripe_events` table (event ID UNIQUE)
6. **Insert** into `payments` table
7. **Mark** `stripe_events.processed_at`
8. **Owner dashboard** queries `payments` → MRR ticks up

The webhook is the single source of truth for billing state. We never trust
the browser to tell us a payment succeeded — Stripe tells us, signed.

---

## When to add a new page

```
Step 1: Decide which role(s) need access
    Owner only?         → app/(owner)/your-page/
    Trainer + owner?    → app/(trainer)/your-page/  (owner inherits via RLS)
    Client only?        → app/(client)/your-page/
    All roles?          → app/your-page/ (no group)

Step 2: Add it to the sidebar
    apps/web/components/layout/app-sidebar.tsx
    → Add to NAV_BY_ROLE[role]

Step 3: Add middleware gating if owner-only
    apps/web/middleware.ts → ownerOnly array

Step 4: If it loads data, query via the server Supabase client
    RLS does the access control — don't add manual permission checks
```

---

## What you should NOT do

- **Don't put business logic in middleware.** Keep middleware to auth + routing only. Slow middleware = slow site.
- **Don't use the service-role client in user-facing routes.** It bypasses RLS. If you need server-only privileges in a user route, that's a sign the RLS policy is wrong.
- **Don't query Stripe to read state.** Read from your own database. Stripe webhooks update your DB; your UI reads from your DB. The webhook handler is the only place that talks to Stripe state directly.
- **Don't fetch the Python generator from the browser.** Always proxy through `/api/generate` so we can authenticate the request.
- **Don't add a new external service without updating `.env.example`.** If it's not in `.env.example`, prod will silently break.

---

## What's intentionally simple

- **No GraphQL.** Supabase queries are direct. PostgREST handles 95% of cases.
- **No Redux/Zustand.** Server Components + URL state cover everything.
- **No microservices** beyond the Python generator. One Next.js app handles everything else.
- **No Docker for the web app.** Vercel handles the build. Docker is only for the Python generator on Railway.
- **No multi-tenancy.** This is for IMS only. If a second studio ever wants this, we add `organization_id` everywhere — but not before.
