# Clients Editor Update

This bundle adds a real `/clients` page where you can:
- See your full roster (both billing types)
- Click into any client and edit their billing model
- Switch between membership ↔ package at any time
- Increment a package client's session number with + / − buttons or direct entry

## What changed

### Schema
**New file:** `packages/db/migrations/0004_billing_type_and_counter.sql`

- Adds `clients.billing_type` enum (`membership` | `package` | `unset`)
- Adds `memberships.current_session_number` int — Nikki at 24, Will at 12, etc. (the running session count)
- Creates a `client_billing_summary` view that joins everything for the list/profile screens
- Adds `increment_session_counter(client_id)` Postgres function for atomic count updates when sessions complete

**Run this migration in your Supabase SQL editor before deploying the new code.**

### Pages

**New: `apps/web/app/clients/page.tsx`** — Full clients table
- Search by name (live, debounced)
- Filter by type (membership / package / unset / all)
- Filter by status (active / lead / paused / churned / all)
- Each row links to the profile

**New: `apps/web/app/clients/[id]/page.tsx`** — Profile + edit page
- Server component that loads the client + billing history
- Renders the editor

**New: `apps/web/components/clients/client-editor.tsx`** — The actual editor
- Three-button toggle: Membership / Package / Unset
- For Membership: pick tier (Essentials / Standard / Premium / Recovery) — auto-fills monthly rate
- For Package: pick size (6 / 12 / 24) and adjust the session counter with +/− or direct input
- Save buttons for billing and contact info separately
- Right rail shows full billing history (every change logs as a new membership row, old ones marked cancelled)

**New: `apps/web/components/clients/clients-filter.tsx`** — Filter bar (client component, URL-synced)

### API

**New: `apps/web/app/api/clients/[id]/route.ts`** — Edit endpoint

`PATCH /api/clients/[id]` handles both:
- `kind: 'profile'` — updates name/email/phone on the profiles row
- `kind: 'billing'` — updates billing_type on clients, then either:
  - Creates a new membership row (when tier changes) and cancels the old one
  - Updates current_session_number on the existing row (when just incrementing the count)

Trainer/owner only. Verified twice (RLS + explicit role check).

### Seed script

**Updated: `apps/web/scripts/seed-clients.ts`** — Now classifies all 46 clients

Package clients (21) get `billing_type='package'` + a membership row with the right session count:
- Nikki (24), Will (12), Diana (12), Dan (33), An (24), Delois (12), Gabe (24), Jim (12), Peyton (6), Rajan (12), Sarah S (12), Sarah H (4), Saman (12), Suzanne (12), Donovan (24), Jerry (24), Rich W (12), Frank M (12), Mark (24), Steve (12), Robin (15)

Membership clients (25) get `billing_type='unset'` (you'll pick their tier in the editor):
- Joey L, AJ, Colleen, Matt, Christian, Maverick, Zach, Ryan, Stephanie, Juan, Josh, Olive, Iris, Shelby, Matt Yarling, Stacey, Debbie, Danny, Nick, Hailey, Jen, Alan, Tom, Tameem, Gabriel

## How to apply

```bash
unzip ims-coach-os-clients-update.zip
cd ims-coach-os/   # your existing repo

# 1. Copy new files
cp ../clients-update/packages/db/migrations/*.sql packages/db/migrations/
cp -r ../clients-update/apps/web/app/clients apps/web/app/
cp ../clients-update/apps/web/app/api/clients/[id]/route.ts apps/web/app/api/clients/[id]/route.ts
cp -r ../clients-update/apps/web/components/clients apps/web/components/
cp ../clients-update/apps/web/scripts/seed-clients.ts apps/web/scripts/

# (You may need to mkdir -p apps/web/app/api/clients/[id] first)

# 2. Run the new migration in Supabase SQL editor:
#    packages/db/migrations/0004_billing_type_and_counter.sql

# 3. Re-run the seed (idempotent — existing clients are skipped)
cd apps/web
pnpm tsx scripts/seed-clients.ts
```

Then `pnpm dev` and visit `/clients`.

## Workflow once it's running

**Daily:**
- Trainer marks a session complete → call the `increment_session_counter()` Postgres function (you'll wire this from the session detail page next; the function is ready)
- Nikki goes from 24 → 25 automatically

**Weekly / monthly:**
- Owner reviews `/clients` — see everyone, who's active, who's stuck
- Click into any unset member, pick their membership tier, save → done

**When billing changes:**
- Open client profile, change tier or model, save
- Old membership row marked cancelled with end_date
- New membership row created
- History panel shows the full timeline

## What's still TODO downstream

- The session-completion flow in the trainer dashboard isn't wired to `increment_session_counter()` yet. Two-line change in the session detail page when you build it.
- Stripe sync — when you switch a client to a tier, no Stripe action happens automatically. Add this when you migrate billing off Vagaro.
- "New client" button in the header doesn't open a creation form yet — add a new-client dialog that takes name + email + initial billing.

## What's intentionally simple

- Billing history panel just shows membership rows in reverse-chrono order. No diff view, no edit-of-history. If you record something wrong, fix it forward (cancel + new row).
- No bulk operations — every client edited one at a time. With 46 clients that's fine; if you grow to hundreds, batch import via CSV is straightforward to add.
- No email confirmation on tier changes — the change is instant. Add an Inngest workflow later to email the client "your billing changed" if needed.
