# Connected training-value analysis

Owner-approved assumption: USD 93 per private training session. This is a valuation assumption, not a client price, proof of collection, an invoice, payroll or a package credit.

## Implemented read-only loop

Operational session records -> validated status/time/duration -> historical completed or future scheduled cohort -> client / coach / Pacific-month breakdown. The owner report is `/reports/training-value`, linked from Reports and Migration Center. Refreshing the report reads the current data; there is no background AI job or claim that arbitrary files are automatically understood.

The default view covers a rolling 90 days back and 60 days ahead. Missing cohorts are “Not established,” not zero dollars. Past accepted/scheduled records are not completion evidence. Requests, unmapped statuses, invalid/offset-free timestamps, duration conflicts, and contradictory duplicate identities are held out of estimates. Known cancellations, no-shows and non-training records are excluded. Identical duplicate identities count once. Historical and upcoming estimates are never added to actual payments or described as earned/collected revenue.

The report reads only sessions and profile display names through the owner's RLS-scoped client. It does not write payments, session status, profiles, packages, appointments, client prices, payroll, subscriptions or audit history. No production migration or provider authorization is required for this report itself.

## Source analysis boundary

Migration Center selects one source batch and loads every page before computing counts. Count changes, duplicate IDs, query errors, unexpectedly short pages, unknown counts and excessive result sets fail visibly. Separate requests are not a transactionally frozen snapshot; refresh if the underlying data changes. A full read of a partly uploaded batch is NOT a complete source upload.

The former source-value sum could silently turn absent estimates into $0 and depended on unrolled valuation columns. It is replaced with a link to the operational report. The earlier estimator also accepted old accepted bookings as completed history; that is corrected and covered by executable tests. Source dates, statuses and identities still require mapping before controlled import; the report does not authorize import.

## Other evidence

Package runway requires owner-verified opening quantities and recorded usage. Payment totals require genuine receipts, separate from the $93 assumption. Progress and exercise history require actual assessments/performance/video evidence. Research candidates remain distinct from clients. Raw ingestion does not establish any of those facts or automatically finish their existing product loops.

## Release boundaries

No deployment, hosted DDL/data write, retry of blocked staging writes, account change, notification, charge, QuickBooks access or Vagaro operation in this build. Source upload, reproducible-database repair and authenticated phone acceptance remain separate outstanding gates. Do not claim the full OS or migration is ready from this report's tests alone.
