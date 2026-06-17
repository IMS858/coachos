# Development

## Prerequisites

- Node.js 20+ (`nvm install 20` if you don't have it)
- pnpm 9+ (`npm install -g pnpm`)
- Python 3.12+ (only for working on the generator)
- A Supabase account (free tier works for dev)
- A Stripe account (use test mode for dev)

## First-time setup

```bash
# 1. Clone and install
git clone https://github.com/YOUR_ORG/ims-coach-os.git
cd ims-coach-os
pnpm install

# 2. Set up Supabase
# Go to https://supabase.com/dashboard → Create new project
# Wait ~2 minutes for it to provision
# Open SQL editor → run each migration in order:
#   packages/db/migrations/0001_initial_schema.sql
#   packages/db/migrations/0002_pricing_lockin.sql

# 3. Configure environment
cp .env.example apps/web/.env.local
# Open apps/web/.env.local and fill in:
#   NEXT_PUBLIC_SUPABASE_URL          (Project Settings → API)
#   NEXT_PUBLIC_SUPABASE_ANON_KEY     (same page)
#   SUPABASE_SERVICE_ROLE_KEY         (same page, "service_role")
#   STRIPE_SECRET_KEY                 (Stripe dashboard, test mode)
#   STRIPE_PUBLISHABLE_KEY            (same page)
#   NEXT_PUBLIC_URL=http://localhost:3000

# 4. Generate database types
pnpm dlx supabase gen types typescript \
  --project-id YOUR_PROJECT_ID \
  --schema public \
  > apps/web/lib/types/database.ts

# 5. Seed Stripe catalog (one time)
cd apps/web
pnpm tsx scripts/seed-stripe-catalog.ts
cd ../..

# 6. Run dev server
pnpm dev
# → http://localhost:3000
```

## Sign up your first user

1. Visit `http://localhost:3000/login`
2. Enter your email, click "Send magic link"
3. **Local mode catch:** Supabase sends real emails even in dev. Check your inbox, or use the Supabase dashboard's Auth → Users panel and copy the magic link manually.
4. Click the magic link
5. You're logged in as a `client` (default role)

To bootstrap an owner:
```sql
-- Run in Supabase SQL editor
UPDATE profiles
SET role = 'owner'
WHERE email = 'your@email.com';
```

Refresh the browser. You're now an owner. The sidebar gains owner-only items.

## Daily workflow

```bash
# Start dev server (runs Next.js + watches changes)
pnpm dev

# In another terminal, forward Stripe webhooks to local dev
stripe listen --forward-to localhost:3000/api/webhooks/stripe
# Copy the webhook secret it prints into apps/web/.env.local
# as STRIPE_WEBHOOK_SECRET (dev value, different from prod)

# Run typecheck before committing
pnpm typecheck

# Format with Biome
pnpm format
```

## Project structure

```
apps/web/
├── app/                    ← Next.js App Router routes
├── components/             ← React components
├── lib/
│   ├── supabase/           ← Three Supabase clients (server, browser, middleware)
│   ├── types/database.ts   ← Generated Supabase types
│   └── utils.ts            ← cn(), formatCurrency(), formatDate()
├── scripts/                ← One-off scripts (Stripe seed, etc.)
└── middleware.ts           ← Edge-runtime auth + routing
```

## Adding a feature

### New page (no data)

```bash
# 1. Create the file
mkdir apps/web/app/your-page
touch apps/web/app/your-page/page.tsx
```

```tsx
// apps/web/app/your-page/page.tsx
import { AppShell } from "@/components/layout/app-shell";

export default function YourPage() {
  return (
    <AppShell>
      <h1 className="text-2xl font-semibold">Your Page</h1>
    </AppShell>
  );
}
```

### New page (with data)

```tsx
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/layout/app-shell";

export default async function YourPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // RLS automatically scopes this to what the user can see
  const { data: stuff } = await supabase
    .from("some_table")
    .select("*");

  return (
    <AppShell>
      {stuff?.map(s => <div key={s.id}>{s.name}</div>)}
    </AppShell>
  );
}
```

### New table

```bash
# 1. Create the migration
touch packages/db/migrations/0004_your_feature.sql

# 2. Write SQL: CREATE TABLE, INDEXES, ALTER TABLE ENABLE ROW LEVEL SECURITY,
#    CREATE POLICY for each role

# 3. Run it in Supabase SQL editor

# 4. Regenerate types
pnpm dlx supabase gen types typescript ... > apps/web/lib/types/database.ts
```

## Testing

We're not heavy on tests — this is a small studio's internal tool, not a SaaS
product. Focus is integration + manual testing during development.

If you want to add tests later:
- **Unit tests:** Vitest (Tailwind v4 + Next.js 15 compatible)
- **E2E tests:** Playwright (great for testing the intake → waiver → dashboard flow)

The Python generator already has a real test suite in `apps/generator/tests/`.

## Common gotchas

**"Cannot read properties of undefined" on first load.**
You haven't run the migrations. Open Supabase SQL editor and run them.

**"Row violates RLS policy" when inserting as a service.**
You used `createClient()` (user-scoped) where you needed `createServiceClient()`
(admin-scoped). Webhooks need service-role.

**Magic link redirects to localhost in production.**
Set `NEXT_PUBLIC_URL` in Vercel env vars. The auth callback uses it.

**Stripe webhook signature verification fails.**
The `STRIPE_WEBHOOK_SECRET` is different per environment:
- Dev: `stripe listen` prints it
- Staging: Stripe dashboard → Webhooks → your endpoint → Signing secret
- Prod: same as staging but for the prod endpoint

**`Type error: Property 'X' does not exist on type 'never'`.**
You haven't regenerated database types after a migration. Run the
`supabase gen types` command.

## Coding conventions

- **TypeScript strict** — no `any` except at known external boundaries (Stripe, Supabase JSON columns)
- **Server Components by default** — only use `"use client"` when you need interactivity
- **Tailwind classes inline** — no separate stylesheets, no CSS modules
- **`cn()` utility** for conditional classes — never string concatenation
- **`forwardRef`** all UI primitives so they can be composed with refs
- **Async server pages** — use `async/await` directly, don't fetch in `useEffect`

## Resources

- [Next.js 15 docs](https://nextjs.org/docs)
- [Supabase docs](https://supabase.com/docs)
- [Stripe API reference](https://stripe.com/docs/api)
- [Tailwind v4](https://tailwindcss.com/docs/v4-beta)
- [shadcn/ui](https://ui.shadcn.com) — component recipes (we have inline copies)
- [Inngest docs](https://www.inngest.com/docs)
