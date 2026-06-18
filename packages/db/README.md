# Database Migrations

Sequentially-numbered SQL files. Run in order against your Supabase project.
Each file is idempotent (safe to re-run).

## Order

1. **`0001_initial_schema.sql`** — Core tables, enums, RLS policies, triggers
2. **`0002_pricing_lockin.sql`** — Recovery membership tier, configurable service catalog, Stripe billing tables
3. **`0003_dev_seed.sql`** — ⚠️ DEV ONLY — example users/clients/sessions

## Running migrations

### Via Supabase dashboard (recommended for first deploy)
1. https://supabase.com/dashboard → your project → SQL Editor
2. Open each file in order, paste into the editor, run
3. Verify tables in Table Editor

### Via Supabase CLI (recommended for ongoing dev)
```bash
pnpm dlx supabase login
pnpm dlx supabase link --project-ref YOUR_PROJECT_REF
pnpm dlx supabase db push
```

## Adding a new migration

```bash
# Pick the next number
ls packages/db/migrations/
# e.g. existing files end at 0003 → next is 0004

# Create
touch packages/db/migrations/0004_short_descriptive_name.sql
```

Conventions for new migrations:
- Always wrap DDL in `IF NOT EXISTS` / `OR REPLACE` to make re-runs safe
- Use `DO $$ BEGIN ... EXCEPTION WHEN duplicate_object THEN NULL; END $$` for enum types
- Always add RLS policies for new tables — never leave a table with RLS disabled
- Always add an updated_at trigger if the table has an `updated_at` column
- Write a comment block at the top explaining what the migration does

## Regenerating TypeScript types

After every migration:
```bash
pnpm dlx supabase gen types typescript \
  --project-id YOUR_PROJECT_ID \
  --schema public \
  > apps/web/lib/types/database.ts
```

This keeps `Database` interface in sync with the actual schema. TypeScript
will yell at you if you query a column that doesn't exist.
