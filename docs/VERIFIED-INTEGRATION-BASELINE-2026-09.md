# Verified integration baseline — September 22, 2026

## Connected systems and scope
- GitHub: IMS858/coachos, feature/public-consultation-entry; draft PR #2.
- Supabase: active project `ims-coach-os`, project ref `hatcusqagwpmebzsbolw` (us-west-2). Read-only schema inspection completed; **no production database writes**.
- Vercel: connected app exposed, but `list_teams` returned no teams and a project listing under an unverified team slug returned 403. **Production project and deployment have not been verified.** Re-authorize Vercel access to the actual project/team, then inspect production and preview deployments before merging.

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
1. Confirm Vercel project/team and which Supabase project is configured for production (inspect environment variable **names and URL host only**; never print secret values).
2. Verify live route, mobile layout, accessibility and build on preview.
3. Establish a reliable authoritative calendar feed/integration or migrate the full gym calendar with conflict checks. `vagaro_event_id` alone is not a sync.
4. Implement phone consultation as a separate appointment type and duration only after deciding how it appears in scheduling and availability. Never generate bookable phone slots from opening hours alone.
5. Decide where intake and signed waivers live during transition; avoid duplicate signatures and avoid moving sensitive data without a reviewed migration.
6. Test booking, cancellation, reminders, timezone and concurrent booking against non-production data.
7. Obtain owner approval before publishing or switching the website CTA from Vagaro to Coach OS.

## Immediate priority
Keep existing Vagaro booking live. Continue building Coach OS in a draft PR; do not deploy or alter the live database until project mapping and calendar safety are verified.
