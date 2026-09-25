# Client readiness closeout — 2026-09-25

This is a code/verification checkpoint, not permission to invite clients or deploy.
Parent inspected: b44e44e17b9e22c76f4382a7b0e897fdd14a16ae, whose gate #1160 failed source parsing in the request route. No inherited green claim is used for this pass.

## Fixed client workflows

- Replaced the invalid request source and the divergent client/server slot policies with a training-only, fixed-60-minute contract.
- Pacific wall-clock conversion is independent of the client's device time zone. A full session must fit before close; no 18:30 weekday or 12:30 Saturday overrun.
- Availability lookup failures cannot render fallback open times. Stale responses cannot replace the currently selected date.
- Client requests have stable IDs and immutable request provenance. Identical retries return the existing record's current status, even after staff handle it. Changed payloads or another client's ID cannot reuse that receipt.
- The final request rechecks coach assignment, notice/horizon, explicit availability, earlier-starting sessions, classes, time blocks and the five-pending-request limit. The request, receipt and audit record commit or roll back together.
- Network ambiguity is distinct from a known database rollback. The form holds its original payload during uncertainty. A later failed retry does not erase earlier ambiguity.
- Requested is not confirmed, paid, or deducted. Owner email acceptance is reported separately and does not reverse a saved request.
- Account updates use only the client's RLS-scoped identity, name and phone. A zero-row update or mismatched receipt cannot become a success message. Edits survive failure; the form baseline updates only after confirmed persistence.
- Book and Account distinguish absent records, failed queries, and unknown/conflicting package counters. Memberships are not displayed as invented session quantities. Class registration is still explicitly prelaunch.

## Verification design

`client-readiness-api.test.cjs` executes the actual TypeScript route handlers with controlled Supabase/email responses. `client-booking-frontend.test.cjs` executes the actual form event handlers in a controlled hook harness (including out-of-order loads and ambiguous retries). This is not an authenticated browser or iPhone test.

`client-training-request-database.test.cjs` runs the exact 0069 SQL in a separate synthetic PostgreSQL database when CI's local ims_ci service is available. Without that service it uses PGlite and skips only the multi-connection test. Coverage includes role boundaries, direct-call denial, atomic audit rollback, stable replay, changed-payload rejection, conflicting commitments, cap enforcement and simultaneous requests. No production connection is accepted by that test.

The request command uses a short SHARE ROW EXCLUSIVE gate across the four commitment tables. Ordinary reads continue; writes serialize, and contention times out after three seconds. This is a deliberately conservative single-studio transaction, not an unlimited-scale scheduler. It protects this request's final check/write and concurrent client requests; it does not claim that every older admin/recurring writer prevents all future conflicts. Existing standing/admin actions still need their own rollout and acceptance.

## Hosted preflight — verified read-only in this pass

Present: `set_session_completion`, `get_my_coached_performance`; class booking and class attendance commands still deny authenticated execution.

Missing in the inspected hosted project: `create_staff_session`, `cancel_recurring_series`, `finalize_client_media_review`, `assign_client_media_demos`, `create_recurring_series_atomic`, trainer availability/time-block tables, and media review fields. This is not a fully aligned production schema.

0069 requires the existing staff availability/time-block migration plus sessions, class_occurrences and audit_logs. Do not apply an entire historical migration folder blindly, particularly bundled Stripe/billing changes. Review and rehearse the exact dependency set and compare hosted function bodies/permissions before rollout. 0064/0065 and other unrolled commands are not declared production-ready by this checkpoint.

## Remaining client release gate

1. Exact release head must pass source verification, regression/security tests, zero-warning lint, production build and standalone TypeScript.
2. Ordered hosted rollout and post-rollout permission/function checks, including the media feedback/storage boundary. No schema change was made in this pass.
3. Authenticated owner, assigned trainer, unrelated trainer and two-client acceptance on the final build: booking, session visibility, program/demo visibility, upload/review, messaging, account save, package/billing states, sign-in/reset/sign-out.
4. Actual iPhone/Safari layout, camera/upload and interrupted-network checks. Email/password-reset delivery and external payment/notification integrations require their own acceptance; mocks are not delivery evidence.

No deployment, class launch, client invitations, program publication, charge, credit consumption, payroll submission or Vagaro migration occurred in this pass. No real client records were modified for testing.
