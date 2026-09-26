# Migration owner review — calendar and package cutover

## Implemented workflow

Migration Center -> Owner review -> Client matches / Calendar / Package openings.

The workspace reads one batch and one 25-record page at a time. Original source fields, raw types, source checksum and provenance remain visible and unchanged. Missing review storage or failed identity reads disable the editor rather than claiming zero balances or no reviews. Only existing active client records are selectable; a standalone auth profile is not a client identity.

An owner can save Hold, Owner-reviewed proposal, or Excluded. Reviewing/excluding needs explicit confirmation and every decision needs a reason. A reviewed appointment requires a real client and coach, explicit time, duration and status. The Pacific time control rejects missing spring-forward times and requires an explicit offset for the repeated autumn hour. Past scheduled/confirmed bookings remain non-completion evidence. A package opening records an as-of date and owner-verified remaining sessions, with optional price/paid/owed/credit figures. Blank money stays unknown; a verified zero stays zero. The $93 valuation never populates those fields.

No review creates or edits operational clients, sessions, plans, payments, subscriptions, recurring series, notification jobs or authentication identities. Owner-reported figures are not provider-verified receipts. Shared ownership, fresh collision checks, destination matching, source verification and explicit operational import approval remain gates.

## Persistence and safety

Staged migration: `0076_migration_owner_reviews.sql`, depends on source-staging foundation 0070. This is NOT automatically applied to hosted Supabase.

`review_migration_record(uuid,jsonb)` rechecks active owner authorization, locks the batch/source row, validates exact allowlists and fresh destination roles, compares source checksum and expected revision, and appends a review plus audit in one transaction. Old revisions cannot be updated, deleted or truncated through ordinary SQL; a correction creates a new revision. Exact retries return the original receipt; changed request contents or stale concurrent decisions fail. Frozen/imported batches cannot accept new reviews. The latest-review view is security-invoker and inherits owner-only row access.

The form preserves an ambiguous request and locks edits until its outcome is confirmed. It validates the full save receipt, not just HTTP 200. No service-role shortcut or fabricated owner claim is used by the application endpoint.

Tests execute the parser, real route handler, form event handlers, server page, and real SQL against a dedicated synthetic database in the CI PostgreSQL service. The SQL fixture is focused command/permission coverage, not the complete Coach OS schema baseline or hosted authentication acceptance. No test uses production identities/data or sends communications.

## Unchanged release gates

No hosted DDL/data writes, retry of previously blocked bulk uploads, Vercel deployment, QuickBooks operation, Vagaro change or login-email change in this block. The last confirmed evidence load remains partial; no fresh hosted count is claimed here. Reproducible full-database repair and authenticated iPhone acceptance are still outstanding. This workspace makes owner decisions durable inside Coach OS after controlled rollout; it does not declare a production cutover.
