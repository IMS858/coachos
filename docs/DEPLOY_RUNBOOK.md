# Deploy Runbook — IMS Coach OS

This is the doc you follow start-to-finish. Plan ~3 hours including buffer.
Coffee on a Saturday is the right call.

**Tailored to your setup:**
- ✅ GitHub + Vercel + Supabase already set up
- ✅ Fresh Supabase production project (empty)
- ⏭️  No custom domain — using `*.vercel.app` for now
- ⏭️  No Stripe — staying on Vagaro for billing
- ⏭️  No Bunny Stream — library video is post-launch
- ⏭️  No Railway — Python program generator is post-launch
- ⏭️  No production user accounts yet — we'll create one owner

---

## PART 0 — Pre-flight (15 min)

### 0.1 Verify the local repo builds

Before touching production, confirm everything you've collected from bundles
actually compiles together.

```bash
cd /path/to/ims-coach-os
pnpm install
pnpm build
```

If `pnpm build` errors, **stop here**. Fix imports / missing files before
going further. The most common cause is a partial bundle apply — a component
imports something that wasn't copied over.

If it builds clean: you're golden. Continue.

### 0.2 Confirm migration files are present

```bash
ls -1 packages/db/migrations/
```

You should see (or close to it):
```
0001_initial_schema.sql
0002_pricing_lockin.sql
0004_billing_type_and_counter.sql
0005_multi_plan_model.sql
0006_session_plan_integration.sql
0007_security_hardening.sql
0008_extend_session_type.sql
0009_concurrency_and_indexes.sql
0010_exercise_library.sql
```

(There is no 0003 — was reserved for a seed file. That's correct.)

### 0.3 Have these tabs open in your browser

- Supabase dashboard → your production project
- Vercel dashboard → your IMS project (or "Add New" if not yet imported)
- GitHub → the IMS repo

---

## PART 1 — Supabase production database (30 min)

### 1.1 Find your Supabase keys

In the Supabase dashboard for your prod project:
**Settings → API**

Copy these into a temporary scratchpad:

| Variable | Where to find it |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | "Project URL" |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | "Project API keys" → `anon` `public` |
| `SUPABASE_SERVICE_ROLE_KEY` | "Project API keys" → `service_role` `secret` ⚠️ |

⚠️ The service role key bypasses RLS. Treat it like a database password.
Never commit it. Never paste it in a public Slack channel.

### 1.2 Run the migrations in order

Open: **Supabase dashboard → SQL Editor → New query**

For **each** migration file, in numeric order (0001, 0002, 0004, 0005, 0006, 0007, 0008, 0009, 0010):

1. Open the file in your local editor
2. Copy entire contents
3. Paste into Supabase SQL Editor
4. Click **Run**
5. Wait for "Success. No rows returned" (or similar)
6. Move to next file

**Do not skip ahead.** Each migration depends on the previous ones.

If you hit an error mid-way, **stop and fix before continuing**. Common issues:
- "type already exists" → rerunning a migration, fine to skip
- "relation does not exist" → previous migration didn't run; back up and retry
- Anything else → paste the error to me and we'll debug

### 1.3 Verify the schema

In SQL Editor, run:

```sql
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public' ORDER BY table_name;
```

You should see at least:
```
assessments, body_comp_results, clients, exercise_favorites, exercises,
intake_tokens, memberships, messages, mobility_assignments,
mobility_completions, payments, plans, profiles, program_exercises,
programs, refund_queue, service_catalog, sessions, stripe_events, waivers
```

(`memberships` is the deprecated table that's still present — that's correct.)

Then verify the critical bits:

```sql
-- 1. Counter functions exist
SELECT proname FROM pg_proc
WHERE proname IN ('increment_session_counter', 'decrement_session_counter');
-- Should return 2 rows

-- 2. View has security_invoker (the audit-1 critical fix)
SELECT relname, reloptions FROM pg_class
WHERE relname = 'client_billing_summary';
-- reloptions should include 'security_invoker=on'

-- 3. RLS is on
SELECT relname, relrowsecurity FROM pg_class
WHERE relname IN ('clients', 'plans', 'sessions', 'exercises')
  AND relkind = 'r';
-- All four should show relrowsecurity = true
```

If any of these fail, do not deploy. Migrations didn't run cleanly.

### 1.4 Set the auth Site URL — placeholder for now

We'll come back to this once Vercel gives us a URL. For now:

**Supabase → Authentication → URL Configuration**

Leave Site URL as `http://localhost:3000` for the moment. We'll update it in
Part 4.

---

## PART 2 — Vercel deployment (20 min)

### 2.1 Import the repo (if not done)

In the Vercel dashboard:
**Add New → Project → Import** the GitHub repo.

If already connected: skip to 2.2.

### 2.2 Build settings

Vercel should auto-detect Next.js. If it asks:
- Framework: **Next.js**
- Build command: `pnpm build` (default is fine)
- Output directory: `.next` (default)
- Install command: `pnpm install`

If your repo is a monorepo (apps/web), set **Root Directory** to `apps/web`.

### 2.3 Environment variables — only the required three

**Project Settings → Environment Variables**

Add only:

| Name | Value | Environments |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | from 1.1 | Production, Preview, Development |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | from 1.1 | Production, Preview, Development |
| `SUPABASE_SERVICE_ROLE_KEY` | from 1.1 | **Production only** |

**Skip these** (you're not using them yet):
- ❌ `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` — staying on Vagaro
- ❌ `NEXT_PUBLIC_BUNNY_LIBRARY_ID`, `BUNNY_API_KEY` — no video upload yet
- ❌ `PROGRAM_GENERATOR_URL` — no Python generator yet
- ❌ `RESEND_API_KEY`, `TWILIO_*` — magic link uses Supabase's built-in email

The app handles missing optional env vars gracefully — Stripe webhook will
500 if Stripe ever calls it, but Stripe isn't going to call it because we
haven't given them the URL.

### 2.4 Deploy

Click **Deploy** (or push a commit to main if auto-deploy is on).

Watch the build log. If it fails:
- "Module not found" → bundle not fully applied; back to step 0.1
- "Environment variable required" → re-check 2.3
- Anything else → paste the log here

### 2.5 Note your Vercel URL

Once deployed, you have something like `https://ims-coach-os.vercel.app` (or
`ims-coach-os-yourusername.vercel.app`). Copy it. We need it next.

---

## PART 3 — Connect Auth to your live URL (10 min)

This is the step everyone forgets. Without it, magic-link sign-in goes to
localhost and breaks.

### 3.1 Update Supabase Auth URLs

**Supabase → Authentication → URL Configuration**

- **Site URL**: `https://your-app.vercel.app` (your URL from 2.5)
- **Redirect URLs**: add
  - `https://your-app.vercel.app/**`
  - `http://localhost:3000/**` (keep this so you can still develop locally)

Click Save.

### 3.2 Test the URL is reachable

In a browser, visit `https://your-app.vercel.app/login`. You should see the
login form. If you see a 500 or "Application error," the env vars are wrong
or missing — back to 2.3.

---

## PART 4 — Owner account + seed data (20 min)

### 4.1 Create your owner account

This requires running a script against the production Supabase. We'll point
the local repo at production for one command.

```bash
cd /path/to/ims-coach-os/apps/web

# Create a temporary .env.production.local pointing at PROD
cat > .env.production.local <<EOF
NEXT_PUBLIC_SUPABASE_URL=<your prod URL from 1.1>
SUPABASE_SERVICE_ROLE_KEY=<your prod service role key from 1.1>
EOF

# Source it and run the owner bootstrap
export $(grep -v '^#' .env.production.local | xargs)
pnpm tsx scripts/seed-owner.ts jason@imsfitnesscenter.com "Jason Patterson"
```

Replace the email with your real one. Output should be:

```
Looking up jason@imsfitnesscenter.com...
Creating new owner account for jason@imsfitnesscenter.com...

✓ Owner account created.
  Email:  jason@imsfitnesscenter.com
  Name:   Jason Patterson
  Role:   owner

Now go to /login and sign in. Magic link email will be sent.
```

### 4.2 Sign in for the first time

1. Open `https://your-app.vercel.app/login` in your browser
2. Enter the email you used above
3. Check your inbox (Supabase sends the magic link via their built-in email — not always instant, give it a minute and check spam)
4. Click the link
5. You should land on `/dashboard` showing the **Owner** view

If the link goes to `http://localhost:3000` and breaks → step 3.1 wasn't done.

If you land on `/dashboard` but see no data → that's correct, you haven't seeded
clients yet. Continue to 4.3.

### 4.3 Seed the 46 clients

Still in `apps/web` with the env file sourced:

```bash
pnpm tsx scripts/seed-clients.ts
```

Expected output:
```
🌱 Seeding 46 clients (writing to plans table)

  ✓ Nikki                training pack #24
  ✓ Will                 training pack #12
  ...
46 created · 0 existed · 0 failed
```

### 4.4 Seed Nikki's three plans

```bash
pnpm tsx scripts/seed-nikki-plans.ts
```

Output:
```
Found Nikki (<uuid>). Setting up her plans...
  Cancelled 1 existing active plan(s)

✓ Nikki Custom subscription — $3,550/month
✓ Training 12-pack — session #24
✓ Massage 12-pack — session #0
```

### 4.5 Seed Jerry's three plans

```bash
pnpm tsx scripts/seed-jerry-plans.ts
```

Output mirrors Nikki's.

### 4.6 (Optional) Seed the 15 exemplar exercises

If you want to start populating the library now, even without Bunny videos:

```bash
pnpm tsx scripts/seed-exercises.ts
```

The exercises will show as drafts. You can rewrite cues + publish them
gradually over the following weeks.

### 4.7 ⚠️ Clean up the production env file

```bash
rm apps/web/.env.production.local
```

You don't want service role keys lingering in your local repo.

---

## PART 5 — Smoke test (30 min)

Walk through these in the browser as the signed-in owner. Anything that fails
is a launch blocker.

### Critical path — must work

- [ ] **Sign in** with magic link → land on `/dashboard`
- [ ] **Owner dashboard** loads, shows 46 clients in the roster
- [ ] **MRR** card shows ~$7,100 (Nikki + Jerry custom subs)
- [ ] **At-risk list** shows everyone (correct — no sessions yet)
- [ ] Click `/clients` → see 46 rows, search works
- [ ] Click into **Nikki** → see three active plans (custom sub + 2 packages)
- [ ] On Nikki's profile, **bump training counter** with `+` button → saves, refresh confirms
- [ ] Open `/sessions/new?mode=log` → Quick Log opens
- [ ] **Search "nikki"** → she appears, plans visible inline
- [ ] **Pick training**, datetime defaults to 1 hour ago
- [ ] See preview "Will tick Nikki's training counter from #N → #N+1"
- [ ] Click **Log + tick counter** → land on session detail with green confirmation
- [ ] Open Nikki's profile again → counter has advanced

### Nice to verify (do during the soak weekend)

- [ ] Undo that completion → counter rolls back
- [ ] `/clients/new` → create a test client → land on their profile
- [ ] Add a subscription plan to the test client → save works
- [ ] Try to add a second active subscription → see the friendly 409 error
- [ ] Cancel the test plan → click Reactivate → it comes back
- [ ] If you ran 4.6: `/library?draft=1` → 15 exercise cards shown
- [ ] Open one exercise → Edit → publish → it goes from draft to live

### Concurrency smoke (the audit-2 fix)

In two browser windows (or one window + an incognito as a second trainer
account if you want):

- [ ] Open `/sessions/new` in both
- [ ] Pick the same client (Nikki) in both
- [ ] Pick training in both
- [ ] Click **Log** in window 1, then immediately in window 2
- [ ] Refresh Nikki's profile → counter should have ticked **twice** (not once)

If both ticks are recorded, the FOR UPDATE lock is working in production.

---

## PART 6 — When things break

### "I can't sign in — magic link goes nowhere"
- Check Supabase → Authentication → Logs for delivery errors
- Check spam folder
- Verify Site URL in Auth settings matches your Vercel URL exactly (https, no trailing slash)

### "/dashboard shows zero clients but I seeded 46"
- Are you signed in as the owner? Check `/profile` (or open the user menu)
- In SQL Editor: `SELECT count(*) FROM clients;` — should return 46
- If 46 in DB but UI shows 0, RLS issue — check that your profile row has `role='owner'`

### "Counter didn't tick after marking complete"
- Check Supabase → Database → Functions: `increment_session_counter` should be there
- Check sessions table: `SELECT id, status, plan_id FROM sessions ORDER BY created_at DESC LIMIT 5;`
- If status='completed' but plan_id is null, the service_type didn't match a package — verify Nikki has an active training package

### "API endpoint returns 500"
- Vercel → your project → Functions tab → click into the failing endpoint → see the error log
- Most common: missing env var (re-check Part 2.3) or stale build (redeploy from Vercel dashboard)

### "Build fails on Vercel but works locally"
- Vercel Node version may differ. Set `NODE_VERSION` env var to match your local (`node -v`)
- pnpm version: add `"packageManager": "pnpm@8.x.x"` to root `package.json` if not present

### Rollback procedure
You don't need one yet. Supabase backs up daily on paid plans. Vercel keeps
all previous deploys — click any prior one → "Promote to Production." In a
real disaster, the worst case is restoring the database from yesterday's backup
and re-running today's seed scripts.

---

## PART 7 — After the soak weekend

Things to do in the first two weeks of running on the new system:

- [ ] Onboard 2-3 real new clients via `/clients/new` instead of Vagaro
- [ ] Log every real session through the new app (alongside Vagaro for now)
- [ ] Set membership tiers for the 25 unset clients (open each, pick tier)
- [ ] Replace placeholder `@ims-roster.local` emails with real ones as you collect them
- [ ] Watch for anything weird — at-risk lists, counter values, MRR numbers
- [ ] Once stable for ~2 weeks: drop the deprecated table:
  ```sql
  DROP TABLE memberships CASCADE;
  ```
- [ ] Set up Sentry (~30 min) for error tracking before things get real

When you're confident the data layer is solid, that's when you start the
Phase 2 Stripe migration off Vagaro.

---

## What "done" looks like

You're done with this runbook when:

1. `https://your-app.vercel.app/dashboard` shows the IMS owner view with 46 clients and ~$7,100 MRR
2. You can log a session for Nikki and her counter ticks
3. You can sign out, sign back in via magic link, and land in the same place

Everything else is iteration. The hard part — getting from "code in a zip" to
"running production system" — is done.
