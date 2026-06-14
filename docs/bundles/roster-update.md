# Roster Update — Drop-In Files

This bundle replaces 3 dashboard files and adds 1 new seed script.
Drop these on top of your existing `ims-coach-os/` repo.

## What changed

### 1. Owner dashboard — mock removed, real queries added
**File:** `apps/web/components/dashboard/owner-dashboard.tsx`

Now an async server component that pulls live data from Supabase:
- **MRR** = sum of `monthly_rate_cents` across active memberships
- **Active members** = count of `clients` with status='active'
- **New leads this month** = count where status='lead' and created_at ≥ start of month
- **Conversion rate** = (active sign-ups this month) / (assessments completed this month)
- **90-day retention** = clients who joined ≥90 days ago and are still active
- **Pipeline funnel** = real counts grouped by `clients.status`
- **At-risk list** = active members with no session in 14+ days
- **Roster preview** = 8 most recent clients with names, status badges, and links to profile
- **Recent sign-ups** = 5 most recent `joined_at` dates

All cards have honest empty states ("No clients yet", "Everyone's been seen recently").
Nothing is faked.

### 2. Trainer dashboard — mock removed, real queries added
**File:** `apps/web/components/dashboard/trainer-dashboard.tsx`

- Today's sessions for the logged-in trainer (joined to client names + program names)
- Pending tasks generated from real draft programs and completed assessments awaiting program generation
- Unread messages pulled from `messages` where `read_at IS NULL`

### 3. Client dashboard — mock removed, real queries added
**File:** `apps/web/components/dashboard/client-dashboard.tsx`

- Next session: nearest upcoming session for the logged-in client
- This week strip: real session statuses for the current week (complete / today / upcoming / rest)
- Mobility homework: from `mobility_assignments` + completion count from `mobility_completions`
- Progress: latest body comp + delta vs first scan

### 4. Dashboard route — async-aware
**File:** `apps/web/app/dashboard/page.tsx`

The route already worked with sync components; the only change is that the dashboards
themselves now do async data loading internally. This file is included for completeness.

### 5. NEW — Client roster seed script
**File:** `apps/web/scripts/seed-clients.ts`

Populates 46 real IMS clients into Supabase auth + profiles + clients + memberships.

## How to apply

```bash
# From the root of your ims-coach-os repo:
unzip ims-coach-os-roster-update.zip -d /tmp/update
cp -r /tmp/update/apps/web/components/dashboard/*.tsx \
      apps/web/components/dashboard/
cp /tmp/update/apps/web/app/dashboard/page.tsx \
   apps/web/app/dashboard/page.tsx
cp /tmp/update/apps/web/scripts/seed-clients.ts \
   apps/web/scripts/

# Install (one-time)
cd apps/web && pnpm install

# Make sure SUPABASE_SERVICE_ROLE_KEY is in apps/web/.env.local
# Then seed:
pnpm tsx scripts/seed-clients.ts
```

Expected output:
```
🌱 Seeding 46 clients into Supabase...

  ✓ Nikki                (24 sessions)
  ✓ Will                 (12 sessions)
  ✓ Diana                (12 sessions)
  ✓ Dan                  (33 sessions)
  ...
  ✓ Gabriel              (no package)

46 created · 0 already existed · 0 failed

Next steps for Jason:
  1. Open Owner → Clients to confirm everyone is there
  2. Replace @ims-roster.local placeholder emails with real client emails
  ...
```

Re-running is safe — clients with existing placeholder emails are skipped.

## What the seed actually creates

For each client:
1. An `auth.users` row with email like `nikki@ims-roster.local` (placeholder)
2. A `profiles` row (auto-created by your trigger) with `role='client'` and full name
3. A `clients` row with `status='active'`
4. **If they had a package number** — a `memberships` row with the appropriate tier:
   - 6/12/24 → matching `package_6`/`package_12`/`package_24` tier, fresh
   - 33 (Dan) → `package_24` with `total_sessions=33` (overage saved as-is)
   - 15 (Robin) → `package_24` with `sessions_used=9` so 15 remain
   - 4 (Sarah H.) → `package_12` with `sessions_used=8` so 4 remain
5. **If no number** — no membership row, leaves it blank for you to set manually

## Cleanup tasks for Jason after seeding

These need human judgment so the script doesn't guess:

1. **24 clients have no membership tier yet.**
   Decide for each whether they're Essentials ($780/mo), Standard ($1,169/mo),
   Premium ($1,559/mo), Recovery ($100/mo), or just packaged.
   Joey L., AJ, Colleen, Matt, Christian, Maverick, Zach, Ryan, Stephanie,
   Juan, Josh, Olive, Iris, Shelby, Matt Yarling, Stacey, Debbie, Danny,
   Nick, Hailey, Jen, Alan, Tom, Tameem, Gabriel.

2. **Dan (33), Robin (15), Sarah H. (4)** — if my interpretations are wrong,
   open the membership row and adjust `total_sessions` and `sessions_used`.

3. **Gabriel** — if this is your trainer Gabriel Madrid, delete this client row.
   Trainers are seeded separately with `role='trainer'`.

4. **Real emails** — placeholder `@ims-roster.local` addresses won't deliver.
   Update each client's email to their real one before sending magic-link
   invites.

5. **Sarah S. vs Sarah H.** — both are seeded as separate clients. Confirm
   they're actually two people, not a typo.
