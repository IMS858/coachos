# Database baseline repair
The hosted IMS database contains schema created before Supabase migration tracking began. A fresh Supabase branch therefore cannot replay hosted history from migration 20260923003010 because that migration references public.programs before the tracked history creates it.

## Canonical fresh-environment order
1. Create an empty isolated database.
2. Apply packages/db/migrations/0001_initial_schema.sql and then numbered repository migrations in ascending order.
3. **Do not apply 0003_dev_seed.sql** except to an intentionally synthetic development database.
4. Apply the standalone supabase/migrations files at their documented dependency points. In particular, staff availability/time blocks must precede 0069_client_training_requests, and atomic recurring creation must exist before the current recurring API is accepted.
5. Apply hosted-only historical migrations that are not represented by a numbered repository migration only after their prerequisites exist.
6. Run security/role acceptance before production rollout.

Production must not be treated as the reproducible baseline. The repository is being repaired so a clean database can be built without relying on hidden production history.
