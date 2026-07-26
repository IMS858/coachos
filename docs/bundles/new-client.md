# New Client Form

Adds a real onboarding flow at `/clients/new`.

## What this delivers

1. Click "+ New client" on the clients list
2. Fill in name, email, optional phone
3. Pick status (active / lead)
4. Optionally configure their first plan inline:
   - **Skip** — create them now, set billing later
   - **Subscription** — pick tier (Essentials / Standard / Premium / Recovery / Custom)
   - **Package** — pick service type (training/massage/pilates), size (6/12/24), starting session
5. Click Create → redirected to their fresh profile

The full flow takes ~30 seconds for a new member you're onboarding right then. No SQL, no scripts.

## Files

```
new-client/
├── apps/web/
│   ├── app/
│   │   ├── api/clients/route.ts           ← POST: create new client
│   │   └── clients/new/page.tsx           ← /clients/new route
│   └── components/clients/
│       └── new-client-form.tsx            ← interactive form
├── PATCH_clients_page.md                  ← one-line tweak to the existing list page
└── README.md
```

## How to apply

```bash
unzip ims-coach-os-new-client.zip
cd ims-coach-os/

# Drop in the new files
mkdir -p apps/web/app/api/clients
cp ../new-client/apps/web/app/api/clients/route.ts apps/web/app/api/clients/route.ts
mkdir -p apps/web/app/clients/new
cp ../new-client/apps/web/app/clients/new/page.tsx apps/web/app/clients/new/page.tsx
cp ../new-client/apps/web/components/clients/new-client-form.tsx apps/web/components/clients/new-client-form.tsx

# Wire the existing "+ New client" button — see PATCH_clients_page.md
# It's literally wrapping <Button>...</Button> in <Link href="/clients/new">...</Link>
```

## Edge cases handled

- **Email already exists** — 409 with a clear message; auth user not created
- **Auth user creation fails** — surfaces the underlying error (e.g. invalid email format)
- **Plan creation fails** — client is created successfully, plan creation error surfaces as a warning, you land on their profile to set up the plan manually (no orphan rollback needed since RLS still gates writes)
- **Custom subscription with no name or no rate** — caught client-side before submit
- **Package with no service type** — server validates and returns 400

## What's still missing

- **No password set / invite email yet** — the API creates the auth user with a random password and `email_confirm: true`. The client can sign in via magic link when ready (the standard `/login` flow handles it). If you want to send them a "welcome to IMS, click here to sign in" email, hook this into Inngest later — emit `client.created` on success and have a workflow send the magic link.
- **No bulk import** — for the 25 unset clients you still need to convert from the seed, you'll either click into each one or write a one-off SQL update. Bulk CSV import is a half-day build if you want it.
- **No avatar upload** — Supabase Storage is set up for it, just need a file picker in the form.

That's three checkboxes on the to-do list. Tell me which one you want next.
