# Deployment

End-to-end deployment from a fresh repo to a live production app at
`app.imsmethod.com`. Should take an afternoon.

---

## Step 1 — Provision Supabase (production)

1. Go to https://supabase.com/dashboard
2. **New project** → name it `ims-prod` → pick US-West region (closest to San Diego)
3. Generate a strong DB password, save it in 1Password
4. Wait ~2 minutes for provisioning
5. **SQL editor** → run each migration in order:
   - `packages/db/migrations/0001_initial_schema.sql`
   - `packages/db/migrations/0002_pricing_lockin.sql`
6. **Settings → API** → copy:
   - `Project URL`
   - `anon public` key
   - `service_role` key (treat like a password)
7. **Storage** → create three buckets, all **private**:
   - `waivers`
   - `intakes`
   - `programs`
   - `bodycomp-photos`
   - And two **public**:
   - `exercise-videos`
   - `avatars`
8. **Authentication → URL Configuration**:
   - Site URL: `https://app.imsmethod.com`
   - Redirect URLs: `https://app.imsmethod.com/api/auth/callback`

---

## Step 2 — Provision Stripe

1. Go to https://dashboard.stripe.com → ensure live mode (top toggle)
2. **Developers → API keys** → copy:
   - `Secret key` (live)
   - `Publishable key` (live)
3. Run the catalog seed against live mode:
   ```bash
   STRIPE_SECRET_KEY=sk_live_... pnpm tsx apps/web/scripts/seed-stripe-catalog.ts
   ```
4. **Developers → Webhooks → Add endpoint**:
   - URL: `https://app.imsmethod.com/api/webhooks/stripe`
   - Events to send:
     - `checkout.session.completed`
     - `customer.subscription.created`
     - `customer.subscription.updated`
     - `customer.subscription.deleted`
     - `invoice.payment_succeeded`
     - `invoice.payment_failed`
     - `charge.refunded`
   - Copy the **signing secret** (`whsec_...`)
5. **Settings → Customer portal → Activate test link** (and live link). Configure what customers can do (cancel, update payment method, view invoices). Save.

---

## Step 3 — Deploy Python generator (Railway)

1. Push the monorepo to GitHub
2. Populate `apps/generator/` with the existing `ims-fresh-repo.zip` contents
   (see `apps/generator/README.md`)
3. Go to https://railway.app → **New project → Deploy from GitHub repo**
4. Select your repo
5. **Settings → Service Settings → Root Directory**: `apps/generator`
6. Railway auto-detects the Dockerfile
7. Click **Deploy**
8. Once green, **Settings → Networking → Generate Domain** to get a public URL
9. Save the URL (e.g. `https://ims-generator-production.up.railway.app`)

Test it:
```bash
curl -X POST https://ims-generator-production.up.railway.app/generate \
  -H "Content-Type: application/json" \
  -d '{"client_name": "Test", "fra_priorities": []}'
# → should return a Program JSON
```

---

## Step 4 — Deploy web app (Vercel)

1. Go to https://vercel.com → **Add New → Project** → pick your repo
2. **Configure project**:
   - Framework: Next.js
   - Root directory: `apps/web`
   - Build command: `cd ../.. && pnpm install && pnpm build --filter=@ims/web`
3. **Environment variables** (from `.env.example`, fill in real values):
   ```
   NEXT_PUBLIC_URL=https://app.imsmethod.com
   NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
   SUPABASE_SERVICE_ROLE_KEY=eyJ...
   STRIPE_SECRET_KEY=sk_live_...
   STRIPE_PUBLISHABLE_KEY=pk_live_...
   STRIPE_WEBHOOK_SECRET=whsec_...
   PYTHON_GENERATOR_URL=https://ims-generator-production.up.railway.app
   RESEND_API_KEY=re_...
   RESEND_FROM_EMAIL=jason@imsmethod.com
   TWILIO_ACCOUNT_SID=AC...
   TWILIO_AUTH_TOKEN=...
   TWILIO_PHONE_NUMBER=+16199371434
   INNGEST_EVENT_KEY=...
   INNGEST_SIGNING_KEY=signkey-...
   ```
4. Click **Deploy**
5. Once deployed, **Settings → Domains → Add**: `app.imsmethod.com`
6. Add the DNS record at your domain registrar (Vercel will tell you which)

---

## Step 5 — Bootstrap the owner account

1. Visit `https://app.imsmethod.com/login`
2. Sign in with your email (Jason's)
3. In Supabase SQL editor:
   ```sql
   UPDATE profiles
   SET role = 'owner'
   WHERE email = 'jason@imsmethod.com';
   ```
4. Refresh the browser. You're now the owner.

---

## Step 6 — Invite the team

In the owner dashboard (once built; currently you'll do this directly):

1. **Add Gabriel:**
   - Tell Gabriel to sign up at `app.imsmethod.com/login`
   - In Supabase SQL editor:
     ```sql
     UPDATE profiles
     SET role = 'trainer'
     WHERE email = 'gabriel@imsmethod.com';
     ```
2. **Add Kara:** same pattern with her email.

---

## Step 7 — Configure email + SMS (Resend + Twilio)

### Resend
1. https://resend.com → create account
2. **Domains → Add domain** → `imsmethod.com`
3. Add the DNS records they specify
4. Wait for verification (~5 min)
5. **API keys → Create** → copy → set `RESEND_API_KEY` in Vercel
6. Set `RESEND_FROM_EMAIL=jason@imsmethod.com` (or `noreply@imsmethod.com`)

### Twilio
1. https://www.twilio.com → upgrade to paid (need this for sending SMS to real numbers)
2. **Phone Numbers → Buy a number** → pick a San Diego (619) number
3. **Account info → API credentials** → copy SID + token
4. Set `TWILIO_*` in Vercel

---

## Step 8 — Set up Inngest (workflows)

1. https://app.inngest.com → create account → create app `ims-coach-os`
2. **Apps → Sync new app** → enter your production URL: `https://app.imsmethod.com/api/inngest`
3. Copy event key + signing key into Vercel env vars
4. Inngest will auto-discover any workflows you define in `apps/web/lib/inngest/`

(No workflows are defined in this scaffold yet — start with the
post-assessment follow-up sequence per the build spec.)

---

## Step 9 — Smoke test

In production, run through this checklist:

- [ ] Visit `app.imsmethod.com` → bounces to `/login`
- [ ] Sign in with magic link → arrives at owner dashboard
- [ ] Sidebar shows owner items (Reports, Services)
- [ ] Visit `/settings/services` → see seeded recovery catalog
- [ ] Visit `/intake/demo_invalid_token` → see "Link not found" error
- [ ] Stripe webhook test (Stripe dashboard → Webhooks → your endpoint → "Send test webhook" with `customer.subscription.created`) → check Supabase `stripe_events` table for the row
- [ ] Sign out → back to `/login`

---

## Phase 1 launch checklist (for when you're ready)

- [ ] All current 55 IMS clients have profile rows in Supabase
- [ ] All trainers have accounts with role='trainer'
- [ ] Stripe products match Vagaro pricing exactly
- [ ] Refund policy + cancellation policy text deployed to imsmethod.com
- [ ] Migration email drafted for Vagaro members ("we're upgrading our system")
- [ ] First post-assessment Inngest workflow built and tested
- [ ] Public intake URL tested on real iPhone + Android
- [ ] PDF waiver delivery confirmed working
- [ ] Sentry error tracking enabled and quiet (no errors in last 24hr)
- [ ] Backup taken from Supabase before launch

---

## Ongoing operations

### Database backups
Supabase Pro tier includes daily automated backups with 7-day point-in-time
recovery. Verify in Settings → Backups.

### Monitoring
- **Sentry** → all errors aggregate here, set up Slack alerts
- **PostHog** → user behavior, conversion funnels
- **Vercel Analytics** → traffic, Core Web Vitals
- **Stripe dashboard** → payment health, dispute alerts

### Updates
```bash
# Update dependencies monthly
pnpm update --interactive --recursive

# Test locally → push to a branch → Vercel deploys preview → review → merge
```

### Cost monitoring
Set billing alerts on:
- **Vercel** ($20/mo) → alert at $40
- **Supabase** ($25/mo) → alert at $50
- **Stripe** (no fixed fee, % only) → review monthly
- **Resend** ($20/mo) → alert at $40
- **Twilio** (~$15-30/mo) → alert at $60
- **Railway** ($5/mo) → alert at $10

If any service triples its expected cost, something's broken. Check Sentry
first.
