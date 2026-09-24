# Verified integration baseline — September 22, 2026

## Connected systems and scope
- GitHub: IMS858/coachos, feature/public-consultation-entry; draft PR #2.
- Supabase: active project `ims-coach-os`, project ref `hatcusqagwpmebzsbolw` (us-west-2). Read-only schema inspection completed; **no production database writes**.
- Vercel: verified project `coachos` (`prj_B5Fu00jMneA2DitUjgsJ2880F9JB`) under `innovative-movement-solutions` (`team_jeEx9EhG01h6NQLyOKs3v6jK`). The connector can list projects and deployments **when `teamId` is an empty string**; passing the explicit team ID returns 403. Production deployment `dpl_9aVuN21CZgL8gXjSZdwWPZpCTLmj` is READY and serves `coachos-opal.vercel.app` from `main` commit `52376a51ad7464447be8fb9503dcb25cb256010b`. Preview deployment `dpl_FoPL1bQJhkkgr6z1PkXsrwAdF8cN` is READY from this feature branch commit `52e97193f1d805e2875ea04273f798418b6a8cad`. The preview URL is protected and `web_fetch_vercel_url` returned access denied; runtime diagnostics require a team ID and currently return an authorization error. **READY verifies build/deployment status, not functional route or database integration.**

## Verified production Supabase structure
- `profiles`, `clients`, `sessions`, `assessments`, `programs`, `intake_forms`, `intake_tokens`, `waivers`, `agreement_requests`, `recurring_series`, `rooms`, `app_events` exist and have RLS enabled where inspected.
- `sessions` includes `vagaro_event_id` (unique, nullable), `trainer_id`, `room_id`, `scheduled_at`, `duration_minutes`, `status`, `session_type`, `notes_pre`.
- Existing `session_type` enum includes assessment/training/mobility/pilates/recovery/body_comp/massage, but **not phone consultation**.
- `intake_forms` and `waivers` exist in IMS database; this does not establish migration of the signed Vagaro waivers or legal equivalence.
- `recurring_series` stores trainer, slots, duration and generated-through date.
- `agreement_requests` can associate a client and document types with an expiring token.

## Current code findings
- `app/book/page.tsx` is authenticated client self-booking, not a public prospect booking page.
- `components/booking/booking-form.tsx` generates candidate slots from opening hours, **not from actual Vagaro availability**.
- `app/api/sessions/request/route.ts` creates `requested` sessions for signed-in clients, requiring owner/staff approval. Do not display these as confirmed availability.
- `app/consult/page.tsx` added on this branch as a public phone/in-person choice; phone calls are arranged manually and in-person appointments still use Vagaro.
- `proxy.ts` now allows public `/consult` access.

## Migration safety gates
1. Vercel project/team identified. Still verify which Supabase project is configured for production (inspect environment variable **names and URL host only**; never print secret values); do not assume the connected project is the production database.
2. Verify live route, mobile layout, accessibility and build on preview.
3. Establish a reliable authoritative calendar feed/integration or migrate the full gym calendar with conflict checks. `vagaro_event_id` alone is not a sync.
4. Implement phone consultation as a separate appointment type and duration only after deciding how it appears in scheduling and availability. Never generate bookable phone slots from opening hours alone.
5. Decide where intake and signed waivers live during transition; avoid duplicate signatures and avoid moving sensitive data without a reviewed migration.
6. Test booking, cancellation, reminders, timezone and concurrent booking against non-production data.
7. Obtain owner approval before publishing or switching the website CTA from Vagaro to Coach OS.

## Immediate priority
Keep existing Vagaro booking live. Continue building Coach OS in a draft PR; do not deploy or alter the live database until project mapping and calendar safety are verified.
