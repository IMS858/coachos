> Historical branch snapshot. Current consolidation status: [UNIFIED-RELEASE-2026-09.md](UNIFIED-RELEASE-2026-09.md).

# IMS Coach OS security and functionality audit — September 22, 2026

Status: code and connected-service audit; **not a completed penetration test or end-to-end production acceptance test**. No production DB mutations, live bookings, or production deployments performed.

## Priority 0 — database privilege review
Live Supabase security advisor flagged 18 SECURITY DEFINER views (including client_engagement, memberships, v_client_balance, v_assessment_full), and 5 public SECURITY DEFINER functions executable by both anon and authenticated: decrement_session_counter, increment_session_counter, handle_new_user, is_owner, is_trainer. Verified execute privileges with read-only pg_proc SQL. Examine definitions, dependencies, API grants, and client access before revoking; do not blindly switch to SECURITY INVOKER or break auth triggers. [Supabase advisor: security definer views](https://supabase.com/docs/guides/database/database-linter?lint=0010_security_definer_view), [public functions](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable).

Additional live advisor findings: 6 functions with mutable search_path, citext extension in public, leaked-password protection disabled, intake_tokens RLS enabled without policies (could be intentional service-role-only). Performance: 26 unindexed foreign keys and 37 RLS auth init-plan findings. These are scanner findings, not proof of exploitable data exposure.

## Priority 0 — generator publication and data integrity
`app/api/generate/route.ts` generates PDF from an assessment, then inserts `programs` with `status: "published"` **without coach review**. It does not check insert error or return program ID, and stores only assessment summary metadata rather than the generated editable exercise plan or PDF storage location. This breaks the advertised generate → review/edit → publish flow. Return draft and persist a complete structured program after validating generator output; require explicit publication.

## Priority 1 — generator endpoint exposure
The separate `IMS858/program-generator` Flask `app.py` exposes `POST /api/generate`, `/api/validate`, and `/api/vald/transform` with no authentication and wildcard CORS. CORS is not authentication; unrestricted callers can invoke resource-intensive PDF generation and submit potentially sensitive assessment data. Put service-to-service authentication on private generation, validate input size and apply rate limits. Coordinate with Coach OS before deploying to avoid breaking the current caller. Its 500 error handler returned traceback and raw error; fixed on unmerged `audit/fix-generator-reliability-2026-09` branch, not production.

## Priority 1 — mapping and reliability
Coach OS `mapMobilityMap` copies a single joint rating to *every* mapped direction and both sides, potentially exaggerating limitation/pain and discarding direction/side information. `mapFRAPriorities` uses only the first mapped direction for each joint. `mapStrength` maps core anti-extension to side plank (anti-lateral). `sessionsPerWeek` is not strictly parsed/validated before `Math.min`. The generator is called with a 55-second timeout within a 60-second route budget; UI also times out at 60 seconds. Generator URL defaults to `https://program-generator-rho.vercel.app` if env missing, so deployment mapping must be verified. Contract/version and returned Content-Type are not checked before storing a published program. Errors from upstream are surfaced verbatim to client via detail.

## Priority 1 — client booking
`components/booking/booking-form.tsx` offers hardcoded opening-hour slots without consulting Vagaro or a complete room/trainer calendar. Requests are pending only; do not advertise as available times. `app/api/sessions/request/route.ts` uses service role after checking a client account; add input validation, safe errors, trainer/room conflict handling and timezone tests before any migration. Session type validation and email HTML escaping were committed to feature/public-consultation-entry, not production.

## Priority 2 — other findings and verification
Global metadata blocks indexing on /consult (potential organic search issue). Preview build is READY but preview HTTP fetch remains access denied, so browser/mobile/accessibility testing is pending. Production Coach OS deployment is READY; Vercel env mapping and runtime logs remain inaccessible under team-scoped connector. Verify `NEXT_PUBLIC_SUPABASE_URL` host matches the intended Supabase project before touching production.

## Acceptance tests to add
- Assessment fixture: healthy beginner, spinal pain/axial restriction, asymmetric joint ROM, post-surgical constraint, incomplete intake, measured force outlier.
- Validate Coach OS translation against generator /api/validate; verify contract version, safe fallback and actionable errors.
- Generate client and coach PDF; inspect contents, constraints, week-by-week progression, formatting and safe client visibility.
- Ensure no program is published automatically; review/edit/revision/publish lifecycle works and downloadable PDF matches persisted version.
- Unauthorized generation returns 401/403; cross-trainer assessment access is enforced; external generator rejects unauthenticated traffic once Coach OS service auth is wired.
- Test invalid/large JSON, upstream timeout, upstream 400/422/500, non-PDF success response, duplicate clicks and concurrent requests.
- Check client vs staff RLS, privileged RPCs and views using test roles; review Stripe webhook signature/idempotency, storage policies and admin endpoints.
- Booking overlap, timezone/DST, cancellation, reminders, waiver status and Vagaro calendar coexistence in non-production.

## Scope
Inspected Coach OS generation route, program listing and request flow, standalone generator Flask endpoint and contract, connected Vercel deployment metadata and live Supabase security/performance advisors. Full source-wide static analysis, package vulnerability scan, generator unit tests, authenticated UI smoke tests, runtime log review and role-based penetration testing remain pending.
